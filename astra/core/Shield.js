/**
 * ASTRAShield - Main Shield Class
 * The intelligent guardian that knows when to stay invisible.
 */

import { Session } from './Session.js';
import { Detector } from './Detector.js';
import { TierEngine } from '../tiers/TierEngine.js';
import { ChallengeManager } from '../challenges/ChallengeManager.js';
import { Mutator } from '../mutation/Mutator.js';
import { AccessibilityManager } from '../accessibility/AccessibilityManager.js';
import { HappinessTracker } from '../metrics/HappinessTracker.js';

class ASTRAShield {
  constructor(options = {}) {
    this.options = {
      apiKey: options.apiKey || null,
      endpoint: options.endpoint || '/api/verify',
      debug: options.debug || false,
      theme: options.theme || 'auto',
      storagePrefix: options.storagePrefix || 'astra_',
      sessionDuration: options.sessionDuration || 30 * 60 * 1000, // 30 minutes
      mutationInterval: options.mutationInterval || 60 * 60 * 1000, // 1 hour
      ...options
    };

    // Core modules
    this.session = new Session(this.options);
    this.detector = new Detector(this.options);
    this.mutator = new Mutator(this.options);
    this.accessibility = new AccessibilityManager(this.options);
    this.happiness = new HappinessTracker(this.options);
    this.tierEngine = new TierEngine(this.options);
    this.challengeManager = new ChallengeManager(this.options, this.mutator, this.accessibility);

    // Event listeners
    this.listeners = {
      challenge: [],
      success: [],
      blocked: [],
      tierChange: [],
      error: []
    };

    // State
    this.isInitialized = false;
    this.isVerifying = false;
    this.activeChallenge = null;

    // Bind methods
    this.protect = this.protect.bind(this);
    this.verify = this.verify.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);

    // Auto-initialize
    this.init();
  }

  /**
   * Initialize the shield system
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Initialize session
      await this.session.init();

      // Initialize detector with session data
      await this.detector.init(this.session);

      // Initialize mutation system
      await this.mutator.init();

      // Apply accessibility preferences
      await this.accessibility.init();

      // Check OOS score and apply appropriate tier
      await this.tierEngine.init(this.detector, this.session);

      // Inject styles
      this.injectStyles();

      // Inject badge
      this.injectBadge();

      // Start behavioral tracking
      this.startTracking();

      this.isInitialized = true;
      this.log('ASTRA Shield initialized successfully');

      // Emit ready event
      this.emit('ready', { timestamp: Date.now() });

    } catch (error) {
      this.log('Initialization error:', error);
      this.emit('error', { type: 'init', error });
    }
  }

  /**
   * Start behavioral tracking
   */
  startTracking() {
    // Track mouse movements
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), { passive: true });

    // Track clicks
    document.addEventListener('click', this.handleClick.bind(this), { passive: true });

    // Track keyboard
    document.addEventListener('keydown', this.handleKeydown.bind(this), { passive: true });

    // Track scroll
    document.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });

    // Track touch
    document.addEventListener('touchstart', this.handleTouch.bind(this), { passive: true });
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
  }

  /**
   * Handle mouse movement for behavioral analysis
   */
  handleMouseMove(event) {
    if (!this.isInitialized) return;

    this.detector.recordMouseMove({
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now()
    });
  }

  /**
   * Handle click events
   */
  handleClick(event) {
    if (!this.isInitialized) return;

    this.detector.recordClick({
      target: event.target.tagName,
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now()
    });
  }

  /**
   * Handle keyboard events
   */
  handleKeydown(event) {
    if (!this.isInitialized) return;

    this.detector.recordKeystroke({
      key: event.key,
      timestamp: Date.now()
    });
  }

  /**
   * Handle scroll events
   */
  handleScroll(event) {
    if (!this.isInitialized) return;

    this.detector.recordScroll({
      scrollY: window.scrollY,
      timestamp: Date.now()
    });
  }

  /**
   * Handle touch events
   */
  handleTouch(event) {
    if (!this.isInitialized) return;

    const touch = event.touches[0];
    this.detector.recordTouch({
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    });
  }

  /**
   * Handle touch move events
   */
  handleTouchMove(event) {
    if (!this.isInitialized) return;

    const touch = event.touches[0];
    this.detector.recordTouchMove({
      x: touch.clientX,
      y: touch.clientY,
      velocity: event.velocity || 0,
      timestamp: Date.now()
    });
  }

  /**
   * Protect a sensitive action
   * @param {string} action - The action type (login, checkout, comment, etc.)
   * @param {Object} context - Additional context for the action
   */
  async protect(action, context = {}) {
    if (!this.isInitialized) {
      await this.init();
    }

    this.log(`Protecting action: ${action}`);

    // Get current OOS score
    const oosScore = await this.detector.getOOSScore();
    const tier = this.tierEngine.getTierForScore(oosScore);

    this.log(`Current OOS: ${oosScore}, Tier: ${tier}`);

    // Emit tier change if needed
    if (tier !== this.currentTier) {
      this.currentTier = tier;
      this.emit('tierChange', { tier, oosScore });
    }

    // Execute tier-appropriate response
    return await this.tierEngine.handleAction(tier, {
      action,
      context,
      shield: this,
      session: this.session,
      detector: this.detector
    });
  }

  /**
   * Manual verification request
   */
  async verify() {
    if (this.isVerifying) {
      return { success: false, error: 'already_verifying' };
    }

    this.isVerifying = true;

    try {
      const oosScore = await this.detector.getOOSScore();
      const tier = this.tierEngine.getTierForScore(oosScore);

      // Show challenge if needed
      if (tier >= 2) {
        const result = await this.showChallenge(tier);
        return result;
      }

      // For lower tiers, just confirm
      return {
        success: true,
        tier: 0,
        verified: true,
        timestamp: Date.now()
      };

    } finally {
      this.isVerifying = false;
    }
  }

  /**
   * Show a challenge to the user
   */
  async showChallenge(tier) {
    return new Promise((resolve) => {
      this.emit('challenge', { tier, type: 'starting' });

      // Track challenge start time for happiness metrics
      const challengeStart = Date.now();

      // Create and show challenge UI
      this.challengeManager.createChallengeUI(tier, (result) => {
        // Track completion time
        const completionTime = Date.now() - challengeStart;
        this.happiness.trackChallengeCompletion(result.success, completionTime, result.type);

        if (result.success) {
          this.emit('success', {
            tier: result.tier,
            type: result.type,
            duration: completionTime
          });

          // Update session trust
          this.session.increaseTrust();
          resolve({
            success: true,
            tier: result.tier,
            type: result.type,
            duration: completionTime
          });
        } else {
          this.emit('blocked', {
            reason: result.reason,
            attempts: result.attempts
          });
          resolve({
            success: false,
            reason: result.reason,
            attempts: result.attempts
          });
        }
      });
    });
  }

  /**
   * Event emitter methods
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    return this;
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * Inject CSS styles
   */
  injectStyles() {
    if (document.getElementById('astra-shield-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'astra-shield-styles';
    styles.textContent = this.getStyles();
    document.head.appendChild(styles);
  }

  /**
   * Get all CSS styles
   */
  getStyles() {
    return `
      :root {
        --astra-primary: #6366F1;
        --astra-secondary: #8B5CF6;
        --astra-success: #10B981;
        --astra-warning: #F59E0B;
        --astra-error: #EF4444;
        --astra-bg: rgba(255, 255, 255, 0.98);
        --astra-text: #1E293B;
        --astra-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --astra-bg: rgba(15, 23, 42, 0.98);
          --astra-text: #F8FAFC;
        }
      }

      .astra-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        opacity: 0;
        transition: opacity 0.3s ease;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .astra-overlay.active {
        opacity: 1;
      }

      .astra-modal {
        background: var(--astra-bg);
        border-radius: 24px;
        padding: 48px;
        max-width: 420px;
        width: 90%;
        text-align: center;
        box-shadow: var(--astra-shadow);
        transform: scale(0.9) translateY(20px);
        transition: transform 0.3s ease;
      }

      .astra-overlay.active .astra-modal {
        transform: scale(1) translateY(0);
      }

      .astra-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        background: linear-gradient(135deg, var(--astra-primary), var(--astra-secondary));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .astra-icon svg {
        width: 40px;
        height: 40px;
        color: white;
      }

      .astra-title {
        font-size: 24px;
        font-weight: 700;
        color: var(--astra-text);
        margin: 0 0 12px;
      }

      .astra-subtitle {
        font-size: 16px;
        color: #64748B;
        margin: 0 0 32px;
        line-height: 1.5;
      }

      .astra-progress {
        width: 100%;
        height: 4px;
        background: #E2E8F0;
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 32px;
      }

      .astra-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--astra-primary), var(--astra-success));
        border-radius: 2px;
        transition: width 0.1s linear;
      }

      .astra-challenge-area {
        background: linear-gradient(135deg, #F8FAFC, #F1F5F9);
        border-radius: 16px;
        padding: 32px;
        margin-bottom: 24px;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      @media (prefers-color-scheme: dark) {
        .astra-challenge-area {
          background: linear-gradient(135deg, #1E293B, #0F172A);
        }
      }

      .astra-instruction {
        font-size: 14px;
        color: #64748B;
        margin-bottom: 24px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .astra-btn {
        background: linear-gradient(135deg, var(--astra-primary), var(--astra-secondary));
        color: white;
        border: none;
        padding: 16px 48px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        font-family: inherit;
      }

      .astra-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 40px rgba(99, 102, 241, 0.4);
      }

      .astra-btn:active {
        transform: translateY(0);
      }

      .astra-btn:focus {
        outline: 2px solid var(--astra-primary);
        outline-offset: 4px;
      }

      .astra-btn-secondary {
        background: transparent;
        color: #64748B;
        font-size: 14px;
        padding: 8px 16px;
        margin-top: 16px;
      }

      .astra-btn-secondary:hover {
        color: var(--astra-text);
        transform: none;
        box-shadow: none;
      }

      /* Pulse Challenge */
      .astra-pulse-container {
        position: relative;
        width: 120px;
        height: 120px;
      }

      .astra-pulse-ring {
        position: absolute;
        inset: 0;
        border: 3px solid var(--astra-primary);
        border-radius: 50%;
        opacity: 0;
      }

      .astra-pulse-ring.animate {
        animation: pulse-ring 1.2s ease-out infinite;
      }

      @keyframes pulse-ring {
        0% { transform: scale(0.8); opacity: 0.8; }
        100% { transform: scale(1.5); opacity: 0; }
      }

      .astra-pulse-core {
        position: absolute;
        inset: 20px;
        background: var(--astra-primary);
        border-radius: 50%;
        transition: transform 0.15s ease;
      }

      .astra-pulse-core.active {
        transform: scale(1.2);
      }

      .astra-pulse-indicator {
        position: absolute;
        bottom: -40px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 14px;
        color: #64748B;
      }

      /* Tilt Challenge */
      .astra-tilt-container {
        width: 200px;
        height: 200px;
        background: radial-gradient(circle at 30% 30%, #E2E8F0, #CBD5E1);
        border-radius: 50%;
        position: relative;
        overflow: hidden;
      }

      @media (prefers-color-scheme: dark) {
        .astra-tilt-container {
          background: radial-gradient(circle at 30% 30%, #334155, #1E293B);
        }
      }

      .astra-tilt-ball {
        width: 40px;
        height: 40px;
        background: var(--astra-primary);
        border-radius: 50%;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        transition: transform 0.1s ease;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
      }

      .astra-tilt-target {
        width: 60px;
        height: 60px;
        border: 3px dashed var(--astra-success);
        border-radius: 50%;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      /* Flick Challenge */
      .astra-flick-container {
        width: 200px;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .astra-flick-arrow {
        width: 80px;
        height: 80px;
        transition: transform 0.3s ease;
      }

      .astra-flick-arrow svg {
        width: 100%;
        height: 100%;
        color: var(--astra-primary);
      }

      /* Breath Challenge */
      .astra-breath-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .astra-breath-circle {
        width: 120px;
        height: 120px;
        background: linear-gradient(135deg, var(--astra-primary), var(--astra-secondary));
        border-radius: 50%;
        animation: breathe 4s ease-in-out infinite;
      }

      @keyframes breathe {
        0%, 100% { transform: scale(0.8); opacity: 0.6; }
        50% { transform: scale(1.2); opacity: 1; }
      }

      .astra-breath-text {
        font-size: 18px;
        font-weight: 600;
        color: var(--astra-text);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      /* Success Animation */
      .astra-success-check {
        width: 80px;
        height: 80px;
        margin: 0 auto;
      }

      .astra-success-check svg {
        width: 100%;
        height: 100%;
        color: var(--astra-success);
      }

      .astra-success-check .check-circle {
        stroke-dasharray: 166;
        stroke-dashoffset: 166;
        animation: check-circle 0.6s ease-in-out forwards;
      }

      .astra-success-check .check-check {
        stroke-dasharray: 48;
        stroke-dashoffset: 48;
        animation: check-check 0.3s ease-in-out 0.4s forwards;
      }

      @keyframes check-circle {
        to { stroke-dashoffset: 0; }
      }

      @keyframes check-check {
        to { stroke-dashoffset: 0; }
      }

      /* Accessibility */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }

      .astra-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      /* Loading spinner */
      .astra-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #E2E8F0;
        border-top-color: var(--astra-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Toast notifications */
      .astra-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--astra-bg);
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: var(--astra-shadow);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 2147483646;
        opacity: 0;
        transition: transform 0.3s ease, opacity 0.3s ease;
      }

      .astra-toast.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }

      .astra-toast.success { border-left: 4px solid var(--astra-success); }
      .astra-toast.error { border-left: 4px solid var(--astra-error); }
      .astra-toast.warning { border-left: 4px solid var(--astra-warning); }

      /* Protected by ASTRA badge */
      .astra-badge {
        position: fixed;
        bottom: 8px;
        right: 8px;
        z-index: 2147483645;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 11px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s ease;
        opacity: 0.6;
        user-select: none;
      }

      .astra-badge:hover {
        opacity: 1;
        background: rgba(15, 23, 42, 0.9);
        border-color: rgba(99, 102, 241, 0.4);
        color: rgba(255, 255, 255, 0.95);
      }

      .astra-badge svg {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }

      .astra-badge .astra-badge-text {
        letter-spacing: 0.02em;
      }

      @media (prefers-color-scheme: light) {
        .astra-badge {
          background: rgba(255, 255, 255, 0.8);
          border-color: rgba(0, 0, 0, 0.1);
          color: rgba(0, 0, 0, 0.6);
        }

        .astra-badge:hover {
          background: rgba(255, 255, 255, 0.95);
          border-color: rgba(99, 102, 241, 0.4);
          color: rgba(0, 0, 0, 0.85);
        }
      }
    `;
  }

  /**
   * Log debug messages
   */
  log(...args) {
    if (this.options.debug) {
      console.log('[ASTRA Shield]', ...args);
    }
  }

  /**
   * Inject the "Protected by ASTRA" badge
   */
  injectBadge() {
    // Check if badge is disabled via config
    if (this.options.showBadge === false) return;
    if (document.getElementById('astra-badge')) return;

    const badge = document.createElement('a');
    badge.id = 'astra-badge';
    badge.className = 'astra-badge';
    badge.href = 'https://github.com/snarsnat/astra';
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';
    badge.setAttribute('aria-label', 'Protected by ASTRA Security');
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span class="astra-badge-text">Protected by ASTRA</span>
    `;

    document.body.appendChild(badge);
  }

  /**
   * Destroy the shield instance
   */
  destroy() {
    // Remove event listeners
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('touchstart', this.handleTouch);
    document.removeEventListener('touchmove', this.handleTouchMove);

    // Remove overlay if exists
    const overlay = document.getElementById('astra-overlay');
    if (overlay) {
      overlay.remove();
    }

    // Remove badge if exists
    const badge = document.getElementById('astra-badge');
    if (badge) {
      badge.remove();
    }

    // Remove styles
    const styles = document.getElementById('astra-shield-styles');
    if (styles) {
      styles.remove();
    }

    this.isInitialized = false;
  }
}

// Auto-attach to window for script tag usage
if (typeof window !== 'undefined') {
  window.ASTRAShield = ASTRAShield;
}

export { ASTRAShield };
