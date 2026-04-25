/**
 * ASTRA Shield — Main Verification Endpoint
 * Vercel Serverless Function
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Global in-memory storage (persists across warm Vercel lambdas)
declare global {
  var astraSessions: Map<string, any>;
  var astraApiKeys: Map<string, any>;
  var astraRateLimits: Map<string, { count: number; resetAt: number }>;
  var astraChallenges: Map<string, any>;
  var astraBlocks: Map<string, { failureCount: number; riskScore: number; tier: number; blockedUntil: number; lastSeen: number }>;
}

if (!globalThis.astraSessions) globalThis.astraSessions = new Map();
if (!globalThis.astraApiKeys) globalThis.astraApiKeys = new Map();
if (!globalThis.astraRateLimits) globalThis.astraRateLimits = new Map();
if (!globalThis.astraChallenges) globalThis.astraChallenges = new Map();
if (!globalThis.astraBlocks) globalThis.astraBlocks = new Map();

const sessions = globalThis.astraSessions;
const apiKeys = globalThis.astraApiKeys;
const rateLimits = globalThis.astraRateLimits;
export const challenges = globalThis.astraChallenges;
const blocks = globalThis.astraBlocks;

const MAX_BLOCKS = 10_000;
const BLOCK_TTL_MS = 10 * 60_000; // 10 min hard block
const FAILURE_HARD_BLOCK = 5;     // 5+ failures → hard block
const FAILURE_ESCALATE_1 = 2;     // 2+ failures → bump one tier
const FAILURE_ESCALATE_2 = 3;     // 3+ failures → jump to Gate
const FAILURE_WINDOW_MS = 30 * 60_000; // forget failures older than 30min

function hashFingerprint(clientData: any, ip: string): string {
  const fp = clientData?.fingerprints || {};
  const parts = [
    String(fp.canvas || fp.canvasHash || ''),
    String(fp.webgl || fp.webglHash || ''),
    String(fp.webglRenderer || ''),
    String(fp.audio || fp.audioHash || ''),
    String(fp.fonts?.length || 0),
    String(fp.hardwareConcurrency || ''),
    String(fp.deviceMemory || ''),
    String(fp.timezone || ''),
    String(fp.screenResolution || ''),
    String(fp.platform || ''),
    ip
  ];
  const joined = parts.join('|');
  // FNV-1a 64-bit lite → hex string (no crypto import needed)
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
  for (let i = 0; i < joined.length; i++) {
    const c = joined.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
}

function pruneBlocks() {
  if (blocks.size <= MAX_BLOCKS) return;
  const now = Date.now();
  for (const [k, v] of blocks) {
    if (v.blockedUntil < now && now - v.lastSeen > FAILURE_WINDOW_MS) blocks.delete(k);
  }
}

function getBlockRecord(key: string) {
  let rec = blocks.get(key);
  if (!rec) return null;
  const now = Date.now();
  if (rec.blockedUntil < now && now - rec.lastSeen > FAILURE_WINDOW_MS) {
    blocks.delete(key);
    return null;
  }
  return rec;
}

function isHardBlocked(key: string): { blocked: boolean; retryAfter: number } {
  const rec = getBlockRecord(key);
  if (!rec) return { blocked: false, retryAfter: 0 };
  const now = Date.now();
  if (rec.blockedUntil > now) return { blocked: true, retryAfter: Math.ceil((rec.blockedUntil - now) / 1000) };
  return { blocked: false, retryAfter: 0 };
}

function escalateTier(baseTier: number, key: string): number {
  const rec = getBlockRecord(key);
  if (!rec) return baseTier;
  if (rec.failureCount >= FAILURE_ESCALATE_2) return 4;
  if (rec.failureCount >= FAILURE_ESCALATE_1) return Math.min(4, baseTier + 1);
  return baseTier;
}

export function recordChallengeFailure(key: string, tier: number): { hardBlock: boolean; retryAfter: number; failureCount: number } {
  pruneBlocks();
  const now = Date.now();
  const rec = blocks.get(key) || { failureCount: 0, riskScore: 0, tier, blockedUntil: 0, lastSeen: now };
  rec.failureCount++;
  rec.lastSeen = now;
  rec.riskScore = Math.min(1, rec.riskScore + 0.25);
  rec.tier = Math.max(rec.tier, tier);
  let hardBlock = false;
  let retryAfter = 0;
  if (rec.failureCount >= FAILURE_HARD_BLOCK) {
    rec.blockedUntil = now + BLOCK_TTL_MS;
    hardBlock = true;
    retryAfter = Math.ceil(BLOCK_TTL_MS / 1000);
  }
  blocks.set(key, rec);
  return { hardBlock, retryAfter, failureCount: rec.failureCount };
}

export function recordChallengeSuccess(key: string) {
  const rec = blocks.get(key);
  if (!rec) return;
  rec.failureCount = Math.max(0, rec.failureCount - 2);
  rec.riskScore = Math.max(0, rec.riskScore - 0.2);
  rec.lastSeen = Date.now();
}

export { blocks as astraBlocks, hashFingerprint, getBlockRecord, isHardBlocked, escalateTier };

interface SessionData {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  riskScores: number[];
  verifications: number;
  challengesPassed: number;
  challengesFailed: number;
  lastActivity: number;
  trustScore: number;
}

interface APIKeyData {
  id: string;
  hash: string;
  permissions: string[];
  rateLimit: number;
  createdAt: string;
  totalRequests: number;
}

// API key must be provisioned via environment or admin endpoint — no hardcoded defaults
if (process.env.ASTRA_DEFAULT_API_KEY && apiKeys.size === 0) {
  apiKeys.set(process.env.ASTRA_DEFAULT_API_KEY, {
    id: 'key_env',
    hash: process.env.ASTRA_DEFAULT_API_KEY,
    permissions: ['verify', 'challenge', 'analyze'],
    rateLimit: 100,
    createdAt: new Date().toISOString(),
    totalRequests: 0,
  });
}

const MAX_RATE_LIMIT_ENTRIES = 10_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record) {
    // Prune expired entries if map too large
    if (rateLimits.size > MAX_RATE_LIMIT_ENTRIES) {
      for (const [k, v] of rateLimits) {
        if (now > v.resetAt) rateLimits.delete(k);
      }
    }
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (now > record.resetAt) { record.count = 1; record.resetAt = now + 60_000; return true; }
  if (record.count >= 100) return false;
  record.count++;
  return true;
}

const MAX_SESSIONS = 50_000;

function createSession(ip: string, userAgent: string): SessionData {
  const id = `sess_${crypto.randomUUID()}`;
  const session: SessionData = {
    id, ip, userAgent, createdAt: Date.now(), riskScores: [],
    verifications: 0, challengesPassed: 0, challengesFailed: 0,
    lastActivity: Date.now(), trustScore: 0.5,
  };
  // Prune stale sessions if map too large
  if (sessions.size > MAX_SESSIONS) {
    const cutoff = Date.now() - 3_600_000; // 1h
    for (const [k, v] of sessions) {
      if (v.lastActivity < cutoff) sessions.delete(k);
    }
  }
  sessions.set(id, session);
  return session;
}

function getOrCreateSession(ip: string, userAgent: string, sessionId?: string): SessionData {
  if (sessionId && sessions.has(sessionId)) {
    const existing = sessions.get(sessionId)!;
    // Validate session ownership: IP must match to prevent session hijacking
    if (existing.ip !== ip) {
      return createSession(ip, userAgent);
    }
    existing.lastActivity = Date.now();
    return existing;
  }
  return createSession(ip, userAgent);
}

function analyzeBehavior(clientData: any): number {
  let riskScore = 0;
  const behavior = clientData?.behavior || {};
  if (behavior.mouseData) {
    const m = behavior.mouseData;
    if (m.totalMovements === 0 && m.totalClicks === 0) riskScore += 0.3;
    if (m.averageVelocity > 5000) riskScore += 0.15;
    if (m.directionChanges > m.totalMovements * 0.9 && m.totalMovements > 50) riskScore += 0.2;
    if (m.straightLineRatio > 0.95 && m.totalMovements > 30) riskScore += 0.15;
  }
  if (behavior.keyboardData) {
    const k = behavior.keyboardData;
    if (k.averageInterval < 10 && k.totalKeystrokes > 10) riskScore += 0.25;
    if (k.consistency > 0.98 && k.totalKeystrokes > 20) riskScore += 0.15;
  }
  if (behavior.timingData && behavior.timingData.sessionDuration < 500) riskScore += 0.2;
  return Math.min(riskScore, 1);
}

function analyzeFingerprint(clientData: any): { score: number; anomalies: string[] } {
  const fingerprints = clientData?.fingerprints || {};
  const anomalies: string[] = [];
  let score = 0;
  if (!fingerprints.canvas && !fingerprints.canvasHash && Object.keys(fingerprints).length > 0) {
    anomalies.push('missing_canvas_fingerprint'); score += 0.1;
  }
  if (fingerprints.webgl && fingerprints.webglRenderer === 'Google SwiftShader') {
    anomalies.push('software_webgl_rendering'); score += 0.15;
  }
  if (clientData?.languages && clientData.languages.length > 10) {
    anomalies.push('excessive_languages'); score += 0.1;
  }
  return { score: Math.min(score, 1), anomalies };
}

function analyzeContext(req: VercelRequest): { score: number } {
  let score = 0;
  const ua = req.headers['user-agent'] || '';
  if (/Headless|headless/.test(ua)) score += 0.3;
  if (/PhantomJS|Selenium|webdriver|puppeteer/.test(ua)) score += 0.4;
  if (!req.headers['accept-language']) score += 0.05;
  return { score: Math.min(score, 1) };
}

function calculateCompositeScore(behavior: number, fingerprint: number, context: number, trust: number): number {
  return behavior * 0.4 + fingerprint * 0.2 + context * 0.25 + (1 - trust) * 0.15;
}

function determineTier(riskScore: number): number {
  if (riskScore < 0.15) return 0;
  if (riskScore < 0.30) return 1;
  if (riskScore < 0.50) return 2;
  if (riskScore < 0.70) return 3;
  return 4;
}

function generateChallenge(tier: number, sessionId: string, fpKey?: string, prevType?: string): any {
  const all = ['pulse', 'tilt', 'flick', 'breath', 'rhythm', 'pressure', 'path', 'semantic'];
  // After multiple failures, switch challenge type for variety (humans handle variety, bots struggle).
  const pool = prevType ? all.filter(t => t !== prevType) : all;
  const diffs = ['easy', 'medium', 'hard', 'extreme'];
  const type = pool[Math.floor(Math.random() * pool.length)];
  const diff = diffs[Math.min(Math.max(tier - 1, 0), diffs.length - 1)];
  const id = `chal_${crypto.randomUUID()}`;
  const instructions: Record<string, string> = {
    pulse: 'Tap along with the rhythm.',
    tilt: 'Tilt your device or drag to balance the ball.',
    flick: 'Swipe in the indicated direction.',
    breath: 'Follow the breathing circle.',
    rhythm: 'Tap the rhythm pattern.',
    pressure: 'Hold with steady pressure.',
    path: 'Trace the path.',
    semantic: 'Tap the correct shape.',
  };
  const challenge = {
    id, type, difficulty: diff, sessionId, fpKey,
    expiresAt: Date.now() + 300_000,
    instructions: instructions[type] || 'Complete the challenge.',
    attempts: 0,
    tier,
  };
  challenges.set(id, challenge);
  return challenge;
}

// CORS allowlist — only reflect origins that are explicitly whitelisted.
// Set ASTRA_ALLOWED_ORIGINS env var (comma-separated). Empty = deny all cross-origin.
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const allowList = (process.env.ASTRA_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowList.includes(origin);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, reason: 'method_not_allowed' });

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ success: false, reason: 'rate_limit_exceeded', retryAfter: 60 });

  try {
    const { clientData, action } = req.body;
    const fpKey = hashFingerprint(clientData, ip as string);

    // Reload defense: check persistent block BEFORE any session logic
    const hardBlock = isHardBlocked(fpKey);
    if (hardBlock.blocked) {
      return res.status(403).json({
        success: false,
        tier: 4,
        reason: 'hard_blocked',
        blocked: true,
        retryAfter: hardBlock.retryAfter,
        blockReason: 'Too many failed verification attempts. Try again later.',
        fpKey,
      });
    }

    const session = getOrCreateSession(ip as string, req.headers['user-agent'] || '', clientData?.sessionId);

    const behaviorScore = analyzeBehavior(clientData);
    const fingerprintResult = analyzeFingerprint(clientData);
    const contextResult = analyzeContext(req);
    const compositeScore = calculateCompositeScore(behaviorScore, fingerprintResult.score, contextResult.score, session.trustScore);
    let tier = determineTier(compositeScore);
    // Carry forward failure-based tier escalation — survives page reload
    tier = escalateTier(tier, fpKey);

    session.riskScores.push(compositeScore);
    if (session.riskScores.length > 20) {
      session.riskScores = session.riskScores.slice(-20);
    }
    session.verifications++;
    session.lastActivity = Date.now();
    if (session.verifications > 3) {
      const avg = session.riskScores.slice(-5).reduce((a: number, b: number) => a + b, 0) / Math.min(session.riskScores.length, 5);
      session.trustScore = session.trustScore * 0.7 + (1 - avg) * 0.3;
    }

    const blockRec = getBlockRecord(fpKey);
    const carriedFailures = blockRec?.failureCount || 0;

    if (compositeScore > 0.7 || tier >= 4) {
      const challenge = generateChallenge(Math.max(tier, 4), session.id, fpKey);
      return res.json({
        success: false,
        tier,
        reason: carriedFailures >= FAILURE_ESCALATE_2 ? 'gate_required' : 'challenge_required',
        riskScore: compositeScore,
        challenge,
        sessionId: session.id,
        fpKey,
        carriedFailures,
        details: { behaviorScore, fingerprintAnomalies: fingerprintResult.anomalies, contextScore: contextResult.score }
      });
    }
    if (compositeScore > 0.3 || carriedFailures > 0) {
      const challenge = generateChallenge(tier, session.id, fpKey);
      return res.json({
        success: false,
        tier,
        reason: 'challenge_required',
        riskScore: compositeScore,
        challenge,
        sessionId: session.id,
        fpKey,
        carriedFailures,
        details: { behaviorScore, fingerprintAnomalies: fingerprintResult.anomalies, contextScore: contextResult.score }
      });
    }

    return res.json({
      success: true,
      tier,
      reason: 'verified',
      riskScore: compositeScore,
      sessionId: session.id,
      fpKey,
      details: { behaviorScore, fingerprintAnomalies: fingerprintResult.anomalies, contextScore: contextResult.score, message: tier === 0 ? 'Invisible verification — no friction applied' : 'Minimal friction applied' }
    });
  } catch (error: any) {
    console.error('[ASTRA] Verification error:', error);
    return res.status(500).json({ success: false, reason: 'server_error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
}
