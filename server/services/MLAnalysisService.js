/**
 * ML-Powered Analysis Service - Advanced Machine Learning for Bot Detection
 *
 * Features:
 * 1. Behavioral pattern recognition using entropy analysis
 * 2. Anomaly detection using statistical models
 * 3. Temporal pattern analysis
 * 4. Session fingerprinting
 * 5. Real-time risk scoring with adaptive thresholds
 */

import crypto from 'crypto';

export class MLAnalysisService {
  constructor() {
    // ML model configurations
    this.config = {
      entropyThreshold: 2.5,
      velocityThreshold: 2.0,
      anomalyWeight: 0.4,
      patternWeight: 0.35,
      temporalWeight: 0.25,
      lookbackWindow: 100, // Events to analyze
      cooldownPeriod: 300000, // 5 minutes
    };

    // Known patterns (would be trained models in production)
    this.knownPatterns = {
      humanMouse: {
        minEntropy: 3.0,
        maxStraightness: 0.7,
        avgVelocity: 1.5,
        pauseFrequency: 0.3
      },
      botMouse: {
        maxEntropy: 2.0,
        minStraightness: 0.9,
        avgVelocity: 5.0,
        pauseFrequency: 0.05
      }
    };

    // Anomaly detection cache
    this.anomalyCache = new Map();
  }

  /**
   * Comprehensive ML analysis of all collected signals
   */
  async analyze(clientData, serverObservations = {}) {
    const analysis = {
      entropy: {},
      anomalies: [],
      patterns: {},
      riskScore: 0,
      confidence: 0,
      recommendations: [],
      modelVersion: '2.0.0'
    };

    // 1. Mouse behavior analysis
    if (clientData.behavior?.mouse) {
      analysis.entropy.mouse = this.calculateMouseEntropy(clientData.behavior.mouse);
      analysis.patterns.mouse = this.detectMousePattern(clientData.behavior.mouse);
      analysis.anomalies.push(...this.detectMouseAnomalies(clientData.behavior.mouse));
    }

    // 2. Keystroke dynamics analysis
    if (clientData.behavior?.keystrokes) {
      analysis.entropy.keystroke = this.analyzeKeystrokeDynamics(clientData.behavior.keystrokes);
      analysis.patterns.keystroke = this.detectKeystrokePattern(clientData.behavior.keystrokes);
    }

    // 3. Click pattern analysis
    if (clientData.behavior?.clicks) {
      analysis.entropy.click = this.analyzeClickPatterns(clientData.behavior.clicks);
      analysis.patterns.click = this.detectClickPattern(clientData.behavior.clicks);
    }

    // 4. Scroll behavior analysis
    if (clientData.behavior?.scroll) {
      analysis.entropy.scroll = this.analyzeScrollPatterns(clientData.behavior.scroll);
      analysis.patterns.scroll = this.detectScrollPattern(clientData.behavior.scroll);
    }

    // 5. Touch gesture analysis
    if (clientData.behavior?.touch) {
      analysis.entropy.touch = this.analyzeTouchGestures(clientData.behavior.touch);
      analysis.patterns.touch = this.detectTouchPattern(clientData.behavior.touch);
    }

    // 6. Temporal analysis
    analysis.temporal = this.analyzeTemporalPatterns(clientData.timestamps || []);
    analysis.anomalies.push(...analysis.temporal.anomalies);

    // 7. Session fingerprinting
    analysis.fingerprint = this.generateSessionFingerprint(clientData);

    // 8. Cross-signal correlation
    analysis.correlations = this.analyzeCorrelations(analysis);

    // 9. Calculate composite risk score
    analysis.riskScore = this.calculateCompositeRisk(analysis);

    // 10. Calculate confidence
    analysis.confidence = this.calculateConfidence(analysis);

    // 11. Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * Calculate Shannon entropy of mouse movement data
   */
  calculateMouseEntropy(mouseData) {
    if (!mouseData || !mouseData.positions || mouseData.positions.length < 10) {
      return { value: 0, classification: 'insufficient_data' };
    }

    // Calculate velocity distribution entropy
    const velocities = this.extractVelocities(mouseData);
    const entropy = this.shannonEntropy(velocities);

    // Calculate direction change entropy
    const directions = this.extractDirections(mouseData);
    const directionEntropy = this.shannonEntropy(directions);

    // Calculate pause entropy
    const pauses = this.extractPauses(mouseData);
    const pauseEntropy = this.shannonEntropy(pauses);

    return {
      value: entropy,
      directionEntropy,
      pauseEntropy,
      classification: this.classifyMouseEntropy(entropy, directionEntropy),
      details: {
        velocityDistribution: this.getDistributionStats(velocities),
        directionChanges: directions.length,
        pauseCount: pauses.filter(p => p > 0).length
      }
    };
  }

  /**
   * Extract velocities from mouse movement
   */
  extractVelocities(mouseData) {
    const velocities = [];
    const positions = mouseData.positions;

    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      const dt = positions[i].t - positions[i - 1].t;

      if (dt > 0) {
        const velocity = Math.sqrt(dx * dx + dy * dy) / dt;
        velocities.push(Math.min(velocity, 100)); // Cap at 100
      }
    }

    return velocities;
  }

  /**
   * Extract direction changes
   */
  extractDirections(mouseData) {
    const directions = [];
    const positions = mouseData.positions;

    for (let i = 2; i < positions.length; i++) {
      const dx1 = positions[i - 1].x - positions[i - 2].x;
      const dy1 = positions[i - 1].y - positions[i - 2].y;
      const dx2 = positions[i].x - positions[i - 1].x;
      const dy2 = positions[i].y - positions[i - 1].y;

      const angle1 = Math.atan2(dy1, dx1);
      const angle2 = Math.atan2(dy2, dx2);
      let change = Math.abs(angle2 - angle1);

      if (change > Math.PI) change = 2 * Math.PI - change;
      directions.push(change);
    }

    return directions;
  }

  /**
   * Extract pause patterns
   */
  extractPauses(mouseData) {
    const pauses = [];
    const positions = mouseData.positions;

    for (let i = 1; i < positions.length; i++) {
      const dt = positions[i].t - positions[i - 1].t;
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Pause if movement is minimal
      if (distance < 2) {
        pauses.push(dt);
      } else {
        pauses.push(0);
      }
    }

    return pauses;
  }

  /**
   * Shannon entropy calculation
   */
  shannonEntropy(data) {
    if (!data || data.length === 0) return 0;

    // Create histogram with bins
    const bins = 20;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const binWidth = range / bins;

    const histogram = new Array(bins).fill(0);
    for (const value of data) {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      histogram[binIndex]++;
    }

    // Calculate entropy
    const total = data.length;
    let entropy = 0;

    for (const count of histogram) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize to 0-4 scale
    return (entropy / Math.log2(bins)) * 4;
  }

  /**
   * Classify mouse entropy results
   */
  classifyMouseEntropy(velocityEntropy, directionEntropy) {
    if (velocityEntropy < 1.5 && directionEntropy < 1.5) {
      return 'bot_perfect'; // Too uniform, suspicious
    }
    if (velocityEntropy < 2.0) {
      return 'bot_likely';
    }
    if (velocityEntropy >= 2.5 && directionEntropy >= 2.5) {
      return 'human_high_confidence';
    }
    if (velocityEntropy >= 2.0) {
      return 'human_likely';
    }
    return 'uncertain';
  }

  /**
   * Detect anomalies in mouse behavior
   */
  detectMouseAnomalies(mouseData) {
    const anomalies = [];

    if (!mouseData || !mouseData.positions) return anomalies;

    const positions = mouseData.positions;

    // Check for perfect straight lines
    const straightness = this.calculateStraightness(positions);
    if (straightness > 0.95) {
      anomalies.push({
        type: 'perfect_straight_line',
        severity: 'high',
        confidence: 0.9,
        details: { straightness }
      });
    }

    // Check for uniform velocity
    const velocities = this.extractVelocities(mouseData);
    const velocityVariance = this.variance(velocities);
    if (velocityVariance < 0.1 && velocities.length > 20) {
      anomalies.push({
        type: 'uniform_velocity',
        severity: 'medium',
        confidence: 0.7,
        details: { variance: velocityVariance }
      });
    }

    // Check for instant response (too fast)
    const avgReactionTime = this.calculateReactionTime(positions);
    if (avgReactionTime < 50) {
      anomalies.push({
        type: 'instant_reaction',
        severity: 'medium',
        confidence: 0.6,
        details: { avgReactionTime }
      });
    }

    // Check for geometric patterns
    const hasGeometricPattern = this.detectGeometricPattern(positions);
    if (hasGeometricPattern) {
      anomalies.push({
        type: 'geometric_pattern',
        severity: 'high',
        confidence: 0.85,
        details: { pattern: hasGeometricPattern }
      });
    }

    return anomalies;
  }

  /**
   * Calculate path straightness
   */
  calculateStraightness(positions) {
    if (positions.length < 2) return 0;

    const start = positions[0];
    const end = positions[positions.length - 1];
    const directDistance = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );

    let pathDistance = 0;
    for (let i = 1; i < positions.length; i++) {
      pathDistance += Math.sqrt(
        Math.pow(positions[i].x - positions[i - 1].x, 2) +
        Math.pow(positions[i].y - positions[i - 1].y, 2)
      );
    }

    return directDistance / (pathDistance || 1);
  }

  /**
   * Calculate average reaction time
   */
  calculateReactionTime(positions) {
    if (positions.length < 2) return 0;

    let totalTime = 0;
    let count = 0;

    for (let i = 1; i < positions.length; i++) {
      const dx = Math.abs(positions[i].x - positions[i - 1].x);
      const dy = Math.abs(positions[i].y - positions[i - 1].y);

      // Only count significant movements
      if (dx > 5 || dy > 5) {
        totalTime += positions[i].t - positions[i - 1].t;
        count++;
      }
    }

    return count > 0 ? totalTime / count : 0;
  }

  /**
   * Detect geometric patterns
   */
  detectGeometricPattern(positions) {
    if (positions.length < 10) return null;

    // Check for circles
    if (this.isCircularPath(positions)) {
      return 'circle';
    }

    // Check for squares
    if (this.isSquarePath(positions)) {
      return 'square';
    }

    // Check for zigzag
    if (this.isZigzagPath(positions)) {
      return 'zigzag';
    }

    return null;
  }

  isCircularPath(positions) {
    // Simplified circle detection
    const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
    const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;

    const distances = positions.map(p =>
      Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2))
    );

    const variance = this.variance(distances);
    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;

    // Low variance relative to mean indicates circle
    return variance / (mean * mean) < 0.1;
  }

  isSquarePath(positions) {
    // Check for right angles
    let rightAngleCount = 0;

    for (let i = 2; i < positions.length; i++) {
      const dx1 = positions[i - 1].x - positions[i - 2].x;
      const dy1 = positions[i - 1].y - positions[i - 2].y;
      const dx2 = positions[i].x - positions[i - 1].x;
      const dy2 = positions[i].y - positions[i - 1].y;

      const dot = dx1 * dx2 + dy1 * dy2;
      const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (mag1 > 0 && mag2 > 0) {
        const cosAngle = dot / (mag1 * mag2);
        // Right angle if cos is close to 0
        if (Math.abs(cosAngle) < 0.2) {
          rightAngleCount++;
        }
      }
    }

    return rightAngleCount >= 3;
  }

  isZigzagPath(positions) {
    let directionChanges = 0;
    let lastDirection = null;

    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      const currentDirection = dx > 0 ? 'right' : 'left';

      if (lastDirection && currentDirection !== lastDirection) {
        directionChanges++;
      }
      lastDirection = currentDirection;
    }

    return directionChanges > positions.length * 0.3;
  }

  /**
   * Analyze keystroke dynamics
   */
  analyzeKeystrokeDynamics(keystrokes) {
    if (!keystrokes || keystrokes.length < 10) {
      return { value: 0, classification: 'insufficient_data' };
    }

    // Calculate timing statistics
    const timings = keystrokes.map(k => k.timing || 0).filter(t => t > 0);
    const entropy = this.shannonEntropy(timings);

    // Calculate digraph timings
    const digraphs = this.calculateDigraphTimings(keystrokes);
    const digraphEntropy = this.shannonEntropy(digraphs);

    return {
      value: entropy,
      digraphEntropy,
      classification: this.classifyKeystrokeEntropy(entropy),
      details: {
        avgTiming: timings.length > 0 ? timings.reduce((a, b) => a + b) / timings.length : 0,
        variance: this.variance(timings),
        digraphCount: digraphs.length
      }
    };
  }

  /**
   * Calculate digraph timings (time between consecutive key pairs)
   */
  calculateDigraphTimings(keystrokes) {
    const timings = [];

    for (let i = 1; i < keystrokes.length; i++) {
      // Time between different keys
      if (keystrokes[i].key !== keystrokes[i - 1].key) {
        const time = (keystrokes[i].timestamp || 0) - (keystrokes[i - 1].timestamp || 0);
        if (time > 0 && time < 5000) {
          timings.push(time);
        }
      }
    }

    return timings;
  }

  /**
   * Classify keystroke entropy
   */
  classifyKeystrokeEntropy(entropy) {
    if (entropy < 1.5) return 'bot_likely';
    if (entropy >= 2.5) return 'human_likely';
    return 'uncertain';
  }

  /**
   * Analyze click patterns
   */
  analyzeClickPatterns(clicks) {
    if (!clicks || clicks.length < 5) {
      return { value: 0, classification: 'insufficient_data' };
    }

    // Calculate click intervals
    const intervals = [];
    for (let i = 1; i < clicks.length; i++) {
      intervals.push(clicks[i].timestamp - clicks[i - 1].timestamp);
    }

    const entropy = this.shannonEntropy(intervals);
    const variance = this.variance(intervals);

    // Check for periodic clicking
    const isPeriodic = this.checkPeriodicPattern(intervals);

    return {
      value: entropy,
      variance,
      isPeriodic,
      classification: this.classifyClickPattern(entropy, variance, isPeriodic),
      details: {
        avgInterval: intervals.reduce((a, b) => a + b, 0) / intervals.length,
        clickCount: clicks.length
      }
    };
  }

  /**
   * Check for periodic clicking patterns
   */
  checkPeriodicPattern(intervals) {
    if (intervals.length < 5) return false;

    // Calculate coefficient of variation
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const cv = Math.sqrt(this.variance(intervals)) / mean;

    // Low CV indicates periodic clicking
    return cv < 0.1;
  }

  /**
   * Classify click pattern
   */
  classifyClickPattern(entropy, variance, isPeriodic) {
    if (isPeriodic) return 'bot_perfect';
    if (entropy < 1.5) return 'bot_likely';
    if (entropy >= 2.5) return 'human_likely';
    return 'uncertain';
  }

  /**
   * Analyze scroll patterns
   */
  analyzeScrollPatterns(scrolls) {
    if (!scrolls || scrolls.length < 10) {
      return { value: 0, classification: 'insufficient_data' };
    }

    // Calculate scroll velocities
    const velocities = [];
    for (let i = 1; i < scrolls.length; i++) {
      const dy = scrolls[i].delta - scrolls[i - 1].delta;
      const dt = scrolls[i].timestamp - scrolls[i - 1].timestamp;
      if (dt > 0) {
        velocities.push(Math.abs(dy / dt));
      }
    }

    const entropy = this.shannonEntropy(velocities);
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;

    return {
      value: entropy,
      avgVelocity,
      classification: this.classifyScrollPattern(entropy, avgVelocity),
      details: {
        velocityVariance: this.variance(velocities),
        scrollCount: scrolls.length
      }
    };
  }

  /**
   * Classify scroll pattern
   */
  classifyScrollPattern(entropy, avgVelocity) {
    if (avgVelocity > 10 && entropy < 1.5) return 'bot_likely';
    if (entropy >= 2.0) return 'human_likely';
    return 'uncertain';
  }

  /**
   * Analyze touch gestures
   */
  analyzeTouchGestures(touches) {
    if (!touches || touches.length < 5) {
      return { value: 0, classification: 'insufficient_data' };
    }

    // Analyze gesture complexity
    const complexities = touches.map(t => t.complexity || 0);
    const entropy = this.shannonEntropy(complexities);

    // Analyze gesture duration variance
    const durations = touches.map(t => t.duration || 0);
    const durationVariance = this.variance(durations);

    return {
      value: entropy,
      durationVariance,
      classification: this.classifyTouchGesture(entropy, durationVariance),
      details: {
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        touchCount: touches.length
      }
    };
  }

  /**
   * Classify touch gesture
   */
  classifyTouchGesture(entropy, durationVariance) {
    if (durationVariance < 100) return 'bot_likely';
    if (entropy >= 2.0) return 'human_likely';
    return 'uncertain';
  }

  /**
   * Analyze temporal patterns
   */
  analyzeTemporalPatterns(timestamps) {
    const anomalies = [];

    if (!timestamps || timestamps.length < 10) {
      return { anomalies, score: 0 };
    }

    // Sort timestamps
    const sorted = [...timestamps].sort((a, b) => a - b);

    // Check for uniform spacing
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i] - sorted[i - 1]);
    }

    const intervalVariance = this.variance(intervals);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Detect bot-like uniform intervals
    if (intervalVariance < 100 && avgInterval > 0) {
      anomalies.push({
        type: 'uniform_timing',
        severity: 'high',
        confidence: 0.85,
        details: { variance: intervalVariance, avgInterval }
      });
    }

    // Check for impossible speeds
    const maxInterval = Math.max(...intervals);
    if (maxInterval < 10) {
      anomalies.push({
        type: 'instant_actions',
        severity: 'medium',
        confidence: 0.7,
        details: { maxInterval }
      });
    }

    return {
      anomalies,
      score: this.shannonEntropy(intervals),
      details: { avgInterval, variance: intervalVariance }
    };
  }

  /**
   * Generate session fingerprint
   */
  generateSessionFingerprint(data) {
    const components = [];

    // Mouse characteristics
    if (data.behavior?.mouse) {
      const entropy = this.calculateMouseEntropy(data.behavior.mouse);
      components.push(`m${entropy.value.toFixed(2)}`);
    }

    // Keystroke characteristics
    if (data.behavior?.keystrokes) {
      const entropy = this.analyzeKeystrokeDynamics(data.behavior.keystrokes);
      components.push(`k${entropy.value.toFixed(2)}`);
    }

    // Click characteristics
    if (data.behavior?.clicks) {
      const entropy = this.analyzeClickPatterns(data.behavior.clicks);
      components.push(`c${entropy.value.toFixed(2)}`);
    }

    // Fingerprint hash
    const hash = crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 16);

    return {
      hash,
      components,
      version: '1'
    };
  }

  /**
   * Analyze correlations between signals
   */
  analyzeCorrelations(analysis) {
    const correlations = [];

    // Mouse-Click correlation
    if (analysis.entropy.mouse && analysis.entropy.click) {
      const mouseClickCorr = this.correlateSignals(
        analysis.entropy.mouse,
        analysis.entropy.click
      );
      correlations.push({
        signals: ['mouse', 'click'],
        correlation: mouseClickCorr,
        anomaly: mouseClickCorr > 0.9
      });
    }

    // Keystroke-Temporal correlation
    if (analysis.entropy.keystroke && analysis.temporal) {
      const keystrokeTemporalCorr = this.correlateSignals(
        analysis.entropy.keystroke,
        analysis.temporal.score
      );
      correlations.push({
        signals: ['keystroke', 'temporal'],
        correlation: keystrokeTemporalCorr,
        anomaly: keystrokeTemporalCorr > 0.9
      });
    }

    return correlations;
  }

  /**
   * Simple correlation between two signals
   */
  correlateSignals(signal1, signal2) {
    if (typeof signal1 === 'object') signal1 = signal1.value;
    if (typeof signal2 === 'object') signal2 = signal2.value;

    // Simplified correlation (in production, use Pearson)
    const diff = Math.abs(signal1 - signal2);
    return 1 - Math.min(diff / 4, 1);
  }

  /**
   * Calculate composite risk score
   */
  calculateCompositeRisk(analysis) {
    let score = 0;
    let weightSum = 0;

    // Anomaly weight
    const anomalyCount = analysis.anomalies.length;
    const anomalyRisk = Math.min(anomalyCount * 0.15, 0.6);
    score += anomalyRisk * this.config.anomalyWeight;
    weightSum += this.config.anomalyWeight;

    // Pattern classification weight
    let patternRisk = 0;
    let patternCount = 0;

    if (analysis.patterns.mouse) {
      if (analysis.patterns.mouse.includes('bot')) patternRisk += 0.3;
      patternCount++;
    }
    if (analysis.patterns.keystroke) {
      if (analysis.patterns.keystroke.includes('bot')) patternRisk += 0.3;
      patternCount++;
    }
    if (analysis.patterns.click) {
      if (analysis.patterns.click.includes('bot')) patternRisk += 0.3;
      patternCount++;
    }

    if (patternCount > 0) {
      score += (patternRisk / patternCount) * this.config.patternWeight;
      weightSum += this.config.patternWeight;
    }

    // Temporal weight
    if (analysis.temporal) {
      const temporalRisk = analysis.temporal.anomalies.length * 0.2;
      score += Math.min(temporalRisk, 0.5) * this.config.temporalWeight;
      weightSum += this.config.temporalWeight;
    }

    return Math.min(score / weightSum, 1);
  }

  /**
   * Calculate confidence in the analysis
   */
  calculateConfidence(analysis) {
    let confidence = 0;
    let factors = 0;

    // Based on data availability
    if (analysis.entropy.mouse) {
      confidence += 0.2;
      factors++;
    }
    if (analysis.entropy.keystroke) {
      confidence += 0.2;
      factors++;
    }
    if (analysis.entropy.click) {
      confidence += 0.2;
      factors++;
    }
    if (analysis.entropy.scroll) {
      confidence += 0.15;
      factors++;
    }
    if (analysis.temporal) {
      confidence += 0.15;
      factors++;
    }

    // Based on anomaly consistency
    if (analysis.anomalies.length > 0) {
      const avgConfidence = analysis.anomalies.reduce((sum, a) => sum + a.confidence, 0) / analysis.anomalies.length;
      confidence = confidence * 0.7 + avgConfidence * 0.3;
    }

    return Math.min(confidence, 1);
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.riskScore > 0.7) {
      recommendations.push({
        action: 'block',
        reason: 'High-risk behavior detected',
        confidence: analysis.confidence
      });
    } else if (analysis.riskScore > 0.4) {
      recommendations.push({
        action: 'challenge',
        challengeType: 'advanced',
        reason: 'Moderate risk, needs verification',
        confidence: analysis.confidence
      });
    } else if (analysis.riskScore > 0.2) {
      recommendations.push({
        action: 'monitor',
        reason: 'Low risk but some anomalies detected',
        confidence: analysis.confidence
      });
    } else {
      recommendations.push({
        action: 'allow',
        reason: 'Normal human behavior patterns',
        confidence: analysis.confidence
      });
    }

    // Specific recommendations based on anomalies
    for (const anomaly of analysis.anomalies) {
      if (anomaly.type === 'perfect_straight_line') {
        recommendations.push({
          action: 'increase_scrutiny',
          focus: 'mouse_behavior',
          reason: 'Unnatural mouse movement detected'
        });
      }
      if (anomaly.type === 'geometric_pattern') {
        recommendations.push({
          action: 'increase_scrutiny',
          focus: 'automation_tools',
          reason: 'Geometric mouse patterns suggest automation'
        });
      }
      if (anomaly.type === 'uniform_timing') {
        recommendations.push({
          action: 'increase_scrutiny',
          focus: 'temporal_patterns',
          reason: 'Uniform timing suggests scripted behavior'
        });
      }
    }

    return recommendations;
  }

  /**
   * Detect mouse movement pattern
   */
  detectMousePattern(mouseData) {
    const entropy = this.calculateMouseEntropy(mouseData);
    const straightness = this.calculateStraightness(mouseData.positions);

    if (entropy.classification === 'bot_perfect' || straightness > 0.95) {
      return 'bot_perfect';
    }
    if (entropy.classification === 'bot_likely') {
      return 'bot_likely';
    }
    if (entropy.classification === 'human_high_confidence') {
      return 'human_high_confidence';
    }
    return 'human_likely';
  }

  /**
   * Detect keystroke pattern
   */
  detectKeystrokePattern(keystrokes) {
    const analysis = this.analyzeKeystrokeDynamics(keystrokes);
    return analysis.classification;
  }

  /**
   * Detect click pattern
   */
  detectClickPattern(clicks) {
    const analysis = this.analyzeClickPatterns(clicks);
    return analysis.classification;
  }

  /**
   * Detect scroll pattern
   */
  detectScrollPattern(scrolls) {
    const analysis = this.analyzeScrollPatterns(scrolls);
    return analysis.classification;
  }

  /**
   * Detect touch pattern
   */
  detectTouchPattern(touches) {
    const analysis = this.analyzeTouchGestures(touches);
    return analysis.classification;
  }

  /**
   * Get distribution statistics
   */
  getDistributionStats(data) {
    if (!data || data.length === 0) {
      return { mean: 0, variance: 0, stdDev: 0, min: 0, max: 0 };
    }

    const sorted = [...data].sort((a, b) => a - b);
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = this.variance(data);

    return {
      mean,
      variance,
      stdDev: Math.sqrt(variance),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)]
    };
  }

  /**
   * Calculate variance
   */
  variance(data) {
    if (!data || data.length < 2) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const squaredDiffs = data.map(x => Math.pow(x - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / data.length;
  }

  /**
   * Get model version
   */
  getModelVersion() {
    return {
      version: '1.0.0',
      trained: '2024-01-01',
      features: [
        'mouse_entropy',
        'keystroke_dynamics',
        'click_patterns',
        'scroll_behavior',
        'touch_gestures',
        'temporal_analysis',
        'geometric_detection'
      ]
    };
  }
}
