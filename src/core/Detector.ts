/**
 * Behavioral Detection Engine with Advanced Fingerprinting
 */

import {
  DetectorOptions,
  MouseMoveData,
  ClickData,
  KeystrokeData,
  ScrollData,
  TouchData,
  TouchMoveData,
  AnomalyScores,
  OOSAnalysis,
  AnalysisSummary,
  FingerprintData
} from '../types';
import { Session } from './Session';

export class Detector {
  private options: Required<DetectorOptions>;
  private session: Session | null = null;

  public scores: AnomalyScores = {
    mouseAnomaly: 0,
    clickAnomaly: 0,
    scrollAnomaly: 0,
    keyboardAnomaly: 0,
    touchAnomaly: 0,
    sessionAnomaly: 0
  };

  private data = {
    mouseMovements: [] as any[],
    clicks: [] as any[],
    keystrokes: [] as any[],
    scrolls: [] as any[],
    touches: [] as any[],
    touchMoves: [] as any[]
  };

  // Advanced fingerprinting data
  private fingerprints: FingerprintData = {
    canvas: null,
    webgl: null,
    audio: null,
    fonts: null,
    navigator: null,
    hardware: null
  };

  private keystrokeTimings: number[] = [];
  private clickTimings: number[] = [];
  private lastMouseMove: any = null;
  private lastClick: any = null;
  private lastKeystroke: any = null;
  private lastScroll: any = null;
  private lastTouch: any = null;
  private analysisTimer: ReturnType<typeof setInterval> | null = null;
  private fingerprintPromise: Promise<void> | null = null;

  constructor(options: DetectorOptions = {}) {
    this.options = {
      windowSize: options.windowSize || 100,
      analysisInterval: options.analysisInterval || 5000,
      thresholds: options.thresholds || {
        mouseVelocity: { min: 5, max: 2000 },
        clickInterval: { min: 50, max: 5000 },
        scrollVelocity: { min: 0, max: 5000 },
        keystrokeInterval: { min: 30, max: 2000 },
        touchVelocity: { min: 0, max: 3000 }
      }
    };
  }

  async init(session: Session): Promise<Detector> {
    this.session = session;
    this.startAnalysis();
    // Start fingerprinting collection
    this.fingerprintPromise = this.collectFingerprints();
    return this;
  }

  private startAnalysis(): void {
    this.analysisTimer = setInterval(() => {
      this.performAnalysis();
    }, this.options.analysisInterval);
  }

  /**
   * Collect advanced fingerprints
   */
  private async collectFingerprints(): Promise<void> {
    await Promise.all([
      this.collectCanvasFingerprint(),
      this.collectWebGLFingerprint(),
      this.collectAudioFingerprint(),
      this.collectFontFingerprint(),
      this.collectNavigatorFingerprint(),
      this.collectHardwareFingerprint()
    ]);
  }

  /**
   * Canvas fingerprinting
   */
  private async collectCanvasFingerprint(): Promise<void> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw various elements
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Astra Shield', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Fingerprint', 4, 17);

      // Add cryptographically secure noise (defeats canvas-blocker countermeasures)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const noiseBuffer = new Uint8Array(Math.ceil(data.length / 4));
      crypto.getRandomValues(noiseBuffer);
      for (let i = 0, n = 0; i < data.length; i += 4, n++) {
        data[i] ^= noiseBuffer[n] % 50;
      }

      const hash = await this.hashArrayBuffer(data.buffer);
      const entropy = this.calculateEntropy(Array.from(data.slice(0, 100)));

      this.fingerprints.canvas = {
        hash,
        entropy,
        hasWebGL: !!canvas.getContext('webgl'),
        hasWebGL2: !!canvas.getContext('webgl2'),
        dimensions: `${canvas.width}x${canvas.height}`
      };
    } catch (e) {
      // Canvas fingerprinting failed
    }
  }

  /**
   * WebGL fingerprinting
   */
  private async collectWebGLFingerprint(): Promise<void> {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      if (!gl) return;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

      this.fingerprints.webgl = {
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
        version: gl.getParameter(gl.VERSION),
        shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        parameters: {
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
          maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS)
        },
        extensions: gl.getSupportedExtensions() || [],
        webgl2: !!canvas.getContext('webgl2')
      };
    } catch (e) {
      // WebGL fingerprinting failed
    }
  }

  /**
   * Audio context fingerprinting
   */
  private async collectAudioFingerprint(): Promise<void> {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      const processor = context.createScriptProcessor(4096, 1, 1);

      gain.gain.value = 0;
      oscillator.type = 'triangle';
      oscillator.frequency.value = 10000;

      oscillator.connect(analyser);
      analyser.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);

      oscillator.start(0);

      const frequencyData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(frequencyData);

      oscillator.stop();
      context.close();

      const hash = await this.hashArrayBuffer(frequencyData.buffer);
      const entropy = this.calculateEntropy(Array.from(frequencyData.slice(0, 100)));

      this.fingerprints.audio = {
        hash,
        entropy,
        sampleRate: context.sampleRate,
        supported: true,
        audioWorklet: 'audioWorklet' in context
      };
    } catch (e) {
      // Audio fingerprinting failed
      this.fingerprints.audio = { supported: false };
    }
  }

  /**
   * Font fingerprinting
   */
  private async collectFontFingerprint(): Promise<void> {
    try {
      const testFonts = [
        'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
        'Courier New', 'Impact', 'Comic Sans MS', 'Trebuchet MS',
        'Adobe Garamond Pro', 'Baskerville', 'Big Caslon', 'Bodoni MT',
        'Book Antiqua', 'Calibri', 'Cambria', 'Candara', 'Century Gothic',
        'Franklin Gothic Medium', 'Futura', 'Gabriola', 'Garamond',
        'Palatino Linotype', 'Optima', 'Segoe UI', 'Trebuchet MS'
      ];

      const baseFonts = ['monospace', 'sans-serif', 'serif'];
      const testString = 'mmmmmmmmmmlli';
      const testSize = '72px';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const detected: string[] = [];
      const fontMetrics: Record<string, any> = {};

      for (const font of testFonts) {
        let isDetected = false;

        for (const baseFont of baseFonts) {
          ctx.font = `${testSize} ${baseFont}`;
          const baseWidth = ctx.measureText(testString).width;

          ctx.font = `${testSize} "${font}", ${baseFont}`;
          const fontWidth = ctx.measureText(testString).width;

          if (fontWidth !== baseWidth) {
            isDetected = true;
            fontMetrics[font] = { width: fontWidth, base: baseWidth };
          }
        }

        if (isDetected) {
          detected.push(font);
        }
      }

      this.fingerprints.fonts = {
        detected,
        count: detected.length,
        metrics: fontMetrics
      };
    } catch (e) {
      // Font fingerprinting failed
    }
  }

  /**
   * Navigator fingerprinting
   */
  private collectNavigatorFingerprint(): void {
    try {
      const nav = navigator as any;

      this.fingerprints.navigator = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: navigator.languages,
        hardwareConcurrency: navigator.hardwareConcurrency || nav.deviceMemory || undefined,
        deviceMemory: nav.deviceMemory || undefined,
        maxTouchPoints: navigator.maxTouchPoints,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        webdriver: nav.webdriver || false,
        plugins: Array.from(navigator.plugins || []).map(p => p.name),
        mimeTypes: Array.from(navigator.mimeTypes || []).map(m => m.type),
        vendor: navigator.vendor,
        product: navigator.product,
        productSub: nav.productSub,
        vendorSub: nav.vendorSub
      };
    } catch (e) {
      // Navigator fingerprinting failed
    }
  }

  /**
   * Hardware fingerprinting
   */
  private collectHardwareFingerprint(): void {
    try {
      const nav = navigator as any;

      this.fingerprints.hardware = {
        cpuCores: navigator.hardwareConcurrency || undefined,
        deviceMemory: nav.deviceMemory || undefined,
        devicePixelRatio: window.devicePixelRatio,
        screen: {
          width: screen.width,
          height: screen.height,
          colorDepth: screen.colorDepth,
          pixelDepth: screen.pixelDepth
        },
        touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset()
      };
    } catch (e) {
      // Hardware fingerprinting failed
    }
  }

  /**
   * Hash array buffer using SHA-256
   */
  private async hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
    try {
      // crypto.subtle requires HTTPS or localhost
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('crypto.subtle unavailable');
      }
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback: djb2-style hash for environments without SubtleCrypto
      const arr = new Uint8Array(buffer);
      let h = 5381;
      for (let i = 0; i < arr.length; i++) {
        h = ((h << 5) + h) ^ arr[i];
        h = h >>> 0; // keep unsigned 32-bit
      }
      return h.toString(16).padStart(8, '0');
    }
  }

  /**
   * Calculate entropy of data
   */
  private calculateEntropy(data: number[]): number {
    const counts: Record<number, number> = {};
    for (const value of data) {
      counts[value] = (counts[value] || 0) + 1;
    }

    const total = data.length;
    let entropy = 0;

    for (const count of Object.values(counts)) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Get all fingerprints for server analysis
   */
  async getFingerprints(): Promise<FingerprintData> {
    if (this.fingerprintPromise) {
      await this.fingerprintPromise;
    }
    return { ...this.fingerprints };
  }

  recordMouseMove(data: MouseMoveData): void {
    const entry = { x: data.x, y: data.y, t: data.timestamp };

    if (this.lastMouseMove) {
      const dt = data.timestamp - this.lastMouseMove.t;
      if (dt > 0) {
        const dx = data.x - this.lastMouseMove.x;
        const dy = data.y - this.lastMouseMove.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        entry.velocity = distance / (dt / 1000);
        entry.direction = Math.atan2(dy, dx);
      }
    }

    this.data.mouseMovements.push(entry);
    this.trimData('mouseMovements');
    this.lastMouseMove = entry;
  }

  recordClick(data: ClickData): void {
    const entry = { target: data.target, x: data.x, y: data.y, t: data.timestamp };

    if (this.lastClick) {
      entry.interval = data.timestamp - this.lastClick.t;
      this.clickTimings.push(entry.interval);
    }

    this.data.clicks.push(entry);
    this.trimData('clicks');
    this.lastClick = entry;
  }

  recordKeystroke(data: KeystrokeData): void {
    const entry = { key: data.key, t: data.timestamp };

    if (this.lastKeystroke) {
      const interval = data.timestamp - this.lastKeystroke.t;
      entry.interval = interval;
      if (data.key.length === 1) {
        this.keystrokeTimings.push(interval);
      }
    }

    this.data.keystrokes.push(entry);
    this.trimData('keystrokes');
    this.lastKeystroke = entry;
  }

  recordScroll(data: ScrollData): void {
    const entry = { scrollY: data.scrollY, t: data.timestamp };

    if (this.lastScroll) {
      const dt = data.timestamp - this.lastScroll.t;
      if (dt > 0) {
        entry.delta = Math.abs(data.scrollY - this.lastScroll.scrollY);
        entry.velocity = entry.delta / (dt / 1000);
      }
    }

    this.data.scrolls.push(entry);
    this.trimData('scrolls');
    this.lastScroll = entry;
  }

  recordTouch(data: TouchData): void {
    this.data.touches.push({ x: data.x, y: data.y, t: data.timestamp });
    this.trimData('touches');
    this.lastTouch = { x: data.x, y: data.y, t: data.timestamp };
  }

  recordTouchMove(data: TouchMoveData): void {
    const entry = { x: data.x, y: data.y, velocity: data.velocity, t: data.timestamp };

    if (this.lastTouch) {
      const dt = data.timestamp - this.lastTouch.t;
      if (dt > 0) {
        const dx = data.x - this.lastTouch.x;
        const dy = data.y - this.lastTouch.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        entry.velocity = distance / (dt / 1000);
      }
    }

    this.data.touchMoves.push(entry);
    this.trimData('touchMoves');
    this.lastTouch = entry;
  }

  private trimData(key: keyof typeof this.data): void {
    if (this.data[key].length > this.options.windowSize) {
      this.data[key] = this.data[key].slice(-this.options.windowSize);
    }
  }

  private performAnalysis(): void {
    this.scores.mouseAnomaly = this.analyzeMousePattern();
    this.scores.clickAnomaly = this.analyzeClickPattern();
    this.scores.scrollAnomaly = this.analyzeScrollPattern();
    this.scores.keyboardAnomaly = this.analyzeKeyboardPattern();
    this.scores.touchAnomaly = this.analyzeTouchPattern();
    this.scores.sessionAnomaly = this.analyzeSessionPattern();
  }

  private analyzeMousePattern(): number {
    if (this.data.mouseMovements.length < 10) return 0;
    const velocities = this.data.mouseMovements
      .filter(m => m.velocity !== undefined)
      .map(m => m.velocity);
    if (velocities.length === 0) return 0.5;

    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const std = Math.sqrt(velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / velocities.length);

    let anomaly = 0;
    if (std < 10) anomaly += 0.3;
    if (avg < this.options.thresholds.mouseVelocity.min) anomaly += 0.2;
    if (avg > this.options.thresholds.mouseVelocity.max) anomaly += 0.2;

    return Math.min(1, anomaly);
  }

  private analyzeClickPattern(): number {
    if (this.clickTimings.length < 5) return 0;
    const avg = this.clickTimings.reduce((a, b) => a + b, 0) / this.clickTimings.length;
    const std = Math.sqrt(this.clickTimings.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / this.clickTimings.length);

    let anomaly = 0;
    if (std < 20) anomaly += 0.4;
    if (avg < this.options.thresholds.clickInterval.min) anomaly += 0.2;
    if (avg > this.options.thresholds.clickInterval.max) anomaly += 0.1;

    return Math.min(1, anomaly);
  }

  private analyzeScrollPattern(): number {
    const velocities = this.data.scrolls.filter(s => s.velocity !== undefined).map(s => s.velocity);
    if (velocities.length < 5) return 0;

    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const std = Math.sqrt(velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / velocities.length);

    let anomaly = 0;
    if (std < 5) anomaly += 0.4;
    if (avg > this.options.thresholds.scrollVelocity.max) anomaly += 0.3;

    return Math.min(1, anomaly);
  }

  private analyzeKeyboardPattern(): number {
    if (this.keystrokeTimings.length < 10) return 0;
    const avg = this.keystrokeTimings.reduce((a, b) => a + b, 0) / this.keystrokeTimings.length;
    const std = Math.sqrt(this.keystrokeTimings.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / this.keystrokeTimings.length);

    let anomaly = 0;
    if (std < 15) anomaly += 0.3;
    if (avg < this.options.thresholds.keystrokeInterval.min) anomaly += 0.2;
    if (avg > this.options.thresholds.keystrokeInterval.max) anomaly += 0.1;

    return Math.min(1, anomaly);
  }

  private analyzeTouchPattern(): number {
    const velocities = this.data.touchMoves.filter(t => t.velocity !== undefined).map(t => t.velocity);
    if (velocities.length < 5) return 0;

    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const std = Math.sqrt(velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / velocities.length);

    let anomaly = 0;
    if (std < 10) anomaly += 0.3;
    if (avg > this.options.thresholds.touchVelocity.max) anomaly += 0.2;

    return Math.min(1, anomaly);
  }

  private analyzeSessionPattern(): number {
    if (!this.session) return 0;
    let anomaly = 0;
    if (this.session.getTrust() < 0.5) anomaly += 0.3;
    if (this.session.getTrust() < 0.3) anomaly += 0.3;
    if (this.session.getAge() < 5000 && this.data.clicks.length > 10) anomaly += 0.4;
    return Math.min(1, anomaly);
  }

  async getOOSScore(): Promise<number> {
    this.performAnalysis();
    const weights = {
      mouseAnomaly: 0.2,
      clickAnomaly: 0.2,
      scrollAnomaly: 0.1,
      keyboardAnomaly: 0.15,
      touchAnomaly: 0.15,
      sessionAnomaly: 0.2
    };

    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += (this.scores as any)[key] * weight;
    }

    if (this.session) {
      const trustModifier = 1 - (this.session.getTrust() * 0.3);
      score *= trustModifier;
    }

    return Math.round(score * 4 * 100) / 100;
  }

  getAnalysisResults(): OOSAnalysis {
    return {
      scores: { ...this.scores },
      summary: {
        totalMouseMovements: this.data.mouseMovements.length,
        totalClicks: this.data.clicks.length,
        totalKeystrokes: this.data.keystrokes.length,
        totalScrolls: this.data.scrolls.length,
        totalTouches: this.data.touches.length
      }
    };
  }

  /**
   * Get all behavioral data for server analysis
   */
  getBehavioralData() {
    return {
      mouse: {
        positions: this.data.mouseMovements,
        clicks: this.data.clicks
      },
      keystrokes: this.data.keystrokes.map(k => ({
        key: k.key,
        timing: k.interval,
        timestamp: k.t
      })),
      clicks: this.data.clicks.map(c => ({
        x: c.x,
        y: c.y,
        target: c.target,
        interval: c.interval,
        timestamp: c.t
      })),
      scroll: this.data.scrolls.map(s => ({
        scrollY: s.scrollY,
        delta: s.delta,
        velocity: s.velocity,
        timestamp: s.t
      })),
      touch: this.data.touches
    };
  }

  /**
   * Get complete client data for server verification
   */
  async getClientData(): Promise<{
    behavior: ReturnType<typeof this.getBehavioralData>;
    fingerprints: FingerprintData;
    deviceInfo: {
      hasVibration: 'vibrate' in navigator,
      hasOrientation: 'DeviceOrientationEvent' in window,
      hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      isMobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    };
    timestamps: number[];
  }> {
    // Ensure fingerprints are collected
    if (this.fingerprintPromise) {
      await this.fingerprintPromise;
    }

    // Collect timestamps
    const timestamps: number[] = [];
    for (const move of this.data.mouseMovements) {
      if (move.t) timestamps.push(move.t);
    }
    for (const click of this.data.clicks) {
      if (click.t) timestamps.push(click.t);
    }

    return {
      behavior: this.getBehavioralData(),
      fingerprints: this.fingerprints,
      deviceInfo: {
        hasVibration: 'vibrate' in navigator,
        hasOrientation: 'DeviceOrientationEvent' in window,
        hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        isMobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
      },
      timestamps
    };
  }

  reset(): void {
    this.data = {
      mouseMovements: [],
      clicks: [],
      keystrokes: [],
      scrolls: [],
      touches: [],
      touchMoves: []
    };
    this.scores = {
      mouseAnomaly: 0,
      clickAnomaly: 0,
      scrollAnomaly: 0,
      keyboardAnomaly: 0,
      touchAnomaly: 0,
      sessionAnomaly: 0
    };
    this.keystrokeTimings = [];
    this.clickTimings = [];
  }
}
