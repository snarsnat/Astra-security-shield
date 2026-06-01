/**
 * MLClient — fetches the adaptive per-app anomaly score.
 *
 * Posts the current behavioral feature vector to /api/ml/score, which scores it
 * against the app's learned distribution of verified-human sessions (Welford
 * online stats). Returns 0..1. Cold-start apps return 0 so new users are never
 * falsely flagged before the model has data.
 *
 * This is what makes Astra adaptive rather than purely hand-tuned: each app
 * learns its own "normal" and flags deviation from it.
 */
export class MLClient {
  constructor(options = {}) {
    this.appToken = options.appToken || null;
    let base = 'https://astra-shield-site.vercel.app/api/ml/score';
    try {
      const ep = options.mlEndpoint
        || (options.telemetryEndpoint || '').replace(/\/events\/ingest\/?$/, '/ml/score');
      if (ep) base = ep;
    } catch {}
    this.endpoint = base;
    this._lastScore = 0;
    this._lastAt = 0;
    this.minIntervalMs = options.mlMinIntervalMs || 5000; // throttle network calls
  }

  get available() {
    return typeof fetch !== 'undefined' && !!this.appToken;
  }

  // Returns 0..1 adaptive anomaly score. Throttled + cached; never throws.
  async score(features) {
    if (!this.available || !features) return 0;
    const now = Date.now();
    if (now - this._lastAt < this.minIntervalMs) return this._lastScore;
    this._lastAt = now;
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Token': this.appToken },
        body: JSON.stringify({ features }),
      });
      if (!res.ok) return this._lastScore;
      const data = await res.json();
      this._lastScore = data.cold ? 0 : (data.anomalyScore || 0);
      return this._lastScore;
    } catch {
      return this._lastScore;
    }
  }
}
