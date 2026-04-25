/**
 * Session Service - Server-side Session Management
 *
 * Features:
 * 1. Session creation and validation
 * 2. Token management with refresh tokens
 * 3. Session fingerprinting
 * 4. Rate limiting per session
 * 5. Session analytics
 */

import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const ASTRA_DIR = join(homedir(), '.astra');
const ANALYTICS_FILE = join(ASTRA_DIR, 'shield-analytics.json');

export class SessionService {
  constructor(options = {}) {
    this.redis = options.redis || null;
    this.config = {
      sessionTTL: 3600, // 1 hour
      refreshTokenTTL: 86400 * 7, // 7 days
      maxSessionsPerUser: 5,
      maxTokensPerSession: 10,
      challengeExpiry: 300, // 5 minutes
      verificationExpiry: 600, // 10 minutes
    };

    // In-memory fallback
    this.sessions = new Map();
    this.tokens = new Map();

    // Analytics — global and per-app
    this.analytics = {
      totalSessions: 0,
      activeSessions: 0,
      failedVerifications: 0,
      successfulVerifications: 0,
    };
    this.appAnalytics = {}; // { appName: { sessions, verifications, blocks, ... } }

    // Load persisted analytics from disk
    this._loadFromDisk();
  }

  /**
   * Persist analytics to disk
   */
  _saveToDisk() {
    try {
      if (!existsSync(ASTRA_DIR)) mkdirSync(ASTRA_DIR, { recursive: true });
      const data = {
        analytics: this.analytics,
        appAnalytics: this.appAnalytics,
        savedAt: Date.now(),
      };
      writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SessionService] Failed to save analytics:', e.message);
    }
  }

  /**
   * Load analytics from disk
   */
  _loadFromDisk() {
    try {
      if (!existsSync(ANALYTICS_FILE)) return;
      const raw = readFileSync(ANALYTICS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.analytics) Object.assign(this.analytics, data.analytics);
      if (data.appAnalytics) this.appAnalytics = data.appAnalytics;
    } catch (e) {
      console.error('[SessionService] Failed to load analytics:', e.message);
    }
  }

  /**
   * Track analytics for a specific app
   */
  _trackApp(appName, event) {
    if (!appName) return;
    if (!this.appAnalytics[appName]) {
      this.appAnalytics[appName] = {
        totalSessions: 0,
        activeSessions: 0,
        successfulVerifications: 0,
        failedVerifications: 0,
        blockedRequests: 0,
        challengesIssued: 0,
        challengesPassed: 0,
        lastActivity: Date.now(),
        riskScores: [],
      };
    }
    const app = this.appAnalytics[appName];
    app.lastActivity = Date.now();

    switch (event) {
      case 'session_created':
        app.totalSessions++;
        app.activeSessions++;
        break;
      case 'session_closed':
        app.activeSessions = Math.max(0, app.activeSessions - 1);
        break;
      case 'verification_success':
        app.successfulVerifications++;
        break;
      case 'verification_failed':
        app.failedVerifications++;
        break;
      case 'blocked':
        app.blockedRequests++;
        break;
      case 'challenge_issued':
        app.challengesIssued++;
        break;
      case 'challenge_passed':
        app.challengesPassed++;
        break;
    }
    this._saveToDisk();
  }

  /**
   * Create a new session
   */
  async createSession(clientData = {}, options = {}) {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session = {
      id: sessionId,
      created: now,
      lastActive: now,
      expires: now + (options.ttl || this.config.sessionTTL) * 1000,
      fingerprint: this.generateSessionFingerprint(clientData),
      metadata: {
        ip: clientData.ip || null,
        userAgent: clientData.userAgent || null,
        country: clientData.country || null,
        deviceType: clientData.deviceType || 'unknown',
        browser: clientData.browser || null,
        os: clientData.os || null,
      },
      state: {
        verificationLevel: 0,
        isVerified: false,
        challengeAttempts: 0,
        lastChallenge: null,
        riskScore: 0,
        trustScore: 1.0,
      },
      tokens: [],
      actions: [],
      metrics: {
        requestCount: 0,
        challengeCount: 0,
        challengeSuccesses: 0,
        avgResponseTime: 0,
      },
      context: {},
    };

    // Store session
    await this.storeSession(sessionId, session);

    // Update analytics
    this.analytics.totalSessions++;
    this.analytics.activeSessions++;
    this._trackApp(options.appName, 'session_created');
    this._saveToDisk();

    return {
      sessionId,
      expires: session.expires,
      fingerprint: session.fingerprint,
    };
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    if (!sessionId) return null;

    const session = await this.getStoredSession(sessionId);
    if (!session) return null;

    // Check if expired
    if (Date.now() > session.expires) {
      await this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update session
   */
  async updateSession(sessionId, updates) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    // Prevent prototype pollution by filtering forbidden keys
    const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
    const safeUpdates = {};
    if (updates && typeof updates === 'object') {
      for (const [k, v] of Object.entries(updates)) {
        if (!FORBIDDEN.has(k)) safeUpdates[k] = v;
      }
    }
    Object.assign(session, safeUpdates, {
      lastActive: Date.now(),
    });

    await this.storeSession(sessionId, session);
    return session;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (session) {
      this.analytics.activeSessions--;
    }

    if (this.redis) {
      await this.redis.del(`session:${sessionId}`);
    } else {
      this.sessions.delete(sessionId);
    }

    // Also delete associated tokens
    if (this.tokens.has(sessionId)) {
      const tokens = this.tokens.get(sessionId);
      for (const token of tokens) {
        if (this.redis) {
          await this.redis.del(`token:${token}`);
        }
      }
      this.tokens.delete(sessionId);
    }

    return true;
  }

  /**
   * Create access token
   */
  async createToken(sessionId, options = {}) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const tokenId = nanoid(32);
    const accessToken = this.generateToken('access', options);
    const refreshToken = this.generateToken('refresh');

    const now = Date.now();
    const token = {
      id: tokenId,
      sessionId,
      accessToken,
      refreshToken,
      created: now,
      expires: now + (options.ttl || this.config.sessionTTL) * 1000,
      refreshExpires: now + this.config.refreshTokenTTL * 1000,
      lastUsed: now,
      useCount: 0,
      metadata: {
        ip: options.ip || null,
        userAgent: options.userAgent || null,
      },
      scope: options.scope || ['verify'],
    };

    // Store token
    await this.storeToken(tokenId, token);

    // Add to session tokens
    session.tokens.push(tokenId);
    if (session.tokens.length > this.config.maxTokensPerSession) {
      // Remove oldest token
      const oldestTokenId = session.tokens.shift();
      await this.deleteToken(oldestTokenId);
    }
    await this.updateSession(sessionId, { tokens: session.tokens });

    // Track in memory
    if (!this.tokens.has(sessionId)) {
      this.tokens.set(sessionId, []);
    }
    this.tokens.get(sessionId).push(tokenId);

    return {
      tokenId,
      accessToken,
      refreshToken,
      expires: token.expires,
      scope: token.scope,
    };
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken) {
    if (!accessToken) return null;

    const tokenId = await this.getTokenIdByAccess(accessToken);
    if (!tokenId) return null;

    const token = await this.getStoredToken(tokenId);
    if (!token) return null;

    // Check expiration
    if (Date.now() > token.expires) {
      await this.deleteToken(tokenId);
      return null;
    }

    // Update usage
    token.lastUsed = Date.now();
    token.useCount++;
    await this.storeToken(tokenId, token);

    // Get associated session
    const session = await this.getSession(token.sessionId);
    if (!session) {
      await this.deleteToken(tokenId);
      return null;
    }

    return {
      token: token,
      session: session,
      scope: token.scope,
    };
  }

  /**
   * Refresh token
   */
  async refreshTokens(refreshToken, options = {}) {
    if (!refreshToken) return null;

    const tokenId = await this.getTokenIdByRefresh(refreshToken);
    if (!tokenId) return null;

    const oldToken = await this.getStoredToken(tokenId);
    if (!oldToken) return null;

    // Check refresh token expiration
    if (Date.now() > oldToken.refreshExpires) {
      await this.deleteToken(tokenId);
      return null;
    }

    // Generate new tokens
    const newAccessToken = this.generateToken('access', options);
    const newRefreshToken = this.generateToken('refresh');

    const now = Date.now();
    const newToken = {
      ...oldToken,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      created: now,
      expires: now + (options.ttl || this.config.sessionTTL) * 1000,
      refreshExpires: now + this.config.refreshTokenTTL * 1000,
      lastUsed: now,
      useCount: 0,
    };

    // Store new token and delete old
    await this.storeToken(tokenId, newToken);

    // Update session
    await this.updateSession(oldToken.sessionId, {
      lastActive: Date.now(),
    });

    return {
      tokenId,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expires: newToken.expires,
      scope: newToken.scope,
    };
  }

  /**
   * Delete token
   */
  async deleteToken(tokenId) {
    const token = await this.getStoredToken(tokenId);
    if (token && this.tokens.has(token.sessionId)) {
      const sessionTokens = this.tokens.get(token.sessionId);
      const index = sessionTokens.indexOf(tokenId);
      if (index > -1) {
        sessionTokens.splice(index, 1);
      }
    }

    if (this.redis) {
      await this.redis.del(`token:${tokenId}`);
    } else {
      this.tokens.delete(tokenId);
    }

    return true;
  }

  /**
   * Revoke all tokens for session
   */
  async revokeSessionTokens(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return true;

    for (const tokenId of session.tokens) {
      await this.deleteToken(tokenId);
    }

    await this.updateSession(sessionId, { tokens: [] });
    return true;
  }

  /**
   * Store challenge attempt
   */
  async storeChallengeAttempt(sessionId, attempt) {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const challenge = {
      id: nanoid(16),
      sessionId,
      created: Date.now(),
      expires: Date.now() + this.config.challengeExpiry * 1000,
      ...attempt,
    };

    // Store challenge
    if (this.redis) {
      await this.redis.setex(
        `challenge:${challenge.id}`,
        this.config.challengeExpiry,
        JSON.stringify(challenge)
      );
    }

    // Update session metrics
    session.metrics.challengeCount++;
    session.state.challengeAttempts++;
    session.state.lastChallenge = challenge.id;

    await this.updateSession(sessionId, {
      metrics: session.metrics,
      state: session.state,
    });

    return challenge;
  }

  /**
   * Validate challenge
   */
  async validateChallenge(challengeId, solution, options = {}) {
    if (!challengeId) return { valid: false, reason: 'no_challenge_id' };

    let challenge;
    if (this.redis) {
      const data = await this.redis.get(`challenge:${challengeId}`);
      challenge = data ? JSON.parse(data) : null;
    }

    if (!challenge) {
      return { valid: false, reason: 'challenge_not_found' };
    }

    // Check expiration
    if (Date.now() > challenge.expires) {
      return { valid: false, reason: 'challenge_expired' };
    }

    // Check if already solved
    if (challenge.solved) {
      return { valid: false, reason: 'challenge_already_solved' };
    }

    // Check attempt limit
    if ((challenge.attempts || 0) >= 3) {
      return { valid: false, reason: 'too_many_attempts' };
    }

    // Validate solution based on challenge type
    const isValid = this.validateChallengeSolution(challenge, solution, options);

    if (!isValid) {
      // Increment attempt count
      challenge.attempts = (challenge.attempts || 0) + 1;
      if (this.redis) {
        const ttl = await this.redis.ttl(`challenge:${challengeId}`);
        if (ttl > 0) {
          await this.redis.setex(`challenge:${challengeId}`, ttl, JSON.stringify(challenge));
        }
      }

      return {
        valid: false,
        reason: 'invalid_solution',
        attemptsRemaining: 3 - challenge.attempts,
      };
    }

    // Mark as solved
    challenge.solved = true;
    challenge.solvedAt = Date.now();

    if (this.redis) {
      const ttl = await this.redis.ttl(`challenge:${challengeId}`);
      if (ttl > 0) {
        await this.redis.setex(`challenge:${challengeId}`, ttl, JSON.stringify(challenge));
      }
    }

    // Update session
    const session = await this.getSession(challenge.sessionId);
    if (session) {
      session.metrics.challengeSuccesses++;
      session.state.verificationLevel = Math.min(session.state.verificationLevel + 1, 5);
      session.state.isVerified = true;
      session.state.trustScore = Math.min(session.state.trustScore + 0.2, 1.0);

      await this.updateSession(challenge.sessionId, {
        metrics: session.metrics,
        state: session.state,
      });

      this.analytics.successfulVerifications++;
      this._trackApp(session.metadata?.appName, 'verification_success');
      this._trackApp(session.metadata?.appName, 'challenge_passed');
    }

    return {
      valid: true,
      verificationLevel: session?.state.verificationLevel || 1,
      trustScore: session?.state.trustScore || 1.0,
    };
  }

  /**
   * Validate challenge solution
   */
  validateChallengeSolution(challenge, solution, options = {}) {
    switch (challenge.type) {
      case 'pulse':
        // Validate haptic pulse pattern
        return this.validatePulseSolution(challenge, solution);
      case 'tilt':
        // Validate device orientation
        return this.validateTiltSolution(challenge, solution);
      case 'flick':
        // Validate swipe direction
        return this.validateFlickSolution(challenge, solution);
      case 'breath':
        // Validate breathing rhythm
        return this.validateBreathSolution(challenge, solution);
      case 'proof_of_work':
        // Validate PoW hash
        return this.validatePoWSolution(challenge, solution);
      default:
        return false;
    }
  }

  /**
   * Validate pulse challenge solution
   */
  validatePulseSolution(challenge, solution) {
    if (!challenge.data || !solution) return false;
    const target = challenge.data.targetPattern || [];
    const provided = solution.pattern || [];

    if (target.length !== provided.length) return false;

    // Allow 20% tolerance for human error
    const tolerance = Math.ceil(target.length * 0.2);
    const differences = target.filter((t, i) => Math.abs(t - provided[i]) > 50);

    return differences.length <= tolerance;
  }

  /**
   * Validate tilt challenge solution
   */
  validateTiltSolution(challenge, solution) {
    if (!challenge.data || !solution) return false;
    const targetAngle = challenge.data.targetAngle || 0;
    const providedAngle = solution.angle || 0;

    // 15 degree tolerance
    return Math.abs(targetAngle - providedAngle) <= 15;
  }

  /**
   * Validate flick challenge solution
   */
  validateFlickSolution(challenge, solution) {
    if (!challenge.data || !solution) return false;
    const targetDirection = challenge.data.direction || 'right';
    const providedDirection = solution.direction || '';

    return targetDirection === providedDirection;
  }

  /**
   * Validate breath challenge solution
   */
  validateBreathSolution(challenge, solution) {
    if (!challenge.data || !solution) return false;
    const targetRhythm = challenge.data.rhythm || [];
    const providedRhythm = solution.rhythm || [];

    if (targetRhythm.length !== providedRhythm.length) return false;

    // Check timing similarity
    const avgTarget = targetRhythm.reduce((a, b) => a + b, 0) / targetRhythm.length;
    const avgProvided = providedRhythm.reduce((a, b) => a + b, 0) / providedRhythm.length;

    // 25% tolerance on average rhythm
    return Math.abs(avgTarget - avgProvided) <= avgTarget * 0.25;
  }

  /**
   * Validate proof of work solution
   */
  validatePoWSolution(challenge, solution) {
    if (!challenge.data || !solution) return false;
    const { difficulty, prefix } = challenge.data;
    const { nonce } = solution;

    const hash = crypto
      .createHash('sha256')
      .update(`${prefix}${nonce}`)
      .digest('hex');

    // Check leading zeros
    const requiredZeros = Math.ceil(difficulty / 4);
    const leadingZeros = hash.match(/^0*/)?.[0].length || 0;

    return leadingZeros >= requiredZeros;
  }

  /**
   * Store verification result
   */
  async storeVerification(sessionId, result) {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const verification = {
      id: nanoid(16),
      sessionId,
      timestamp: Date.now(),
      expires: Date.now() + this.config.verificationExpiry * 1000,
      ...result,
    };

    // Store in Redis with expiry
    if (this.redis) {
      await this.redis.setex(
        `verification:${verification.id}`,
        this.config.verificationExpiry,
        JSON.stringify({
          ...verification,
          sessionId, // Keep for lookup
        })
      );

      // Also create reverse lookup by session
      await this.redis.setex(
        `session_verification:${sessionId}`,
        this.config.verificationExpiry,
        verification.id
      );
    }

    return verification;
  }

  /**
   * Get verification by ID
   */
  async getVerification(verificationId) {
    if (!verificationId) return null;

    if (this.redis) {
      const data = await this.redis.get(`verification:${verificationId}`);
      return data ? JSON.parse(data) : null;
    }

    return null;
  }

  /**
   * Get current verification for session
   */
  async getCurrentVerification(sessionId) {
    if (!sessionId) return null;

    if (this.redis) {
      const verificationId = await this.redis.get(`session_verification:${sessionId}`);
      if (verificationId) {
        return this.getVerification(verificationId);
      }
    }

    return null;
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    return {
      sessionId,
      duration: Date.now() - session.created,
      active: Date.now() < session.expires,
      metrics: session.metrics,
      state: session.state,
      actionCount: session.actions.length,
    };
  }

  /**
   * Add action to session
   */
  async addSessionAction(sessionId, action) {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const actionEntry = {
      id: nanoid(8),
      timestamp: Date.now(),
      ...action,
    };

    session.actions.push(actionEntry);
    session.metrics.requestCount++;
    session.lastActive = Date.now();

    // Keep only last 100 actions
    if (session.actions.length > 100) {
      session.actions.shift();
    }

    await this.updateSession(sessionId, {
      actions: session.actions,
      metrics: session.metrics,
    });

    return actionEntry;
  }

  /**
   * Update session risk score
   */
  async updateRiskScore(sessionId, riskData) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const previousScore = session.state.riskScore;
    const newScore = riskData.score ?? previousScore;

    session.state.riskScore = newScore;

    // Adjust trust based on risk
    if (newScore > 0.7) {
      session.state.trustScore = Math.max(session.state.trustScore - 0.3, 0);
    } else if (newScore > 0.4) {
      session.state.trustScore = Math.max(session.state.trustScore - 0.1, 0);
    }

    await this.updateSession(sessionId, {
      state: session.state,
    });

    return {
      previous: previousScore,
      current: newScore,
      trustScore: session.state.trustScore,
    };
  }

  /**
   * Store session (Redis or memory)
   */
  async storeSession(sessionId, session) {
    if (this.redis) {
      const ttl = Math.ceil((session.expires - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redis.setex(`session:${sessionId}`, ttl, JSON.stringify(session));
      }
    } else {
      this.sessions.set(sessionId, session);

      // Cleanup old sessions periodically
      if (this.sessions.size > 10000) {
        this.cleanupExpiredSessions();
      }
    }
  }

  /**
   * Get stored session
   */
  async getStoredSession(sessionId) {
    if (this.redis) {
      const data = await this.redis.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    }
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Store token
   */
  async storeToken(tokenId, token) {
    if (this.redis) {
      const ttl = Math.ceil((token.expires - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redis.setex(`token:${tokenId}`, ttl, JSON.stringify(token));
        // Create reverse lookup
        await this.redis.setex(`token_access:${token.accessToken}`, ttl, tokenId);
        await this.redis.setex(`token_refresh:${token.refreshToken}`, ttl, tokenId);
      }
    }
  }

  /**
   * Get stored token
   */
  async getStoredToken(tokenId) {
    if (this.redis) {
      const data = await this.redis.get(`token:${tokenId}`);
      return data ? JSON.parse(data) : null;
    }
    return null;
  }

  /**
   * Get token ID by access token
   */
  async getTokenIdByAccess(accessToken) {
    if (this.redis) {
      return await this.redis.get(`token_access:${accessToken}`);
    }
    return null;
  }

  /**
   * Get token ID by refresh token
   */
  async getTokenIdByRefresh(refreshToken) {
    if (this.redis) {
      return await this.redis.get(`token_refresh:${refreshToken}`);
    }
    return null;
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return `ses_${nanoid(24)}`;
  }

  /**
   * Generate token
   */
  generateToken(type, options = {}) {
    const prefix = type === 'access' ? 'at_' : 'rt_';
    const payload = nanoid(32);
    const signature = crypto
      .createHmac('sha256', options.secret || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'))
      .update(payload)
      .digest('base64url');

    return `${prefix}${payload}.${signature}`;
  }

  /**
   * Generate session fingerprint
   */
  generateSessionFingerprint(data) {
    const components = [
      data.userAgent || '',
      data.ip || '',
      data.acceptLanguage || '',
      data.screenResolution || '',
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expires < now) {
        this.sessions.delete(id);
        this.analytics.activeSessions--;
      }
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.analytics,
      activeSessions: this.sessions.size,
      storedTokens: this.tokens.size,
      apps: Object.keys(this.appAnalytics).length,
    };
  }

  /**
   * Get statistics for a specific app
   */
  getAppStats(appName) {
    return this.appAnalytics[appName] || null;
  }

  /**
   * Get all app statistics
   */
  getAllAppStats() {
    return { ...this.appAnalytics };
  }
}
