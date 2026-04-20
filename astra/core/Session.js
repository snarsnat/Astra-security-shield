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
    this.trust = 1.0; // Start with full trust
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
      // Restore existing session
      this.id = stored.id;
      this.createdAt = stored.createdAt;
      this.lastActivity = Date.now();
      this.trust = stored.trust || 1.0;
      this.metadata = stored.metadata || {};
    } else {
      // Create new session
      this.id = this.generateId();
      this.createdAt = Date.now();
      this.lastActivity = Date.now();
      this.trust = 1.0;
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
      cookieEnabled: navigator.cookieEnabled
    };
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
    this.trust = 1.0;
    this.metadata = {};
  }
}
