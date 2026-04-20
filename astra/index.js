/**
 * ASTRA Shield - Main Entry Point
 * Invisible security that feels helpful, not hostile.
 */

// SDK — the recommended way to use ASTRA
export { Astra } from './sdk/Astra.js';

// Legacy browser SDK
export { ASTRAShield } from './core/Shield.js';
export { Session } from './core/Session.js';
export { Detector } from './core/Detector.js';
export { TierEngine } from './tiers/TierEngine.js';
export { ChallengeManager } from './challenges/ChallengeManager.js';
export { Mutator } from './mutation/Mutator.js';
export { AccessibilityManager } from './accessibility/AccessibilityManager.js';
