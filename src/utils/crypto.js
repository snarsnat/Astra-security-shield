/**
 * Crypto utilities for secure token generation
 */

/**
 * Generate a random token
 */
export function generateToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Hash a string using simple hash (for non-cryptographic purposes)
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Encode data to base64
 */
export function encodeBase64(data) {
  return btoa(unescape(encodeURIComponent(data)));
}

/**
 * Decode base64 data
 */
export function decodeBase64(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}
