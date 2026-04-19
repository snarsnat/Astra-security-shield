/**
 * Challenge Service - Server-side Challenge Generation and Verification
 *
 * Features:
 * 1. Cryptographically secure challenge generation
 * 2. Multiple challenge types (Pulse, Tilt, Flick, Breath, PoW)
 * 3. Challenge mutation system
 * 4. Difficulty adjustment
 * 5. Anti-replay protection
 */

import crypto from 'crypto';
import { nanoid } from 'nanoid';

// Shared signing secret — generated once at process start, or from env
const VERIFICATION_SECRET = process.env.CHALLENGE_SECRET || crypto.randomBytes(32).toString('hex');

export class ChallengeService {
  constructor(options = {}) {
    this.redis = options.redis || null;
    this.sessionService = options.sessionService || null;

    this.config = {
      challengeTTL: 300, // 5 minutes
      maxAttempts: 3,
      difficultyLevels: {
        easy:    { entropy: 16, timeLimit: 30 },
        medium:  { entropy: 24, timeLimit: 20 },
        hard:    { entropy: 32, timeLimit: 15 },
        extreme: { entropy: 48, timeLimit: 10 },
      },
      proofOfWork: {
        enabled: true,
        defaultDifficulty: 20,
        maxDifficulty: 26,
      },
      // Minimum ms a human needs to complete each challenge type (anti-instant-solve)
      minHumanTime: {
        pulse:         1500,
        tilt:          1000,
        flick:          500,
        breath:        4000,
        proof_of_work:  200,
      },
    };

    // In-memory challenge store (used when Redis unavailable)
    // Map: challengeId -> { challenge, expiresAt }
    this._memStore = new Map();

    // Cleanup expired in-memory challenges every minute
    setInterval(() => this._cleanupMemStore(), 60_000);

    // Challenge patterns
    this.patterns = {
      pulse: {
        easy:    { length: 3,  maxDuration: 500, tolerance: 100 },
        medium:  { length: 5,  maxDuration: 400, tolerance: 75 },
        hard:    { length: 7,  maxDuration: 300, tolerance: 50 },
        extreme: { length: 10, maxDuration: 250, tolerance: 40 },
      },
      tilt: {
        easy:    { angleRange: 45, tolerance: 15, axis: 'gamma' },
        medium:  { angleRange: 30, tolerance: 10, axis: 'gamma' },
        hard:    { angleRange: 20, tolerance: 7,  axis: 'both'  },
        extreme: { angleRange: 15, tolerance: 5,  axis: 'both'  },
      },
      flick: {
        easy:    { minVelocity: 0.5, directions: ['left', 'right', 'up', 'down'] },
        medium:  { minVelocity: 0.8, directions: ['left', 'right', 'up', 'down', 'up-left', 'up-right'] },
        hard:    { minVelocity: 1.0, directions: ['left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right'] },
        extreme: { minVelocity: 1.5, directions: ['any'] },
      },
      breath: {
        easy:    { cycleDuration: 4000, tolerance: 1000, cycles: 2 },
        medium:  { cycleDuration: 4000, tolerance: 750,  cycles: 3 },
        hard:    { cycleDuration: 4000, tolerance: 500,  cycles: 4 },
        extreme: { cycleDuration: 4000, tolerance: 300,  cycles: 5 },
      },
    };

    this.recentChallenges = new Set();
    this.challengeHistory  = new Map();
  }

  /**
   * Generate a new challenge
   */
  async generateChallenge(type, options = {}) {
    const sessionId = options.sessionId;
    const difficulty = options.difficulty || 'medium';
    const seed = options.seed || Date.now();

    const challengeId = this.generateChallengeId();

    // Generate challenge-specific data
    let challengeData;
    switch (type) {
      case 'pulse':
        challengeData = this.generatePulseChallenge(difficulty, seed);
        break;
      case 'tilt':
        challengeData = this.generateTiltChallenge(difficulty, seed);
        break;
      case 'flick':
        challengeData = this.generateFlickChallenge(difficulty, seed);
        break;
      case 'breath':
        challengeData = this.generateBreathChallenge(difficulty, seed);
        break;
      case 'proof_of_work':
        challengeData = this.generatePoWChallenge(options.difficultyLevel || this.config.proofOfWork.defaultDifficulty);
        break;
      default:
        throw new Error(`Unknown challenge type: ${type}`);
    }

    const now = Date.now();
    const challenge = {
      id: challengeId,
      type,
      difficulty,
      created: now,
      expires: now + this.config.challengeTTL * 1000,
      attempts: 0,
      solved: false,
      data: challengeData,
      sessionId,
      metadata: {
        userAgent: options.userAgent,
        ip: options.ip,
        requiredEntropy: this.getRequiredEntropy(type, difficulty),
      },
    };

    // Store challenge
    await this.storeChallenge(challengeId, challenge);

    // Add to session if available
    if (sessionId && this.sessionService) {
      await this.sessionService.storeChallengeAttempt(sessionId, {
        type,
        difficulty,
        challengeId,
      });
    }

    // Add to replay protection
    this.addToReplayProtection(challengeId);

    return this.formatChallengeForClient(challenge);
  }

  /**
   * Generate pulse challenge
   */
  generatePulseChallenge(difficulty, seed) {
    const pattern = this.patterns.pulse[difficulty];
    const random = this.createSeededRandom(seed);

    // Generate timing pattern
    const timings = [];
    let currentTime = 0;

    for (let i = 0; i < pattern.length; i++) {
      // Random pulse timing within range
      const pulseTiming = 100 + random() * (pattern.maxDuration - 100);
      timings.push(Math.round(pulseTiming));
      currentTime += pulseTiming;
    }

    // Calculate target duration
    const targetDuration = timings.reduce((a, b) => a + b, 0);

    return {
      type: 'pulse',
      targetPattern: timings,
      targetDuration,
      tolerance: pattern.tolerance,
      length: pattern.length,
      instructions: 'Follow the pulse rhythm',
    };
  }

  /**
   * Generate tilt challenge
   */
  generateTiltChallenge(difficulty, seed) {
    const pattern = this.patterns.tilt[difficulty];
    const random = this.createSeededRandom(seed);

    // Generate target angle
    const minAngle = -pattern.angleRange;
    const maxAngle = pattern.angleRange;
    const targetAngle = Math.round(minAngle + random() * (maxAngle - minAngle));

    // Determine axis
    let axis = pattern.axis;
    if (axis === 'both') {
      axis = random() > 0.5 ? 'beta' : 'gamma';
    }

    return {
      type: 'tilt',
      targetAngle,
      axis,
      tolerance: pattern.tolerance,
      angleRange: pattern.angleRange,
      instructions: `Tilt your device ${targetAngle > 0 ? 'right' : 'left'} by ${Math.abs(targetAngle)}°`,
    };
  }

  /**
   * Generate flick challenge
   */
  generateFlickChallenge(difficulty, seed) {
    const pattern = this.patterns.flick[difficulty];
    const random = this.createSeededRandom(seed);

    // Select direction
    const direction = pattern.directions[Math.floor(random() * pattern.directions.length)];

    // Generate required velocity
    const velocity = pattern.minVelocity + random() * 0.5;

    // Calculate angle for diagonal directions
    let angle = 0;
    switch (direction) {
      case 'right': angle = 0; break;
      case 'down': angle = 90; break;
      case 'left': angle = 180; break;
      case 'up': angle = 270; break;
      case 'up-right': angle = 315; break;
      case 'up-left': angle = 225; break;
      case 'down-right': angle = 45; break;
      case 'down-left': angle = 135; break;
      default: angle = 0;
    }

    return {
      type: 'flick',
      direction,
      targetAngle: angle,
      minVelocity: velocity,
      tolerance: 30, // 30 degree tolerance
      instructions: `Flick ${direction.replace('-', ' ')}`,
    };
  }

  /**
   * Generate breath challenge
   */
  generateBreathChallenge(difficulty, seed) {
    const pattern = this.patterns.breath[difficulty];
    const random = this.createSeededRandom(seed);

    // Generate rhythm pattern
    const rhythm = [];
    for (let i = 0; i < pattern.cycles; i++) {
      // Inhale/exhale timing (standard breath is ~4 seconds)
      const inhale = Math.round(pattern.cycleDuration / 2 + (random() - 0.5) * pattern.tolerance);
      const exhale = Math.round(pattern.cycleDuration / 2 + (random() - 0.5) * pattern.tolerance);
      rhythm.push({ inhale, exhale });
    }

    return {
      type: 'breath',
      rhythm,
      cycleDuration: pattern.cycleDuration,
      tolerance: pattern.tolerance,
      cycles: pattern.cycles,
      instructions: 'Breathe in sync with the pattern',
    };
  }

  /**
   * Generate Proof of Work challenge
   */
  generatePoWChallenge(difficulty) {
    // Generate random prefix
    const prefix = nanoid(16);

    // Calculate required leading zeros
    const requiredZeros = Math.ceil(difficulty / 4);

    return {
      type: 'proof_of_work',
      prefix,
      difficulty,
      requiredZeros,
      algorithm: 'sha256',
      instructions: 'Computing...',
    };
  }

  /**
   * Verify challenge solution
   */
  async verifyChallenge(challengeId, solution, options = {}) {
    // Get challenge
    const challenge = await this.getChallenge(challengeId);

    if (!challenge) {
      return {
        success: false,
        reason: 'challenge_not_found',
      };
    }

    // Check expiration
    if (Date.now() > challenge.expires) {
      return {
        success: false,
        reason: 'challenge_expired',
      };
    }

    // Check if already solved
    if (challenge.solved) {
      return {
        success: false,
        reason: 'challenge_already_solved',
      };
    }

    // Check attempt limit
    if (challenge.attempts >= this.config.maxAttempts) {
      return {
        success: false,
        reason: 'too_many_attempts',
        attemptsRemaining: 0,
      };
    }

    // Increment attempts first (prevents brute-force even on timing rejection)
    challenge.attempts++;
    await this.storeChallenge(challengeId, challenge);

    // Timing guard — reject suspiciously fast solutions
    const elapsed = Date.now() - challenge.created;
    const minTime = this.config.minHumanTime[challenge.type] || 500;
    if (elapsed < minTime) {
      return {
        success: false,
        reason: 'solved_too_fast',
        attemptsRemaining: this.config.maxAttempts - challenge.attempts,
      };
    }

    // Verify solution
    const verification = this.verifySolution(challenge, solution, options);

    if (verification.success) {
      // Mark as solved
      challenge.solved = true;
      challenge.solvedAt = Date.now();
      challenge.solution = solution;
      await this.storeChallenge(challengeId, challenge);

      // Add to history
      this.addToHistory(challengeId, challenge);

      return {
        success: true,
        verificationToken: this.generateVerificationToken(challengeId),
        verificationLevel: this.calculateVerificationLevel(challenge),
        metadata: {
          difficulty: challenge.difficulty,
          type: challenge.type,
          attempts: challenge.attempts,
        },
      };
    }

    return {
      success: false,
      reason: verification.reason || 'invalid_solution',
      attemptsRemaining: this.config.maxAttempts - challenge.attempts,
      hint: verification.hint,
    };
  }

  /**
   * Verify pulse solution
   */
  verifyPulseSolution(challenge, solution) {
    const { targetPattern, tolerance } = challenge.data;
    const { pattern } = solution || {};

    if (!pattern || !Array.isArray(pattern)) {
      return { success: false, reason: 'invalid_solution_format' };
    }

    if (pattern.length !== targetPattern.length) {
      return { success: false, reason: 'pattern_length_mismatch' };
    }

    // Calculate differences
    let totalDifference = 0;
    const differences = [];

    for (let i = 0; i < targetPattern.length; i++) {
      const diff = Math.abs(targetPattern[i] - (pattern[i] || 0));
      differences.push(diff);
      totalDifference += diff;
    }

    const avgDifference = totalDifference / targetPattern.length;

    if (avgDifference <= tolerance) {
      return { success: true };
    }

    // Provide hint based on closest pulses
    const closestIndex = differences.indexOf(Math.min(...differences));
    return {
      success: false,
      reason: 'pattern_mismatch',
      hint: closestIndex < targetPattern.length - 1
        ? `Focus on pulse ${closestIndex + 2} onwards`
        : 'Try to match the rhythm more closely',
    };
  }

  /**
   * Verify tilt solution
   */
  verifyTiltSolution(challenge, solution) {
    const { targetAngle, tolerance, axis } = challenge.data;
    const { angle, detectedAxis } = solution || {};

    if (angle === undefined || angle === null) {
      return { success: false, reason: 'invalid_solution_format' };
    }

    // Check axis if required
    if (axis === 'both' && detectedAxis && detectedAxis !== axis) {
      return {
        success: false,
        reason: 'wrong_axis',
        hint: `Try tilting on the ${axis} axis instead`,
      };
    }

    const angleDiff = Math.abs(targetAngle - angle);

    if (angleDiff <= tolerance) {
      return { success: true };
    }

    return {
      success: false,
      reason: 'angle_mismatch',
      hint: angleDiff > tolerance * 2
        ? `Tilt more ${angle > targetAngle ? 'less' : 'more'}`
        : 'Almost there, adjust slightly',
    };
  }

  /**
   * Verify flick solution
   */
  verifyFlickSolution(challenge, solution) {
    const { direction, minVelocity, tolerance } = challenge.data;
    const { flickDirection, velocity, angle } = solution || {};

    if (!flickDirection) {
      return { success: false, reason: 'invalid_solution_format' };
    }

    // Check direction
    if (direction !== 'any' && flickDirection !== direction) {
      return {
        success: false,
        reason: 'wrong_direction',
        hint: `Flick ${direction.replace('-', ' ')} instead`,
      };
    }

    // Check velocity
    if (velocity && velocity < minVelocity) {
      return {
        success: false,
        reason: 'insufficient_velocity',
        hint: 'Flick faster',
      };
    }

    // Check angle for diagonal directions
    if (direction !== 'any' && direction.includes('-') && angle !== undefined) {
      const targetAngle = this.getAngleForDirection(direction);
      const angleDiff = Math.abs(targetAngle - angle);

      if (angleDiff > tolerance) {
        return {
          success: false,
          reason: 'wrong_angle',
          hint: 'Try a more diagonal direction',
        };
      }
    }

    return { success: true };
  }

  /**
   * Verify breath solution
   */
  verifyBreathSolution(challenge, solution) {
    const { rhythm, tolerance } = challenge.data;
    const { breathRhythm } = solution || {};

    if (!breathRhythm || !Array.isArray(breathRhythm)) {
      return { success: false, reason: 'invalid_solution_format' };
    }

    if (breathRhythm.length !== rhythm.length) {
      return {
        success: false,
        reason: 'cycle_count_mismatch',
        hint: `Complete ${rhythm.length} breath cycles`,
      };
    }

    // Compare each cycle
    let cycleErrors = 0;
    for (let i = 0; i < rhythm.length; i++) {
      const targetInhale = rhythm[i].inhale;
      const targetExhale = rhythm[i].exhale;
      const provided = breathRhythm[i];

      if (!provided) {
        cycleErrors++;
        continue;
      }

      const inhaleDiff = Math.abs(targetInhale - (provided.inhale || 0));
      const exhaleDiff = Math.abs(targetExhale - (provided.exhale || 0));

      if (inhaleDiff > tolerance * 2 || exhaleDiff > tolerance * 2) {
        cycleErrors++;
      }
    }

    if (cycleErrors <= Math.ceil(rhythm.length * 0.2)) {
      return { success: true };
    }

    return {
      success: false,
      reason: 'rhythm_mismatch',
      hint: 'Try to match the breathing pattern more closely',
    };
  }

  /**
   * Verify Proof of Work solution
   */
  verifyPoWSolution(challenge, solution) {
    const { prefix, requiredZeros } = challenge.data;
    const { nonce } = solution || {};

    if (!nonce) {
      return { success: false, reason: 'invalid_solution_format' };
    }

    // Verify hash
    const hash = crypto
      .createHash('sha256')
      .update(`${prefix}${nonce}`)
      .digest('hex');

    const leadingZeros = hash.match(/^0*/)?.[0].length || 0;

    if (leadingZeros >= requiredZeros) {
      return {
        success: true,
        hash,
        computationTime: solution.computationTime,
      };
    }

    return {
      success: false,
      reason: 'invalid_proof',
      hint: `Need ${requiredZeros} leading zeros, got ${leadingZeros}`,
    };
  }

  /**
   * Verify solution based on type
   */
  verifySolution(challenge, solution, options = {}) {
    switch (challenge.type) {
      case 'pulse':
        return this.verifyPulseSolution(challenge, solution);
      case 'tilt':
        return this.verifyTiltSolution(challenge, solution);
      case 'flick':
        return this.verifyFlickSolution(challenge, solution);
      case 'breath':
        return this.verifyBreathSolution(challenge, solution);
      case 'proof_of_work':
        return this.verifyPoWSolution(challenge, solution);
      default:
        return { success: false, reason: 'unknown_challenge_type' };
    }
  }

  /**
   * Get required entropy for challenge type
   */
  getRequiredEntropy(type, difficulty) {
    const entropyMap = {
      pulse: { easy: 16, medium: 24, hard: 32, extreme: 48 },
      tilt: { easy: 8, medium: 12, hard: 16, extreme: 24 },
      flick: { easy: 4, medium: 6, hard: 8, extreme: 12 },
      breath: { easy: 20, medium: 28, hard: 36, extreme: 48 },
      proof_of_work: { easy: 20, medium: 24, hard: 32, extreme: 48 },
    };

    return entropyMap[type]?.[difficulty] || 16;
  }

  /**
   * Calculate verification level based on challenge
   */
  calculateVerificationLevel(challenge) {
    const difficultyScores = {
      easy: 1,
      medium: 2,
      hard: 3,
      extreme: 4,
    };

    const typeScores = {
      pulse: 1,
      flick: 1,
      tilt: 1.5,
      breath: 2,
      proof_of_work: 3,
    };

    const baseScore = difficultyScores[challenge.difficulty] || 1;
    const typeMultiplier = typeScores[challenge.type] || 1;

    return Math.min(Math.round(baseScore * typeMultiplier), 10);
  }

  /**
   * Get available challenge types based on device capabilities
   */
  getAvailableChallenges(deviceInfo = {}) {
    const challenges = [];

    // Pulse challenge (requires vibration API)
    if (deviceInfo.hasVibration || deviceInfo.isMobile) {
      challenges.push({
        type: 'pulse',
        score: 0.3,
        accessibility: 'high',
      });
    }

    // Tilt challenge (requires DeviceOrientation API)
    if (deviceInfo.hasOrientation) {
      challenges.push({
        type: 'tilt',
        score: 0.4,
        accessibility: 'medium',
      });
    }

    // Flick challenge (requires touch)
    if (deviceInfo.hasTouch) {
      challenges.push({
        type: 'flick',
        score: 0.3,
        accessibility: 'high',
      });
    }

    // Breath challenge (always available)
    challenges.push({
      type: 'breath',
      score: 0.5,
      accessibility: 'very_high',
    });

    // PoW challenge (always available, CPU intensive)
    challenges.push({
      type: 'proof_of_work',
      score: 0.6,
      accessibility: 'high',
    });

    return challenges;
  }

  /**
   * Select optimal challenge based on risk and device
   */
  async selectOptimalChallenge(riskLevel, deviceInfo = {}, options = {}) {
    const available = this.getAvailableChallenges(deviceInfo);

    // Filter by accessibility requirements
    let filtered = available;
    if (options.accessibilityLevel === 'high') {
      filtered = available.filter(c => c.accessibility === 'high' || c.accessibility === 'very_high');
    }

    // Select based on risk level
    let difficulty;
    if (riskLevel < 0.3) {
      difficulty = 'easy';
    } else if (riskLevel < 0.5) {
      difficulty = 'medium';
    } else if (riskLevel < 0.7) {
      difficulty = 'hard';
    } else {
      difficulty = 'extreme';
    }

    // Select highest scoring available challenge
    const selected = filtered.sort((a, b) => b.score - a.score)[0];

    // Generate the challenge
    return this.generateChallenge(selected.type, {
      difficulty,
      sessionId: options.sessionId,
      ...options,
    });
  }

  /**
   * Generate challenge ID
   */
  generateChallengeId() {
    return `chl_${nanoid(16)}`;
  }

  /**
   * Generate verification token
   */
  generateVerificationToken(challengeId) {
    const payload = `${challengeId}:${Date.now()}`;
    const signature = crypto
      .createHmac('sha256', VERIFICATION_SECRET)
      .update(payload)
      .digest('base64url');
    return `vft_${payload.replace(/:/g, '')}.${signature}`;
  }

  /**
   * Format challenge for client
   */
  formatChallengeForClient(challenge) {
    // Never send the solution to the client — only send what the UI needs to render
    const clientData = {};

    switch (challenge.type) {
      case 'pulse':
        // Send length and timing constraints only — NOT the targetPattern
        clientData.type       = 'pulse';
        clientData.length     = challenge.data.length;
        clientData.maxDuration = challenge.data.targetDuration;
        clientData.instructions = challenge.data.instructions;
        break;

      case 'tilt':
        // Send axis and range — NOT the exact targetAngle
        clientData.type         = 'tilt';
        clientData.axis         = challenge.data.axis;
        clientData.angleRange   = challenge.data.angleRange;
        clientData.instructions = challenge.data.instructions;
        break;

      case 'flick':
        // Send direction and velocity requirement — safe to expose
        clientData.type         = 'flick';
        clientData.direction    = challenge.data.direction;
        clientData.minVelocity  = challenge.data.minVelocity;
        clientData.instructions = challenge.data.instructions;
        break;

      case 'breath':
        // Send cycle count and duration — NOT the exact rhythm timings
        clientData.type         = 'breath';
        clientData.cycles       = challenge.data.cycles;
        clientData.cycleDuration = challenge.data.cycleDuration;
        clientData.instructions = challenge.data.instructions;
        break;

      case 'proof_of_work':
        // PoW: prefix + difficulty are meant to be public
        clientData.type       = 'proof_of_work';
        clientData.prefix     = challenge.data.prefix;
        clientData.difficulty = challenge.data.difficulty;
        clientData.algorithm  = challenge.data.algorithm;
        clientData.instructions = challenge.data.instructions;
        break;

      default:
        clientData.type = challenge.type;
        clientData.instructions = challenge.data?.instructions || '';
    }

    return {
      id:        challenge.id,
      type:      challenge.type,
      difficulty: challenge.difficulty,
      expiresIn: Math.ceil((challenge.expires - Date.now()) / 1000),
      data:      clientData,
    };
  }

  /**
   * Store challenge (Redis first, in-memory fallback)
   */
  async storeChallenge(challengeId, challenge) {
    if (this.redis) {
      const ttl = Math.ceil((challenge.expires - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redis.setex(`challenge:${challengeId}`, ttl, JSON.stringify(challenge));
      }
      return;
    }
    // In-memory fallback
    this._memStore.set(challengeId, { challenge, expiresAt: challenge.expires });
  }

  /**
   * Get challenge (Redis first, in-memory fallback)
   */
  async getChallenge(challengeId) {
    if (!challengeId) return null;

    if (this.redis) {
      const data = await this.redis.get(`challenge:${challengeId}`);
      return data ? JSON.parse(data) : null;
    }

    // In-memory fallback
    const entry = this._memStore.get(challengeId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._memStore.delete(challengeId);
      return null;
    }
    return entry.challenge;
  }

  /**
   * Cleanup expired in-memory challenges
   */
  _cleanupMemStore() {
    const now = Date.now();
    for (const [id, entry] of this._memStore) {
      if (entry.expiresAt < now) this._memStore.delete(id);
    }
  }

  /**
   * Add to replay protection
   */
  addToReplayProtection(challengeId) {
    this.recentChallenges.add(challengeId);

    // Cleanup old entries
    if (this.recentChallenges.size > 1000) {
      const toDelete = Array.from(this.recentChallenges).slice(0, 500);
      toDelete.forEach(id => this.recentChallenges.delete(id));
    }
  }

  /**
   * Check if challenge is in replay protection
   */
  isInReplayProtection(challengeId) {
    return this.recentChallenges.has(challengeId);
  }

  /**
   * Add to history
   */
  addToHistory(challengeId, challenge) {
    this.challengeHistory.set(challengeId, {
      ...challenge,
      verified: Date.now(),
    });

    // Cleanup old history
    if (this.challengeHistory.size > 10000) {
      const entries = Array.from(this.challengeHistory.entries());
      entries.slice(0, 5000).forEach(([id]) => this.challengeHistory.delete(id));
    }
  }

  /**
   * Get challenge history for session
   */
  getChallengeHistory(sessionId, limit = 100) {
    const history = [];
    for (const [id, challenge] of this.challengeHistory) {
      if (challenge.sessionId === sessionId) {
        history.push(challenge);
      }
    }
    return history.slice(-limit);
  }

  /**
   * Create seeded random function
   */
  createSeededRandom(seed) {
    let currentSeed = seed;
    return function() {
      currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
      return currentSeed / 0x7fffffff;
    };
  }

  /**
   * Get angle for direction
   */
  getAngleForDirection(direction) {
    const angles = {
      'right': 0,
      'down': 90,
      'left': 180,
      'up': 270,
      'up-right': 315,
      'up-left': 225,
      'down-right': 45,
      'down-left': 135,
    };
    return angles[direction] || 0;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      recentChallenges: this.recentChallenges.size,
      historySize: this.challengeHistory.size,
      patterns: Object.keys(this.patterns),
    };
  }
}
