/**
 * ASTRA Shield — Post-Install Setup
 *
 * Runs after `npm install astra-shield` to:
 * 1. Create ~/.astra config directory
 * 2. Copy ui-challenges to node_modules for reference
 * 3. Print quick-start instructions
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const ASTRA_DIR = path.join(os.homedir(), '.astra');

// Ensure config directory exists
if (!fs.existsSync(ASTRA_DIR)) {
  fs.mkdirSync(ASTRA_DIR, { recursive: true });
}

// Create default config if missing
const CONFIG_FILE = path.join(ASTRA_DIR, 'config.json');
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    theme: 'auto',
    debug: false,
    sessionDuration: 1800000,
    mutationInterval: 3600000,
    apiKey: '',
  }, null, 2));
}

// Create default apps file if missing
const APPS_FILE = path.join(ASTRA_DIR, 'apps.json');
if (!fs.existsSync(APPS_FILE)) {
  fs.writeFileSync(APPS_FILE, JSON.stringify({ apps: [] }, null, 2));
}

// Print setup hint
const isGlobal = process.env.npm_config_global === 'true' ||
                 (process.env.npm_execpath && process.env.npm_execpath.includes('global'));

if (isGlobal || process.env.npm_lifecycle_event === 'postinstall') {
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   🛡️  ASTRA Shield installed successfully!              ║
  ║                                                          ║
  ║   Quick Start:                                           ║
  ║                                                          ║
  ║     astra dashboard        Start analytics dashboard     ║
  ║     astra add              Add to current project         ║
  ║     astra list             View protected apps            ║
  ║     astra help             All commands                   ║
  ║                                                          ║
  ║   Docs: https://github.com/snarsnat/astra                ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
  `);
}
