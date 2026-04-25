/**
 * ASTRA Shield — Challenge Verification Endpoint
 *
 * Verifies a challenge solution and ties failures into the persistent
 * fingerprint-keyed block store from verify.ts. After 5 failures inside
 * the failure window the user (or bot) is hard-blocked for the cooldown
 * TTL — reloading the page cannot reset this.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  hashFingerprint,
  recordChallengeFailure,
  recordChallengeSuccess,
  getBlockRecord,
} from './verify';

declare global {
  var astraSessions: Map<string, any>;
  var astraChallenges: Map<string, any>;
}

if (!globalThis.astraSessions) globalThis.astraSessions = new Map();
if (!globalThis.astraChallenges) globalThis.astraChallenges = new Map();

const sessions = globalThis.astraSessions;
const challenges = globalThis.astraChallenges;

// Per-IP rate limiting for challenge verification
const challengeRateLimits = new Map<string, { count: number; resetAt: number }>();
const CHALLENGE_RATE_MAX = 30;
const CHALLENGE_RATE_WINDOW = 60_000;
const MAX_PER_CHALLENGE_ATTEMPTS = 3;

function checkChallengeRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = challengeRateLimits.get(ip);
  if (!rec || now > rec.resetAt) {
    if (challengeRateLimits.size > 5_000) {
      for (const [k, v] of challengeRateLimits) {
        if (now > v.resetAt) challengeRateLimits.delete(k);
      }
    }
    challengeRateLimits.set(ip, { count: 1, resetAt: now + CHALLENGE_RATE_WINDOW });
    return true;
  }
  if (rec.count >= CHALLENGE_RATE_MAX) return false;
  rec.count++;
  return true;
}

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
  if (!checkChallengeRateLimit(ip)) {
    return res.status(429).json({ success: false, reason: 'rate_limit_exceeded', retryAfter: 60 });
  }

  const { challengeId, solution, sessionId, clientData } = req.body || {};
  if (!challengeId || solution === undefined) {
    return res.status(400).json({ success: false, reason: 'missing_parameters' });
  }

  const challenge = challenges.get(challengeId);
  if (!challenge) return res.status(404).json({ success: false, reason: 'challenge_not_found' });

  // Prefer the fingerprint stored on the challenge (issued by verify.ts) — falls back to a
  // recomputed hash if the SDK supplied client data with this request. Either way, this is
  // the key that ties failures to a persistent record that survives reload.
  const fpKey: string = challenge.fpKey || hashFingerprint(clientData, ip as string);
  const tier: number = typeof challenge.tier === 'number' ? challenge.tier : 2;

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(challengeId);
    const fail = recordChallengeFailure(fpKey, tier);
    return res.json({
      success: false,
      reason: 'challenge_expired',
      attemptsRemaining: 0,
      hardBlock: fail.hardBlock,
      retryAfter: fail.retryAfter,
      failureCount: fail.failureCount,
      cooldown: fail.hardBlock,
      fpKey,
    });
  }

  const isValid = (typeof solution === 'object' && solution !== null)
    ? (solution.completed === true || solution.success === true)
    : false;

  if (!isValid) {
    challenge.attempts = (challenge.attempts || 0) + 1;
    const fail = recordChallengeFailure(fpKey, tier);

    // Per-challenge attempts cap (separate from the per-fingerprint window count).
    if (challenge.attempts >= MAX_PER_CHALLENGE_ATTEMPTS) {
      challenges.delete(challengeId);
      return res.json({
        success: false,
        reason: fail.hardBlock ? 'cooldown_active' : 'max_attempts_exceeded',
        attemptsRemaining: 0,
        hardBlock: fail.hardBlock,
        retryAfter: fail.retryAfter,
        failureCount: fail.failureCount,
        cooldown: fail.hardBlock,
        nextChallengeType: 'switch',
        fpKey,
      });
    }

    return res.json({
      success: false,
      reason: fail.hardBlock ? 'cooldown_active' : 'invalid_solution',
      attemptsRemaining: MAX_PER_CHALLENGE_ATTEMPTS - challenge.attempts,
      hardBlock: fail.hardBlock,
      retryAfter: fail.retryAfter,
      failureCount: fail.failureCount,
      cooldown: fail.hardBlock,
      fpKey,
    });
  }

  // Success — clear challenge, reduce failure record, bump session trust.
  challenges.delete(challengeId);
  recordChallengeSuccess(fpKey);

  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    s.challengesPassed = (s.challengesPassed || 0) + 1;
    s.trustScore = Math.min(1, s.trustScore + 0.2);
    s.lastActivity = Date.now();
  }

  const rec = getBlockRecord(fpKey);
  return res.json({
    success: true,
    reason: 'challenge_passed',
    verificationLevel: challenge.difficulty || 'medium',
    failureCount: rec?.failureCount || 0,
    fpKey,
  });
}
