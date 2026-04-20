/**
 * ASTRA Shield - Type Definitions
 * Invisible security system with 5-tier friction model
 */

export type TierLevel = 0 | 1 | 2 | 3 | 4;

export type ChallengeType = 'pulse' | 'tilt' | 'flick' | 'breath' | 'rhythm' | 'pressure' | 'path' | 'semantic' | 'microchain' | 'gaze' | 'contextual';

export type ThemeMode = 'auto' | 'light' | 'dark';

export type EventType = 'ready' | 'challenge' | 'success' | 'blocked' | 'tierChange' | 'error';

export interface ASTRAShieldOptions {
  /** API key for backend verification */
  apiKey?: string;
  /** Backend verification endpoint */
  endpoint?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Theme mode */
  theme?: ThemeMode;
  /** LocalStorage prefix */
  storagePrefix?: string;
  /** Session duration in milliseconds */
  sessionDuration?: number;
  /** Challenge mutation interval in milliseconds */
  mutationInterval?: number;
  /** Callback when shield is ready */
  onReady?: () => void;
  /** Callback on challenge */
  onChallenge?: (data: ChallengeEvent) => void;
  /** Callback on success */
  onSuccess?: (data: SuccessEvent) => void;
  /** Callback on blocked */
  onBlocked?: (data: BlockedEvent) => void;
  /** Callback on tier change */
  onTierChange?: (data: TierChangeEvent) => void;
  /** Callback on error */
  onError?: (data: ErrorEvent) => void;
}

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastActivity: number;
  trust: number;
  age: number;
  idleTime: number;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  userAgent: string;
  language: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  timezone: string;
  touchEnabled: boolean;
  cookieEnabled: boolean;
}

export interface VerificationResult {
  success: boolean;
  tier: TierLevel;
  friction?: number;
  type?: ChallengeType;
  duration?: number;
  timestamp?: number;
  blocked?: boolean;
  reason?: string;
  attempts?: number;
  action?: string;
}

export interface ChallengeEvent {
  tier: TierLevel;
  type: 'starting' | 'active';
  challengeType?: ChallengeType;
}

export interface SuccessEvent {
  tier: TierLevel;
  type: ChallengeType;
  duration: number;
}

export interface BlockedEvent {
  reason: string;
  attempts: number;
}

export interface TierChangeEvent {
  tier: TierLevel;
  oosScore: number;
}

export interface ErrorEvent {
  type: 'init' | 'challenge' | 'verification' | 'unknown';
  error: Error;
}

export interface OOSAnalysis {
  scores: AnomalyScores;
  summary: AnalysisSummary;
}

export interface AnomalyScores {
  mouseAnomaly: number;
  clickAnomaly: number;
  scrollAnomaly: number;
  keyboardAnomaly: number;
  touchAnomaly: number;
  sessionAnomaly: number;
}

export interface AnalysisSummary {
  totalMouseMovements: number;
  totalClicks: number;
  totalKeystrokes: number;
  totalScrolls: number;
  totalTouches: number;
}

export interface TierConfig {
  name: string;
  description: string;
  oosRange: [number, number];
  delay: number;
  requiresChallenge?: boolean;
}

export interface ChallengeConfig {
  name: string;
  description: string;
  duration: number;
  accessibility: boolean;
}

export interface AccessibilityPreferences {
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  audioCues: boolean;
  extendedTime: boolean;
  simplifiedMode: boolean;
}

export interface HappinessMetrics {
  totalChallenges: number;
  completionRate: number;
  averageTime: number;
  satisfactionScore: number;
  challenges: Record<ChallengeType, ChallengeMetrics>;
}

export interface ChallengeMetrics {
  attempts: number;
  successes: number;
  totalTime: number;
}

export interface MutatorInfo {
  lastMutation: number;
  nextMutation: number;
  timeUntilMutation: number;
  activeChallenges: Record<TierLevel, ChallengeType[]>;
  seed: number;
}

/**
 * ASTRA Shield - Main Class
 */
export declare class ASTRAShield {
  constructor(options?: ASTRAShieldOptions);

  /** Core modules */
  readonly session: Session;
  readonly detector: Detector;
  readonly tierEngine: TierEngine;
  readonly challengeManager: ChallengeManager;
  readonly mutator: Mutator;
  readonly accessibility: AccessibilityManager;
  readonly happiness: HappinessTracker;

  /** Initialization state */
  readonly isInitialized: boolean;
  readonly isVerifying: boolean;

  /**
   * Protect a sensitive action
   */
  protect(action: string, context?: Record<string, unknown>): Promise<VerificationResult>;

  /**
   * Manual verification request
   */
  verify(): Promise<VerificationResult>;

  /**
   * Add event listener
   */
  on(event: EventType, callback: (data: unknown) => void): this;

  /**
   * Remove event listener
   */
  off(event: EventType, callback: (data: unknown) => void): this;

  /**
   * Destroy the shield instance
   */
  destroy(): void;
}

/**
 * Session Management
 */
export declare class Session {
  readonly id: string;
  readonly trust: number;
  readonly createdAt: number;
  readonly lastActivity: number;

  constructor(options?: SessionOptions);
  init(): Promise<Session>;
  touch(): void;
  increaseTrust(amount?: number): number;
  decreaseTrust(amount?: number): number;
  getTrust(): number;
  getAge(): number;
  getIdleTime(): number;
  getInfo(): SessionInfo;
  updateMetadata(data: Partial<SessionMetadata>): void;
  clear(): void;
}

export interface SessionOptions {
  storagePrefix?: string;
  sessionDuration?: number;
}

/**
 * Behavioral Detection Engine
 */
export declare class Detector {
  readonly scores: AnomalyScores;

  constructor(options?: DetectorOptions);
  init(session: Session): Promise<Detector>;
  recordMouseMove(data: MouseMoveData): void;
  recordClick(data: ClickData): void;
  recordKeystroke(data: KeystrokeData): void;
  recordScroll(data: ScrollData): void;
  recordTouch(data: TouchData): void;
  recordTouchMove(data: TouchMoveData): void;
  getOOSScore(): Promise<number>;
  getAnalysisResults(): OOSAnalysis;
  getFingerprints(): Promise<FingerprintData>;
  getBehavioralData(): {
    mouse: { positions: any[]; clicks: any[] };
    keystrokes: any[];
    clicks: any[];
    scroll: any[];
    touch: any[];
  };
  getClientData(): Promise<{
    behavior: ReturnType<Detector['getBehavioralData']>;
    fingerprints: FingerprintData;
    deviceInfo: {
      hasVibration: boolean;
      hasOrientation: boolean;
      hasTouch: boolean;
      isMobile: boolean;
    };
    timestamps: number[];
  }>;
  reset(): void;
}

export interface DetectorOptions {
  windowSize?: number;
  analysisInterval?: number;
  thresholds?: AnomalyThresholds;
}

export interface AnomalyThresholds {
  mouseVelocity?: { min: number; max: number };
  mouseAcceleration?: { min: number; max: number };
  clickInterval?: { min: number; max: number };
  scrollVelocity?: { min: number; max: number };
  keystrokeInterval?: { min: number; max: number };
  touchVelocity?: { min: number; max: number };
}

export interface MouseMoveData {
  x: number;
  y: number;
  timestamp: number;
}

export interface ClickData {
  target: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface KeystrokeData {
  key: string;
  timestamp: number;
}

export interface ScrollData {
  scrollY: number;
  timestamp: number;
}

export interface TouchData {
  x: number;
  y: number;
  timestamp: number;
}

export interface TouchMoveData {
  x: number;
  y: number;
  velocity: number;
  timestamp: number;
}

/**
 * Tier Engine
 */
export declare class TierEngine {
  constructor(options?: TierEngineOptions);
  init(detector: Detector, session: Session): Promise<TierEngine>;
  getTierForScore(oosScore: number): TierLevel;
  handleAction(tier: TierLevel, context: ActionContext): Promise<VerificationResult>;
  getTierInfo(tier: TierLevel): TierConfig | null;
  getAllTierInfo(): Record<TierLevel, TierConfig>;
}

export interface TierEngineOptions {
  tiers?: Record<TierLevel, Partial<TierConfig>>;
}

export interface ActionContext {
  action: string;
  context: Record<string, unknown>;
  shield: ASTRAShield;
  session: Session;
  detector: Detector;
}

/**
 * Challenge Manager
 */
export declare class ChallengeManager {
  constructor(options: ASTRAShieldOptions, mutator: Mutator, accessibility: AccessibilityManager);
  createChallengeUI(tier: TierLevel, callback: ChallengeCallback): void;
  completeChallenge(success: boolean, type: ChallengeType, tier: TierLevel): void;
  cancelChallenge(): void;
}

export interface ChallengeCallback {
  (result: VerificationResult): void;
}

/**
 * Mutator
 */
export declare class Mutator {
  constructor(options?: MutatorOptions);
  init(): Promise<Mutator>;
  mutate(): void;
  getChallengeForTier(tier: TierLevel): ChallengeType;
  shouldMutate(): boolean;
  getTimeUntilMutation(): number;
  getMutationInfo(): MutatorInfo;
  forceMutation(): MutatorInfo;
}

export interface MutatorOptions {
  mutationInterval?: number;
}

/**
 * Accessibility Manager
 */
export declare class AccessibilityManager {
  readonly preferences: AccessibilityPreferences;

  constructor(options?: AccessibilityOptions);
  init(): Promise<AccessibilityManager>;
  setPreference(key: keyof AccessibilityPreferences, value: boolean): void;
  getPreference(key: keyof AccessibilityPreferences): boolean;
  getAllPreferences(): AccessibilityPreferences;
  getAccessibleAlternative(challengeType: ChallengeType): AccessibleAlternative;
  announce(message: string, priority?: 'polite' | 'assertive'): void;
  trapFocus(element: HTMLElement): () => void;
  getDurationModifier(): number;
  shouldUseAudioCues(): boolean;
  resetToDefaults(): void;
}

export interface AccessibilityOptions {
  preferences?: Partial<AccessibilityPreferences>;
}

export interface AccessibleAlternative {
  type: string;
  title: string;
  description: string;
  action: string;
}

/**
 * Happiness Tracker
 */
export declare class HappinessTracker {
  constructor(options?: HappinessOptions);
  trackChallengeCompletion(success: boolean, duration: number, challengeType: ChallengeType): void;
  trackSatisfaction(rating: number): void;
  getCompletionRate(): number;
  getAverageTime(): number;
  getSatisfactionScore(): number;
  getSummary(): HappinessMetrics;
  meetsTargets(): HappinessTargets;
  reset(): void;
}

export interface HappinessOptions {
  onMetricUpdate?: (summary: HappinessMetrics) => void;
}

export interface HappinessTargets {
  completionRate: boolean;
  averageTime: boolean;
  satisfactionScore: boolean;
  overall: boolean;
}

/**
 * Advanced Fingerprint Types
 */
export interface CanvasFingerprint {
  hash: string;
  entropy: number;
  hasWebGL: boolean;
  hasWebGL2: boolean;
  dimensions: string;
}

export interface WebGLFingerprint {
  vendor: string | null;
  renderer: string | null;
  version: string;
  shadingLanguage: string;
  parameters: {
    maxTextureSize: number;
    maxViewportDims: number;
    maxVertexAttribs: number;
  };
  extensions: string[];
  webgl2: boolean;
}

export interface AudioFingerprint {
  hash: string;
  entropy: number;
  sampleRate: number;
  supported: boolean;
  audioWorklet?: boolean;
}

export interface FontFingerprint {
  detected: string[];
  count: number;
  metrics: Record<string, { width: number; base: number }>;
}

export interface NavigatorFingerprint {
  userAgent: string;
  platform: string;
  language: string;
  languages: string[];
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints: number;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  webdriver: boolean;
  plugins: string[];
  mimeTypes: string[];
  vendor: string;
  product: string;
  productSub?: string;
  vendorSub?: string;
}

export interface HardwareFingerprint {
  cpuCores?: number;
  deviceMemory?: number;
  devicePixelRatio: number;
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelDepth: number;
  };
  touchSupport: boolean;
  maxTouchPoints: number;
  platform: string;
  timezone: string;
  timezoneOffset: number;
}

export interface FingerprintData {
  canvas: CanvasFingerprint | null;
  webgl: WebGLFingerprint | null;
  audio: AudioFingerprint | null;
  fonts: FontFingerprint | null;
  navigator: NavigatorFingerprint | null;
  hardware: HardwareFingerprint | null;
}
