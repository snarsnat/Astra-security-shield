/**
 * Behavioral Detection Engine
 * Analyzes user behavior patterns to detect bots
 */

export class Detector {
  constructor(options = {}) {
    this.options = options;
    this.session = null;

    // Behavioral data storage
    this.data = {
      mouseMovements: [],
      clicks: [],
      keystrokes: [],
      scrolls: [],
      touches: [],
      touchMoves: []
    };

    // Analysis windows
    this.windowSize = 100; // Number of events to keep
    this.analysisInterval = 5000; // Analyze every 5 seconds

    // Anomaly thresholds
    this.thresholds = {
      mouseVelocity: { min: 5, max: 2000 }, // px per second
      mouseAcceleration: { min: -500, max: 1000 },
      clickInterval: { min: 50, max: 5000 }, // ms
      scrollVelocity: { min: 0, max: 5000 }, // px per second
      keystrokeInterval: { min: 30, max: 2000 }, // ms
      touchVelocity: { min: 0, max: 3000 }
    };

    // OOS score components
    this.scores = {
      mouseAnomaly: 0,
      clickAnomaly: 0,
      scrollAnomaly: 0,
      keyboardAnomaly: 0,
      touchAnomaly: 0,
      sessionAnomaly: 0
    };

    // Last event timestamps for velocity calculation
    this.lastMouseMove = null;
    this.lastClick = null;
    this.lastKeystroke = null;
    this.lastScroll = null;
    this.lastTouch = null;

    // Timing analysis
    this.keystrokeTimings = [];
    this.clickTimings = [];

    // Analysis timer
    this.analysisTimer = null;
  }

  /**
   * Initialize detector with session
   */
  async init(session) {
    this.session = session;
    this.startAnalysis();
    return this;
  }

  /**
   * Start periodic analysis
   */
  startAnalysis() {
    this.analysisTimer = setInterval(() => {
      this.performAnalysis();
    }, this.analysisInterval);
  }

  /**
   * Stop analysis
   */
  stopAnalysis() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }
  }

  /**
   * Record mouse movement
   */
  recordMouseMove(data) {
    const entry = {
      x: data.x,
      y: data.y,
      t: data.timestamp
    };

    // Calculate velocity if we have previous data
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

  /**
   * Record click event
   */
  recordClick(data) {
    const entry = {
      target: data.target,
      x: data.x,
      y: data.y,
      t: data.timestamp
    };

    // Calculate interval since last click
    if (this.lastClick) {
      entry.interval = data.timestamp - this.lastClick.t;
      this.clickTimings.push(entry.interval);
    }

    this.data.clicks.push(entry);
    this.trimData('clicks');
    this.lastClick = entry;
  }

  /**
   * Record keystroke
   */
  recordKeystroke(data) {
    const entry = {
      key: data.key,
      t: data.timestamp
    };

    // Calculate interval since last keystroke
    if (this.lastKeystroke) {
      const interval = data.timestamp - this.lastKeystroke.t;
      entry.interval = interval;

      // Only count normal typing intervals (exclude special keys)
      if (data.key.length === 1) {
        this.keystrokeTimings.push(interval);
      }
    }

    this.data.keystrokes.push(entry);
    this.trimData('keystrokes');
    this.lastKeystroke = entry;
  }

  /**
   * Record scroll event
   */
  recordScroll(data) {
    const entry = {
      scrollY: data.scrollY,
      t: data.timestamp
    };

    // Calculate scroll velocity
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

  /**
   * Record touch event
   */
  recordTouch(data) {
    const entry = {
      x: data.x,
      y: data.y,
      t: data.timestamp
    };

    this.data.touches.push(entry);
    this.trimData('touches');
    this.lastTouch = entry;
  }

  /**
   * Record touch move event
   */
  recordTouchMove(data) {
    const entry = {
      x: data.x,
      y: data.y,
      velocity: data.velocity || 0,
      t: data.timestamp
    };

    // Calculate velocity from movement
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

  /**
   * Trim data arrays to window size
   */
  trimData(key) {
    if (this.data[key].length > this.windowSize) {
      this.data[key] = this.data[key].slice(-this.windowSize);
    }
  }

  /**
   * Perform analysis and update scores
   */
  performAnalysis() {
    // Analyze mouse patterns
    this.scores.mouseAnomaly = this.analyzeMousePattern();

    // Analyze click patterns
    this.scores.clickAnomaly = this.analyzeClickPattern();

    // Analyze scroll patterns
    this.scores.scrollAnomaly = this.analyzeScrollPattern();

    // Analyze keyboard patterns
    this.scores.keyboardAnomaly = this.analyzeKeyboardPattern();

    // Analyze touch patterns
    this.scores.touchAnomaly = this.analyzeTouchPattern();

    // Analyze session patterns
    this.scores.sessionAnomaly = this.analyzeSessionPattern();
  }

  /**
   * Analyze mouse movement patterns
   */
  analyzeMousePattern() {
    if (this.data.mouseMovements.length < 10) return 0;

    const velocities = this.data.mouseMovements
      .filter(m => m.velocity !== undefined)
      .map(m => m.velocity);

    if (velocities.length === 0) return 0.5; // Suspicious if no movement

    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const std = Math.sqrt(
      velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / velocities.length
    );

    // Check for suspicious patterns
    let anomaly = 0;

    // Too consistent (bot-like)
    if (std < 10) anomaly += 0.3;

    // Abnormal velocity
    if (avg < this.thresholds.mouseVelocity.min) anomaly += 0.2;
    if (avg > this.thresholds.mouseVelocity.max) anomaly += 0.2;

    // Perfect straight lines (bot-like)
    const directions = this.data.mouseMovements.filter(m => m.direction !== undefined);
    if (directions.length > 5) {
      const dirVariance = this.getDirectionVariance(directions);
      if (dirVariance < 0.1) anomaly += 0.3;
    }

    return Math.min(1, anomaly);
  }

  /**
   * Get variance of movement directions
   */
  getDirectionVariance(directions) {
    if (directions.length < 2) return 1;

    // Convert to radians variance
    const sinSum = directions.reduce((sum, d) => sum + Math.sin(d.direction), 0) / directions.length;
    const cosSum = directions.reduce((sum, d) => sum + Math.cos(d.direction), 0) / directions.length;

    return Math.sqrt(sinSum * sinSum + cosSum * cosSum);
  }

  /**
   * Analyze click patterns
   */
  analyzeClickPattern() {
    if (this.clickTimings.length < 5) return 0;

    const avg = this.clickTimings.reduce((a, b) => a + b, 0) / this.clickTimings.length;
    const std = Math.sqrt(
      this.clickTimings.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / this.clickTimings.length
    );

    let anomaly = 0;

    // Too regular (bot-like)
    if (std < 20) anomaly += 0.4;

    // Abnormal intervals
    if (avg < this.thresholds.clickInterval.min) anomaly += 0.2;
    if (avg > this.thresholds.clickInterval.max) anomaly += 0.1;

    // Perfect timing (unlikely human)
    const cv = std / avg; // Coefficient of variation
    if (cv < 0.1) anomaly += 0.3;

    return Math.min(1, anomaly);
  }

  /**
   * Analyze scroll patterns
   */
  analyzeScrollPattern() {
    const velocities = this.data.scrolls
      .filter(s => s.velocity !== undefined)
      .map(s => s.velocity);

    if (velocities.length < 5) return 0;

    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const std = Math.sqrt(
      velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / velocities.length
    );

    let anomaly = 0;

    // Perfect constant velocity (bot-like)
    if (std < 5) anomaly += 0.4;

    // Too fast
    if (avg > this.thresholds.scrollVelocity.max) anomaly += 0.3;

    return Math.min(1, anomaly);
  }

  /**
   * Analyze keyboard patterns
   */
  analyzeKeyboardPattern() {
    if (this.keystrokeTimings.length < 10) return 0;

    const avg = this.keystrokeTimings.reduce((a, b) => a + b, 0) / this.keystrokeTimings.length;
    const std = Math.sqrt(
      this.keystrokeTimings.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / this.keystrokeTimings.length
    );

    let anomaly = 0;

    // Too consistent (copy-paste or bot)
    if (std < 15) anomaly += 0.3;

    // Abnormal speed
    if (avg < this.thresholds.keystrokeInterval.min) anomaly += 0.2;
    if (avg > this.thresholds.keystrokeInterval.max) anomaly += 0.1;

    return Math.min(1, anomaly);
  }

  /**
   * Analyze touch patterns
   */
  analyzeTouchPattern() {
    const velocities = this.data.touchMoves
      .filter(t => t.velocity !== undefined)
      .map(t => t.velocity);

    if (velocities.length < 5) return 0;

    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const std = Math.sqrt(
      velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / velocities.length
    );

    let anomaly = 0;

    // Perfect touch gestures (bot-like)
    if (std < 10) anomaly += 0.3;

    // Unusual velocity
    if (avg < this.thresholds.touchVelocity.min) anomaly += 0.1;
    if (avg > this.thresholds.touchVelocity.max) anomaly += 0.2;

    return Math.min(1, anomaly);
  }

  /**
   * Analyze session patterns
   */
  analyzeSessionPattern() {
    if (!this.session) return 0;

    let anomaly = 0;

    // Low trust score
    if (this.session.getTrust() < 0.5) anomaly += 0.3;
    if (this.session.getTrust() < 0.3) anomaly += 0.3;

    // Very new session with suspicious activity
    if (this.session.getAge() < 5000 && this.data.clicks.length > 10) {
      anomaly += 0.4;
    }

    // Very long session doing same patterns
    if (this.session.getAge() > 300000 && this.session.getIdleTime() > 60000) {
      // Inactive for a long time, then suddenly active
      anomaly += 0.2;
    }

    return Math.min(1, anomaly);
  }

  /**
   * Get overall OOS (Out-of-Suspicion) score
   */
  async getOOSScore() {
    // Perform fresh analysis
    this.performAnalysis();

    // Calculate weighted score
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
      score += this.scores[key] * weight;
    }

    // Apply session trust modifier
    if (this.session) {
      const trustModifier = 1 - (this.session.getTrust() * 0.3);
      score *= trustModifier;
    }

    // Scale to OOS range (0-4)
    const oosScore = score * 4;

    return Math.round(oosScore * 100) / 100; // Round to 2 decimals
  }

  /**
   * Get detailed analysis results
   */
  getAnalysisResults() {
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
   * Reset analysis data
   */
  reset() {
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
