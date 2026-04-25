/**
 * ASTRA Shield SDK
 * 
 * The official SDK for integrating ASTRA's behavioral bot-detection
 * and human-verification system into your application.
 * 
 * Usage:
 *   import { Astra } from 'astra-shield';
 *   const astra = new Astra({ apiKey: 'astra_myapp_xxxx', endpoint: 'https://...' });
 *   const result = await astra.verify({ action: 'login' });
 */

// ─── Types ──────────────────────────────────────────────────

/**
 * @typedef {Object} AstraOptions
 * @property {string} apiKey - Your ASTRA API key (starts with "astra_")
 * @property {string} [endpoint] - ASTRA server endpoint (default: '/api/verify')
 * @property {string} [serverUrl] - Full ASTRA server URL (default: 'http://localhost:3001')
 * @property {boolean} [debug] - Enable debug logging (default: false)
 * @property {'auto'|'light'|'dark'} [theme] - Challenge theme
 * @property {string} [storagePrefix] - LocalStorage prefix (default: 'astra_')
 * @property {number} [sessionDuration] - Session duration in ms (default: 1800000)
 * @property {Function} [onReady] - Called when SDK is ready
 * @property {Function} [onChallenge] - Called when a challenge starts
 * @property {Function} [onSuccess] - Called when verification succeeds
 * @property {Function} [onBlocked] - Called when verification is blocked
 * @property {Function} [onError] - Called when an error occurs
 */

/**
 * @typedef {Object} VerifyResult
 * @property {boolean} success - Whether verification passed
 * @property {number} tier - The tier level (0-4)
 * @property {number} riskScore - Composite risk score (0-1)
 * @property {string} [reason] - Reason for the result
 * @property {string} [blockReason] - Why the user was blocked
 * @property {Object} [challenge] - Challenge data if challenge_required
 * @property {string} verificationId - Verification record ID
 * @property {string} sessionId - Session ID
 */

// ─── Main SDK Class ─────────────────────────────────────────

class Astra {
  /**
   * Create a new ASTRA SDK instance
   * @param {AstraOptions} options
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint || '/api/verify';
    this.serverUrl = options.serverUrl || 'http://localhost:3001';
    this.debug = options.debug || false;
    this.theme = options.theme || 'auto';
    this.storagePrefix = options.storagePrefix || 'astra_';
    this.sessionDuration = options.sessionDuration || 1800000;

    // Event listeners
    this._listeners = {
      ready: options.onReady ? [options.onReady] : [],
      challenge: options.onChallenge ? [options.onChallenge] : [],
      success: options.onSuccess ? [options.onSuccess] : [],
      blocked: options.onBlocked ? [options.onBlocked] : [],
      error: options.onError ? [options.onError] : [],
      tierChange: []
    };

    // Internal state
    this._sessionId = null;
    this._token = null;
    this._behaviorData = {
      mouse: [],
      clicks: [],
      keystrokes: [],
      scroll: [],
      touches: [],
      startTime: Date.now()
    };
    this._tracking = false;
    this._ready = false;

    // Validate API key format
    if (!this.apiKey) {
      this._error('API key is required. Get one from your ASTRA dashboard or server.');
      return;
    }

    if (!this.apiKey.startsWith('astra_')) {
      this._error('Invalid API key format. Keys start with "astra_".');
      return;
    }

    this._init();
  }

  // ─── Initialization ──────────────────────────────────────

  async _init() {
    try {
      // Create a session with the server
      const session = await this._createSession();
      this._sessionId = session.sessionId;
      this._token = session.token;

      // Start behavioral tracking
      if (typeof window !== 'undefined') {
        this._startTracking();
      }

      // Reload-resistant cooldown check: ask the server if this fingerprint
      // is currently inside a hard-block window. If so, render the cooldown
      // screen before any protected action mounts.
      if (typeof window !== 'undefined') {
        try {
          const status = await this._checkCooldownStatus();
          if (status && status.cooldown && status.retryAfter > 0) {
            this._renderCooldownScreen(status.retryAfter, status);
          }
        } catch (e) {
          this._log(`Status check failed: ${e.message}`);
        }
      }

      this._ready = true;
      this._emit('ready', { sessionId: this._sessionId });
      this._log('ASTRA SDK initialized');
    } catch (err) {
      this._error(`Failed to initialize: ${err.message}`);
    }
  }

  /**
   * Ask the server whether this fingerprint+session is currently under an
   * active hard-block (cooldown). Survives page reloads — the SDK is meant
   * to call this on init and before any protect() flow.
   */
  async _checkCooldownStatus() {
    if (typeof window === 'undefined') return null;
    try {
      const fingerprints = this._collectFingerprints();
      const url = (this.serverUrl || '') + '/api/astra/status';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this._sessionId,
          clientData: { fingerprints, deviceInfo: this._getDeviceInfo() }
        }),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  /**
   * Render the cooldown / hard-block screen. Self-contained — does not depend
   * on the (TS) ChallengeManager so it can run from the JS SDK in any host.
   * On timer completion, re-checks status server-side; the screen stays up
   * if the fingerprint is still blocked.
   */
  _renderCooldownScreen(seconds, info) {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('astra-cooldown-overlay');
    if (existing) existing.remove();

    const total = Math.max(1, Math.floor(seconds));
    const headline = (info && info.message) || "You've failed a lot of challenges";
    const subMessage = (info && info.subMessage) || 'Astra detected suspicious repeated attempts. Please wait before trying again.';

    const overlay = document.createElement('div');
    overlay.id = 'astra-cooldown-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;background:#0a0a0a;color:#f5f5f5;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;text-align:center;font-family:Space Grotesk,-apple-system,BlinkMacSystemFont,sans-serif;z-index:2147483647';
    overlay.innerHTML = `
      <div style="max-width:480px;width:100%;border:1px solid #1f1f1f;background:#111111;padding:48px 32px 40px;position:relative;">
        <div style="position:absolute;left:0;right:0;top:0;border-top:2px solid #ef4444;"></div>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;color:#888;margin-bottom:32px;">ASTRA SHIELD</div>
        <div style="width:56px;height:56px;border:1.5px solid #ef4444;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:24px;background:rgba(239,68,68,0.12);">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <polyline points="12 7 12 12 15 14"/>
          </svg>
        </div>
        <h1 style="font-size:22px;font-weight:600;line-height:1.3;margin:0 0 12px;">${headline}</h1>
        <p style="font-size:14px;color:#888;line-height:1.5;margin:0 0 32px;">${subMessage}</p>
        <div id="astra-cd-timer" style="font-size:84px;font-weight:700;letter-spacing:-0.04em;line-height:1;color:#ef4444;margin-bottom:8px;font-variant-numeric:tabular-nums;">${total}</div>
        <div style="font-size:11px;letter-spacing:0.18em;color:#888;text-transform:uppercase;margin-bottom:32px;">Seconds remaining</div>
        <div style="height:2px;background:#1f1f1f;width:100%;margin-bottom:28px;overflow:hidden;">
          <div id="astra-cd-progress" style="height:100%;background:#ef4444;width:100%;transition:width 1s linear;"></div>
        </div>
        <p style="font-size:12px;color:#888;line-height:1.5;border-top:1px solid #1f1f1f;padding-top:20px;margin:0;">This helps keep bots out while giving real users a fair chance.</p>
        <div style="margin-top:24px;font-size:10px;letter-spacing:0.16em;color:#888;text-transform:uppercase;">COOLDOWN ACTIVE</div>
      </div>`;
    document.body.appendChild(overlay);
    this._emit('blocked', { reason: 'cooldown_active', retryAfter: total });

    let remaining = total;
    const timerEl = overlay.querySelector('#astra-cd-timer');
    const progEl = overlay.querySelector('#astra-cd-progress');
    const self = this;

    const tick = () => {
      if (timerEl) timerEl.textContent = String(remaining);
      if (progEl) progEl.style.width = `${Math.max(0, (remaining / total) * 100)}%`;
      if (remaining <= 0) {
        // Re-check server-side; if still blocked, re-render with the remaining time.
        self._checkCooldownStatus().then(status => {
          overlay.remove();
          if (status && status.cooldown && status.retryAfter > 0) {
            self._renderCooldownScreen(status.retryAfter, status);
          }
        }).catch(() => { overlay.remove(); });
        return;
      }
      remaining -= 1;
      setTimeout(tick, 1000);
    };
    tick();
  }

  // ─── Core Methods ─────────────────────────────────────────

  /**
   * Verify a user for a sensitive action
   * @param {Object} options
   * @param {string} options.action - The action being protected (e.g., 'login', 'checkout')
   * @param {Object} [options.context] - Additional context data
   * @returns {Promise<VerifyResult>}
   */
  async verify(options = {}) {
    const { action, context = {} } = options;

    if (!this._ready) {
      this._error('SDK not ready. Wait for the ready event.');
      return { success: false, reason: 'not_ready' };
    }

    if (!action) {
      this._error('Action is required. Example: "login", "checkout", "signup"');
      return { success: false, reason: 'missing_action' };
    }

    try {
      // Collect behavioral data
      const behaviorData = this._collectBehaviorData();

      // Collect fingerprints
      const fingerprints = typeof window !== 'undefined' ? this._collectFingerprints() : {};

      // Send verification request
      const result = await this._request('POST', this.endpoint, {
        sessionId: this._sessionId,
        token: this._token,
        action,
        context,
        clientData: {
          behavior: behaviorData,
          fingerprints,
          deviceInfo: this._getDeviceInfo(),
          timestamp: Date.now()
        }
      });

      // Hard-block / cooldown response — render the cooldown screen and stop.
      // Reload-resistant: even if user refreshes mid-action the server still
      // says cooldown:true and the screen comes back.
      if (result.cooldown || result.reason === 'cooldown_active' || result.reason === 'hard_blocked') {
        if (typeof window !== 'undefined' && result.retryAfter > 0) {
          this._renderCooldownScreen(result.retryAfter, result);
        }
        this._emit('blocked', result);
        return { success: false, reason: 'cooldown_active', retryAfter: result.retryAfter };
      }

      // Handle result
      if (result.success) {
        this._emit('success', result);
        this._log(`Verification passed for action: ${action}`);
        return result;
      }

      if (result.reason === 'challenge_required' && result.challenge) {
        this._emit('challenge', result);
        this._log(`Challenge required: ${result.challenge.type}`);
        
        // If in browser, show challenge UI
        if (typeof window !== 'undefined') {
          const challengeResult = await this._handleChallenge(result.challenge);
          return challengeResult;
        }

        // In non-browser, return challenge data for caller to handle
        return result;
      }

      if (result.reason === 'blocked') {
        this._emit('blocked', result);
        this._log(`Blocked: ${result.blockReason}`);
        return result;
      }

      return result;
    } catch (err) {
      this._error(`Verification failed: ${err.message}`);
      return { success: false, reason: 'error', error: err.message };
    }
  }

  /**
   * Alias for verify() — protect a sensitive action
   * @param {string} action
   * @param {Object} context
   * @returns {Promise<VerifyResult>}
   */
  async protect(action, context = {}) {
    return this.verify({ action, context });
  }

  /**
   * Manual verification request
   * @returns {Promise<VerifyResult>}
   */
  async manualVerify() {
    return this.verify({ action: 'manual_check' });
  }

  // ─── Event System ─────────────────────────────────────────

  /**
   * Add an event listener
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
  }

  /**
   * Remove an event listener
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }
  }

  // ─── Key Management ───────────────────────────────────────

  /**
   * Generate a new API key for an app (requires admin key)
   * @param {Object} options
   * @param {string} options.appName - Name of the app
   * @param {string} [options.description] - Description
   * @param {string[]} [options.permissions] - Permissions array
   * @param {number} [options.rateLimit] - Rate limit per minute
   * @param {string} [options.adminKey] - Admin API key (defaults to current key)
   * @returns {Promise<{key: string, metadata: Object}>}
   */
  async generateKey({ appName, description, permissions, rateLimit, adminKey }) {
    const key = adminKey || this.apiKey;
    return this._request('POST', '/api/keys/generate', {
      appName,
      description,
      permissions,
      rateLimit
    }, key);
  }

  /**
   * List API keys
   * @param {Object} options
   * @param {string} [options.appName] - Filter by app name
   * @param {string} [options.adminKey] - Admin API key
   * @returns {Promise<{keys: Array, apps: Array}>}
   */
  async listKeys({ appName, adminKey } = {}) {
    const key = adminKey || this.apiKey;
    const query = appName ? `?appName=${appName}` : '';
    return this._request('GET', `/api/keys/list${query}`, null, key);
  }

  /**
   * Revoke an API key
   * @param {string} keyId - The key ID to revoke
   * @param {string} [adminKey] - Admin API key
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async revokeKey(keyId, adminKey) {
    const key = adminKey || this.apiKey;
    return this._request('POST', '/api/keys/revoke', { keyId }, key);
  }

  /**
   * Get stats for current API key
   * @returns {Promise<{stats: Object}>}
   */
  async getKeyStats() {
    return this._request('GET', '/api/keys/stats', null, this.apiKey);
  }

  // ─── Cleanup ──────────────────────────────────────────────

  /**
   * Destroy the SDK instance and clean up
   */
  destroy() {
    this._stopTracking();
    this._listeners = {};
    this._ready = false;
    this._log('ASTRA SDK destroyed');
  }

  // ─── Internal Methods ─────────────────────────────────────

  async _createSession() {
    return this._request('POST', '/api/session/create', {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      deviceType: this._getDeviceType()
    });
  }

  async _request(method, url, body, overrideApiKey) {
    const fullUrl = url.startsWith('http') ? url : `${this.serverUrl}${url}`;
    const apiKey = overrideApiKey || this.apiKey;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Astra-Session': this._sessionId || ''
    };

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(error.error || error.message || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  _startTracking() {
    if (this._tracking) return;
    this._tracking = true;

    // Mouse tracking
    this._mouseHandler = (e) => {
      this._behaviorData.mouse.push({
        x: e.clientX,
        y: e.clientY,
        t: Date.now()
      });
      // Keep last 100 events
      if (this._behaviorData.mouse.length > 100) {
        this._behaviorData.mouse.shift();
      }
    };
    window.addEventListener('mousemove', this._mouseHandler);

    // Click tracking
    this._clickHandler = (e) => {
      this._behaviorData.clicks.push({
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        target: e.target?.tagName
      });
      if (this._behaviorData.clicks.length > 100) {
        this._behaviorData.clicks.shift();
      }
    };
    window.addEventListener('click', this._clickHandler);

    // Keystroke tracking
    this._keyHandler = (e) => {
      this._behaviorData.keystrokes.push({
        key: e.key,
        t: Date.now()
      });
      if (this._behaviorData.keystrokes.length > 100) {
        this._behaviorData.keystrokes.shift();
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    // Scroll tracking
    this._scrollHandler = () => {
      this._behaviorData.scroll.push({
        y: window.scrollY,
        t: Date.now()
      });
      if (this._behaviorData.scroll.length > 100) {
        this._behaviorData.scroll.shift();
      }
    };
    window.addEventListener('scroll', this._scrollHandler, { passive: true });
  }

  _stopTracking() {
    this._tracking = false;
    if (this._mouseHandler) window.removeEventListener('mousemove', this._mouseHandler);
    if (this._clickHandler) window.removeEventListener('click', this._clickHandler);
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
  }

  _collectBehaviorData() {
    const data = { ...this._behaviorData };
    data.duration = Date.now() - data.startTime;
    return data;
  }

  _collectFingerprints() {
    if (typeof window === 'undefined') return {};

    const fingerprints = {};

    // Canvas fingerprint
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('ASTRA Shield 🛡️', 2, 2);
      ctx.fillStyle = '#f60';
      ctx.fillRect(100, 2, 20, 20);
      fingerprints.canvas = canvas.toDataURL();
    } catch (e) {}

    // WebGL fingerprint
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          fingerprints.webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          fingerprints.webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
      }
    } catch (e) {}

    // Screen
    fingerprints.screen = {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio
    };

    // Navigator
    fingerprints.navigator = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints
    };

    return fingerprints;
  }

  _getDeviceInfo() {
    return {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'server',
      language: typeof navigator !== 'undefined' ? navigator.language : 'en',
      timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
      timestamp: Date.now()
    };
  }

  _getDeviceType() {
    if (typeof navigator === 'undefined') return 'server';
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  async _handleChallenge(challengeData) {
    // This would show the challenge UI to the user
    // For now, return the challenge data for the caller to handle
    // In a full implementation, this would render the challenge overlay
    return {
      success: false,
      reason: 'challenge_required',
      challenge: challengeData,
      message: `Complete the ${challengeData.type} challenge to continue.`
    };
  }

  _emit(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { this._error(`Listener error: ${e.message}`); }
      });
    }
  }

  _log(msg) {
    if (this.debug) {
      console.log(`[ASTRA] ${msg}`);
    }
  }

  _error(msg) {
    console.error(`[ASTRA] ${msg}`);
    this._emit('error', { message: msg });
  }
}

// ─── Exports ────────────────────────────────────────────────

export { Astra };
export default Astra;
