/**
 * ASTRA Shield Server v2.1 — Hardened Edition
 *
 * Upgrades over v2.0:
 *   • Strict Content-Security-Policy + HSTS + cross-origin isolation headers
 *   • WAF-lite payload scanner (SQLi / XSS / SSRF / traversal / RCE signatures)
 *   • Anti-scraping heuristics (UA fingerprint + header-profile scoring)
 *   • Honeypot routes that trap automated scanners and auto-block their IPs
 *   • Progressive slow-down on abusive IPs (tarpit) + suspicion scoring
 *   • Per-IP tiered rate limits (API, auth, challenge, admin)
 *   • Request-ID correlation and structured security events
 *   • Hardened error handler that never leaks internals in production
 *   • Graceful shutdown + uncaught-exception guard
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import crypto from 'crypto';

import { createAPIRoutes } from './routes/api.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { BotDetectionService } from './services/BotDetectionService.js';
import { FingerprintService } from './services/FingerprintService.js';
import { MLAnalysisService } from './services/MLAnalysisService.js';
import { ThreatIntelligenceService } from './services/ThreatIntelligenceService.js';
import { SessionService } from './services/SessionService.js';
import { ChallengeService } from './services/ChallengeService.js';
import { DashboardService } from './services/DashboardService.js';
import APIKeyService from './services/APIKeyService.js';
import { requireAPIKey } from './middleware/auth.js';

import {
  requestId,
  wafLite,
  antiScraping,
  honeypotRoutes,
  slowDown,
  SuspicionTracker,
} from './security/index.js';

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// Trust proxy — critical for real IP detection behind nginx/Cloudflare/etc.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.disable('etag'); // ETags can leak cache-side info on small JSON responses

// ─── IP Blocklist ─────────────────────────────────────────────────────────────
const ipBlocklist = new Set();
const blockedIPLog = new Map(); // ip -> { blockedAt, reason, count, expiresAt }

// Automatic unblock after this window — prevents permanent blocks on shared NATs.
// Explicit admin blocks have no expiry.
const AUTO_BLOCK_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function blockIP(ip, reason = 'bot_detected', { permanent = false } = {}) {
  if (!ip) return;
  ipBlocklist.add(ip);
  const existing = blockedIPLog.get(ip);
  blockedIPLog.set(ip, {
    blockedAt: existing?.blockedAt || Date.now(),
    reason,
    count: (existing?.count || 0) + 1,
    expiresAt: permanent ? null : Date.now() + AUTO_BLOCK_TTL_MS,
    permanent,
  });
}

export function unblockIP(ip) {
  ipBlocklist.delete(ip);
  blockedIPLog.delete(ip);
}

export function getBlockedIPs() {
  return Array.from(blockedIPLog.entries()).map(([ip, data]) => ({ ip, ...data }));
}

// Periodic sweep of auto-expiring blocks
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of blockedIPLog) {
    if (rec.expiresAt && rec.expiresAt < now && !rec.permanent) {
      ipBlocklist.delete(ip);
      blockedIPLog.delete(ip);
    }
  }
}, 5 * 60_000).unref?.();

// ─── Replay-Protection Nonce Store ───────────────────────────────────────────
const usedNonces = new Map(); // nonce -> expiry timestamp
const NONCE_TTL = 5 * 60 * 1000; // 5 minutes
const NONCE_MAX_LEN = 128;

function consumeNonce(nonce) {
  if (!nonce) return true;
  if (typeof nonce !== 'string' || nonce.length > NONCE_MAX_LEN || !/^[A-Za-z0-9._-]+$/.test(nonce)) {
    return false; // reject malformed nonces
  }
  const now = Date.now();
  // Purge expired nonces opportunistically (capped to avoid pathological loops)
  if (usedNonces.size > 10_000) {
    let purged = 0;
    for (const [n, exp] of usedNonces) {
      if (exp < now) { usedNonces.delete(n); if (++purged > 1000) break; }
    }
  }
  if (usedNonces.has(nonce)) return false; // already used — replay!
  usedNonces.set(nonce, now + NONCE_TTL);
  return true;
}

// ─── SSE Event Bus ────────────────────────────────────────────────────────────
const sseClients = new Set();
const MAX_SSE_CLIENTS = 500;

export function emitEvent(type, payload) {
  const data = JSON.stringify({ type, payload, ts: Date.now() });
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); } catch { sseClients.delete(res); }
  }
}

// ─── Suspicion tracker (progressive penalties on bad signals) ─────────────────
const suspicion = new SuspicionTracker({
  banAt: 10,
  blockAt: 25,
  decayPerMinute: 1,
  onBan: (ip, info) => {
    emitEvent('ip_banned', { ip, ...info });
  },
  onBlock: (ip, info) => {
    blockIP(ip, `suspicion:${info.reason}`);
    emitEvent('ip_blocked', { ip, ...info, source: 'suspicion' });
  },
});

// ─── Body parser (raw body captured for future HMAC verification) ────────────
app.use(express.json({
  limit: '256kb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

app.use(requestId());

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  strictTransportSecurity: IS_PROD
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
  frameguard: { action: 'deny' },
  noSniff: true,
}));

// Extra hardening headers not covered by helmet defaults
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); // API must not be indexed
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:8080',
     'http://127.0.0.1:3000', 'http://127.0.0.1:8000', 'http://127.0.0.1:8080'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID',
                   'X-Astra-Signature', 'X-Astra-Timestamp'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 600,
}));

app.use(compression());

// Structured access logs with request IDs — avoid logging bodies (PII risk)
morgan.token('id', req => req.id || '-');
app.use(morgan(':method :url :status :response-time ms id=:id ip=:remote-addr', {
  skip: (req) => req.path === '/health' || req.path === '/api/events',
}));

// ─── Hard-limit check: IP blocklist + suspicion ban ───────────────────────────
app.use((req, res, next) => {
  const ip = req.ip;
  if (ipBlocklist.has(ip)) {
    emitEvent('blocked_request', {
      ip, path: req.path, reason: blockedIPLog.get(ip)?.reason, reqId: req.id,
    });
    return res.status(403).json({ success: false, reason: 'ip_blocked' });
  }
  if (suspicion.isBanned(ip)) {
    return res.status(429).json({
      success: false, reason: 'temporarily_banned', retryAfter: 600,
    });
  }
  next();
});

// ─── WAF-lite + anti-scraping (applied to /api/* only) ────────────────────────
const wafMiddleware = wafLite({
  emit: emitEvent,
  onBlock: (req) => suspicion.bump(req.ip, 5, 'waf_hit'),
});

const antiScraperMiddleware = antiScraping({
  emit: emitEvent,
  onFlag: (req) => suspicion.bump(req.ip, 3, 'scraper_pattern'),
  blockOnScore: 3,
});

const slowDownMiddleware = slowDown({
  threshold: 50,
  windowMs: 60_000,
  stepMs: 100,
  maxDelayMs: 5_000,
});

// ─── Services ─────────────────────────────────────────────────────────────────
const sessionService = new SessionService({ redis: null });

const services = {
  botDetection: new BotDetectionService(),
  fingerprint: new FingerprintService(),
  mlAnalysis: new MLAnalysisService(),
  threatIntel: new ThreatIntelligenceService(),
  session: sessionService,
  challenge: new ChallengeService({ sessionService: null }),
  dashboard: new DashboardService({ sessionService }),
};

services.challenge.sessionService = services.session;

// ─── Rate Limiting (tiered: global, burst, auth) ──────────────────────────────
const rateLimits = new Map();
const burstLimits = new Map();
const authLimits = new Map();

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_BURST_MAX = 30;
const AUTH_RATE_MAX = 10;

function bumpWindowed(store, ip, windowMs) {
  const now = Date.now();
  let rec = store.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 1, resetAt: now + windowMs };
  } else {
    rec.count++;
  }
  store.set(ip, rec);
  return rec.count;
}

function checkRateLimit(ip) {
  const global = bumpWindowed(rateLimits, ip, RATE_LIMIT_WINDOW);
  if (global > RATE_LIMIT_MAX) return { ok: false, scope: 'global' };
  const burst = bumpWindowed(burstLimits, ip, 5_000);
  if (burst > RATE_LIMIT_BURST_MAX) return { ok: false, scope: 'burst' };
  return { ok: true };
}

function checkAuthRateLimit(ip) {
  const n = bumpWindowed(authLimits, ip, RATE_LIMIT_WINDOW);
  return n <= AUTH_RATE_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimits) { if (rec.resetAt < now) rateLimits.delete(ip); }
  for (const [ip, rec] of burstLimits) { if (rec.resetAt < now) burstLimits.delete(ip); }
  for (const [ip, rec] of authLimits)  { if (rec.resetAt < now) authLimits.delete(ip); }
}, 120_000).unref?.();

// ─── Honeypot routes (mounted BEFORE /api) ────────────────────────────────────
honeypotRoutes(app, {
  onHit: (req) => {
    const state = suspicion.bump(req.ip, 8, 'honeypot');
    if (state !== 'blocked') {
      emitEvent('honeypot_escalation', { ip: req.ip, path: req.path, reqId: req.id });
    }
  },
  emit: emitEvent,
});

// ─── /api pipeline ────────────────────────────────────────────────────────────
const apiRoutes = createAPIRoutes(services, { blockIP, consumeNonce, emitEvent, suspicion });

app.use('/api', antiScraperMiddleware);
app.use('/api', wafMiddleware);
app.use('/api', slowDownMiddleware);
app.use('/api', (req, res, next) => {
  const r = checkRateLimit(req.ip);
  if (!r.ok) {
    suspicion.bump(req.ip, 1, `rate_limit_${r.scope}`);
    emitEvent('rate_limited', { ip: req.ip, path: req.path, scope: r.scope, reqId: req.id });
    return res.status(429).json({ success: false, reason: 'rate_limit_exceeded', retryAfter: 60 });
  }
  const isAuthLike =
    req.path.startsWith('/keys') ||
    req.path.startsWith('/session') ||
    req.path === '/verify';
  if (isAuthLike && !checkAuthRateLimit(req.ip)) {
    suspicion.bump(req.ip, 2, 'auth_rate_limit');
    emitEvent('auth_rate_limited', { ip: req.ip, path: req.path, reqId: req.id });
    return res.status(429).json({ success: false, reason: 'auth_rate_limit_exceeded', retryAfter: 60 });
  }
  next();
});
app.use('/api', apiRoutes);

const dashboardRoutes = createDashboardRoutes(services.dashboard);
app.use('/api/dashboards', dashboardRoutes);

app.use('/api/dashboard', (req, res) => {
  res.redirect(301, req.originalUrl.replace('/api/dashboard', '/api/dashboards'));
});

// ─── Live Stats Endpoint ──────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const sessionStats = services.session.getStats();
  const allAppStats = services.session.getAllAppStats();
  res.json({
    success: true,
    stats: {
      ...sessionStats,
      blockedIPs: ipBlocklist.size,
      suspiciousIPs: suspicion.snapshot().length,
      apps: allAppStats,
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed,
    },
  });
});

// ─── SSE Stream ───────────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    return res.status(503).json({ success: false, reason: 'too_many_subscribers' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 20_000);

  sseClients.add(res);

  const snapshot = services.session.getStats();
  res.write(`data: ${JSON.stringify({ type: 'snapshot', payload: snapshot, ts: Date.now() })}\n\n`);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ─── Admin Endpoints (all admin-gated) ────────────────────────────────────────
app.get('/api/admin/blocked-ips', requireAPIKey(['admin']), (req, res) => {
  res.json({ success: true, blocked: getBlockedIPs() });
});

app.delete('/api/admin/blocked-ips/:ip', requireAPIKey(['admin']), (req, res) => {
  const ip = req.params.ip;
  if (!/^[0-9a-f:.]{2,45}$/i.test(ip)) {
    return res.status(400).json({ success: false, error: 'invalid_ip_format' });
  }
  unblockIP(ip);
  emitEvent('ip_unblocked', { ip, by: req.apiKey?.id || 'admin', reqId: req.id });
  res.json({ success: true, message: `${ip} unblocked` });
});

app.get('/api/admin/suspicion', requireAPIKey(['admin']), (req, res) => {
  res.json({ success: true, suspicious: suspicion.snapshot() });
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '2.1.0',
    uptime: process.uptime(),
    services: Object.keys(services),
    dashboards: services.dashboard.dashboards.size,
    blockedIPs: ipBlocklist.size,
    sseClients: sseClients.size,
  });
});

// ─── 404 fallthrough ──────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    suspicion.bump(req.ip, 0.5, 'unknown_api_path');
  }
  res.status(404).json({ success: false, reason: 'not_found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ success: false, error: err.message });
  }
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ success: false, reason: 'malformed_json' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, reason: 'payload_too_large' });
  }
  console.error(`[ERROR] reqId=${req.id}`, err);
  res.status(500).json({
    success: false,
    reason: 'server_error',
    reqId: req.id,
    message: IS_PROD ? undefined : err.message,
  });
});

// ─── Process-level safety net ─────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// ─── Start ────────────────────────────────────────────────────────────────────
let server;
if (process.env.ASTRA_NO_LISTEN !== '1') {
  server = app.listen(PORT, () => {
    let adminKey = null;
    try {
      const adminResult = APIKeyService.generateKey({
        appName: 'admin',
        description: 'Initial admin key — revoke after creating your own keys',
        permissions: ['verify', 'challenge', 'analyze', 'admin'],
        rateLimit: 1000,
      });
      adminKey = adminResult;
    } catch { /* key already exists */ }

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛡️  ASTRA Shield Server v2.1  (Hardened Edition)       ║
║                                                           ║
║   • Multi-layer fingerprinting                            ║
║   • ML behavioral analysis                                ║
║   • WAF-lite payload scanner                              ║
║   • Anti-scraping + honeypot traps                        ║
║   • Progressive tarpit + suspicion scoring                ║
║   • IP blocklist with auto-expiry                         ║
║   • Replay-protection nonces                              ║
║   • HMAC request signing (optional)                       ║
║   • Strict CSP + HSTS + CORP/COOP                         ║
║   • Real-time SSE event stream                            ║
║                                                           ║
║   API:    http://localhost:${PORT}/api                     ║
║   Events: http://localhost:${PORT}/api/events              ║
║   Health: http://localhost:${PORT}/health                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
${adminKey ? `\n  🔑  ADMIN API KEY (save this — shown once):\n  ${adminKey.key}\n  Permissions: ${adminKey.metadata.permissions.join(', ')}\n  Rate limit: ${adminKey.metadata.rateLimit}/min\n` : ''}
`);
  });

  const shutdown = (signal) => {
    console.log(`[${signal}] shutting down...`);
    server?.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref?.();
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { app, services };
