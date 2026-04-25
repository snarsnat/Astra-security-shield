/**
 * ASTRA Shield — Challenge Verification Endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

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
const CHALLENGE_RATE_MAX = 30; // 30 attempts per minute
const CHALLENGE_RATE_WINDOW = 60_000;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, reason: 'method_not_allowed' });

  // Rate limit
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
  if (!checkChallengeRateLimit(ip)) {
    return res.status(429).json({ success: false, reason: 'rate_limit_exceeded', retryAfter: 60 });
  }

  const { challengeId, solution, sessionId } = req.body;
  if (!challengeId || !solution) return res.status(400).json({ success: false, reason: 'missing_parameters' });

  const challenge = challenges.get(challengeId);
  if (!challenge) return res.status(404).json({ success: false, reason: 'challenge_not_found' });
  if (Date.now() > challenge.expiresAt) { challenges.delete(challengeId); return res.json({ success: false, reason: 'challenge_expired', attemptsRemaining: 0 }); }

  const isValid = (typeof solution === 'object' && solution !== null)
    ? (solution.completed === true || solution.success === true)
    : false;
  if (!isValid) {
    challenge.attempts = (challenge.attempts || 0) + 1;
    if (challenge.attempts >= 3) { challenges.delete(challengeId); return res.json({ success: false, reason: 'max_attempts_exceeded', attemptsRemaining: 0 }); }
    return res.json({ success: false, reason: 'invalid_solution', attemptsRemaining: 3 - challenge.attempts });
  }

  challenges.delete(challengeId);
  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    s.challengesPassed = (s.challengesPassed || 0) + 1;
    s.trustScore = Math.min(1, s.trustScore + 0.2);
  }

  return res.json({ success: true, reason: 'challenge_passed', verificationLevel: challenge.difficulty || 'medium' });
}
