#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the ASTRA root directory — works whether installed globally,
// as a dependency, or run from source
let ASTRA_ROOT;
try {
  // When installed as a dependency: node_modules/astra-shield/cli/astra.js
  const pkgDir = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(pkgDir, 'server', 'index.js'))) {
    ASTRA_ROOT = pkgDir;
  } else {
    throw new Error('Not in astra-shield package');
  }
} catch {
  // Fallback: running from source checkout
  ASTRA_ROOT = path.resolve(__dirname, '..');
}

const ASTRA_CONFIG_DIR = path.join(os.homedir(), '.astra');
const ASTRA_CONFIG_FILE = path.join(ASTRA_CONFIG_DIR, 'config.json');
const ASTRA_APPS_FILE = path.join(ASTRA_CONFIG_DIR, 'apps.json');

const VERSION = '2.0.0';

// ─── Colors ───────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

function logo() {
  return `
${C.green}${C.bold}
    █████╗ ███████╗██████╗ ████████╗
   ██╔══██╗██╔════╝██╔══██╗╚══██╔══╝
   ███████║███████╗██████╔╝   ██║
   ██╔══██║╚════██║██╔═══╝    ██║
   ██║  ██║███████║██║        ██║
   ╚═╝  ╚═╝╚══════╝╚═╝        ╚═╝
${C.reset}${C.dim}   Behavioral Bot-Detection & Human Verification v${VERSION}${C.reset}
`;
}

// ─── Config Helpers ───────────────────────────────────────
function ensureConfigDir() {
  if (!fs.existsSync(ASTRA_CONFIG_DIR)) {
    fs.mkdirSync(ASTRA_CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  if (!fs.existsSync(ASTRA_CONFIG_FILE)) {
    return { theme: 'auto', debug: false, sessionDuration: 1800000, mutationInterval: 3600000, apiKey: '' };
  }
  return JSON.parse(fs.readFileSync(ASTRA_CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(ASTRA_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadApps() {
  if (!fs.existsSync(ASTRA_APPS_FILE)) {
    return { apps: [] };
  }
  return JSON.parse(fs.readFileSync(ASTRA_APPS_FILE, 'utf8'));
}

function saveApps(appsData) {
  ensureConfigDir();
  fs.writeFileSync(ASTRA_APPS_FILE, JSON.stringify(appsData, null, 2));
}

// ─── Prompt Helper ────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${C.cyan}?${C.reset} ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Step logger ──────────────────────────────────────────
function step(num, label) {
  console.log(`${C.blue}${C.bold}[${String(num).padStart(2, '0')}]${C.reset} ${label}`);
}

function ok(msg) {
  console.log(`     ${C.green}✓${C.reset} ${msg}`);
}

function warn(msg) {
  console.log(`     ${C.yellow}!${C.reset} ${C.dim}${msg}${C.reset}`);
}

function err(msg) {
  console.log(`     ${C.red}✗${C.reset} ${msg}`);
}

// ─── Framework Detection ─────────────────────────────────
function detectFramework(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    if (fs.existsSync(path.join(projectDir, 'index.html'))) {
      return { name: 'static', pkg: null };
    }
    return null;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps['next']) {
    const hasAppDir = fs.existsSync(path.join(projectDir, 'app'));
    const hasAppLayout = fs.existsSync(path.join(projectDir, 'app', 'layout.tsx')) ||
                         fs.existsSync(path.join(projectDir, 'app', 'layout.jsx'));
    return {
      name: 'nextjs',
      type: hasAppDir && hasAppLayout ? 'app-router' : 'pages-router',
      srcDir: path.join(projectDir, hasAppDir ? 'app' : 'pages'),
      entryExt: hasAppLayout ? '.tsx' : '.jsx',
      pkg
    };
  }

  if (deps['vite'] && (deps['react'] || deps['@vitejs/plugin-react'])) {
    const srcDir = path.join(projectDir, 'src');
    const entryFile = findEntryFile(srcDir, ['main.tsx', 'main.jsx', 'index.tsx', 'index.jsx']);
    return {
      name: 'vite-react',
      srcDir,
      entryFile,
      appFile: findEntryFile(srcDir, ['App.tsx', 'App.jsx', 'app.tsx', 'app.jsx']),
      pkg
    };
  }

  if (deps['vite'] && deps['vue']) {
    const srcDir = path.join(projectDir, 'src');
    return {
      name: 'vite-vue',
      srcDir,
      entryFile: findEntryFile(srcDir, ['main.ts', 'main.js']),
      pkg
    };
  }

  if (deps['@angular/core'] || fs.existsSync(path.join(projectDir, 'angular.json'))) {
    const srcDir = path.join(projectDir, 'src');
    return {
      name: 'angular',
      srcDir,
      entryFile: findEntryFile(srcDir, ['main.ts', 'main.js']),
      pkg
    };
  }

  if (deps['nuxt'] || deps['nuxt3']) {
    return { name: 'nuxt', pkg };
  }

  if (deps['vue']) {
    const srcDir = path.join(projectDir, 'src');
    return {
      name: 'vue',
      srcDir,
      entryFile: findEntryFile(srcDir, ['main.ts', 'main.js']),
      pkg
    };
  }

  if (deps['react']) {
    const srcDir = path.join(projectDir, 'src');
    return {
      name: 'react',
      srcDir,
      entryFile: findEntryFile(srcDir, ['index.tsx', 'index.jsx', 'main.tsx', 'main.jsx']),
      pkg
    };
  }

  if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hono']) {
    const entry = findEntryFile(projectDir, ['server.js', 'index.js', 'app.js', 'server.ts', 'index.ts', 'app.ts']);
    return { name: 'express', entryFile: entry, pkg };
  }

  if (fs.existsSync(path.join(projectDir, 'index.html'))) {
    return { name: 'static', pkg };
  }

  return { name: 'static', pkg };
}

function findEntryFile(dir, candidates) {
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─── File Generators ──────────────────────────────────────

/**
 * Generate the verify.ts serverless function
 */
function generateVerifyTs() {
  return `/**
 * ASTRA Shield — Main Verification Endpoint
 * Vercel Serverless Function
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Global in-memory storage (persists across warm Vercel lambdas)
declare global {
  var astraSessions: Map<string, any>;
  var astraApiKeys: Map<string, any>;
  var astraRateLimits: Map<string, { count: number; resetAt: number }>;
  var astraChallenges: Map<string, any>;
}

if (!globalThis.astraSessions) globalThis.astraSessions = new Map();
if (!globalThis.astraApiKeys) globalThis.astraApiKeys = new Map();
if (!globalThis.astraRateLimits) globalThis.astraRateLimits = new Map();
if (!globalThis.astraChallenges) globalThis.astraChallenges = new Map();

const sessions = globalThis.astraSessions;
const apiKeys = globalThis.astraApiKeys;
const rateLimits = globalThis.astraRateLimits;
export const challenges = globalThis.astraChallenges;

interface SessionData {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  riskScores: number[];
  verifications: number;
  challengesPassed: number;
  challengesFailed: number;
  lastActivity: number;
  trustScore: number;
}

interface APIKeyData {
  id: string;
  hash: string;
  permissions: string[];
  rateLimit: number;
  createdAt: string;
  totalRequests: number;
}

// Seed a default API key
const DEFAULT_API_KEY = 'astra_public_key_2026';
apiKeys.set(DEFAULT_API_KEY, {
  id: 'key_default',
  hash: DEFAULT_API_KEY,
  permissions: ['verify', 'challenge', 'analyze'],
  rateLimit: 100,
  createdAt: new Date().toISOString(),
  totalRequests: 0,
});

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record) { rateLimits.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (now > record.resetAt) { record.count = 1; record.resetAt = now + 60_000; return true; }
  if (record.count >= 100) return false;
  record.count++;
  return true;
}

function createSession(ip: string, userAgent: string): SessionData {
  const id = \`sess_\${Date.now()}_\${Math.random().toString(36).slice(2, 9)}\`;
  const session: SessionData = {
    id, ip, userAgent, createdAt: Date.now(), riskScores: [],
    verifications: 0, challengesPassed: 0, challengesFailed: 0,
    lastActivity: Date.now(), trustScore: 0.5,
  };
  sessions.set(id, session);
  return session;
}

function getOrCreateSession(ip: string, userAgent: string, sessionId?: string): SessionData {
  if (sessionId && sessions.has(sessionId)) {
    const existing = sessions.get(sessionId)!;
    existing.lastActivity = Date.now();
    return existing;
  }
  return createSession(ip, userAgent);
}

function analyzeBehavior(clientData: any): number {
  let riskScore = 0;
  const behavior = clientData?.behavior || {};
  if (behavior.mouseData) {
    const m = behavior.mouseData;
    if (m.totalMovements === 0 && m.totalClicks === 0) riskScore += 0.3;
    if (m.averageVelocity > 5000) riskScore += 0.15;
    if (m.directionChanges > m.totalMovements * 0.9 && m.totalMovements > 50) riskScore += 0.2;
    if (m.straightLineRatio > 0.95 && m.totalMovements > 30) riskScore += 0.15;
  }
  if (behavior.keyboardData) {
    const k = behavior.keyboardData;
    if (k.averageInterval < 10 && k.totalKeystrokes > 10) riskScore += 0.25;
    if (k.consistency > 0.98 && k.totalKeystrokes > 20) riskScore += 0.15;
  }
  if (behavior.timingData && behavior.timingData.sessionDuration < 500) riskScore += 0.2;
  return Math.min(riskScore, 1);
}

function analyzeFingerprint(clientData: any): { score: number; anomalies: string[] } {
  const fingerprints = clientData?.fingerprints || {};
  const anomalies: string[] = [];
  let score = 0;
  if (!fingerprints.canvas && !fingerprints.canvasHash && Object.keys(fingerprints).length > 0) {
    anomalies.push('missing_canvas_fingerprint'); score += 0.1;
  }
  if (fingerprints.webgl && fingerprints.webglRenderer === 'Google SwiftShader') {
    anomalies.push('software_webgl_rendering'); score += 0.15;
  }
  if (clientData?.languages && clientData.languages.length > 10) {
    anomalies.push('excessive_languages'); score += 0.1;
  }
  return { score: Math.min(score, 1), anomalies };
}

function analyzeContext(req: VercelRequest): { score: number } {
  let score = 0;
  const ua = req.headers['user-agent'] || '';
  if (/Headless|headless/.test(ua)) score += 0.3;
  if (/PhantomJS|Selenium|webdriver|puppeteer/.test(ua)) score += 0.4;
  if (!req.headers['accept-language']) score += 0.05;
  return { score: Math.min(score, 1) };
}

function calculateCompositeScore(behavior: number, fingerprint: number, context: number, trust: number): number {
  return behavior * 0.4 + fingerprint * 0.2 + context * 0.25 + (1 - trust) * 0.15;
}

function determineTier(riskScore: number): number {
  if (riskScore < 0.15) return 0;
  if (riskScore < 0.30) return 1;
  if (riskScore < 0.50) return 2;
  if (riskScore < 0.70) return 3;
  return 4;
}

function generateChallenge(tier: number, sessionId: string): any {
  const types = ['pulse', 'tilt', 'flick', 'breath'];
  const diffs = ['easy', 'medium', 'hard'];
  const type = types[Math.floor(Math.random() * types.length)];
  const diff = diffs[Math.min(tier - 1, 2)];
  const id = \`chal_\${Date.now()}_\${Math.random().toString(36).slice(2, 9)}\`;
  const instructions: Record<string, string> = {
    pulse: 'Tap along with the rhythm.',
    tilt: 'Tilt your device or drag to balance the ball.',
    flick: 'Swipe in the indicated direction.',
    breath: 'Follow the breathing circle.',
  };
  const challenge = { id, type, difficulty: diff, sessionId, expiresAt: Date.now() + 300_000, instructions: instructions[type] || 'Complete the challenge.', attempts: 0 };
  challenges.set(id, challenge);
  return challenge;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, reason: 'method_not_allowed' });
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); return res.status(200).end(); }

  const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ success: false, reason: 'rate_limit_exceeded', retryAfter: 60 });

  try {
    const { clientData, action } = req.body;
    const session = getOrCreateSession(ip as string, req.headers['user-agent'] || '', clientData?.sessionId);

    const behaviorScore = analyzeBehavior(clientData);
    const fingerprintResult = analyzeFingerprint(clientData);
    const contextResult = analyzeContext(req);
    const compositeScore = calculateCompositeScore(behaviorScore, fingerprintResult.score, contextResult.score, session.trustScore);
    const tier = determineTier(compositeScore);

    session.riskScores.push(compositeScore);
    session.verifications++;
    session.lastActivity = Date.now();
    if (session.verifications > 3) {
      const avg = session.riskScores.slice(-5).reduce((a: number, b: number) => a + b, 0) / Math.min(session.riskScores.length, 5);
      session.trustScore = session.trustScore * 0.7 + (1 - avg) * 0.3;
    }

    if (compositeScore > 0.7) {
      return res.json({ success: false, tier, reason: 'blocked', riskScore: compositeScore, blockReason: 'High risk score — automated behavior detected', sessionId: session.id, details: { behaviorScore, fingerprintAnomalies: fingerprintResult.anomalies, contextScore: contextResult.score } });
    }
    if (compositeScore > 0.3) {
      const challenge = generateChallenge(tier, session.id);
      return res.json({ success: false, tier, reason: 'challenge_required', riskScore: compositeScore, challenge, sessionId: session.id, details: { behaviorScore, fingerprintAnomalies: fingerprintResult.anomalies, contextScore: contextResult.score } });
    }

    return res.json({ success: true, tier, reason: 'verified', riskScore: compositeScore, sessionId: session.id, details: { behaviorScore, fingerprintAnomalies: fingerprintResult.anomalies, contextScore: contextResult.score, message: tier === 0 ? 'Invisible verification — no friction applied' : 'Minimal friction applied' } });
  } catch (error: any) {
    console.error('[ASTRA] Verification error:', error);
    return res.status(500).json({ success: false, reason: 'server_error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
}
`;
}

/**
 * Generate the challenge-verify.ts serverless function
 */
function generateChallengeVerifyTs() {
  return `/**
 * ASTRA Shield — Challenge Verification Endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

declare global {
  var astraSessions: Map<string, any>;
  var astraChallenges: Map<string, any>;
}

if (!globalThis.astraSessions) globalThis.astraSessions = new Map();
if (!globalThis.astraChallenges) globalThis.astraChallenges = new Map();

const sessions = globalThis.astraSessions;
const challenges = globalThis.astraChallenges;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, reason: 'method_not_allowed' });

  const { challengeId, solution, sessionId } = req.body;
  if (!challengeId || !solution) return res.status(400).json({ success: false, reason: 'missing_parameters' });

  const challenge = challenges.get(challengeId);
  if (!challenge) return res.status(404).json({ success: false, reason: 'challenge_not_found' });
  if (Date.now() > challenge.expiresAt) { challenges.delete(challengeId); return res.json({ success: false, reason: 'challenge_expired', attemptsRemaining: 0 }); }

  const isValid = solution.completed === true || solution.success === true || solution === true;
  if (!isValid) {
    challenge.attempts = (challenge.attempts || 0) + 1;
    if (challenge.attempts >= 3) { challenges.delete(challengeId); return res.json({ success: false, reason: 'max_attempts_exceeded', attemptsRemaining: 0 }); }
    return res.json({ success: false, reason: 'invalid_solution', attemptsRemaining: 3 - challenge.attempts });
  }

  challenges.delete(challengeId);
  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    s.challengesPassed = (s.challengesPassed || 0) + 1;
    s.trustScore = Math.min(1, s.trustScore + 0.2);
  }

  return res.json({ success: true, reason: 'challenge_passed', verificationLevel: challenge.difficulty || 'medium' });
}
`;
}

/**
 * Generate the health.ts serverless function
 */
function generateHealthTs() {
  return `/**
 * ASTRA Shield — Health Check
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'healthy',
    service: 'ASTRA Shield',
    version: '${VERSION}',
    timestamp: Date.now(),
    endpoints: { verify: '/api/astra/verify', challengeVerify: '/api/astra/challenge-verify', health: '/api/astra/health' },
  });
}
`;
}

/**
 * Generate vercel.json for SPA + API routing
 */
function generateVercelJson() {
  return JSON.stringify({
    buildCommand: "pnpm build",
    outputDirectory: "dist",
    rewrites: [
      { source: "/api/(.*)", destination: "/api/$1" },
      { source: "/(.*)", destination: "/index.html" }
    ]
  }, null, 2);
}

/**
 * Generate ASTRA CSS (toast animations, etc.)
 */
function generateAstraCss() {
  return `/* ASTRA Shield — UI Styles */
@keyframes astra-slide-in {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
.astra-toast { animation: astra-slide-in 0.3s ease-out forwards; }

@keyframes astra-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
.astra-pulsing { animation: astra-pulse 2s ease-in-out infinite; }

.astra-glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}
`;
}

// ─── Commands ─────────────────────────────────────────────

async function cmdHelp() {
  console.log(logo());
  console.log(`${C.bold}USAGE:${C.reset}`);
  console.log(`  astra [command] [options]`);
  console.log();
  console.log(`${C.bold}COMMANDS:${C.reset}`);
  console.log();
  console.log(`  ${C.green}add${C.reset}        Add ASTRA Shield to the current project (full integration)`);
  console.log(`  ${C.green}list${C.reset}       List all apps connected to ASTRA`);
  console.log(`  ${C.green}remove${C.reset}     Remove an app from ASTRA security`);
  console.log(`  ${C.green}configure${C.reset}  Configure ASTRA settings (theme, API key, etc.)`);
  console.log(`  ${C.green}status${C.reset}     Check ASTRA integration status of current directory`);
  console.log(`  ${C.green}init${C.reset}       Initialize ASTRA in a new project (installs + adds)`);
  console.log(`  ${C.green}dashboard${C.reset}  Launch the local analytics dashboard (localhost:3000)`);
  console.log(`  ${C.green}doctor${C.reset}     Diagnose common issues`);
  console.log(`  ${C.green}version${C.reset}    Show ASTRA version`);
  console.log(`  ${C.green}help${C.reset}       Show this help message`);
  console.log();
  console.log(`${C.bold}EXAMPLES:${C.reset}`);
  console.log(`  ${C.dim}astra add${C.reset}                    Add current project to ASTRA`);
  console.log(`  ${C.dim}astra add /path/to/project${C.reset}   Add specific project`);
  console.log(`  ${C.dim}astra dashboard${C.reset}              Open analytics dashboard`);
  console.log(`  ${C.dim}astra list${C.reset}                   List all protected apps`);
  console.log(`  ${C.dim}astra configure${C.reset}              Open settings`);
  console.log(`  ${C.dim}astra init${C.reset}                   Scaffold ASTRA in a new project`);
  console.log();
}

async function cmdAdd(targetPath) {
  const projectDir = targetPath ? path.resolve(targetPath) : process.cwd();
  const projectName = path.basename(projectDir);

  if (!fs.existsSync(projectDir)) {
    console.log(`${C.red}✗${C.reset} Directory not found: ${projectDir}`);
    return;
  }

  console.log(logo());
  console.log(`${C.green}${C.bold}Adding ASTRA Shield to "${projectName}"${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);

  // Check if already added
  const appsData = loadApps();
  const existing = appsData.apps.find(a => a.path === projectDir);
  if (existing) {
    console.log(`${C.yellow}!${C.reset} Project already added: ${C.bold}${existing.name}${C.reset} (${existing.addedAt})`);
    console.log(`${C.dim}  Run \`astra remove ${existing.name}\` first, or use \`astra add\` with --force${C.reset}`);
    return;
  }

  // Detect framework
  const fw = detectFramework(projectDir);
  if (!fw) {
    console.log(`${C.red}✗${C.reset} No package.json found. Is this a valid project?`);
    return;
  }
  console.log(`${C.dim}Framework detected: ${C.cyan}${fw.name}${C.dim}${fw.type ? ' (' + fw.type + ')' : ''}${C.reset}`);
  console.log();

  const astraConfig = loadConfig();

  // ─── Step 1: Copy ASTRA source files ──────────────────
  step(1, 'Copying ASTRA source files...');
  const astraSourceDir = path.join(ASTRA_ROOT, 'src');
  const astraTargetDir = path.join(projectDir, 'astra');

  if (!fs.existsSync(astraSourceDir)) {
    // Fallback: try to clone from GitHub
    console.log(`${C.dim}  ASTRA source not found locally, cloning from GitHub...${C.reset}`);
    const tmpDir = path.join(os.tmpdir(), 'astra-source-' + Date.now());
    try {
      execSync(`gh repo clone snarsnat/Astra ${tmpDir} -- --depth 1 2>&1`, { stdio: 'pipe' });
      const clonedSource = path.join(tmpDir, 'src');
      if (fs.existsSync(clonedSource)) {
        fs.cpSync(clonedSource, astraTargetDir, { recursive: true });
        fs.cpSync(path.join(tmpDir, 'ui-challenges'), path.join(projectDir, 'ui-challenges'), { recursive: true });
        ok('ASTRA source files cloned and copied');
      } else {
        err('Could not find src in cloned repo');
        return;
      }
    } catch (e) {
      err('Failed to clone ASTRA repo. Make sure you have gh CLI installed.');
      warn('Alternatively, clone manually: gh repo clone snarsnat/Astra');
      return;
    }
  } else {
    try {
      fs.cpSync(astraSourceDir, astraTargetDir, { recursive: true });
      // Copy UI challenges too
      const uiSrc = path.join(ASTRA_ROOT, 'ui-challenges');
      if (fs.existsSync(uiSrc)) {
        fs.cpSync(uiSrc, path.join(projectDir, 'ui-challenges'), { recursive: true });
      }
      ok('ASTRA source files copied');
    } catch (err) {
      err(`Failed to copy ASTRA files: ${err.message}`);
      return;
    }
  }
  console.log();

  // ─── Step 2: Add astra-shield dependency ──────────────
  step(2, 'Adding astra-shield to package.json...');
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg.dependencies) pkg.dependencies = {};

    // Detect whether we're running from a published npm install or local source.
    // If the CLI lives inside a node_modules tree, use the package version.
    // If running from source checkout, fall back to a local file reference.
    let depVersion = 'latest';
    try {
      const ownPkgPath = path.join(ASTRA_ROOT, 'package.json');
      if (fs.existsSync(ownPkgPath)) {
        const ownPkg = JSON.parse(fs.readFileSync(ownPkgPath, 'utf8'));
        const inNodeModules = ASTRA_ROOT.includes('node_modules');
        depVersion = inNodeModules ? `^${ownPkg.version}` : `file:${ASTRA_ROOT}`;
      }
    } catch { /* keep 'latest' */ }

    pkg.dependencies['astra-shield'] = depVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    ok(`Added astra-shield@${depVersion} to package.json`);
  }
  console.log();

  // ─── Step 3: Install dependencies ─────────────────────
  step(3, 'Installing dependencies...');
  const usesPnpm = fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'));
  const usesYarn = fs.existsSync(path.join(projectDir, 'yarn.lock'));
  const installCmd = usesPnpm ? 'pnpm install' : usesYarn ? 'yarn install' : 'npm install';
  console.log(`${C.dim}  Running: ${installCmd}${C.reset}`);
  try {
    execSync(installCmd, { cwd: projectDir, stdio: 'inherit' });
    ok('Dependencies installed');
  } catch (err) {
    warn(`${installCmd} had issues — run it manually in ${projectDir}`);
  }
  console.log();

  // ─── Step 4: Create Vercel API routes ─────────────────
  step(4, 'Creating Vercel serverless API routes...');
  const apiDir = path.join(projectDir, 'api', 'astra');
  fs.mkdirSync(apiDir, { recursive: true });

  fs.writeFileSync(path.join(apiDir, 'verify.ts'), generateVerifyTs());
  ok('Created api/astra/verify.ts');

  fs.writeFileSync(path.join(apiDir, 'challenge-verify.ts'), generateChallengeVerifyTs());
  ok('Created api/astra/challenge-verify.ts');

  fs.writeFileSync(path.join(apiDir, 'health.ts'), generateHealthTs());
  ok('Created api/astra/health.ts');
  console.log();

  // ─── Step 5: Install @vercel/node ─────────────────────
  step(5, 'Installing @vercel/node for TypeScript API routes...');
  const vercelDevCmd = usesPnpm ? 'pnpm add -D @vercel/node' : usesYarn ? 'yarn add -D @vercel/node' : 'npm install -D @vercel/node';
  try {
    execSync(vercelDevCmd, { cwd: projectDir, stdio: 'pipe' });
    ok('@vercel/node installed');
  } catch (err) {
    warn('Could not auto-install @vercel/node — run manually: ' + vercelDevCmd);
  }
  console.log();

  // ─── Step 6: Create vercel.json ───────────────────────
  step(6, 'Creating vercel.json for API + SPA routing...');
  const vercelJsonPath = path.join(projectDir, 'vercel.json');
  if (!fs.existsSync(vercelJsonPath)) {
    fs.writeFileSync(vercelJsonPath, generateVercelJson());
    ok('Created vercel.json');
  } else {
    // Merge rewrites into existing vercel.json
    try {
      const existingVercel = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
      if (!existingVercel.rewrites) existingVercel.rewrites = [];
      // Only add if not already present
      if (!existingVercel.rewrites.some(r => r.source?.includes('/api/'))) {
        existingVercel.rewrites.unshift(
          { source: "/api/(.*)", destination: "/api/$1" },
          { source: "/(.*)", destination: "/index.html" }
        );
      }
      fs.writeFileSync(vercelJsonPath, JSON.stringify(existingVercel, null, 2));
      ok('Updated existing vercel.json');
    } catch (e) {
      warn('Could not parse existing vercel.json — leaving as-is');
    }
  }
  console.log();

  // ─── Step 7: Create ASTRA CSS ─────────────────────────
  step(7, 'Adding ASTRA UI styles...');
  const cssPath = path.join(projectDir, 'src', 'astra.css');
  if (fs.existsSync(path.join(projectDir, 'src'))) {
    fs.writeFileSync(cssPath, generateAstraCss());
    ok('Created src/astra.css');
  } else {
    // For Next.js or other frameworks, create at root
    fs.writeFileSync(path.join(projectDir, 'astra.css'), generateAstraCss());
    ok('Created astra.css');
  }
  console.log();

  // ─── Step 8: Wire up the entry point ──────────────────
  step(8, 'Wiring up ASTRA Shield in your entry point...');

  if (fw.name === 'vite-react' && fw.entryFile) {
    // Read current entry point
    let entryContent = fs.readFileSync(fw.entryFile, 'utf8');

    // Check if ASTRA is already imported
    if (entryContent.includes('ASTRAShield') || entryContent.includes('astra/index')) {
      warn('Entry point already has ASTRA import — skipping');
    } else {
      // Build the shield initialization block
      const shieldBlock = `
// ASTRA Security — behavioral bot detection & human verification
import { ASTRAShield } from '../astra/index.js'

export const shield = new ASTRAShield({
  endpoint: '/api/astra/verify',
  theme: '${astraConfig.theme || 'auto'}',
  debug: ${astraConfig.debug !== undefined ? astraConfig.debug : 'true'},
  sessionDuration: ${astraConfig.sessionDuration || 1800000},
  mutationInterval: ${astraConfig.mutationInterval || 3600000},
})

shield.on('ready', () => console.log('[ASTRA] 🛡️ Shield initialized'))
shield.on('success', (data) => console.log('[ASTRA] ✅ Verified:', data.tier))
shield.on('blocked', (data) => console.log('[ASTRA] 🚫 Blocked:', data.reason))
shield.on('challenge', (data) => console.log('[ASTRA] 🔒 Challenge:', data.tier))
shield.on('tierChange', (data) => console.log('[ASTRA] 📊 Tier changed:', data.tier, 'OOS:', data.oosScore))
shield.on('error', (data) => console.error('[ASTRA] ❌ Error:', data))
`;

      // Insert the shield block before the createRoot/render call
      const renderMatch = entryContent.match(/(createRoot\(|ReactDOM\.render\()/);
      if (renderMatch) {
        entryContent = entryContent.replace(renderMatch[0], shieldBlock + '\n' + renderMatch[0]);
        fs.writeFileSync(fw.entryFile, entryContent);
        ok(`Updated ${path.relative(projectDir, fw.entryFile)}`);
      } else {
        // Append at the end
        entryContent += shieldBlock;
        fs.writeFileSync(fw.entryFile, entryContent);
        ok(`Appended shield to ${path.relative(projectDir, fw.entryFile)}`);
      }
    }

    // Create useAstra.ts hook for easy usage in components
    const hookPath = path.join(projectDir, 'src', 'hooks', 'useAstra.ts');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, `/**
 * useAstra — React hook for ASTRA Shield protection
 *
 * Usage:
 *   const { protect, verify } = useAstra();
 *   const result = await protect('checkout', { item: 'hoodie' });
 */

import { shield } from '../main';

export function useAstra() {
  return {
    /** Protect a sensitive action (checkout, login, signup, etc.) */
    async protect(action: string, context?: Record<string, unknown>) {
      return await shield.protect(action, context);
    },

    /** Manually trigger verification */
    async verify() {
      return await shield.verify();
    },

    /** Access the raw shield instance */
    shield,
  };
}
`);
    ok('Created src/hooks/useAstra.ts');

    // Create example component showing how to use it
    const exampleComponent = `/**
 * AstraProtectedButton — Wraps any button with ASTRA Shield verification
 *
 * Usage:
 *   <AstraProtectedButton action="checkout" context={{ item: 'hoodie' }}>
 *     <button>Buy Now</button>
 *   </AstraProtectedButton>
 */

import { useState, ReactNode } from 'react';
import { shield } from '../main';

interface Props {
  action: string;
  context?: Record<string, unknown>;
  children: ReactNode;
  onVerified?: () => void;
}

export function AstraProtectedButton({ action, context, children, onVerified }: Props) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'verified' | 'blocked'>('idle');
  const [message, setMessage] = useState('');

  const handleClick = async () => {
    setStatus('checking');
    setMessage('ASTRA verifying...');
    try {
      const result = await shield.protect(action, context || {});
      if (result.success) {
        setStatus('verified');
        setMessage(\`✅ Verified — Tier \${result.tier}\`);
        setTimeout(() => { setStatus('idle'); setMessage(''); }, 2000);
        onVerified?.();
      } else if (result.blocked) {
        setStatus('blocked');
        setMessage(\`🚫 Blocked: \${result.reason}\`);
        setTimeout(() => { setStatus('idle'); setMessage(''); }, 5000);
      } else {
        setStatus('idle');
        setMessage(\`🔒 \${result.reason || 'Additional verification needed'}\`);
      }
    } catch (err) {
      setStatus('idle');
      console.error('[ASTRA] Protection error:', err);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={status === 'checking'}
        style={{ opacity: status === 'checking' ? 0.5 : 1, cursor: status === 'checking' ? 'not-allowed' : 'pointer' }}
      >
        {children}
      </button>
      {message && (
        <span className="astra-toast" style={{
          fontSize: 12,
          padding: '4px 8px',
          borderRadius: 6,
          background: status === 'verified' ? '#22c55e22' : status === 'blocked' ? '#ef444422' : '#eab30822',
          color: status === 'verified' ? '#4ade80' : status === 'blocked' ? '#f87171' : '#fbbf24',
          border: \`1px solid \${status === 'verified' ? '#22c55e44' : status === 'blocked' ? '#ef444444' : '#eab30844'}\`,
        }}>
          {message}
        </span>
      )}
    </div>
  );
}
`;

    const compPath = path.join(projectDir, 'src', 'components', 'AstraProtectedButton.tsx');
    fs.mkdirSync(path.dirname(compPath), { recursive: true });
    fs.writeFileSync(compPath, exampleComponent);
    ok('Created src/components/AstraProtectedButton.tsx');

  } else if (fw.name === 'nextjs') {
    const providerPath = path.join(projectDir, 'src', 'lib', 'astra.ts');
    fs.mkdirSync(path.dirname(providerPath), { recursive: true });

    const providerCode = `/**
 * ASTRA Shield — Next.js client module
 * Use in client components only ("use client").
 */

'use client';

import { ASTRAShield } from '../../astra/index.js';

export const shield = new ASTRAShield({
  endpoint: '/api/astra/verify',
  theme: 'auto',
  debug: true,
  sessionDuration: 1800000,
  mutationInterval: 3600000,
});

shield.on('ready', () => console.log('[ASTRA] Shield initialized'));
shield.on('success', (data: any) => console.log('[ASTRA] Verified:', data.tier));
shield.on('blocked', (data: any) => console.log('[ASTRA] Blocked:', data.reason));

export function useAstra() {
  return {
    async protect(action: string, context?: Record<string, unknown>) {
      return await shield.protect(action, context);
    },
    async verify() {
      return await shield.verify();
    },
    shield,
  };
}
`;
    fs.writeFileSync(providerPath, providerCode);
    ok('Created src/lib/astra.ts (Next.js client module)');

  } else if (fw.name === 'vue' || fw.name === 'vite-vue' || fw.name === 'nuxt') {
    const libDir = path.join(projectDir, 'src', 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    const pluginPath = path.join(libDir, 'astra.ts');
    const pluginCode = `/**
 * ASTRA Shield — Vue 3 plugin
 * Register in main.ts: app.use(AstraPlugin)
 * Access in components: const astra = inject('astra')
 */

import type { App } from 'vue';
import { ASTRAShield } from '../../astra/index.js';

export const shield = new ASTRAShield({
  endpoint: '/api/astra/verify',
  theme: 'auto',
  debug: true,
  sessionDuration: 1800000,
  mutationInterval: 3600000,
});

shield.on('ready', () => console.log('[ASTRA] Shield initialized'));
shield.on('success', (data: any) => console.log('[ASTRA] Verified:', data.tier));
shield.on('blocked', (data: any) => console.log('[ASTRA] Blocked:', data.reason));

export const AstraPlugin = {
  install(app: App) {
    app.provide('astra', {
      protect: (action: string, ctx?: Record<string, unknown>) => shield.protect(action, ctx),
      verify: () => shield.verify(),
      shield,
    });
    app.config.globalProperties.$astra = shield;
  }
};

export default AstraPlugin;
`;
    fs.writeFileSync(pluginPath, pluginCode);
    ok('Created src/lib/astra.ts (Vue 3 plugin)');

    if (fw.entryFile && fs.existsSync(fw.entryFile)) {
      let entry = fs.readFileSync(fw.entryFile, 'utf8');
      if (!entry.includes('AstraPlugin') && !entry.includes("from './lib/astra'")) {
        const importLine = "import AstraPlugin from './lib/astra'\n";
        const useLine = /\.mount\(/.test(entry)
          ? entry.replace(/(createApp\([^)]+\))/, "$1.use(AstraPlugin)")
          : entry + "\n// app.use(AstraPlugin)\n";
        fs.writeFileSync(fw.entryFile, importLine + useLine);
        ok(`Wired AstraPlugin into ${path.relative(projectDir, fw.entryFile)}`);
      } else {
        warn('Entry point already references AstraPlugin — skipping');
      }
    }

  } else if (fw.name === 'angular') {
    const libDir = path.join(projectDir, 'src', 'app');
    fs.mkdirSync(libDir, { recursive: true });
    const svcPath = path.join(libDir, 'astra.service.ts');
    const svcCode = `/**
 * ASTRA Shield — Angular service
 * Provide in root: @Injectable({ providedIn: 'root' })
 * Inject in components: constructor(private astra: AstraService) {}
 */

import { Injectable } from '@angular/core';
import { ASTRAShield } from '../../astra/index.js';

@Injectable({ providedIn: 'root' })
export class AstraService {
  private shield = new ASTRAShield({
    endpoint: '/api/astra/verify',
    theme: 'auto',
    debug: true,
    sessionDuration: 1800000,
    mutationInterval: 3600000,
  });

  constructor() {
    this.shield.on('ready', () => console.log('[ASTRA] Shield initialized'));
    this.shield.on('success', (d: any) => console.log('[ASTRA] Verified:', d.tier));
    this.shield.on('blocked', (d: any) => console.log('[ASTRA] Blocked:', d.reason));
  }

  protect(action: string, context?: Record<string, unknown>) {
    return this.shield.protect(action, context);
  }

  verify() {
    return this.shield.verify();
  }

  instance() {
    return this.shield;
  }
}
`;
    fs.writeFileSync(svcPath, svcCode);
    ok('Created src/app/astra.service.ts (Angular service)');

  } else if (fw.name === 'express') {
    const middlewarePath = path.join(projectDir, 'astra-middleware.js');
    const mwCode = `/**
 * ASTRA Shield — Express middleware
 * Usage:
 *   import { astraMiddleware } from './astra-middleware.js'
 *   app.use(astraMiddleware())
 * Then mount the client bundle to serve /astra/index.js + ui-challenges/.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function astraMiddleware(options = {}) {
  const clientDir = options.clientDir || path.join(__dirname, 'astra');
  const uiDir = options.uiDir || path.join(__dirname, 'ui-challenges');

  return function astra(req, res, next) {
    if (req.path.startsWith('/astra/')) {
      const file = path.join(clientDir, req.path.replace('/astra/', ''));
      if (fs.existsSync(file)) return res.sendFile(file);
    }
    if (req.path.startsWith('/ui-challenges/')) {
      const file = path.join(uiDir, req.path.replace('/ui-challenges/', ''));
      if (fs.existsSync(file)) return res.sendFile(file);
    }
    next();
  };
}
`;
    fs.writeFileSync(middlewarePath, mwCode);
    ok('Created astra-middleware.js (Express)');

    if (fw.entryFile && fs.existsSync(fw.entryFile)) {
      let entry = fs.readFileSync(fw.entryFile, 'utf8');
      if (!entry.includes('astraMiddleware')) {
        const hint = `\n// ASTRA Shield middleware\n// import { astraMiddleware } from './astra-middleware.js'\n// app.use(astraMiddleware())\n`;
        fs.writeFileSync(fw.entryFile, entry + hint);
        ok(`Added ASTRA hint to ${path.relative(projectDir, fw.entryFile)}`);
      }
    }

  } else if (fw.name === 'static') {
    const htmlPath = path.join(projectDir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      if (!html.includes('astra/index.js') && !html.includes('ASTRAShield')) {
        const snippet = `\n  <script type="module">
    import { ASTRAShield } from './astra/index.js';
    const shield = new ASTRAShield({
      endpoint: '/api/astra/verify',
      theme: 'auto',
      debug: true,
    });
    shield.on('ready', () => console.log('[ASTRA] Shield initialized'));
    shield.on('success', (d) => console.log('[ASTRA] Verified:', d.tier));
    shield.on('blocked', (d) => console.log('[ASTRA] Blocked:', d.reason));
    window.astra = shield;
  </script>\n`;
        if (html.includes('</body>')) {
          html = html.replace('</body>', snippet + '</body>');
        } else {
          html += snippet;
        }
        fs.writeFileSync(htmlPath, html);
        ok('Injected ASTRA bootstrap script into index.html');
      } else {
        warn('index.html already references ASTRA — skipping');
      }
    } else {
      warn('No index.html found — create one and import ./astra/index.js');
    }
  }
  console.log();

  // ─── Step 9: Create astra.config.json ─────────────────
  step(9, 'Creating astra.config.json...');
  const projectConfigPath = path.join(projectDir, 'astra.config.json');
  if (!fs.existsSync(projectConfigPath)) {
    const projectConfig = {
      name: projectName,
      version: VERSION,
      apiKey: astraConfig.apiKey || '',
      endpoint: '/api/astra/verify',
      theme: astraConfig.theme || 'auto',
      debug: astraConfig.debug !== undefined ? astraConfig.debug : true,
      sessionDuration: astraConfig.sessionDuration || 1800000,
      mutationInterval: astraConfig.mutationInterval || 3600000,
      tiers: {
        enabled: true,
        levels: ['ghost', 'whisper', 'nudge', 'pause', 'gate']
      }
    };
    fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2));
    ok('Created astra.config.json');
  } else {
    warn('astra.config.json already exists — skipping');
  }
  console.log();

  // ─── Step 10: Create astra-setup.js ───────────────────
  step(10, 'Creating astra-setup.js...');
  const setupFilePath = path.join(projectDir, 'astra-setup.js');
  if (!fs.existsSync(setupFilePath)) {
    const themeVal = astraConfig.theme || 'auto';
    const debugVal = astraConfig.debug !== undefined ? astraConfig.debug : true;
    const setupCode = `// ASTRA Shield — Quick Setup
// Import and initialize the full ASTRA security system
// This includes: behavioral tracking, OOS scoring, tier engine,
// challenge UIs (Pulse, Tilt, Flick, Breath), and the trust badge.

import { ASTRAShield } from 'astra-shield';

const shield = new ASTRAShield({
  apiKey: '${astraConfig.apiKey || ''}',
  endpoint: '/api/astra/verify',
  theme: '${themeVal}',
  debug: ${debugVal},
  sessionDuration: ${astraConfig.sessionDuration || 1800000},
  mutationInterval: ${astraConfig.mutationInterval || 3600000},
  showBadge: true,  // Set false to hide "Protected by ASTRA" badge
});

// Event listeners
shield.on('ready', () => console.log('[ASTRA] Shield initialized — tracking behavior'));
shield.on('tierChange', (data) => console.log('[ASTRA] Tier changed to:', data.tier));
shield.on('challenge', (data) => console.log('[ASTRA] Challenge started:', data.type));
shield.on('success', (data) => console.log('[ASTRA] Verification passed — tier:', data.tier));
shield.on('blocked', (data) => console.log('[ASTRA] Blocked:', data.reason));

// Protect sensitive actions:
//   const result = await shield.protect('login', { userId: '123' });
//   if (result.success) { /* proceed */ }

export { shield };
`;
    fs.writeFileSync(setupFilePath, setupCode);
    ok('Created astra-setup.js');
  }
  console.log();

  // ─── Step 11: Add to apps registry ────────────────────
  step(11, 'Registering app in ASTRA...');
  appsData.apps.push({
    name: projectName,
    path: projectDir,
    addedAt: new Date().toISOString().split('T')[0],
    framework: fw.name + (fw.type ? ` (${fw.type})` : ''),
    config: projectConfigPath,
    status: 'active'
  });
  saveApps(appsData);
  ok(`${projectName} registered`);
  console.log();

  // ─── Step 12: Stage and commit ────────────────────────
  step(12, 'Committing changes to git...');
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: projectDir, stdio: 'pipe' });

    // Build the list of files to stage
    const filesToStage = [
      'astra.config.json', 'astra-setup.js', 'package.json', 'package-lock.json',
      'pnpm-lock.yaml', 'yarn.lock', 'astra/', 'api/', 'vercel.json', '.gitignore'
    ].filter(f => fs.existsSync(path.join(projectDir, f)));

    // Always add src/ if it exists
    if (fs.existsSync(path.join(projectDir, 'src'))) {
      filesToStage.push('src/');
    }

    execSync(`git add ${filesToStage.join(' ')}`, { cwd: projectDir, stdio: 'pipe' });

    const status = execSync('git status --porcelain', { cwd: projectDir, stdio: 'pipe' }).toString();
    if (status.trim()) {
      execSync('git commit -m "chore: integrate ASTRA Shield security system"', { cwd: projectDir, stdio: 'pipe' });
      ok('Changes committed to git');
      console.log(`${C.dim}  You can now run: git push${C.reset}`);
    } else {
      warn('No new changes to commit — files may already be tracked');
    }
  } catch (err) {
    const errMsg = err.stderr ? err.stderr.toString() : '';
    const outMsg = err.stdout ? err.stdout.toString() : '';
    const combined = errMsg + outMsg;

    if (combined.includes('nothing to commit') || combined.includes('no changes added to commit')) {
      warn('No changes to commit — check git status');
    } else if (combined.includes('not a git repository')) {
      warn('Not a git repository — initialize with git init');
    } else {
      warn('Git commit failed — commit manually:');
      console.log(`${C.dim}  cd ${projectDir}${C.reset}`);
      console.log(`${C.dim}  git add -A && git commit -m "chore: integrate ASTRA Shield"${C.reset}`);
    }
  }
  console.log();

  // ─── Done ─────────────────────────────────────────────
  console.log(`${C.green}${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.green}${C.bold}║  ✓ "${projectName}" is now protected by ASTRA Shield    ║${C.reset}`);
  console.log(`${C.green}${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log();
  console.log(`${C.bold}What was created:${C.reset}`);
  console.log(`  ${C.green}✓${C.reset} astra/              — Client-side shield (behavioral tracking, challenges)`);
  console.log(`  ${C.green}✓${C.reset} api/astra/verify.ts  — Backend verification endpoint (risk analysis)`);
  console.log(`  ${C.green}✓${C.reset} api/astra/challenge-verify.ts — Challenge solution validator`);
  console.log(`  ${C.green}✓${C.reset} api/astra/health.ts  — Health check endpoint`);
  console.log(`  ${C.green}✓${C.reset} vercel.json          — API + SPA routing config`);
  console.log(`  ${C.green}✓${C.reset} astra.config.json    — Project configuration`);
  console.log(`  ${C.green}✓${C.reset} astra-setup.js       — Quick reference for setup`);
  console.log();
  console.log(`${C.bold}How to use in your code:${C.reset}`);
  console.log(`  ${C.dim}// Import the shield from your entry point${C.reset}`);
  console.log(`  ${C.dim}import { shield } from './main'${C.reset}`);
  console.log();
  console.log(`  ${C.dim}// Or use the React hook${C.reset}`);
  console.log(`  ${C.dim}import { useAstra } from './hooks/useAstra'${C.reset}`);
  console.log(`  ${C.dim}const { protect } = useAstra()${C.reset}`);
  console.log();
  console.log(`  ${C.dim}// Protect any action${C.reset}`);
  console.log(`  ${C.dim}const result = await protect('checkout', { item: 'hoodie' })${C.reset}`);
  console.log(`  ${C.dim}if (result.success) { /* proceed */ }${C.reset}`);
  console.log();
  console.log(`${C.dim}  Use \`astra list\` to see all protected apps${C.reset}`);
}

async function cmdList() {
  const appsData = loadApps();
  console.log(`${C.green}${C.bold}ASTRA Protected Apps${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  if (appsData.apps.length === 0) {
    console.log();
    console.log(`${C.yellow}No apps added yet.${C.reset}`);
    console.log(`${C.dim}Run \`astra add\` to protect your first app.${C.reset}`);
    return;
  }
  console.log();
  appsData.apps.forEach((app, i) => {
    const num = `${C.green}${String(i + 1).padStart(2)}${C.reset}`;
    const name = `${C.bold}${app.name}${C.reset}`;
    const fw = app.framework ? ` ${C.dim}(${app.framework})${C.reset}` : '';
    const path_ = `${C.dim}${app.path}${C.reset}`;
    const date = `${C.gray}${app.addedAt}${C.reset}`;
    const status = app.status === 'active' ? `${C.green}● active${C.reset}` : `${C.red}● inactive${C.reset}`;
    console.log(`  ${num} ${name}${fw}`);
    console.log(`     ${path_}`);
    console.log(`     ${date}  ${status}`);
    console.log();
  });
  console.log(`${C.dim}  Total: ${appsData.apps.length} app(s)${C.reset}`);
}

async function cmdRemove(appName) {
  const projectDir = process.cwd();
  const appsData = loadApps();
  let targetApp;
  if (appName) {
    targetApp = appsData.apps.find(a => a.name.toLowerCase() === appName.toLowerCase());
  } else {
    targetApp = appsData.apps.find(a => a.path === projectDir);
  }
  if (!targetApp) {
    console.log(`${C.yellow}!${C.reset} Current directory is not registered with ASTRA`);
    if (appsData.apps.length > 0) {
      console.log(`${C.dim}Registered apps:${C.reset}`);
      appsData.apps.forEach(a => console.log(`  ${C.cyan}${a.name}${C.reset} — ${C.dim}${a.path}${C.reset}`));
      console.log(`${C.dim}Use \`astra remove <app-name>\` to remove a specific app${C.reset}`);
    }
    return;
  }
  console.log(`${C.red}${C.bold}Removing ASTRA Shield from "${targetApp.name}"...${C.reset}`);
  const answer = await prompt(`This will remove all ASTRA files from ${C.bold}${targetApp.path}${C.reset}. Continue? (y/N)`);
  if (answer.toLowerCase() !== 'y') { console.log(`${C.dim}Cancelled.${C.reset}`); return; }

  const configPath = path.join(targetApp.path, 'astra.config.json');
  if (fs.existsSync(configPath)) { fs.unlinkSync(configPath); ok('Removed astra.config.json'); }
  const setupPath = path.join(targetApp.path, 'astra-setup.js');
  if (fs.existsSync(setupPath)) { fs.unlinkSync(setupPath); ok('Removed astra-setup.js'); }
  const astraDir = path.join(targetApp.path, 'astra');
  if (fs.existsSync(astraDir)) { fs.rmSync(astraDir, { recursive: true, force: true }); ok('Removed astra/ directory'); }
  const apiDir = path.join(targetApp.path, 'api', 'astra');
  if (fs.existsSync(apiDir)) { fs.rmSync(apiDir, { recursive: true, force: true }); ok('Removed api/astra/ directory'); }

  const pkgPath = path.join(targetApp.path, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.dependencies?.['astra-shield']) { delete pkg.dependencies['astra-shield']; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2)); ok('Removed astra-shield from package.json'); }
  }

  appsData.apps = appsData.apps.filter(a => a.path !== targetApp.path);
  saveApps(appsData);
  console.log();
  console.log(`${C.green}${C.bold}✓ ASTRA Shield fully removed from "${targetApp.name}"${C.reset}`);
}

async function cmdConfigure() {
  const config = loadConfig();
  console.log(`${C.green}${C.bold}ASTRA Configuration${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  console.log();
  console.log(`  ${C.bold}Current Settings:${C.reset}`);
  console.log(`  Theme:             ${C.cyan}${config.theme}${C.reset}`);
  console.log(`  Debug:             ${C.cyan}${config.debug}${C.reset}`);
  console.log(`  API Key:           ${C.cyan}${config.apiKey ? config.apiKey.substring(0, 20) + '...' : '(not set)'}${C.reset}`);
  console.log(`  Session Duration:  ${C.cyan}${(config.sessionDuration / 1000 / 60).toFixed(0)} minutes${C.reset}`);
  console.log(`  Mutation Interval: ${C.cyan}${(config.mutationInterval / 1000 / 60).toFixed(0)} minutes${C.reset}`);
  console.log();
  console.log(`${C.dim}(Press Enter to keep current value)${C.reset}`);
  console.log();

  const theme = await prompt(`Theme? (auto/light/dark) [${config.theme}]`);
  const debugStr = await prompt(`Debug mode? (true/false) [${config.debug}]`);
  const apiKey = await prompt(`API Key? [${config.apiKey ? '(hidden)' : '(empty)'}]`);
  const sessionDurStr = await prompt(`Session duration (minutes)? [${config.sessionDuration / 1000 / 60}]`);
  const mutationIntStr = await prompt(`Mutation interval (minutes)? [${config.mutationInterval / 1000 / 60}]`);

  if (theme && ['auto', 'light', 'dark'].includes(theme)) config.theme = theme;
  if (debugStr && ['true', 'false'].includes(debugStr)) config.debug = debugStr === 'true';
  if (apiKey) config.apiKey = apiKey;
  if (sessionDurStr) config.sessionDuration = parseInt(sessionDurStr, 10) * 60 * 1000;
  if (mutationIntStr) config.mutationInterval = parseInt(mutationIntStr, 10) * 60 * 1000;

  saveConfig(config);
  console.log();
  console.log(`${C.green}${C.bold}✓ Configuration saved${C.reset}`);
}

async function cmdStatus() {
  const projectDir = process.cwd();
  const projectName = path.basename(projectDir);
  console.log(`${C.green}${C.bold}ASTRA Status — ${projectName}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  console.log();

  const checks = [];
  const configFile = path.join(projectDir, 'astra.config.json');
  checks.push(['astra.config.json', fs.existsSync(configFile)]);
  const setupFile = path.join(projectDir, 'astra-setup.js');
  checks.push(['astra-setup.js', fs.existsSync(setupFile)]);
  const astraDir = path.join(projectDir, 'astra');
  checks.push(['astra/ directory', fs.existsSync(astraDir)]);
  const apiDir = path.join(projectDir, 'api', 'astra');
  checks.push(['api/astra/ routes', fs.existsSync(apiDir)]);
  const vercelJson = path.join(projectDir, 'vercel.json');
  checks.push(['vercel.json', fs.existsSync(vercelJson)]);
  const nodeModules = path.join(projectDir, 'node_modules', 'astra-shield');
  checks.push(['npm package', fs.existsSync(nodeModules)]);
  const appsData = loadApps();
  const registered = appsData.apps.find(a => a.path === projectDir);
  checks.push(['Registry entry', !!registered]);

  let allOk = true;
  checks.forEach(([name, ok]) => {
    const icon = ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    if (!ok) allOk = false;
    console.log(`  ${icon} ${C.reset}${name.padEnd(25)} ${ok ? C.green + 'found' : C.red + 'missing'}`);
  });

  console.log();
  if (allOk) {
    console.log(`${C.green}${C.bold}  ✓ ASTRA Shield is fully integrated${C.reset}`);
  } else {
    console.log(`${C.yellow}${C.bold}  ! ASTRA Shield is partially integrated${C.reset}`);
    console.log(`${C.dim}  Run \`astra add\` to complete setup${C.reset}`);
  }
}

async function cmdInit() {
  const projectDir = process.cwd();
  const projectName = path.basename(projectDir);
  console.log(`${C.green}${C.bold}Initializing ASTRA Shield in ${projectName}...${C.reset}`);
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log(`${C.red}✗${C.reset} No package.json found. Is this a valid project?`);
    return;
  }
  await cmdAdd(projectDir);
}

async function cmdDoctor() {
  const projectDir = process.cwd();
  const config = loadConfig();
  const appsData = loadApps();

  console.log(`${C.green}${C.bold}ASTRA Doctor${C.reset}`);
  console.log(`${C.dim}Diagnosing common issues...${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  console.log();

  console.log(`  ${C.green}✓${C.reset} Node.js: ${C.cyan}${process.version}${C.reset}`);
  console.log(`  ${config.apiKey ? C.green + '✓' : C.yellow + '!'} ${C.reset}API key ${config.apiKey ? 'is set' : C.yellow + 'not set' + C.reset}`);
  console.log(`  ${C.green}✓${C.reset} Registered apps: ${C.cyan}${appsData.apps.length}${C.reset}`);

  const configFile = path.join(projectDir, 'astra.config.json');
  if (fs.existsSync(configFile)) {
    const projectConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (projectConfig.tiers?.enabled) console.log(`  ${C.green}✓${C.reset} Tier system enabled`);
    else console.log(`  ${C.yellow}!${C.reset} Tier system disabled`);
  } else {
    console.log(`  ${C.yellow}!${C.reset} Current project not configured — run \`astra add\``);
  }

  const apiDir = path.join(projectDir, 'api', 'astra');
  if (fs.existsSync(apiDir)) console.log(`  ${C.green}✓${C.reset} Backend API routes found`);
  else console.log(`  ${C.yellow}!${C.reset} No backend API routes — run \`astra add\` to create them`);

  console.log();
}

// astra dashboard
async function cmdDashboard(subcommand, extraArgs = []) {
  const sub = (subcommand || 'open').toLowerCase();
  const nodePath = process.env.NODE_PATH || process.execPath;
  const astraRoot = ASTRA_ROOT;
  const dashboardDir = path.join(astraRoot, 'dashboard');
  const serverDir = path.join(astraRoot, 'server');

  // Ensure dashboard files exist
  if (!fs.existsSync(dashboardDir)) {
    console.log(`${C.red}✗${C.reset} Dashboard files not found locally.`);
    console.log(`${C.dim}Cloning from GitHub...${C.reset}`);
    const tmpDir = path.join(os.tmpdir(), 'astra-dashboard-' + Date.now());
    try {
      execSync(`gh repo clone snarsnat/Astra ${tmpDir} -- --depth 1 2>&1`, { stdio: 'pipe' });
      const srcDash = path.join(tmpDir, 'dashboard');
      if (fs.existsSync(srcDash)) {
        fs.cpSync(srcDash, dashboardDir, { recursive: true });
        ok('Dashboard files downloaded');
      } else {
        err('Could not find dashboard/ in cloned repo');
        return;
      }
    } catch (e) {
      err('Failed to clone. Make sure gh CLI is installed.');
      return;
    }
  }

  const nodeBin = process.execPath; // Full path to node binary
  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  const shieldPlist = path.join(launchAgentsDir, 'com.astra.shield.plist');
  const dashboardPlist = path.join(launchAgentsDir, 'com.astra.dashboard.plist');

  function isServiceRunning(label) {
    try {
      const out = execSync(`launchctl list 2>/dev/null | grep "${label}"`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
      return out.trim().length > 0;
    } catch { return false; }
  }

  function checkEndpoint(url) {
    try {
      const out = execSync(`curl -s --connect-timeout 3 "${url}" 2>/dev/null`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
      return JSON.parse(out);
    } catch { return null; }
  }

  // ─── START ──────────────────────────────────────────
  if (sub === 'start') {
    console.log(logo());
    console.log(`${C.green}${C.bold}Starting ASTRA Dashboard & Shield${C.reset}`);
    console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
    console.log();

    // Install deps if needed
    if (!fs.existsSync(path.join(dashboardDir, 'node_modules'))) {
      step(1, 'Installing dashboard dependencies...');
      try { execSync('npm install', { cwd: dashboardDir, stdio: 'pipe' }); ok('Dashboard deps installed'); } catch { warn('Could not install dashboard deps — run npm install manually'); }
      console.log();
    }
    if (!fs.existsSync(path.join(serverDir, 'node_modules'))) {
      step(2, 'Installing shield server dependencies...');
      try { execSync('npm install', { cwd: serverDir, stdio: 'pipe' }); ok('Shield deps installed'); } catch { warn('Could not install shield deps — run npm install manually'); }
      console.log();
    }

    // Kill existing
    if (isServiceRunning('com.astra.shield')) {
      try { execSync(`launchctl unload "${shieldPlist}" 2>/dev/null`, { stdio: 'pipe' }); } catch {}
    }
    if (isServiceRunning('com.astra.dashboard')) {
      try { execSync(`launchctl unload "${dashboardPlist}" 2>/dev/null`, { stdio: 'pipe' }); } catch {}
    }

    // Ensure LaunchAgents dir exists
    if (!fs.existsSync(launchAgentsDir)) fs.mkdirSync(launchAgentsDir, { recursive: true });

    // Write shield plist
    fs.writeFileSync(shieldPlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.astra.shield</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodeBin}</string>
        <string>index.js</string>
    </array>
    <key>WorkingDirectory</key><string>${serverDir}</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/astra-shield.log</string>
    <key>StandardErrorPath</key><string>/tmp/astra-shield-error.log</string>
</dict>
</plist>`);

    // Write dashboard plist
    fs.writeFileSync(dashboardPlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.astra.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodeBin}</string>
        <string>server.js</string>
    </array>
    <key>WorkingDirectory</key><string>${dashboardDir}</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/astra-dashboard.log</string>
    <key>StandardErrorPath</key><string>/tmp/astra-dashboard-error.log</string>
</dict>
</plist>`);

    step(1, 'Loading Shield Server service...');
    try { execSync(`launchctl load "${shieldPlist}" 2>/dev/null`, { stdio: 'pipe' }); ok('Shield service loaded'); } catch { err('Failed to load shield'); }

    step(2, 'Loading Dashboard service...');
    try { execSync(`launchctl load "${dashboardPlist}" 2>/dev/null`, { stdio: 'pipe' }); ok('Dashboard service loaded'); } catch { err('Failed to load dashboard'); }

    // Wait for startup
    console.log();
    console.log(`${C.dim}Waiting for services to start...${C.reset}`);
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const shieldOk = checkEndpoint('http://127.0.0.1:3001/health');
      if (shieldOk) break;
    }

    // Open browser
    try {
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      execSync(`${openCmd} http://127.0.0.1:3000`, { stdio: 'pipe' });
    } catch {}

    // Show status
    const shieldHealth = checkEndpoint('http://127.0.0.1:3001/health');
    const dashHealth = checkEndpoint('http://127.0.0.1:3000/api/health');

    console.log();
    if (shieldHealth) {
      console.log(`${C.green}✓${C.reset} Shield Server: ${C.green}healthy${C.reset}`);
    } else {
      console.log(`${C.red}✗${C.reset} Shield Server: ${C.red}not responding${C.reset}`);
    }
    if (dashHealth) {
      const shieldStatus = dashHealth.shieldServer?.status || 'unknown';
      console.log(`${C.green}✓${C.reset} Dashboard: ${C.green}running${C.reset} | Shield: ${shieldStatus === 'healthy' ? C.green + 'connected' + C.reset : C.red + 'disconnected' + C.reset}`);
    } else {
      console.log(`${C.red}✗${C.reset} Dashboard: ${C.red}not responding${C.reset}`);
    }

    console.log();
    console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
    console.log(`  ${C.green}Dashboard:${C.reset} http://127.0.0.1:3000`);
    console.log(`  ${C.green}Shield:${C.reset}    http://127.0.0.1:3001`);
    console.log();
    console.log(`${C.dim}Services run in the background and restart on login.${C.reset}`);
    console.log(`${C.dim}Stop with: ${C.reset}${C.cyan}astra dashboard stop${C.reset}`);
    return;
  }

  // ─── STOP ───────────────────────────────────────────
  if (sub === 'stop') {
    console.log(`${C.yellow}!${C.reset} Stopping ASTRA Dashboard & Shield...`);
    let stopped = false;
    if (isServiceRunning('com.astra.shield')) {
      try { execSync(`launchctl unload "${shieldPlist}" 2>/dev/null`, { stdio: 'pipe' }); ok('Shield stopped'); stopped = true; } catch {}
    }
    if (isServiceRunning('com.astra.dashboard')) {
      try { execSync(`launchctl unload "${dashboardPlist}" 2>/dev/null`, { stdio: 'pipe' }); ok('Dashboard stopped'); stopped = true; } catch {}
    }
    if (!stopped) console.log(`${C.dim}  Services were not running${C.reset}`);
    return;
  }

  // ─── RESTART ────────────────────────────────────────
  if (sub === 'restart') {
    console.log(`${C.yellow}↻${C.reset} Restarting ASTRA services...`);
    if (isServiceRunning('com.astra.shield')) {
      try { execSync(`launchctl unload "${shieldPlist}" 2>/dev/null`, { stdio: 'pipe' }); } catch {}
    }
    if (isServiceRunning('com.astra.dashboard')) {
      try { execSync(`launchctl unload "${dashboardPlist}" 2>/dev/null`, { stdio: 'pipe' }); } catch {}
    }
    await new Promise(r => setTimeout(r, 1000));
    // Delegate to start
    return cmdDashboard('start');
  }

  // ─── STATUS ─────────────────────────────────────────
  if (sub === 'status') {
    const shieldRunning = isServiceRunning('com.astra.shield');
    const dashRunning = isServiceRunning('com.astra.dashboard');

    console.log(logo());
    console.log(`${C.bold}ASTRA Dashboard Status${C.reset}`);
    console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);

    // Service status
    console.log(`  ${C.bold}Services:${C.reset}`);
    console.log(`    Shield Server:  ${shieldRunning ? C.green + '● running' + C.reset : C.red + '○ stopped' + C.reset}`);
    console.log(`    Dashboard:      ${dashRunning ? C.green + '● running' + C.reset : C.red + '○ stopped' + C.reset}`);

    // Endpoint status
    console.log();
    console.log(`  ${C.bold}Endpoints:${C.reset}`);
    const shieldHealth = checkEndpoint('http://127.0.0.1:3001/health');
    const dashHealth = checkEndpoint('http://127.0.0.1:3000/api/health');
    console.log(`    Shield:    ${shieldHealth ? C.green + 'http://127.0.0.1:3001 — healthy' + C.reset : C.red + 'not responding' + C.reset}`);
    if (dashHealth) {
      const ss = dashHealth.shieldServer;
      console.log(`    Dashboard: ${C.green + 'http://127.0.0.1:3000 — running' + C.reset}`);
      console.log(`    Shield link: ${ss?.status === 'healthy' ? C.green + 'connected' + C.reset : C.red + 'disconnected' + C.reset}`);
      console.log(`    Apps: ${dashHealth.appsCount || 0}`);
    } else {
      console.log(`    Dashboard: ${C.red + 'not responding' + C.reset}`);
    }

    // Dashboard ID
    const idFile = path.join(os.homedir(), '.astra', 'dashboard-id.txt');
    if (fs.existsSync(idFile)) {
      const dashId = fs.readFileSync(idFile, 'utf8').trim();
      console.log(`    ID: ${C.dim}${dashId.substring(0, 40)}...${C.reset}`);
    }

    console.log();
    return;
  }

  // ─── LOGS ───────────────────────────────────────────
  if (sub === 'logs') {
    const which = extraArgs[1] || 'dashboard';
    const logFile = which === 'shield' ? '/tmp/astra-shield.log' : '/tmp/astra-dashboard.log';
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').slice(-50).join('\n');
      console.log(`${C.bold}${which} logs:${C.reset}`);
      console.log(lines);
    } else {
      console.log(`${C.dim}No logs found for ${which}${C.reset}`);
    }
    return;
  }

  // ─── OPEN (default) ─────────────────────────────────
  if (sub === 'open' || sub === '') {
    // If not running, auto-start
    if (!isServiceRunning('com.astra.shield') || !isServiceRunning('com.astra.dashboard')) {
      console.log(`${C.dim}Services not running — starting...${C.reset}`);
      return cmdDashboard('start');
    }
    // Already running — just open browser
    try {
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      execSync(`${openCmd} http://127.0.0.1:3000`, { stdio: 'pipe' });
    } catch {}
    console.log(`${C.green}✓${C.reset} Opened http://127.0.0.1:3000 in browser`);
    return;
  }

  // ─── HELP ───────────────────────────────────────────
  console.log(logo());
  console.log(`${C.bold}USAGE:${C.reset}`);
  console.log(`  astra dashboard [command]`);
  console.log();
  console.log(`${C.bold}COMMANDS:${C.reset}`);
  console.log(`  ${C.green}start${C.reset}     Start shield + dashboard as persistent background services`);
  console.log(`  ${C.green}stop${C.reset}      Stop both services`);
  console.log(`  ${C.green}restart${C.reset}   Restart both services`);
  console.log(`  ${C.green}status${C.reset}    Show running status and endpoint health`);
  console.log(`  ${C.green}logs [name]         Show recent logs (dashboard or shield)`);
  console.log(`  ${C.green}open${C.reset}      Open dashboard in browser (default)`);
  console.log();
  console.log(`${C.dim}Examples:${C.reset}`);
  console.log(`  astra dashboard          # Start + open browser`);
  console.log(`  astra dashboard start    # Start background services`);
  console.log(`  astra dashboard status   # Check if running`);
  console.log(`  astra dashboard stop     # Stop services`);
}

function cmdVersion() {
  console.log(`${C.green}${C.bold}ASTRA Shield${C.reset} v${VERSION}`);
}

// ─── Router ───────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || 'help';
const extraArgs = args.slice(1);

async function main() {
  switch (command) {
    case 'help': case undefined: await cmdHelp(); break;
    case 'add': await cmdAdd(extraArgs[0]); break;
    case 'list': await cmdList(); break;
    case 'remove': case 'rm': await cmdRemove(extraArgs[0]); break;
    case 'configure': case 'config': case 'cfg': await cmdConfigure(); break;
    case 'status': await cmdStatus(); break;
    case 'init': await cmdInit(); break;
    case 'dashboard': case 'dash': case 'db': await cmdDashboard(extraArgs[0], extraArgs); break;
    case 'doctor': await cmdDoctor(); break;
    case 'version': case '-v': case '--version': cmdVersion(); break;
    default:
      console.log(`${C.red}✗${C.reset} Unknown command: ${C.bold}${command}${C.reset}`);
      console.log(`${C.dim}Run \`astra\` or \`astra help\` for available commands${C.reset}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`${C.red}Error:${C.reset}`, err.message);
  process.exit(1);
});
