/**
 * Tier Engine - 5-tier friction model
 */

import { TierLevel, TierEngineOptions, ActionContext, VerificationResult, TierConfig } from '../types';
import { Detector } from '../core/Detector';
import { Session } from '../core/Session';

export class TierEngine {
  private options: Required<TierEngineOptions>;
  private detector: Detector | null = null;
  private session: Session | null = null;

  private tiers: Record<TierLevel, TierConfig> = {
    0: { name: 'Ghost', description: 'Invisible - no friction', oosRange: [0, 1.5], delay: 0 },
    1: { name: 'Whisper', description: 'Imperceptible micro-delay', oosRange: [1.5, 2.0], delay: 200 },
    2: { name: 'Nudge', description: 'Single intuitive gesture', oosRange: [2.0, 2.5], delay: 0, requiresChallenge: true },
    3: { name: 'Pause', description: 'Brief engaging challenge', oosRange: [2.5, 3.0], delay: 0, requiresChallenge: true },
    4: { name: 'Gate', description: 'Manual verification required', oosRange: [3.0, 4.0], delay: 0, requiresChallenge: true }
  };

  constructor(options: TierEngineOptions = {}) {
    this.options = {
      tiers: options.tiers || {}
    };

    // Merge custom tier configs
    for (const [tier, config] of Object.entries(options.tiers || {})) {
      const tierNum = parseInt(tier) as TierLevel;
      if (this.tiers[tierNum] && config) {
        this.tiers[tierNum] = { ...this.tiers[tierNum], ...config };
      }
    }
  }

  async init(detector: Detector, session: Session): Promise<TierEngine> {
    this.detector = detector;
    this.session = session;
    return this;
  }

  getTierForScore(oosScore: number): TierLevel {
    for (const [tierNum, config] of Object.entries(this.tiers)) {
      const [min, max] = config.oosRange;
      if (oosScore >= min && oosScore < max) {
        return parseInt(tierNum) as TierLevel;
      }
    }
    return 0;
  }

  async handleAction(tier: TierLevel, context: ActionContext): Promise<VerificationResult> {
    switch (tier) {
      case 0: return this.handleGhostTier(context);
      case 1: return this.handleWhisperTier(context);
      case 2: return this.handleNudgeTier(context);
      case 3: return this.handlePauseTier(context);
      case 4: return this.handleGateTier(context);
      default: return this.handleGhostTier(context);
    }
  }

  private async handleGhostTier(context: ActionContext): Promise<VerificationResult> {
    context.shield.log('Ghost tier - no friction applied');
    return {
      success: true,
      tier: 0,
      friction: 0,
      action: context.action,
      timestamp: Date.now()
    };
  }

  private async handleWhisperTier(context: ActionContext): Promise<VerificationResult> {
    const delay = this.tiers[1].delay;
    context.shield.log(`Whisper tier - adding ${delay}ms delay`);
    await this.sleep(delay);

    return {
      success: true,
      tier: 1,
      friction: delay,
      action: context.action,
      timestamp: Date.now()
    };
  }

  private async handleNudgeTier(context: ActionContext): Promise<VerificationResult> {
    context.shield.log('Nudge tier - showing gesture challenge');
    const result = await context.shield.showChallenge(2);

    return {
      ...result,
      tier: 2,
      friction: result.duration || 3000
    };
  }

  private async handlePauseTier(context: ActionContext): Promise<VerificationResult> {
    context.shield.log('Pause tier - showing extended challenge');
    const result = await context.shield.showChallenge(3);

    return {
      ...result,
      tier: 3,
      friction: result.duration || 10000
    };
  }

  private async handleGateTier(context: ActionContext): Promise<VerificationResult> {
    context.shield.log('Gate tier - requiring enhanced verification');
    const result = await context.shield.showChallenge(4);

    if (!result.success) {
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

  getTierInfo(tier: TierLevel): TierConfig | null {
    return this.tiers[tier] || null;
  }

  getAllTierInfo(): Record<TierLevel, TierConfig> {
    return { ...this.tiers };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
