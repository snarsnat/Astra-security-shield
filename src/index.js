/**
 * ASTRA Shield - Main Entry Point
 * Invisible security that feels helpful, not hostile.
 */

// SDK — the recommended way to use ASTRA
export { Astra } from './sdk/Astra.js';

// WAF / input validation
export { InputGuard } from './core/InputGuard.js';

// Deep fingerprinting and script behavior profiling
export { FingerprintEngine } from './core/FingerprintEngine.js';
export { ScriptMonitor }     from './core/ScriptMonitor.js';

// Server-verified attestation (proof-of-work) + adaptive anomaly scoring
export { ProofOfWork } from './core/ProofOfWork.js';
export { MLClient }    from './core/MLClient.js';
export { solveServerlessPow } from './core/serverlessPow.js';

// Legacy browser SDK
export { ASTRAShield } from './core/Shield.js';
export { Session } from './core/Session.js';
export { Detector } from './core/Detector.js';
export { TierEngine } from './tiers/TierEngine.js';
export { ChallengeManager } from './challenges/ChallengeManager.js';
export { Mutator } from './mutation/Mutator.js';
export { AccessibilityManager } from './accessibility/AccessibilityManager.js';
