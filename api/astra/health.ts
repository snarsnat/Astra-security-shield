/**
 * ASTRA Shield — Health Check
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'healthy',
    service: 'ASTRA Shield',
    version: '2.0.0',
    timestamp: Date.now(),
    endpoints: { verify: '/api/astra/verify', challengeVerify: '/api/astra/challenge-verify', health: '/api/astra/health' },
  });
}
