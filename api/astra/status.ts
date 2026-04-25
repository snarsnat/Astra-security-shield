/**
 * ASTRA Shield — Status Endpoint
 *
 * Returns the current persistent state for a fingerprint+session pair.
 * Called by the SDK on init / before each protected action so reloading
 * the page cannot reset an active hard cooldown.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashFingerprint, getBlockRecord } from './verify';

const HARD_BLOCK_THRESHOLD = 5;

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

  try {
    const { clientData } = req.body || {};
    const fpKey = hashFingerprint(clientData, ip as string);
    const rec = getBlockRecord(fpKey);
    const now = Date.now();

    if (rec && rec.blockedUntil > now) {
      return res.json({
        success: false,
        blocked: true,
        cooldown: true,
        retryAfter: Math.ceil((rec.blockedUntil - now) / 1000),
        failureCount: rec.failureCount,
        tier: 4,
        reason: 'cooldown_active',
        message: "You've failed a lot of challenges",
        subMessage: 'Astra detected suspicious repeated attempts. Please wait before trying again.',
        fpKey,
      });
    }

    return res.json({
      success: true,
      blocked: false,
      cooldown: false,
      failureCount: rec?.failureCount || 0,
      hardBlockThreshold: HARD_BLOCK_THRESHOLD,
      tier: rec?.tier || 0,
      riskScore: rec?.riskScore || 0,
      fpKey,
    });
  } catch (error: any) {
    console.error('[ASTRA] Status error:', error);
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
}
