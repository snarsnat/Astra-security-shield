/**
 * ASTRAShield - Main Shield Class
 * The intelligent guardian that knows when to stay invisible.
 */

import {
  ASTRAShield as ISTRAShield,
  ASTRAShieldOptions,
  VerificationResult,
  TierLevel,
  EventType
} from '../types';

import { Session } from './Session';
import { Detector } from './Detector';
import { TierEngine } from '../tiers/TierEngine';
import { ChallengeManager } from '../challenges/ChallengeManager';
import { Mutator } from '../mutation/Mutator';
import { AccessibilityManager } from '../accessibility/AccessibilityManager';
import { HappinessTracker } from '../metrics/HappinessTracker';

export class ASTRAShield implements ISTRAShield {
  private options: Required<ASTRAShieldOptions>;

  // Core modules
  public readonly session: Session;
  public readonly detector: Detector;
  public readonly mutator: Mutator;
  public readonly accessibility: AccessibilityManager;
  public readonly happiness: HappinessTracker;
  public readonly tierEngine: TierEngine;
  public readonly challengeManager: ChallengeManager;

  // Event listeners
  private listeners: Map<EventType, Set<(data: unknown) => void>> = new Map();

  // State
  public readonly isInitialized: boolean = false;
  public isVerifying: boolean = false;
  private currentTier: TierLevel = 0;

  constructor(options: ASTRAShieldOptions = {}) {
    this.options = {
      apiKey: options.apiKey || null,
      endpoint: options.endpoint || '/api/verify',
      debug: options.debug || false,
      theme: options.theme || 'auto',
      storagePrefix: options.storagePrefix || 'astra_',
      sessionDuration: options.sessionDuration || 30 * 60 * 1000,
      mutationInterval: options.mutationInterval || 60 * 60 * 1000,
      onReady: options.onReady || (() => {}),
      onChallenge: options.onChallenge || (() => {}),
      onSuccess: options.onSuccess || (() => {}),
      onBlocked: options.onBlocked || (() => {}),
      onTierChange: options.onTierChange || (() => {}),
      onError: options.onError || (() => {})
    };

    // Initialize core modules
    this.session = new Session({
      storagePrefix: this.options.storagePrefix,
      sessionDuration: this.options.sessionDuration
    });

    this.detector = new Detector();
    this.mutator = new Mutator({
      mutationInterval: this.options.mutationInterval
    });
    this.accessibility = new AccessibilityManager();
    this.happiness = new HappinessTracker();
    this.tierEngine = new TierEngine();
    this.challengeManager = new ChallengeManager(this.options, this.mutator, this.accessibility);

    // Bind methods
    this.protect = this.protect.bind(this);
    this.verify = this.verify.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.destroy = this.destroy.bind(this);

    // Auto-initialize
    this.init();
  }

  /**
   * Initialize the shield system
   */
  async init(): Promise<void> {
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

      // Start behavioral tracking
      this.startTracking();

      this.log('ASTRA Shield initialized successfully');
      this.options.onReady();

      // Emit ready event
      this.emit('ready', { timestamp: Date.now() });

    } catch (error) {
      this.log('Initialization error:', error);
      this.emit('error', { type: 'init', error });
      this.options.onError({ type: 'init', error: error as Error });
    }
  }

  /**
   * Start behavioral tracking
   */
  private startTracking(): void {
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), { passive: true });
    document.addEventListener('click', this.handleClick.bind(this), { passive: true });
    document.addEventListener('keydown', this.handleKeydown.bind(this), { passive: true });
    document.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    document.addEventListener('touchstart', this.handleTouch.bind(this), { passive: true });
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isInitialized) return;
    this.detector.recordMouseMove({
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now()
    });
  }

  private handleClick(event: MouseEvent): void {
    if (!this.isInitialized) return;
    this.detector.recordClick({
      target: (event.target as HTMLElement).tagName,
      x: event.clientX,
      y: event.clientY,
      timestamp: Date.now()
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.isInitialized) return;
    this.detector.recordKeystroke({
      key: event.key,
      timestamp: Date.now()
    });
  }

  private handleScroll(): void {
    if (!this.isInitialized) return;
    this.detector.recordScroll({
      scrollY: window.scrollY,
      timestamp: Date.now()
    });
  }

  private handleTouch(event: TouchEvent): void {
    if (!this.isInitialized) return;
    const touch = event.touches[0];
    if (touch) {
      this.detector.recordTouch({
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now()
      });
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.isInitialized) return;
    const touch = event.touches[0];
    if (touch) {
      this.detector.recordTouchMove({
        x: touch.clientX,
        y: touch.clientY,
        velocity: 0,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Protect a sensitive action
   */
  async protect(action: string, context: Record<string, unknown> = {}): Promise<VerificationResult> {
    const oosScore = await this.detector.getOOSScore();
    const tier = this.tierEngine.getTierForScore(oosScore);

    this.log(`Protecting action: ${action}, OOS: ${oosScore}, Tier: ${tier}`);

    if (tier !== this.currentTier) {
      this.currentTier = tier;
      this.emit('tierChange', { tier, oosScore });
      this.options.onTierChange({ tier, oosScore });
    }

    // If backend endpoint is configured, perform server-side verification
    if (this.options.endpoint && this.options.endpoint !== '/api/verify') {
      const backendResult = await this.performBackendVerification();

      if (backendResult.action === 'block') {
        this.emit('blocked', {
          reason: backendResult.blockReason || 'backend_blocked',
          attempts: 0
        });
        this.options.onBlocked({
          reason: backendResult.blockReason || 'backend_blocked',
          attempts: 0
        });

        return {
          success: false,
          tier: this.currentTier,
          blocked: true,
          reason: backendResult.blockReason || 'backend_blocked'
        };
      }

      if (backendResult.action === 'challenge' && backendResult.challenge) {
        // Backend requires additional challenge
        return await this.showBackendChallenge(backendResult.challenge);
      }
    }

    return await this.tierEngine.handleAction(tier, {
      action,
      context,
      shield: this,
      session: this.session,
      detector: this.detector
    });
  }

  /**
   * Perform backend verification
   */
  private async performBackendVerification(): Promise<{
    action: 'allow' | 'challenge' | 'block';
    challenge?: any;
    blockReason?: string;
  }> {
    try {
      const clientData = await this.detector.getClientData();

      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.options.apiKey || '',
          'X-Client-Version': '1.0.0'
        },
        body: JSON.stringify({
          clientData,
          action: 'protect',
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        this.log('Backend verification failed:', response.status);
        return { action: 'allow' }; // Fallback to local verification
      }

      const result = await response.json();

      if (result.success) {
        return { action: 'allow' };
      }

      if (result.challenge) {
        return { action: 'challenge', challenge: result.challenge };
      }

      return { action: 'block', blockReason: result.blockReason || 'blocked_by_backend' };
    } catch (error) {
      this.log('Backend verification error:', error);
      return { action: 'allow' }; // Fallback to local verification
    }
  }

  /**
   * Show backend-provided challenge
   */
  private async showBackendChallenge(challengeData: any): Promise<VerificationResult> {
    return new Promise((resolve) => {
      this.emit('challenge', { tier: this.currentTier, type: 'starting', challengeType: challengeData.type });
      this.options.onChallenge({ tier: this.currentTier, type: 'starting', challengeType: challengeData.type });

      // Create challenge UI based on backend challenge data
      const overlay = document.createElement('div');
      overlay.className = 'astra-overlay';
      overlay.id = 'astra-overlay';

      const challengeHtml = this.getBackendChallengeHTML(challengeData);
      overlay.innerHTML = challengeHtml;

      document.body.appendChild(overlay);

      // Animate in
      requestAnimationFrame(() => {
        overlay.classList.add('active');
      });

      // Handle solution submission
      const submitBtn = document.getElementById('astra-submit-btn');
      const skipLink = document.getElementById('astra-skip');

      submitBtn?.addEventListener('click', async () => {
        const solution = this.collectChallengeSolution(challengeData);

        try {
          const response = await fetch(this.options.endpoint + '/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.options.apiKey || ''
            },
            body: JSON.stringify({
              challengeId: challengeData.id,
              solution
            })
          });

          const result = await response.json();

          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 300);

          if (result.success) {
            this.session.increaseTrust();
            resolve({
              success: true,
              tier: this.currentTier,
              type: challengeData.type,
              timestamp: Date.now()
            });
          } else {
            resolve({
              success: false,
              tier: this.currentTier,
              blocked: true,
              reason: result.reason || 'challenge_failed'
            });
          }
        } catch (error) {
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 300);
          resolve({
            success: false,
            tier: this.currentTier,
            blocked: true,
            reason: 'verification_error'
          });
        }
      });

      skipLink?.addEventListener('click', () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
        resolve({
          success: false,
          tier: this.currentTier,
          blocked: true,
          reason: 'skipped'
        });
      });
    });
  }

  /**
   * Get HTML for backend challenge
   */
  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  private getBackendChallengeHTML(challengeData: any): string {
    const type = challengeData.type || 'breath';

    switch (type) {
      case 'pulse':
        return this.getPulseChallengeHTML(challengeData);
      case 'tilt':
        return this.getTiltChallengeHTML(challengeData);
      case 'flick':
        return this.getFlickChallengeHTML(challengeData);
      case 'breath':
        return this.getBreathChallengeHTML(challengeData);
      case 'proof_of_work':
        return this.getPoWChallengeHTML(challengeData);
      default:
        return this.getBreathChallengeHTML(challengeData);
    }
  }

  private getPulseChallengeHTML(data: any): string {
    return `
      <div class="astra-modal">
        <div class="astra-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4.5 3h15M12 3v18M3 12h18M12 8l4 4-4 4"/>
          </svg>
        </div>
        <h2 class="astra-title">Pulse Challenge</h2>
        <p class="astra-subtitle">${this.escapeHtml(data.data?.instructions || 'Tap the button in rhythm with the pulses')}</p>
        <div class="astra-challenge-area">
          <div class="astra-pulse-container">
            <div class="astra-pulse-ring" id="pulse-ring-1"></div>
            <div class="astra-pulse-ring" id="pulse-ring-2"></div>
            <div class="astra-pulse-core" id="pulse-core"></div>
          </div>
        </div>
        <button class="astra-btn" id="astra-submit-btn">Tap in Rhythm</button>
        <a href="#" class="astra-btn-secondary" id="astra-skip">Skip (you might be blocked)</a>
      </div>
    `;
  }

  private getTiltChallengeHTML(data: any): string {
    return `
      <div class="astra-modal">
        <div class="astra-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2"/>
            <circle cx="12" cy="18" r="1"/>
          </svg>
        </div>
        <h2 class="astra-title">Tilt Challenge</h2>
        <p class="astra-subtitle">${this.escapeHtml(data.data?.instructions || 'Tilt your device as instructed')}</p>
        <div class="astra-challenge-area">
          <div class="astra-tilt-container">
            <div class="astra-tilt-ball" id="tilt-ball"></div>
            <div class="astra-tilt-target" id="tilt-target"></div>
          </div>
        </div>
        <button class="astra-btn" id="astra-submit-btn">I'm Ready</button>
        <a href="#" class="astra-btn-secondary" id="astra-skip">Skip (you might be blocked)</a>
      </div>
    `;
  }

  private getFlickChallengeHTML(data: any): string {
    return `
      <div class="astra-modal">
        <div class="astra-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
        <h2 class="astra-title">Flick Challenge</h2>
        <p class="astra-subtitle">${this.escapeHtml(data.data?.instructions || 'Flick in the correct direction')}</p>
        <div class="astra-challenge-area">
          <div style="width: 150px; height: 150px; border: 3px solid var(--astra-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative;">
            <div id="flick-indicator" style="font-size: 24px;">→</div>
          </div>
        </div>
        <button class="astra-btn" id="astra-submit-btn">Flick →</button>
        <a href="#" class="astra-btn-secondary" id="astra-skip">Skip (you might be blocked)</a>
      </div>
    `;
  }

  private getBreathChallengeHTML(data: any): string {
    return `
      <div class="astra-modal">
        <div class="astra-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <h2 class="astra-title">Breath Challenge</h2>
        <p class="astra-subtitle">${this.escapeHtml(data.data?.instructions || 'Breathe in sync with the pattern')}</p>
        <div class="astra-challenge-area">
          <div class="astra-breath-circle" id="breath-circle"></div>
          <div class="astra-breath-text" id="breath-text">Breathe In</div>
        </div>
        <button class="astra-btn" id="astra-submit-btn">Continue</button>
        <a href="#" class="astra-btn-secondary" id="astra-skip">Skip (you might be blocked)</a>
      </div>
    `;
  }

  private getPoWChallengeHTML(data: any): string {
    return `
      <div class="astra-modal">
        <div class="astra-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
            <path d="M9 9h6M9 13h6M9 17h4"/>
          </svg>
        </div>
        <h2 class="astra-title">Verifying...</h2>
        <p class="astra-subtitle">Computing proof of work. Please wait.</p>
        <div class="astra-challenge-area">
          <div class="astra-progress">
            <div class="astra-progress-bar" style="width: 100%; animation: loading 2s infinite;"></div>
          </div>
        </div>
        <button class="astra-btn" id="astra-submit-btn" disabled>Verifying...</button>
        <a href="#" class="astra-btn-secondary" id="astra-skip">Skip (you might be blocked)</a>
      </div>
      <style>
        @keyframes loading {
          0% { width: 0%; margin-left: 0; }
          50% { width: 70%; margin-left: 0; }
          100% { width: 0%; margin-left: 100%; }
        }
      </style>
    `;
  }

  /**
   * Collect challenge solution based on type
   */
  private collectChallengeSolution(challengeData: any): any {
    // This would collect actual user input based on challenge type
    return {
      timestamp: Date.now()
    };
  }

  /**
   * Manual verification request
   */
  async verify(): Promise<VerificationResult> {
    if (this.isVerifying) {
      return { success: false, tier: this.currentTier, reason: 'already_verifying' };
    }

    this.isVerifying = true;

    try {
      const oosScore = await this.detector.getOOSScore();
      const tier = this.tierEngine.getTierForScore(oosScore);

      if (tier >= 2) {
        return await this.showChallenge(tier);
      }

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
  async showChallenge(tier: TierLevel): Promise<VerificationResult> {
    this.emit('challenge', { tier, type: 'starting' });
    this.options.onChallenge({ tier, type: 'starting' });

    const challengeStart = Date.now();

    return new Promise((resolve) => {
      this.challengeManager.createChallengeUI(tier, (result) => {
        const completionTime = Date.now() - challengeStart;
        this.happiness.trackChallengeCompletion(result.success, completionTime, result.type as any);

        if (result.success) {
          this.emit('success', {
            tier: result.tier,
            type: result.type,
            duration: completionTime
          });
          this.options.onSuccess({
            tier: result.tier,
            type: result.type as any,
            duration: completionTime
          });
          this.session.increaseTrust();

          resolve({
            success: true,
            tier: result.tier,
            type: result.type,
            duration: completionTime,
            timestamp: Date.now()
          });
        } else {
          this.emit('blocked', {
            reason: result.reason,
            attempts: result.attempts || 1
          });
          this.options.onBlocked({
            reason: result.reason || 'verification_failed',
            attempts: result.attempts || 1
          });

          resolve({
            success: false,
            tier: result.tier,
            blocked: true,
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
  on(event: EventType, callback: (data: unknown) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  off(event: EventType, callback: (data: unknown) => void): this {
    this.listeners.get(event)?.delete(callback);
    return this;
  }

  private emit(event: EventType, data: unknown): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    if (document.getElementById('astra-shield-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'astra-shield-styles';
    styles.textContent = this.getStyles();
    document.head.appendChild(styles);
  }

  /**
   * Get all CSS styles - Anti-Trope Design
   * Design Philosophy:
   * - No generic AI aesthetics (no indigo gradients, no glassmorphism, no glows)
   * - Utilitarian, minimal, functional design
   * - Space Grotesk typography
   * - Stark black/white with single accent color
   * - Sharp edges, no decorative elements
   */
  private getStyles(): string {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

      :root {
        --astra-bg: #0a0a0a;
        --astra-surface: #141414;
        --astra-surface-alt: #1a1a1a;
        --astra-border: #2a2a2a;
        --astra-text: #e5e5e5;
        --astra-text-muted: #737373;
        --astra-accent: #22c55e;
        --astra-font: 'Space Grotesk', system-ui, sans-serif;
      }

      .astra-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        opacity: 0;
        transition: opacity 0.2s ease;
        font-family: var(--astra-font);
        -webkit-font-smoothing: antialiased;
      }

      .astra-overlay.active { opacity: 1; }

      .astra-container {
        background: var(--astra-surface);
        border: 1px solid var(--astra-border);
        padding: 40px 32px;
        max-width: 380px;
        width: 90%;
        text-align: center;
        transform: scale(0.98) translateY(8px);
        transition: transform 0.2s ease;
      }

      .astra-overlay.active .astra-container {
        transform: scale(1) translateY(0);
      }

      .astra-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 32px;
      }

      .astra-logo-text {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.15em;
        color: var(--astra-text);
      }

      .astra-challenge-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--astra-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .astra-instruction {
        font-size: 16px;
        font-weight: 600;
        color: var(--astra-text);
        margin: 0 0 8px;
        letter-spacing: -0.01em;
      }

      .astra-subtitle {
        font-size: 13px;
        color: var(--astra-text-muted);
        margin: 0 0 32px;
        line-height: 1.4;
      }

      .astra-progress {
        width: 100%;
        height: 3px;
        background: var(--astra-border);
        margin-bottom: 40px;
        overflow: hidden;
      }

      .astra-progress-fill {
        height: 100%;
        background: var(--astra-accent);
        transition: width 0.1s linear;
      }

      .astra-challenge-area {
        min-height: 180px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin-bottom: 24px;
      }

      .astra-footer {
        border-top: 1px solid var(--astra-border);
        padding-top: 24px;
      }

      .astra-btn {
        width: 100%;
        padding: 12px 20px;
        background: var(--astra-text);
        color: var(--astra-bg);
        border: none;
        font-family: var(--astra-font);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
        letter-spacing: 0.02em;
      }

      .astra-btn:hover {
        background: #fff;
      }

      .astra-btn:disabled {
        background: var(--astra-border);
        color: var(--astra-text-muted);
        cursor: not-allowed;
      }

      .astra-meta {
        display: block;
        font-size: 10px;
        color: #404040;
        margin-top: 16px;
      }

      /* Pulse Challenge - Anti-Trope */
      .astra-pulse-container {
        position: relative;
        width: 140px;
        height: 140px;
        cursor: pointer;
      }

      .astra-pulse-ring {
        position: absolute;
        inset: 0;
        border: 2px solid var(--astra-border);
        border-radius: 50%;
        opacity: 0;
      }

      .astra-pulse-ring:nth-child(1) { animation: pulse-ring 1.5s ease-out infinite; }
      .astra-pulse-ring:nth-child(2) { animation: pulse-ring 1.5s ease-out infinite 0.3s; }
      .astra-pulse-ring:nth-child(3) { animation: pulse-ring 1.5s ease-out infinite 0.6s; }

      @keyframes pulse-ring {
        0% { transform: scale(0.8); opacity: 0.6; border-color: var(--astra-accent); }
        100% { transform: scale(1.2); opacity: 0; border-color: var(--astra-border); }
      }

      .astra-pulse-core {
        position: absolute;
        inset: 30px;
        background: var(--astra-surface-alt);
        border: 2px solid var(--astra-border);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s ease;
      }

      .astra-pulse-core::after {
        content: '';
        width: 20px;
        height: 20px;
        background: var(--astra-accent);
        border-radius: 50%;
        transition: transform 0.1s ease;
      }

      .astra-pulse-core.tapped::after {
        transform: scale(1.3);
      }

      .astra-pulse-container:hover .astra-pulse-core {
        border-color: var(--astra-text-muted);
      }

      .astra-pulse-counter {
        position: absolute;
        bottom: -8px;
        right: -8px;
        width: 32px;
        height: 32px;
        background: var(--astra-bg);
        border: 1px solid var(--astra-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      /* Tilt Challenge - Anti-Trope */
      .astra-tilt-container {
        width: 180px;
        height: 180px;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
        position: relative;
        cursor: grab;
      }

      .astra-tilt-container:active {
        cursor: grabbing;
      }

      .astra-tilt-target {
        position: absolute;
        width: 50px;
        height: 50px;
        border: 2px dashed var(--astra-accent);
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        transition: left 0.3s ease, top 0.3s ease, border-color 0.2s ease;
      }

      .astra-tilt-ball {
        width: 32px;
        height: 32px;
        background: var(--astra-text);
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        transition: left 0.05s linear, top 0.05s linear;
      }

      .astra-tilt-status {
        display: flex;
        justify-content: center;
        gap: 24px;
        margin-top: 20px;
        font-size: 12px;
        color: var(--astra-text-muted);
      }

      .astra-tilt-status strong {
        color: var(--astra-text);
        font-variant-numeric: tabular-nums;
      }

      /* Flick Challenge - Anti-Trope */
      .astra-flick-container {
        width: 160px;
        height: 160px;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .astra-flick-indicator {
        width: 70px;
        height: 70px;
        border: 2px solid var(--astra-border);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .astra-flick-indicator.right .astra-flick-arrow { transform: rotate(0deg); }
      .astra-flick-indicator.down .astra-flick-arrow { transform: rotate(90deg); }
      .astra-flick-indicator.left .astra-flick-arrow { transform: rotate(180deg); }
      .astra-flick-indicator.up .astra-flick-arrow { transform: rotate(-90deg); }

      .astra-flick-indicator.correct {
        border-color: var(--astra-accent);
        background: rgba(34, 197, 94, 0.1);
      }

      .astra-flick-arrow {
        width: 28px;
        height: 28px;
        fill: none;
        stroke: var(--astra-text);
        stroke-width: 2.5;
        stroke-linecap: square;
      }

      .astra-direction-labels {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .astra-direction-labels span {
        position: absolute;
        font-size: 9px;
        color: var(--astra-text-muted);
        text-transform: uppercase;
      }

      .astra-direction-labels .top { top: 6px; left: 50%; transform: translateX(-50%); }
      .astra-direction-labels .bottom { bottom: 6px; left: 50%; transform: translateX(-50%); }
      .astra-direction-labels .left { left: 6px; top: 50%; transform: translateY(-50%); }
      .astra-direction-labels .right { right: 6px; top: 50%; transform: translateY(-50%); }

      /* Breath Challenge - Anti-Trope */
      .astra-breath-container {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .astra-breath-circle {
        width: 100px;
        height: 100px;
        background: var(--astra-surface-alt);
        border: 2px solid var(--astra-border);
        border-radius: 50%;
        transition: transform 0.3s ease, border-color 0.3s ease;
      }

      .astra-breath-circle::after {
        content: '';
        position: absolute;
        inset: 10px;
        background: var(--astra-text);
        border-radius: 50%;
        transition: transform 0.3s ease;
      }

      .astra-breath-text {
        margin-top: 24px;
        font-size: 13px;
        font-weight: 500;
        color: var(--astra-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .astra-breath-status {
        display: flex;
        justify-content: center;
        gap: 24px;
        margin-top: 16px;
        font-size: 12px;
        color: var(--astra-text-muted);
      }

      .astra-breath-status strong {
        color: var(--astra-text);
        font-variant-numeric: tabular-nums;
      }

      /* Rhythm Challenge - Anti-Trope */
      .astra-rhythm-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .astra-rhythm-display {
        display: flex;
        gap: 12px;
      }

      .astra-rhythm-pad {
        width: 50px;
        height: 50px;
        background: var(--astra-surface-alt);
        border: 2px solid var(--astra-border);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }

      .astra-rhythm-wave {
        width: 180px;
        height: 40px;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
        position: relative;
        overflow: hidden;
      }

      .astra-rhythm-status {
        display: flex;
        justify-content: center;
        gap: 24px;
        margin-top: 12px;
        font-size: 12px;
        color: var(--astra-text-muted);
      }

      .astra-rhythm-status strong {
        color: var(--astra-text);
        font-variant-numeric: tabular-nums;
      }

      /* Pressure Challenge - Anti-Trope */
      .astra-pressure-container {
        width: 140px;
        height: 140px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .astra-pressure-circle {
        width: 80px;
        height: 80px;
        background: var(--astra-surface-alt);
        border: 2px solid var(--astra-border);
        border-radius: 50%;
        position: relative;
        z-index: 2;
        transition: transform 0.1s ease, border-color 0.2s ease;
      }

      .astra-pressure-ring {
        position: absolute;
        inset: 10px;
        border: 3px solid var(--astra-border);
        border-radius: 50%;
        z-index: 1;
        transition: border-color 0.2s ease;
      }

      .astra-pressure-fill {
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 60px;
        height: 0;
        background: var(--astra-accent);
        opacity: 0.3;
        border-radius: 4px 4px 0 0;
        transition: height 0.1s ease;
      }

      .astra-pressure-status {
        display: flex;
        justify-content: center;
        gap: 24px;
        margin-top: 20px;
        font-size: 12px;
        color: var(--astra-text-muted);
      }

      .astra-pressure-status strong {
        color: var(--astra-text);
        font-variant-numeric: tabular-nums;
      }

      /* Path Challenge - Anti-Trope */
      .astra-path-container {
        width: 200px;
        height: 200px;
        position: relative;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
      }

      .astra-path-canvas {
        width: 100%;
        height: 100%;
      }

      .astra-path-target {
        position: absolute;
        width: 20px;
        height: 20px;
        background: var(--astra-accent);
        border-radius: 50%;
        transform: translate(-50%, -50%);
      }

      .astra-path-status {
        display: flex;
        justify-content: center;
        gap: 24px;
        margin-top: 16px;
        font-size: 12px;
        color: var(--astra-text-muted);
      }

      .astra-path-status strong {
        color: var(--astra-text);
        font-variant-numeric: tabular-nums;
      }

      /* Semantic Challenge - Anti-Trope */
      .astra-semantic-container {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .astra-semantic-shapes {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
      }

      .astra-shape {
        width: 60px;
        height: 60px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .astra-shape:hover {
        transform: scale(1.05);
      }

      .astra-shape-circle {
        border-radius: 50%;
      }

      .astra-shape-square {
        border-radius: 4px;
      }

      .astra-shape-triangle {
        width: 0;
        height: 0;
        border-left: 30px solid transparent;
        border-right: 30px solid transparent;
        border-bottom: 52px solid;
        background: transparent !important;
      }

      .astra-semantic-instruction {
        font-size: 14px;
        font-weight: 500;
        color: var(--astra-text);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Micro-Chain Challenge - Anti-Trope */
      .astra-microchain-container {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .astra-microchain-area {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 20px;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
      }

      .astra-microchain-step {
        width: 40px;
        height: 40px;
        background: var(--astra-surface-alt);
        border: 2px solid var(--astra-border);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 600;
        color: var(--astra-text-muted);
        transition: all 0.2s ease;
      }

      .astra-microchain-step.active {
        border-color: var(--astra-accent);
        color: var(--astra-accent);
      }

      .astra-microchain-arrow {
        width: 20px;
        height: 2px;
        background: var(--astra-border);
      }

      .astra-microchain-status {
        margin-top: 16px;
        font-size: 13px;
        font-weight: 500;
        color: var(--astra-accent);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Gaze Challenge - Anti-Trope */
      .astra-gaze-container {
        width: 200px;
        height: 200px;
        position: relative;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
      }

      .astra-gaze-area {
        width: 100%;
        height: 100%;
        position: relative;
      }

      .astra-gaze-target {
        position: absolute;
        width: 30px;
        height: 30px;
        border: 2px dashed var(--astra-accent);
        border-radius: 50%;
        transform: translate(-50%, -50%);
      }

      .astra-gaze-indicator {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 40px;
        height: 40px;
        color: var(--astra-text-muted);
        transition: color 0.2s ease;
      }

      .astra-gaze-indicator.active {
        color: var(--astra-accent);
      }

      /* Contextual Challenge - Anti-Trope */
      .astra-contextual-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .astra-contextual-display {
        width: 100%;
        padding: 16px;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
        text-align: center;
      }

      .astra-contextual-sentence {
        font-size: 13px;
        color: var(--astra-text-muted);
        line-height: 1.5;
      }

      .astra-contextual-question {
        font-size: 14px;
        font-weight: 600;
        color: var(--astra-text);
      }

      .astra-contextual-options {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .astra-contextual-option {
        padding: 10px 20px;
        background: var(--astra-surface-alt);
        border: 1px solid var(--astra-border);
        color: var(--astra-text);
        font-family: var(--astra-font);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .astra-contextual-option:hover {
        border-color: var(--astra-accent);
        color: var(--astra-accent);
      }

      .astra-contextual-option.correct {
        background: var(--astra-accent);
        border-color: var(--astra-accent);
        color: var(--astra-bg);
      }

      /* Success Check - Anti-Trope */
      .astra-success-check {
        width: 64px;
        height: 64px;
        margin: 0 auto 24px;
        border: 2px solid var(--astra-accent);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .astra-success-check svg {
        width: 28px;
        height: 28px;
        stroke: var(--astra-accent);
        stroke-width: 3;
      }

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
    `;
  }

  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log('[ASTRA Shield]', ...args);
    }
  }

  /**
   * Destroy the shield instance
   */
  destroy(): void {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('touchstart', this.handleTouch);
    document.removeEventListener('touchmove', this.handleTouchMove);

    const overlay = document.getElementById('astra-overlay');
    if (overlay) overlay.remove();

    const styles = document.getElementById('astra-shield-styles');
    if (styles) styles.remove();

    (this as any).isInitialized = false;
  }
}

// Auto-attach to window for script tag usage
if (typeof window !== 'undefined') {
  (window as any).ASTRAShield = ASTRAShield;
}

export { ASTRAShield };
