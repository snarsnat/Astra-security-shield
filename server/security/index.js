/**
 * ASTRA Shield — Security Hardening Module
 *
 * Exposes a collection of middleware and utilities that harden the Shield
 * server against common attack classes:
 *
 *   • WAF-lite         — payload / header / URL signature scanning
 *   • Anti-scraping    — user-agent, header-order and rate heuristics
 *   • Honeypot routes  — trap automated scanners
 *   • Slow-down        — progressive delay on suspicious IPs
 *   • Request signing  — optional HMAC verification of client requests
 *   • Request IDs      — correlate logs + dashboard events
 *
 * Every piece here is dependency-free (only `crypto`) and safe to mount
 * in front of the existing routers.
 */

import crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUSPICIOUS_PATTERNS = [
  // SQL injection
  /\b(union\s+select|select\s+.*\s+from\s+|insert\s+into\s+|update\s+.*\s+set\s+|delete\s+from\s+|drop\s+table\s+|exec\s*\(|sleep\s*\(|benchmark\s*\()/i,
  // NoSQL / Mongo injection markers
  /\$where|\$ne|\$gt\s*:|\$regex\s*:/i,
  // XSS vectors
  /<\s*script\b|javascript:|on(?:error|load|click|mouseover)\s*=|<\s*iframe\b|<\s*svg[\s>]|data:text\/html/i,
  // Path traversal
  /(\.\.\/){2,}|\.\.\\{2,}|%2e%2e%2f|%2e%2e\//i,
  // Command injection
  /(\|\s*(nc|ncat|curl|wget|bash|sh|cmd|powershell)\b|;\s*rm\s+-rf|&&\s*rm\s+)/i,
  // SSRF / server-side fetch
  /\b(file|gopher|dict|php):\/\//i,
  // Template injection
  /\{\{.*?(constructor|__proto__|prototype).*?\}\}/i,
  // Log4Shell-style lookups
  /\$\{jndi:/i,
];

const KNOWN_BAD_UAS = [
  /^$/,                                         // empty UA
  /^-$/,                                        // dash-only UA
  /\b(sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|nessus|openvas|wpscan|dirbuster|gobuster|ffuf|feroxbuster)\b/i,
  /\b(python-requests|curl\/7\.[0-9]|wget\/1|go-http-client|okhttp|java\/1|libwww-perl|mechanize)\b/i,
  /\b(headlesschrome|phantomjs|slimerjs|htmlunit|selenium|webdriver|puppeteer|playwright)\b/i,
  /\b(scrapy|scrapinghub|octoparse|parsehub|crawler4j|httrack|wget|curl)\b/i,
];

const HONEYPOT_PATHS = [
  '/wp-admin', '/wp-login.php', '/administrator', '/phpmyadmin', '/admin.php',
  '/.env', '/.git/config', '/config.php', '/backup.sql', '/.DS_Store',
  '/xmlrpc.php', '/server-status', '/actuator', '/actuator/env', '/console',
  '/solr/admin', '/cgi-bin/', '/shell.php', '/wls-wsat/',
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Still perform a constant-time op against a dummy buffer of equal length
    // so total time is roughly equal across the two code paths.
    crypto.timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function containsSuspiciousPattern(str) {
  if (!str || typeof str !== 'string') return null;
  for (const re of SUSPICIOUS_PATTERNS) {
    if (re.test(str)) return re.source;
  }
  return null;
}

function walkForPatterns(obj, depth = 0, path = '') {
  if (depth > 6) return null; // prevent pathological deep objects
  if (obj == null) return null;
  if (typeof obj === 'string') {
    const hit = containsSuspiciousPattern(obj);
    return hit ? { path, pattern: hit } : null;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length && i < 200; i++) {
      const hit = walkForPatterns(obj[i], depth + 1, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj === 'object') {
    let count = 0;
    for (const k of Object.keys(obj)) {
      if (count++ > 200) break;
      const hit = walkForPatterns(obj[k], depth + 1, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

// ─── Request ID middleware ────────────────────────────────────────────────────

export function requestId() {
  return (req, res, next) => {
    const supplied = req.get('x-request-id');
    // Accept client-supplied IDs only if they look sane (prevents log injection)
    const id = supplied && /^[A-Za-z0-9._-]{8,64}$/.test(supplied)
      ? supplied
      : crypto.randomBytes(12).toString('hex');
    req.id = id;
    res.setHeader('X-Request-ID', id);
    next();
  };
}

// ─── WAF-lite middleware ──────────────────────────────────────────────────────

/**
 * Scans URL, query, headers and body for obvious attack signatures. Rejects
 * the request with 400 on a hit and emits a `waf_blocked` event (if emitter
 * is provided). Safe to run before any route handlers.
 */
export function wafLite({ emit = () => {}, onBlock = () => {} } = {}) {
  return (req, res, next) => {
    // 1. URL + query
    const urlHit = containsSuspiciousPattern(req.originalUrl || req.url || '');
    if (urlHit) {
      onBlock(req, { stage: 'url', pattern: urlHit });
      emit('waf_blocked', { ip: req.ip, path: req.path, reason: 'url_pattern', pattern: urlHit, reqId: req.id });
      return res.status(400).json({ success: false, reason: 'bad_request' });
    }

    // 2. Headers (limited set — avoid scanning UA twice)
    const headerStr = `${req.get('referer') || ''}|${req.get('x-forwarded-for') || ''}|${req.get('cookie') || ''}`;
    const headerHit = containsSuspiciousPattern(headerStr);
    if (headerHit) {
      onBlock(req, { stage: 'headers', pattern: headerHit });
      emit('waf_blocked', { ip: req.ip, path: req.path, reason: 'header_pattern', pattern: headerHit, reqId: req.id });
      return res.status(400).json({ success: false, reason: 'bad_request' });
    }

    // 3. Body — only if parsed
    if (req.body && typeof req.body === 'object') {
      const bodyHit = walkForPatterns(req.body);
      if (bodyHit) {
        onBlock(req, { stage: 'body', pattern: bodyHit.pattern, field: bodyHit.path });
        emit('waf_blocked', {
          ip: req.ip, path: req.path, reason: 'body_pattern',
          pattern: bodyHit.pattern, field: bodyHit.path, reqId: req.id,
        });
        return res.status(400).json({ success: false, reason: 'bad_request' });
      }
    }

    next();
  };
}

// ─── Anti-scraping middleware ─────────────────────────────────────────────────

/**
 * Flags requests whose user-agent matches well-known scraping/pentest tools,
 * or whose header profile looks unlike a real browser. Purely heuristic —
 * we score, and only block above a threshold so legitimate SSR / mobile UAs
 * don't get false-positived.
 */
export function antiScraping({ emit = () => {}, onFlag = () => {}, blockOnScore = 3 } = {}) {
  return (req, res, next) => {
    const ua = req.get('user-agent') || '';
    const accept = req.get('accept') || '';
    const acceptLang = req.get('accept-language') || '';
    const acceptEnc = req.get('accept-encoding') || '';

    let score = 0;
    const reasons = [];

    for (const re of KNOWN_BAD_UAS) {
      if (re.test(ua)) { score += 3; reasons.push(`ua_match:${re.source.slice(0, 30)}`); break; }
    }

    // Real browsers almost always send Accept + Accept-Language + Accept-Encoding
    if (!accept)     { score += 1; reasons.push('missing_accept'); }
    if (!acceptLang) { score += 1; reasons.push('missing_accept_language'); }
    if (!acceptEnc)  { score += 1; reasons.push('missing_accept_encoding'); }

    // Accept: */* alone is a scripting-client tell
    if (accept.trim() === '*/*') { score += 1; reasons.push('accept_wildcard_only'); }

    // Unusually short UA
    if (ua && ua.length < 10) { score += 2; reasons.push('ua_too_short'); }

    // Explicit "bot" self-identification — allow known good crawlers through
    if (/bot|crawler|spider/i.test(ua) && !/googlebot|bingbot|duckduckbot|applebot|yandexbot/i.test(ua)) {
      score += 2;
      reasons.push('generic_bot_ua');
    }

    req.scrapingScore = score;
    req.scrapingReasons = reasons;

    if (score >= blockOnScore) {
      onFlag(req, { score, reasons });
      emit('scraper_blocked', { ip: req.ip, path: req.path, score, reasons, reqId: req.id });
      // Use 403 rather than 429 — this isn't a rate issue, it's a client-class one
      return res.status(403).json({ success: false, reason: 'forbidden' });
    }

    if (score > 0) {
      emit('scraper_flagged', { ip: req.ip, path: req.path, score, reasons, reqId: req.id });
    }

    next();
  };
}

// ─── Honeypot routes ──────────────────────────────────────────────────────────

/**
 * Register honeypot endpoints. Any hit triggers `onHit(req)` (typically
 * blocking the IP) and returns a benign 404 so the scanner doesn't learn.
 */
export function honeypotRoutes(router, { onHit = () => {}, emit = () => {} } = {}) {
  for (const path of HONEYPOT_PATHS) {
    router.all(path, (req, res) => {
      onHit(req, { path });
      emit('honeypot_hit', { ip: req.ip, path, ua: req.get('user-agent'), reqId: req.id });
      res.status(404).send('Not Found');
    });
  }
  return router;
}

// ─── Progressive slow-down ────────────────────────────────────────────────────

/**
 * Adds a latency penalty that grows with recent-request count. Unlike a hard
 * rate limiter, this *responds* to the client but does so slowly — which
 * drains attacker resources (threads, connections) without 429-ing legitimate
 * bursts. Intentionally capped at `maxDelayMs`.
 */
export function slowDown({ threshold = 50, windowMs = 60_000, stepMs = 100, maxDelayMs = 5_000 } = {}) {
  const hits = new Map(); // ip -> [timestamps]

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, list] of hits) {
      const kept = list.filter(t => t > cutoff);
      if (kept.length === 0) hits.delete(ip);
      else hits.set(ip, kept);
    }
  }, windowMs).unref?.();

  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const list = hits.get(ip) || [];
    const recent = list.filter(t => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);

    if (recent.length <= threshold) return next();

    const over = recent.length - threshold;
    const delay = Math.min(over * stepMs, maxDelayMs);
    res.setHeader('X-SlowDown-Delay', String(delay));
    setTimeout(next, delay);
  };
}

// ─── HMAC request signing ─────────────────────────────────────────────────────

/**
 * Optional: verify HMAC-SHA256 of (timestamp + body) signed with an app
 * secret. When enabled, this prevents token leakage + replay even if TLS
 * is terminated upstream. Clock skew tolerated: 5 minutes.
 */
export function verifyRequestSignature({
  getSecret,           // (req) => Promise<string|null> | string|null
  required = false,    // if false, skip when headers absent
  header = 'x-astra-signature',
  tsHeader = 'x-astra-timestamp',
  skewMs = 5 * 60_000,
} = {}) {
  return async (req, res, next) => {
    const sig = req.get(header);
    const ts = req.get(tsHeader);

    if (!sig || !ts) {
      if (required) {
        return res.status(401).json({ success: false, reason: 'signature_required' });
      }
      return next();
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > skewMs) {
      return res.status(401).json({ success: false, reason: 'signature_expired_or_skewed' });
    }

    let secret;
    try {
      secret = await getSecret(req);
    } catch {
      secret = null;
    }
    if (!secret) {
      if (required) {
        return res.status(401).json({ success: false, reason: 'signature_unverifiable' });
      }
      return next();
    }

    const bodyStr = typeof req.rawBody === 'string'
      ? req.rawBody
      : req.body ? JSON.stringify(req.body) : '';
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${bodyStr}`).digest('hex');

    if (!timingSafeStringEqual(sig, expected)) {
      return res.status(401).json({ success: false, reason: 'signature_mismatch' });
    }

    req.signatureVerified = true;
    next();
  };
}

// ─── Suspicious-IP tracker with progressive penalties ─────────────────────────

/**
 * Keeps a per-IP suspicion score that rises on bad signals (WAF hits,
 * honeypot hits, scraper flags, failed challenges) and decays over time.
 * At configurable thresholds, the IP is short-banned or fully blocked.
 */
export class SuspicionTracker {
  constructor({
    banAt = 10,
    blockAt = 25,
    decayPerMinute = 1,
    onBan = () => {},
    onBlock = () => {},
  } = {}) {
    this.scores = new Map(); // ip -> { score, lastUpdate, bannedUntil }
    this.banAt = banAt;
    this.blockAt = blockAt;
    this.decayPerMinute = decayPerMinute;
    this.onBan = onBan;
    this.onBlock = onBlock;

    setInterval(() => this._decay(), 60_000).unref?.();
  }

  _decay() {
    const now = Date.now();
    for (const [ip, rec] of this.scores) {
      const minutes = (now - rec.lastUpdate) / 60_000;
      rec.score = Math.max(0, rec.score - this.decayPerMinute * minutes);
      rec.lastUpdate = now;
      if (rec.score === 0 && (!rec.bannedUntil || rec.bannedUntil < now)) {
        this.scores.delete(ip);
      }
    }
  }

  bump(ip, delta = 1, reason = 'generic') {
    if (!ip) return;
    const now = Date.now();
    const rec = this.scores.get(ip) || { score: 0, lastUpdate: now, bannedUntil: 0 };
    // Lazy decay so score is current
    const minutes = (now - rec.lastUpdate) / 60_000;
    rec.score = Math.max(0, rec.score - this.decayPerMinute * minutes) + delta;
    rec.lastUpdate = now;

    if (rec.score >= this.blockAt) {
      this.onBlock(ip, { reason, score: rec.score });
      this.scores.delete(ip); // handled by the IP blocklist now
      return 'blocked';
    }
    if (rec.score >= this.banAt && (!rec.bannedUntil || rec.bannedUntil < now)) {
      rec.bannedUntil = now + 10 * 60_000; // 10-min temporary ban
      this.onBan(ip, { reason, score: rec.score, until: rec.bannedUntil });
    }
    this.scores.set(ip, rec);
    return 'tracked';
  }

  isBanned(ip) {
    const rec = this.scores.get(ip);
    if (!rec) return false;
    return rec.bannedUntil && rec.bannedUntil > Date.now();
  }

  middleware() {
    return (req, res, next) => {
      if (this.isBanned(req.ip)) {
        return res.status(429).json({ success: false, reason: 'temporarily_banned', retryAfter: 600 });
      }
      next();
    };
  }

  snapshot() {
    const out = [];
    for (const [ip, rec] of this.scores) {
      out.push({ ip, score: Math.round(rec.score * 10) / 10, bannedUntil: rec.bannedUntil });
    }
    return out;
  }
}

export { timingSafeStringEqual, containsSuspiciousPattern };
