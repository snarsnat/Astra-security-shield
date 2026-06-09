/**
 * solveServerlessPow — client solver for the serverless challenge proof-of-work.
 *
 * The serverless tier (api/astra/challenge-verify) gates a challenge pass on a
 * proof-of-work: find `pow` such that sha256(`${nonce}.${pow}`) begins with
 * `difficulty` leading hex zeros. This must match _crypto.ts on the server.
 *
 * Usage in a challenge flow, after the UI challenge completes:
 *   const pow = await solveServerlessPow(challenge.nonce, challenge.powDifficulty);
 *   // POST { challengeId, challengeToken: challenge.token, solution: { pow }, ... }
 */
export async function solveServerlessPow(nonce, difficulty, { maxIterations = 5_000_000 } = {}) {
  if (!nonce || !difficulty) throw new Error('nonce and difficulty required');
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('SubtleCrypto unavailable');
  }
  const enc = new TextEncoder();
  for (let i = 0; i < maxIterations; i++) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${nonce}.${i}`));
    if (leadingZeroHex(new Uint8Array(digest)) >= difficulty) return String(i);
    if ((i & 0x3ff) === 0) await new Promise(r => setTimeout(r, 0)); // yield to UI
  }
  throw new Error('pow_timeout');
}

// Count leading zero hex characters of a digest (2 hex chars per byte).
function leadingZeroHex(bytes) {
  let zeros = 0;
  for (const b of bytes) {
    const hi = b >> 4;
    const lo = b & 0x0f;
    if (hi === 0) { zeros++; } else { return zeros; }
    if (lo === 0) { zeros++; } else { return zeros; }
  }
  return zeros;
}
