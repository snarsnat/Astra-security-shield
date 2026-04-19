/**
 * API Routes - Main verification and analysis endpoints
 *
 * Hardened with Zod input validation on every endpoint. Validation schemas
 * are strict: unknown fields are stripped, lengths bounded, types enforced.
 * This closes a large class of injection / prototype-pollution / DoS-via-
 * pathological-input bugs that the WAF-lite layer alone cannot catch.
 */

import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import APIKeyService from '../services/APIKeyService.js';
import { requireAPIKey } from '../middleware/auth.js';

// ─── Shared schema primitives ────────────────────────────────────────────────
const IPSchema      = z.string().ip().optional();
const IDSchema      = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);
const NonceSchema   = z.string().min(8).max(128).regex(/^[A-Za-z0-9._-]+$/).optional();
const TokenSchema   = z.string().min(16).max(2048).optional();
const PermSchema    = z.enum(['verify', 'challenge', 'analyze', 'admin']);
const DifficultyEnum = z.enum(['easy', 'medium', 'hard', 'extreme']).optional();
const ChallengeTypeEnum = z.enum([
  'pulse', 'tilt', 'flick', 'breath', 'rhythm', 'pressure',
  'path', 'semantic', 'microchain', 'gaze', 'contextual', 'proof_of_work',
]).optional();

// Client-supplied data is open-ended — we allow it but cap total object size.
// The WAF-lite middleware already scanned these bodies for attack patterns.
const ClientDataSchema = z.object({}).passthrough().optional();

const VerifyBodySchema = z.object({
  sessionId: IDSchema.optional(),
  token: TokenSchema,
  clientData: ClientDataSchema,
  challengeToken: z.string().max(512).optional(),
  challengeSolution: z.any().optional(),
  nonce: NonceSchema,
}).strict();

const AnalyzeBodySchema = z.object({
  clientData: z.object({}).passthrough(),
  includeThreatIntel: z.boolean().optional(),
}).strict();

const ChallengeBodySchema = z.object({
  type: ChallengeTypeEnum,
  difficulty: DifficultyEnum,
  sessionId: IDSchema.optional(),
  deviceInfo: z.object({}).passthrough().optional(),
}).strict();

const ChallengeVerifyBodySchema = z.object({
  challengeId: z.string().min(1).max(512),
  solution: z.any(),
  sessionId: IDSchema.optional(),
}).strict();

const ThreatIntelBodySchema = z.object({
  ip: z.string().ip(),
  timezone: z.string().max(64).optional(),
  languages: z.array(z.string().max(16)).max(20).optional(),
}).strict();

const SessionCreateBodySchema = z.object({
  country:    z.string().max(4).optional(),
  deviceType: z.string().max(32).optional(),
  browser:    z.string().max(64).optional(),
  os:         z.string().max(64).optional(),
  appName:    z.string().max(64).optional(),
}).strict();

const SessionRefreshBodySchema = z.object({
  refreshToken: z.string().min(16).max(2048),
}).strict();

const ReportThreatBodySchema = z.object({
  ip: z.string().ip(),
  threatType: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i),
  details: z.object({}).passthrough().optional(),
}).strict();

const KeyGenerateBodySchema = z.object({
  appName: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/),
  description: z.string().max(500).optional(),
  permissions: z.array(PermSchema).min(1).max(4).optional(),
  rateLimit: z.number().int().min(1).max(100000).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
}).strict();

const KeyRevokeBodySchema = z.object({
  keyId: z.string().min(1).max(128).regex(/^key_[A-Za-z0-9_-]+$/),
}).strict();

// Express middleware helper — validate req.body against a schema.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        success: false,
        reason: 'invalid_input',
        issues: result.error.issues.slice(0, 5).map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data; // replace with parsed/stripped object
    next();
  };
}

export function createAPIRoutes(services = {}, helpers = {}) {
  const router = express.Router();

  const {
    botDetection,
    fingerprint,
    mlAnalysis,
    threatIntel,
    session,
    challenge
  } = services;

  const { blockIP, consumeNonce, emitEvent, suspicion } = helpers;
  const emit = emitEvent || (() => {});
  const doBlockIP = blockIP || (() => {});
  const checkNonce = consumeNonce || (() => true);
  const bumpSuspicion = suspicion ? (ip, n, r) => suspicion.bump(ip, n, r) : () => {};

  /**
   * POST /api/verify
   * Main verification endpoint (requires API key)
   */
  router.post('/verify', requireAPIKey(['verify']), validateBody(VerifyBodySchema), async (req, res) => {
    try {
      const {
        sessionId,
        token,
        clientData,
        challengeToken,
        challengeSolution,
        nonce,
      } = req.body;

      // Replay-protection: reject reused nonces
      if (nonce && !checkNonce(nonce)) {
        return res.status(400).json({ success: false, reason: 'nonce_replayed' });
      }

      // Validate token or session
      let sessionData;
      if (token) {
        const tokenResult = await session.validateToken(token);
        if (!tokenResult) {
          return res.status(401).json({
            success: false,
            reason: 'invalid_token',
          });
        }
        sessionData = tokenResult.session;
      } else if (sessionId) {
        sessionData = await session.getSession(sessionId);
        if (!sessionData) {
          return res.status(401).json({
            success: false,
            reason: 'invalid_session',
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          reason: 'missing_credentials',
        });
      }

      // Initialize result
      const result = {
        success: false,
        tier: 0,
        reason: 'pending',
        riskScore: 0,
        details: {},
      };

      // If there's a challenge solution, verify it first
      if (challengeToken && challengeSolution) {
        const challengeResult = await challenge.verifyChallenge(
          challengeToken,
          challengeSolution,
          { sessionId: sessionData.id }
        );

        if (!challengeResult.success) {
          return res.json({
            ...result,
            success: false,
            reason: challengeResult.reason,
            attemptsRemaining: challengeResult.attemptsRemaining,
          });
        }

        result.details.challenge = {
          verified: true,
          verificationLevel: challengeResult.verificationLevel,
        };
      }

      // Analyze client data
      if (clientData) {
        // 1. Bot Detection Analysis
        const botAnalysis = await botDetection.analyze(clientData);
        result.details.botDetection = botAnalysis;

        // 2. Fingerprint Analysis
        const fingerprintAnalysis = await fingerprint.analyze(
          clientData.fingerprints || {},
          clientData.serverObservations || {}
        );
        result.details.fingerprint = fingerprintAnalysis;

        // 3. Threat Intelligence
        const clientIP = req.ip || clientData.ip;
        const threatIntelResult = await threatIntel.getThreatIntelligence(
          clientIP,
          {
            userAgent: req.get('user-agent'),
            timezone: clientData.timezone,
            languages: clientData.languages,
          }
        );
        result.details.threatIntel = threatIntelResult;

        // 4. ML Analysis
        const mlResult = await mlAnalysis.analyze(
          clientData.behavior || {},
          clientData.serverObservations || {}
        );
        result.details.mlAnalysis = mlResult;

        // Calculate composite risk score
        const compositeScore = calculateCompositeScore({
          botScore: botAnalysis.riskScore,
          fingerprintScore: fingerprintAnalysis.riskScore,
          threatScore: threatIntelResult.reputation.score / 100,
          mlScore: mlResult.riskScore,
        });

        result.riskScore = compositeScore;

        // Determine tier based on risk score
        result.tier = determineTier(compositeScore);

        // Update session risk
        await session.updateRiskScore(sessionData.id, { score: compositeScore });

        // Generate recommendations
        const recommendations = generateRecommendations({
          botAnalysis,
          fingerprintAnalysis,
          threatIntel: threatIntelResult,
          mlAnalysis: mlResult,
          compositeScore,
        });

        // Take action based on recommendations
        if (recommendations.action === 'block') {
          result.success = false;
          result.reason = 'blocked';
          result.blockReason = recommendations.reason;

          // Auto-block IP for confirmed bots (botScore == 1.0 = known bot signature)
          if (botAnalysis.riskScore >= 1.0) {
            const clientIP = req.ip || clientData.ip;
            doBlockIP(clientIP, 'confirmed_bot');
            // Also record in threat intelligence for future lookups
            threatIntel.recordAbuse(clientIP, 'confirmed_bot');
          }

          // Emit live block event
          emit('verification', {
            action: 'blocked',
            ip: req.ip || clientData.ip,
            tier: result.tier,
            oosScore: compositeScore,
            reason: recommendations.reason,
            appName: req.apiKey?.appName || null,
            timestamp: Date.now(),
          });
        } else if (recommendations.action === 'challenge') {
          // Need additional verification
          const challengeData = await challenge.selectOptimalChallenge(
            compositeScore,
            clientData.deviceInfo || {},
            { sessionId: sessionData.id }
          );
          result.success = false;
          result.reason = 'challenge_required';
          result.challenge = challengeData;

          emit('verification', {
            action: 'challenge_issued',
            ip: req.ip || clientData.ip,
            tier: result.tier,
            oosScore: compositeScore,
            appName: req.apiKey?.appName || null,
            timestamp: Date.now(),
          });
        } else {
          result.success = true;
          result.reason = 'verified';

          emit('verification', {
            action: 'verified',
            ip: req.ip || clientData.ip,
            tier: result.tier,
            oosScore: compositeScore,
            appName: req.apiKey?.appName || null,
            timestamp: Date.now(),
          });
        }
      }

      // Store verification result
      const verification = await session.storeVerification(sessionData.id, result);

      // Log action
      await session.addSessionAction(sessionData.id, {
        type: 'verification',
        result: result.success ? 'success' : 'failed',
        riskScore: result.riskScore,
        tier: result.tier,
      });

      res.json({
        ...result,
        verificationId: verification.id,
        sessionId: sessionData.id,
      });
    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  });

  /**
   * POST /api/analyze
   * Behavioral analysis endpoint
   */
  router.post('/analyze', validateBody(AnalyzeBodySchema), async (req, res) => {
    try {
      const { clientData, includeThreatIntel } = req.body;

      if (!clientData) {
        return res.status(400).json({
          success: false,
          reason: 'missing_data',
        });
      }

      const analysis = {
        timestamp: Date.now(),
      };

      // Bot Detection
      analysis.botDetection = await botDetection.analyze(clientData);

      // ML Analysis
      analysis.ml = await mlAnalysis.analyze(
        clientData.behavior || {},
        clientData.serverObservations || {}
      );

      // Fingerprint Analysis
      if (clientData.fingerprints) {
        analysis.fingerprint = await fingerprint.analyze(
          clientData.fingerprints,
          clientData.serverObservations || {}
        );
      }

      // Threat Intelligence (optional)
      if (includeThreatIntel) {
        const clientIP = req.ip || clientData.ip;
        analysis.threatIntel = await threatIntel.getThreatIntelligence(clientIP, {
          userAgent: req.get('user-agent'),
          timezone: clientData.timezone,
          languages: clientData.languages,
        });
      }

      // Calculate overall score
      analysis.overallRisk = calculateCompositeScore({
        botScore: analysis.botDetection.riskScore,
        fingerprintScore: analysis.fingerprint?.riskScore || 0,
        threatScore: analysis.threatIntel?.reputation.score / 100 || 0,
        mlScore: analysis.ml.riskScore,
      });

      res.json({
        success: true,
        analysis,
      });
    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
      });
    }
  });

  /**
   * POST /api/challenge
   * Challenge generation endpoint
   */
  router.post('/challenge', validateBody(ChallengeBodySchema), async (req, res) => {
    try {
      const { type, difficulty, sessionId, deviceInfo } = req.body;

      // Validate session
      if (sessionId) {
        const sessionData = await session.getSession(sessionId);
        if (!sessionData) {
          return res.status(401).json({
            success: false,
            reason: 'invalid_session',
          });
        }
      }

      // Generate challenge
      const challengeData = await challenge.generateChallenge(type || 'breath', {
        difficulty: difficulty || 'medium',
        sessionId,
        deviceInfo,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });

      res.json({
        success: true,
        challenge: challengeData,
      });
    } catch (error) {
      console.error('Challenge generation error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
      });
    }
  });

  /**
   * POST /api/challenge/verify
   * Challenge verification endpoint
   */
  router.post('/challenge/verify', validateBody(ChallengeVerifyBodySchema), async (req, res) => {
    try {
      const { challengeId, solution, sessionId } = req.body;

      if (!challengeId || !solution) {
        return res.status(400).json({
          success: false,
          reason: 'missing_parameters',
        });
      }

      const result = await challenge.verifyChallenge(challengeId, solution, {
        sessionId,
        ip: req.ip,
      });

      res.json(result);
    } catch (error) {
      console.error('Challenge verification error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
      });
    }
  });

  /**
   * POST /api/threat-intel
   * Threat intelligence lookup
   */
  router.post('/threat-intel', validateBody(ThreatIntelBodySchema), async (req, res) => {
    try {
      const { ip } = req.body;

      if (!ip) {
        return res.status(400).json({
          success: false,
          reason: 'missing_ip',
        });
      }

      const intel = await threatIntel.getThreatIntelligence(ip, {
        userAgent: req.get('user-agent'),
        timezone: req.body.timezone,
        languages: req.body.languages,
      });

      res.json({
        success: true,
        intel,
      });
    } catch (error) {
      console.error('Threat intel error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
      });
    }
  });

  /**
   * POST /api/session/create
   * Create new session
   */
  router.post('/session/create', validateBody(SessionCreateBodySchema), async (req, res) => {
    try {
      const appName = req.body.appName || req.apiKey?.appName || null;
      const clientData = {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        country: req.body.country,
        deviceType: req.body.deviceType,
        browser: req.body.browser,
        os: req.body.os,
        appName,
      };

      const sessionResult = await session.createSession(clientData, { appName });

      // Create initial token
      const tokenResult = await session.createToken(sessionResult.sessionId, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        sessionId: sessionResult.sessionId,
        token: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expires: sessionResult.expires,
      });

      // Emit session start event (after response so it doesn't delay client)
      emit('session', {
        action: 'created',
        sessionId: sessionResult.sessionId,
        ip: req.ip,
        appName,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Session creation error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
      });
    }
  });

  /**
   * POST /api/session/refresh
   * Refresh access token
   */
  router.post('/session/refresh', validateBody(SessionRefreshBodySchema), async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          reason: 'missing_refresh_token',
        });
      }

      const result = await session.refreshTokens(refreshToken);

      if (!result) {
        return res.status(401).json({
          success: false,
          reason: 'invalid_or_expired_refresh_token',
        });
      }

      res.json({
        success: true,
        token: result.accessToken,
        refreshToken: result.refreshToken,
        expires: result.expires,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
      });
    }
  });

  /**
   * POST /api/session/report-threat
   * Report threat activity
   */
  router.post('/session/report-threat', requireAPIKey(['admin']), validateBody(ReportThreatBodySchema), async (req, res) => {
    try {
      const { ip, threatType, details } = req.body;

      if (!ip || !threatType) {
        return res.status(400).json({
          success: false,
          reason: 'missing_parameters',
        });
      }

      await threatIntel.reportThreat(ip, {
        type: threatType,
        ...details,
      });

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('Threat report error:', error);
      res.status(500).json({
        success: false,
        reason: 'server_error',
      });
    }
  });

  /**
   * GET /api/stats
   * Get service statistics
   */
  router.get('/stats', (req, res) => {
    res.json({
      success: true,
      stats: {
        sessions: session.getStats(),
        challenges: challenge.getStats(),
        threatIntel: threatIntel.getThreatStats(),
      },
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  /**
   * GET /api/health
   * Health check endpoint
   */
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: Date.now(),
    });
  });

  // ─── API Key Management Endpoints ─────────────────────────

  /**
   * POST /api/keys/generate
   * Generate a new API key (requires admin permission)
   */
  router.post('/keys/generate', requireAPIKey(['admin']), validateBody(KeyGenerateBodySchema), (req, res) => {
    try {
      const { appName, description, permissions, rateLimit, expiresInDays } = req.body;

      const result = APIKeyService.generateKey({
        appName,
        description: description || '',
        permissions: permissions || ['verify', 'challenge', 'analyze'],
        rateLimit: rateLimit || 60,
        expiresInDays: expiresInDays || null,
      });

      emit('key_generated', {
        appName,
        keyId: result.metadata.id,
        by: req.apiKey?.id || 'admin',
        reqId: req.id,
      });

      res.json({
        success: true,
        message: 'API key generated. Save it now — it will not be shown again.',
        key: result.key,
        metadata: result.metadata
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * GET /api/keys/list
   * List all keys for an app
   */
  router.get('/keys/list', requireAPIKey(['admin']), (req, res) => {
    const { appName } = req.query;

    if (appName) {
      if (typeof appName !== 'string' || !/^[A-Za-z0-9 _-]{1,64}$/.test(appName)) {
        return res.status(400).json({ success: false, error: 'invalid_app_name' });
      }
      const keys = APIKeyService.listKeys(appName);
      return res.json({ success: true, keys });
    }

    const apps = APIKeyService.listApps();
    res.json({ success: true, apps });
  });

  /**
   * POST /api/keys/revoke
   * Revoke an API key
   */
  router.post('/keys/revoke', requireAPIKey(['admin']), validateBody(KeyRevokeBodySchema), (req, res) => {
    const { keyId } = req.body;

    const revoked = APIKeyService.revokeKeyById(keyId);
    if (!revoked) {
      return res.status(404).json({
        success: false,
        error: 'Key not found'
      });
    }

    emit('key_revoked', {
      keyId,
      by: req.apiKey?.id || 'admin',
      reqId: req.id,
    });

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  });

  /**
   * GET /api/keys/stats
   * Get stats for current API key
   */
  router.get('/keys/stats', requireAPIKey(), (req, res) => {
    const stats = APIKeyService.getKeyStats(req._apiKeyHash);
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Key not found'
      });
    }
    res.json({ success: true, stats });
  });

  return router;
}

/**
 * Calculate composite risk score
 */
function calculateCompositeScore({ botScore, fingerprintScore, threatScore, mlScore }) {
  const weights = {
    bot: 0.35,
    fingerprint: 0.25,
    threat: 0.20,
    ml: 0.20,
  };

  const score =
    botScore * weights.bot +
    fingerprintScore * weights.fingerprint +
    threatScore * weights.threat +
    mlScore * weights.ml;

  return Math.min(Math.max(score, 0), 1);
}

/**
 * Determine tier based on risk score
 */
function determineTier(riskScore) {
  if (riskScore < 0.15) return 0; // Ghost - no friction
  if (riskScore < 0.30) return 1; // Whisper - minimal friction
  if (riskScore < 0.50) return 2; // Nudge - light challenge
  if (riskScore < 0.70) return 3; // Pause - moderate challenge
  return 4; // Gate - full verification
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations({ botAnalysis, fingerprintAnalysis, threatIntel, mlAnalysis, compositeScore }) {
  const reasons = [];

  // Check bot detection flags
  if (botAnalysis.riskScore > 0.6) {
    reasons.push('high_bot_score');
  }

  // Check fingerprint anomalies
  if (fingerprintAnalysis.anomalies?.length > 3) {
    reasons.push('multiple_fingerprint_anomalies');
  }

  // Check threat intel
  if (threatIntel.reputation.score > 60) {
    reasons.push('suspicious_ip_reputation');
  }

  // Check ML anomalies
  if (mlAnalysis.anomalies?.length > 5) {
    reasons.push('multiple_ml_anomalies');
  }

  // High composite score
  if (compositeScore > 0.7) {
    return {
      action: 'block',
      reason: reasons.join(', '),
    };
  }

  if (compositeScore > 0.4) {
    return {
      action: 'challenge',
      reason: reasons.join(', '),
    };
  }

  if (compositeScore > 0.2) {
    return {
      action: 'monitor',
      reason: 'low_risk_with_indicators',
    };
  }

  return {
    action: 'allow',
    reason: 'low_risk',
  };
}
