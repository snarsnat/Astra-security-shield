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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, reason: 'method_not_allowed' });

  const { challengeId, solution, sessionId } = req.body;
  if (!challengeId || !solution) return res.status(400).json({ success: false, reason: 'missing_parameters' });

  const challenge = challenges.get(challengeId);
  if (!challenge) return res.status(404).json({ success: false, reason: 'challenge_not_found' });
  if (Date.now() > challenge.expiresAt) { challenges.delete(challengeId); return res.json({ success: false, reason: 'challenge_expired', attemptsRemaining: 0 }); }

  const isValid = solution.completed === true || solution.success === true || solution === true;
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
