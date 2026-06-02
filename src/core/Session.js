/**
 * Session Management
 * Handles session creation, storage, and trust scoring
 */

export class Session {
  constructor(options = {}) {
    this.options = options;
    this.storagePrefix = options.storagePrefix || 'astra_';
    this.sessionDuration = options.sessionDuration || 30 * 60 * 1000; // 30 minutes

    this.id = null;
    this.createdAt = null;
    this.lastActivity = null;
    // Trust is EARNED, not gifted. New/unproven sessions start untrusted (0) so
    // wiping localStorage or reloading cannot farm a trust discount — it resets
    // you to untrusted. Trust rises via increaseTrust() on verified behavior.
    this.trust = 0.0;
    this.metadata = {};

    this.storage = {
      get: (key) => {
        try {
          const item = localStorage.getItem(this.storagePrefix + key);
          return item ? JSON.parse(item) : null;
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          localStorage.setItem(this.storagePrefix + key, JSON.stringify(value));
        } catch {
          // Storage full or unavailable
        }
      },
      remove: (key) => {
        try {
          localStorage.removeItem(this.storagePrefix + key);
        } catch {
          // Ignore
        }
      }
    };
  }

  /**
   * Initialize or restore session
   */
  async init() {
    const stored = this.storage.get('session');

    if (stored && this.isValid(stored)) {
      // Restore existing session — trust persists with the proven session, but
      // decays with idle time so a long-dormant tab doesn't keep a high score.
      this.id = stored.id;
      this.createdAt = stored.createdAt;
      this.lastActivity = Date.now();
      const idleMin = (Date.now() - (stored.lastActivity || stored.createdAt)) / 60000;
      const decay = Math.min(0.5, idleMin * 0.02); // up to -0.5 over ~25min idle
      this.trust = Math.max(0, (stored.trust ?? 0) - decay);
      this.metadata = stored.metadata || {};
    } else {
      // New session — untrusted until it earns trust through verified behavior.
      this.id = this.generateId();
      this.createdAt = Date.now();
      this.lastActivity = Date.now();
      this.trust = 0.0;
      this.metadata = this.getInitialMetadata();
    }

    this.save();
    return this;
  }

  /**
   * Check if stored session is valid
   */
  isValid(stored) {
    if (!stored || !stored.id || !stored.createdAt) return false;

    const age = Date.now() - stored.createdAt;
    return age < this.sessionDuration;
  }

  /**
   * Generate unique session ID
   */
  generateId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get initial browser/device metadata
   */
  getInitialMetadata() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchEnabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      cookieEnabled: navigator.cookieEnabled,
      canvasFingerprint: this.getCanvasFingerprint(),
      webgl: this.getWebGLInfo(),
      pluginCount: navigator.plugins ? navigator.plugins.length : 0,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null,
    };
  }

  getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Astra\u{1F6E1}', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('Astra\u{1F6E1}', 4, 17);
      const data = canvas.toDataURL();
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(31, hash) + data.charCodeAt(i) | 0;
      }
      return hash.toString(36);
    } catch {
      return null;
    }
  }

  getWebGLInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { renderer: null, vendor: null };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        return {
          renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
          vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
        };
      }
      return {
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
      };
    } catch {
      return { renderer: null, vendor: null };
    }
  }

  /**
   * Save session to storage
   */
  save() {
    this.storage.set('session', {
      id: this.id,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      trust: this.trust,
      metadata: this.metadata
    });
  }

  /**
   * Update last activity timestamp
   */
  touch() {
    this.lastActivity = Date.now();
    this.save();
  }

  /**
   * Increase trust score
   */
  increaseTrust(amount = 0.05) {
    this.trust = Math.min(1.0, this.trust + amount);
    this.touch();
    return this.trust;
  }

  /**
   * Decrease trust score
   */
  decreaseTrust(amount = 0.1) {
    this.trust = Math.max(0, this.trust - amount);
    this.touch();
    return this.trust;
  }

  /**
   * Get trust score
   */
  getTrust() {
    return this.trust;
  }

  /**
   * Get session age in milliseconds
   */
  getAge() {
    return Date.now() - this.createdAt;
  }

  /**
   * Get time since last activity
   */
  getIdleTime() {
    return Date.now() - this.lastActivity;
  }

  /**
   * Get session info
   */
  getInfo() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      trust: this.trust,
      age: this.getAge(),
      idleTime: this.getIdleTime(),
      metadata: this.metadata
    };
  }

  /**
   * Update metadata
   */
  updateMetadata(data) {
    this.metadata = { ...this.metadata, ...data };
    this.save();
  }

  /**
   * Clear session
   */
  clear() {
    this.storage.remove('session');
    this.id = null;
    this.createdAt = null;
    this.trust = 0.0;
    this.metadata = {};
  }
}
