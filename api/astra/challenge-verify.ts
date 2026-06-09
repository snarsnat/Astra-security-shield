/**
 * ASTRA Shield — Challenge Verification Endpoint
 *
 * A challenge "passes" ONLY when the client returns a valid proof-of-work for
 * the server-issued nonce. This is verified cryptographically and statelessly
 * (the challenge spec is HMAC-signed), so:
 *   - A bot CANNOT pass by asserting `{ completed: true }` — it must actually
 *     compute a sha256 preimage with N leading hex zeros.
 *   - Verification works across Vercel instances without shared memory: the
 *     signed `challengeToken` carries the nonce/difficulty, so the instance that
 *     receives the verify call doesn't need the one that issued the challenge.
 *
 * Failures still feed the fingerprint-keyed block store (reload-resistant).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  hashFingerprint,
  recordChallengeFailure,
  recordChallengeSuccess,
  getBlockRecord,
} from './verify';
import { clientIp, verifyPow, verifyChallengeToken } from './_crypto';

declare global {
  var astraSessions: Map<string, any>;
  var astraChallenges: Map<string, any>;
  var astraUsedNonces: Map<string, number>;
}

if (!globalThis.astraSessions) globalThis.astraSessions = new Map();
if (!globalThis.astraChallenges) globalThis.astraChallenges = new Map();
if (!globalThis.astraUsedNonces) globalThis.astraUsedNonces = new Map();

const sessions = globalThis.astraSessions;
const challenges = globalThis.astraChallenges;
const usedNonces = globalThis.astraUsedNonces;

const challengeRateLimits = new Map<string, { count: number; resetAt: number }>();
const CHALLENGE_RATE_MAX = 30;
const CHALLENGE_RATE_WINDOW = 60_000;
const MAX_PER_CHALLENGE_ATTEMPTS = 3;
const NONCE_TTL_MS = 300_000;

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

// Single-use nonce: prevents replaying one solved PoW for repeated passes.
function consumeNonce(nonce: string): boolean {
  const now = Date.now();
  if (usedNonces.size > 50_000) {
    for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n);
  }
  const exp = usedNonces.get(nonce);
  if (exp && exp > now) return false; // already used
  usedNonces.set(nonce, now + NONCE_TTL_MS);
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

  const ip = clientIp(req);
  if (!checkChallengeRateLimit(ip)) {
    return res.status(429).json({ success: false, reason: 'rate_limit_exceeded', retryAfter: 60 });
  }

  const { challengeId, solution, sessionId, clientData, challengeToken } = req.body || {};
  if (!challengeId || solution === undefined) {
    return res.status(400).json({ success: false, reason: 'missing_parameters' });
  }

  // Resolve the challenge. Prefer the in-memory record (warm instance); fall back
  // to the HMAC-signed token so verification works on any instance (stateless).
  let challenge: any = challenges.get(challengeId);
  if (!challenge && challengeToken) {
    const t = verifyChallengeToken(challengeToken);
    if (t && t.id === challengeId) {
      challenge = {
        id: t.id, type: t.type, tier: t.tier, fpKey: t.fpKey,
        nonce: t.nonce, powDifficulty: t.difficulty, expiresAt: t.expiresAt,
        attempts: 0, fromToken: true,
      };
    }
  }
  if (!challenge) return res.status(404).json({ success: false, reason: 'challenge_not_found' });

  const fpKey: string = challenge.fpKey || hashFingerprint(clientData, ip);
  const tier: number = typeof challenge.tier === 'number' ? challenge.tier : 2;
  const nonce: string = challenge.nonce;
  const difficulty: number = typeof challenge.powDifficulty === 'number' ? challenge.powDifficulty : 2;

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(challengeId);
    const fail = recordChallengeFailure(fpKey, tier);
    return res.json({
      success: false, reason: 'challenge_expired', attemptsRemaining: 0,
      hardBlock: fail.hardBlock, retryAfter: fail.retryAfter, failureCount: fail.failureCount,
      cooldown: fail.hardBlock, fpKey,
    });
  }

  // Extract the proof-of-work the client computed (accept `pow` or `nonce`).
  const pow = (typeof solution === 'object' && solution !== null)
    ? (solution.pow ?? solution.nonce ?? solution.powSolution)
    : undefined;

  // No proof supplied yet → ask for it. This is NOT counted as a failure, so a
  // legitimate client that hasn't solved the PoW yet is never wrongly blocked.
  if (pow === undefined || pow === null || pow === '') {
    return res.json({
      success: false,
      reason: 'proof_required',
      proofOfWork: { nonce, difficulty },
      attemptsRemaining: MAX_PER_CHALLENGE_ATTEMPTS - (challenge.attempts || 0),
      fpKey,
    });
  }

  const powValid = verifyPow(nonce, pow, difficulty);

  if (!powValid) {
    challenge.attempts = (challenge.attempts || 0) + 1;
    if (!challenge.fromToken) challenges.set(challengeId, challenge);
    const fail = recordChallengeFailure(fpKey, tier);

    if (challenge.attempts >= MAX_PER_CHALLENGE_ATTEMPTS) {
      challenges.delete(challengeId);
      return res.json({
        success: false,
        reason: fail.hardBlock ? 'cooldown_active' : 'max_attempts_exceeded',
        attemptsRemaining: 0, hardBlock: fail.hardBlock, retryAfter: fail.retryAfter,
        failureCount: fail.failureCount, cooldown: fail.hardBlock, nextChallengeType: 'switch', fpKey,
      });
    }
    return res.json({
      success: false,
      reason: fail.hardBlock ? 'cooldown_active' : 'invalid_proof',
      attemptsRemaining: MAX_PER_CHALLENGE_ATTEMPTS - challenge.attempts,
      hardBlock: fail.hardBlock, retryAfter: fail.retryAfter, failureCount: fail.failureCount,
      cooldown: fail.hardBlock, fpKey,
    });
  }

  // Valid PoW — enforce single-use to block replay of one solved nonce.
  if (!consumeNonce(nonce)) {
    return res.status(409).json({ success: false, reason: 'proof_replayed', fpKey });
  }

  // Authoritative pass.
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
    verified: true,           // cryptographically verified — safe to trust
    reason: 'challenge_passed',
    verificationLevel: challenge.difficulty || 'medium',
    failureCount: rec?.failureCount || 0,
    fpKey,
  });
}
