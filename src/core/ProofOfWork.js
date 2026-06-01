/**
 * ProofOfWork — client side of Astra's server-verified attestation.
 *
 * After a challenge passes, the SDK:
 *   1. requests a server-signed nonce + difficulty   (POST /api/verify/nonce)
 *   2. solves the PoW: finds N s.t. sha256(`${nonce}.${N}`) has `difficulty`
 *      leading zero bits  (costs CPU — trivial once, expensive at bot-farm scale)
 *   3. submits the solution  (POST /api/verify/attest)  and receives a signed
 *      attestation JWT.
 *
 * The app backend verifies that JWT via /api/verify/check. Because the signing
 * secret is server-only, a forged client-side "passed" produces no valid
 * attestation — closing the biggest hole in a purely client-side shield.
 */
export class ProofOfWork {
  constructor(options = {}) {
    this.appToken = options.appToken || null;
    // Derive the verify base from the telemetry endpoint origin
    let base = 'https://astra-shield-site.vercel.app/api/verify';
    try {
      const ep = options.verifyEndpoint
        || (options.telemetryEndpoint || '').replace(/\/events\/ingest\/?$/, '/verify');
      if (ep) base = ep;
    } catch {}
    this.base = base;
    this.maxIterations = options.powMaxIterations || 5_000_000;
  }

  get available() {
    return typeof crypto !== 'undefined' && !!crypto.subtle && !!this.appToken;
  }

  // Count leading zero bits over the raw sha256 bytes — must match the server.
  _leadingZeroBits(bytes) {
    let bits = 0;
    for (const b of bytes) {
      if (b === 0) { bits += 8; continue; }
      let mask = 0x80, c = 0;
      while (mask && !(b & mask)) { c++; mask >>= 1; }
      bits += c;
      break;
    }
    return bits;
  }

  async _sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return new Uint8Array(buf);
  }

  // Solve the proof-of-work. Yields to the event loop periodically so the UI
  // never freezes, even at higher difficulties.
  async solve(nonce, difficulty) {
    for (let i = 0; i < this.maxIterations; i++) {
      const digest = await this._sha256(`${nonce}.${i}`);
      if (this._leadingZeroBits(digest) >= difficulty) return String(i);
      if ((i & 0x3ff) === 0) await new Promise(r => setTimeout(r, 0)); // yield every 1024
    }
    throw new Error('pow_timeout');
  }

  /**
   * Run the full attestation handshake.
   * @returns {Promise<{verified:boolean, attestation?:string, expiresIn?:number}>}
   */
  async attest({ oosScore = 0, challengePassed, challengeType = null, features = null } = {}) {
    if (!this.available) return { verified: false, reason: 'unavailable' };
    try {
      // 1. nonce
      const nRes = await fetch(`${this.base}/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Token': this.appToken },
        body: JSON.stringify({ oos: oosScore }),
      });
      if (!nRes.ok) return { verified: false, reason: 'nonce_failed' };
      const n = await nRes.json();

      // 2. solve
      const pow = await this.solve(n.nonce, n.difficulty);

      // 3. attest
      const aRes = await fetch(`${this.base}/attest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Token': this.appToken },
        body: JSON.stringify({
          nonce: n.nonce, ts: n.ts, difficulty: n.difficulty, sig: n.sig,
          pow, challengePassed, challengeType, oosScore, features,
        }),
      });
      if (!aRes.ok) return { verified: false, reason: 'attest_failed' };
      return await aRes.json();
    } catch (e) {
      return { verified: false, reason: 'error', error: e.message };
    }
  }
}
