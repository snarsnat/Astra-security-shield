/**
 * ASTRA Shield — shared crypto + request helpers for the serverless tier.
 *
 * The challenge flow is made *stateless and forgery-resistant* with these:
 *   - signChallengeToken/verifyChallengeToken: HMAC-signed challenge spec so a
 *     challenge issued on one warm lambda can be verified on any other instance
 *     (no shared in-memory map required).
 *   - verifyPow: proof-of-work check. A "pass" requires actually computing a
 *     sha256 preimage with N leading hex zeros — it cannot be faked by asserting
 *     `{ completed: true }`.
 */
import crypto from 'node:crypto';
import type { VercelRequest } from '@vercel/node';

const SECRET =
  process.env.ASTRA_SIGNING_SECRET ||
  process.env.ASTRA_DEFAULT_API_KEY ||
  'astra-dev-secret-change-me';

export const usingDefaultSecret = SECRET === 'astra-dev-secret-change-me';

if (usingDefaultSecret) {
  // eslint-disable-next-line no-console
  console.warn(
    '[ASTRA] WARNING: no ASTRA_SIGNING_SECRET set — using an insecure default. ' +
    'Challenge tokens are forgeable until this is configured.'
  );
}

export function hmac(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Count leading zero hex characters (matches ChallengeService.verifyPoWSolution).
export function leadingZeroHex(hex: string): number {
  const m = hex.match(/^0*/);
  return m ? m[0].length : 0;
}

/**
 * Verify a proof-of-work: sha256(`${nonce}.${pow}`) must begin with
 * `difficulty` hex zeros. Stateless — needs only the (signed) nonce/difficulty.
 */
export function verifyPow(nonce: string, pow: unknown, difficulty: number): boolean {
  if (pow === undefined || pow === null || pow === '') return false;
  if (!nonce || !Number.isFinite(difficulty) || difficulty < 1) return false;
  return leadingZeroHex(sha256hex(`${nonce}.${pow}`)) >= difficulty;
}

export interface ChallengeToken {
  id: string;
  type: string;
  tier: number;
  fpKey: string;
  nonce: string;
  difficulty: number;
  expiresAt: number;
}

// Sign a self-contained challenge so it verifies on any instance without shared state.
export function signChallengeToken(fields: ChallengeToken): string {
  const body = Buffer.from(JSON.stringify(fields)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function verifyChallengeToken(token: unknown): ChallengeToken | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, hmac(body))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as ChallengeToken;
  } catch {
    return null;
  }
}

/**
 * Resolve the client IP, preferring headers a client cannot spoof on Vercel.
 * `x-real-ip` is set by Vercel's edge to the actual connecting IP. Only fall
 * back to the (client-influenced) leftmost `x-forwarded-for` off-platform.
 */
export function clientIp(req: VercelRequest): string {
  // On Vercel, x-real-ip is set by the edge to the real connecting IP — trusted.
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  // Off-platform, x-forwarded-for is fully client-controlled and must NOT be
  // trusted unless a proxy that strips inbound XFF sits in front. Gate it behind
  // an explicit opt-in so a self-hosted deployment can't be spoofed by default.
  if (process.env.ASTRA_TRUST_PROXY === 'true') {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const first = xff.split(',')[0].trim();
      if (first) return first;
    }
  }

  // Unspoofable: the real TCP peer address.
  return req.socket?.remoteAddress || 'unknown';
}

// /24 subnet of an IPv4 address (null for IPv6/unknown). Used for a coarse block
// that a single-field fingerprint mutation cannot rotate away from.
export function subnet24(ip: string): string | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  return m ? `net:${m[1]}.${m[2]}.${m[3]}.0/24` : null;
}
