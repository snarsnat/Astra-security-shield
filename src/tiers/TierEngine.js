/**
 * Tier Engine - Manages the 5-tier friction model
 * The intelligent system that knows when to stay invisible.
 */

export class TierEngine {
  constructor(options = {}) {
    this.options = options;
    this.detector = null;
    this.session = null;

    // Tier configuration
    this.tiers = {
      0: {
        name: 'Ghost',
        description: 'Invisible - no friction',
        oosRange: [0, 1.5],
        delay: 0
      },
      1: {
        name: 'Whisper',
        description: 'Imperceptible micro-delay',
        oosRange: [1.5, 2.0],
        delay: 200 // ms
      },
      2: {
        name: 'Nudge',
        description: 'Single intuitive gesture',
        oosRange: [2.0, 2.5],
        delay: 0,
        requiresChallenge: true
      },
      3: {
        name: 'Pause',
        description: 'Brief engaging challenge',
        oosRange: [2.5, 3.0],
        delay: 0,
        requiresChallenge: true
      },
      4: {
        name: 'Gate',
        description: 'Manual verification required',
        oosRange: [3.0, 4.0],
        delay: 0,
        requiresChallenge: true
      }
    };
  }

  /**
   * Initialize with dependencies
   */
  async init(detector, session) {
    this.detector = detector;
    this.session = session;
    return this;
  }

  /**
   * Get tier for OOS score
   */
  getTierForScore(oosScore) {
    for (const [tierNum, config] of Object.entries(this.tiers)) {
      const [min, max] = config.oosRange;
      if (oosScore >= min && oosScore < max) {
        return parseInt(tierNum);
      }
    }
    return 0; // Default to ghost
  }

  /**
   * Handle action based on tier
   */
  async handleAction(tier, context) {
    const tierConfig = this.tiers[tier];

    switch (tier) {
      case 0:
        return this.handleGhostTier(context);
      case 1:
        return this.handleWhisperTier(context);
      case 2:
        return this.handleNudgeTier(context);
      case 3:
        return this.handlePauseTier(context);
      case 4:
        return this.handleGateTier(context);
      default:
        return this.handleGhostTier(context);
    }
  }

  /**
   * Handle Ghost tier - completely invisible
   */
  async handleGhostTier(context) {
    // No friction, just log and continue
    context.shield.log('Ghost tier - no friction applied');

    return {
      success: true,
      tier: 0,
      friction: 0,
      action: context.action,
      timestamp: Date.now()
    };
  }

  /**
   * Handle Whisper tier - micro-delay
   */
  async handleWhisperTier(context) {
    const delay = this.tiers[1].delay;

    context.shield.log(`Whisper tier - adding ${delay}ms delay`);

    // Apply micro-delay (imperceptible to humans)
    await this.sleep(delay);

    return {
      success: true,
      tier: 1,
      friction: delay,
      action: context.action,
      timestamp: Date.now()
    };
  }

  /**
   * Handle Nudge tier - single gesture challenge
   */
  async handleNudgeTier(context) {
    context.shield.log('Nudge tier - showing gesture challenge');

    // Show single-step challenge
    const result = await context.shield.showChallenge(2);

    return {
      ...result,
      tier: 2,
      friction: result.duration || 3000
    };
  }

  /**
   * Handle Pause tier - multi-step challenge
   */
  async handlePauseTier(context) {
    context.shield.log('Pause tier - showing extended challenge');

    // Show multi-step challenge
    const result = await context.shield.showChallenge(3);

    return {
      ...result,
      tier: 3,
      friction: result.duration || 10000
    };
  }

  /**
   * Handle Gate tier - manual verification
   */
  async handleGateTier(context) {
    context.shield.log('Gate tier - requiring enhanced verification');

    // For Gate tier, we offer multiple verification options
    // In a real implementation, this would integrate with backend verification
    const result = await context.shield.showChallenge(4);

    if (!result.success) {
      // Return blocked status for gate tier failures
      return {
        success: false,
        tier: 4,
        blocked: true,
        reason: result.reason || 'verification_failed',
        action: context.action,
        timestamp: Date.now()
      };
    }

    return {
      ...result,
      tier: 4,
      friction: result.duration || 15000
    };
  }

  /**
   * Get tier info
   */
  getTierInfo(tier) {
    return this.tiers[tier] || null;
  }

  /**
   * Get all tier info
   */
  getAllTierInfo() {
    return { ...this.tiers };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
