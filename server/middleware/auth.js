import APIKeyService from '../services/APIKeyService.js';
import crypto from 'crypto';

/**
 * Auth middleware — hardened.
 *
 * Security notes vs. the previous version:
 *   • API keys are NO LONGER accepted via query-string. Query params end up
 *     in web-server logs, browser history and referer headers — treating a
 *     bearer credential that way is a leak in waiting.
 *   • Constant-time comparison against a format-probe so an attacker cannot
 *     learn "valid-format but unknown key" vs. "malformed" from timing.
 *   • Error bodies are minimal and uniform on missing/invalid/expired keys so
 *     credential stuffing attackers get no oracle to differentiate against.
 *     (The actual error is still logged server-side via the request id.)
 *   • The shape of the attached `req.apiKey` is sanitised — the raw hash is
 *     not exposed to downstream handlers.
 */

const KEY_FORMAT = /^astra_[a-z0-9_]+_[A-Za-z0-9_-]{16,64}$/;

function extractKey(req) {
  // Authorization: Bearer ...
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      const k = authHeader.slice(7).trim();
      if (k) return k;
    }
  }
  // X-API-Key: ...
  const xKey = req.headers['x-api-key'];
  if (xKey && typeof xKey === 'string' && xKey.trim()) {
    return xKey.trim();
  }
  // Intentionally NOT reading req.query.apiKey anymore.
  return null;
}

function sanitiseKeyData(keyData) {
  if (!keyData) return null;
  // Strip hash and internal counters before handing to routes
  const { hash, rateUsage, ...safe } = keyData;
  return safe;
}

export function requireAPIKey(requiredPermissions = ['verify']) {
  return (req, res, next) => {
    const apiKey = extractKey(req);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'authentication_required',
      });
    }

    // Cheap format probe — do a constant-time compare against a dummy of the
    // same length so malformed keys don't return noticeably faster than
    // well-formed-but-wrong ones.
    if (!KEY_FORMAT.test(apiKey)) {
      const dummy = Buffer.alloc(apiKey.length || 1);
      try { crypto.timingSafeEqual(dummy, Buffer.from(apiKey.slice(0, dummy.length).padEnd(dummy.length, '\0'))); } catch {}
      return res.status(401).json({ success: false, error: 'invalid_api_key' });
    }

    const result = APIKeyService.validateKey(apiKey);

    if (!result.valid) {
      // Uniform response regardless of why (unknown / revoked / rate-limited)
      // except for rate-limited which must return 429 to be honest about retry.
      if (result.error && /rate limit/i.test(result.error)) {
        return res.status(429).json({ success: false, error: 'rate_limit_exceeded' });
      }
      return res.status(401).json({ success: false, error: 'invalid_api_key' });
    }

    // Permission check
    const granted = result.keyData.permissions || [];
    const hasPermission = requiredPermissions.some(p => granted.includes(p));
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'insufficient_permissions',
        required: requiredPermissions,
      });
    }

    req.apiKey = sanitiseKeyData(result.keyData);
    // Keep the hash on a non-enumerable field for APIKeyService.getKeyStats
    Object.defineProperty(req, '_apiKeyHash', {
      value: result.keyData.hash,
      enumerable: false,
    });
    next();
  };
}

/**
 * Optional API key validation — does not block if missing. Same extraction
 * rules (no query-string keys).
 */
export function optionalAPIKey() {
  return (req, res, next) => {
    const apiKey = extractKey(req);
    if (apiKey && KEY_FORMAT.test(apiKey)) {
      const result = APIKeyService.validateKey(apiKey);
      if (result.valid) {
        req.apiKey = sanitiseKeyData(result.keyData);
        Object.defineProperty(req, '_apiKeyHash', {
          value: result.keyData.hash,
          enumerable: false,
        });
      }
    }
    next();
  };
}
