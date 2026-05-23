#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import readline from 'readline';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASTRA_ROOT = path.resolve(__dirname, '..');
const ASTRA_CONFIG_DIR = path.join(os.homedir(), '.astra');
const ASTRA_CONFIG_FILE = path.join(ASTRA_CONFIG_DIR, 'config.json');
const ASTRA_APPS_FILE = path.join(ASTRA_CONFIG_DIR, 'apps.json');

let VERSION = '2.1.2';
try {
  const pkgPath = path.join(ASTRA_ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) VERSION = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || VERSION;
} catch {}

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

// ─── Helpers ──────────────────────────────────────────────
function ensureConfigDir() {
  if (!fs.existsSync(ASTRA_CONFIG_DIR)) fs.mkdirSync(ASTRA_CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  if (!fs.existsSync(ASTRA_CONFIG_FILE)) return { theme: 'auto', debug: false };
  return JSON.parse(fs.readFileSync(ASTRA_CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(ASTRA_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadApps() {
  if (!fs.existsSync(ASTRA_APPS_FILE)) return { apps: [] };
  return JSON.parse(fs.readFileSync(ASTRA_APPS_FILE, 'utf8'));
}

function saveApps(appsData) {
  ensureConfigDir();
  fs.writeFileSync(ASTRA_APPS_FILE, JSON.stringify(appsData, null, 2));
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${C.cyan}?${C.reset} ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function ok(msg)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg) { console.log(`  ${C.yellow}!${C.reset} ${C.dim}${msg}${C.reset}`); }

// ─── Commands ─────────────────────────────────────────────

function cmdHelp() {
  console.log(logo());
  console.log(`${C.bold}USAGE:${C.reset}`);
  console.log(`  astra <command> [options]`);
  console.log();
  console.log(`${C.bold}COMMANDS:${C.reset}`);
  console.log(`  ${C.green}add${C.reset}        Generate an app token for the current project`);
  console.log(`  ${C.green}list${C.reset}       List all registered apps`);
  console.log(`  ${C.green}remove${C.reset}     Remove an app`);
  console.log(`  ${C.green}status${C.reset}     Show ASTRA status for current directory`);
  console.log(`  ${C.green}configure${C.reset}  Configure ASTRA settings`);
  console.log(`  ${C.green}doctor${C.reset}     Diagnose common issues`);
  console.log(`  ${C.green}version${C.reset}    Show ASTRA version`);
  console.log(`  ${C.green}help${C.reset}       Show this help`);
  console.log();
  console.log(`${C.bold}EXAMPLES:${C.reset}`);
  console.log(`  ${C.dim}astra add${C.reset}               Generate app token for current project`);
  console.log(`  ${C.dim}astra list${C.reset}              List all protected apps`);
  console.log(`  ${C.dim}astra status${C.reset}            Check token status in current dir`);
  console.log();
  console.log(`${C.dim}Dashboard: https://astra-shield-site.vercel.app/dashboard${C.reset}`);
  console.log();
}

function findFile(dir, candidates) {
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function wireSDK(projectDir, projectName, appToken) {
  const pkgPath = path.join(projectDir, 'package.json');
  let framework = 'generic';
  let envVarName = 'ASTRA_TOKEN';

  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['next'])               { framework = 'nextjs';  envVarName = 'NEXT_PUBLIC_ASTRA_TOKEN'; }
    else if (deps['vite'])          { framework = 'vite';    envVarName = 'VITE_ASTRA_TOKEN'; }
    else if (deps['nuxt'])          { framework = 'nuxt';    envVarName = 'NUXT_PUBLIC_ASTRA_TOKEN'; }
    else if (deps['@angular/core']) { framework = 'angular'; envVarName = 'ASTRA_TOKEN'; }

    if (!deps['astra-shield']) {
      pkg.dependencies = pkg.dependencies || {};
      pkg.dependencies['astra-shield'] = `^${VERSION}`;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      ok(`Added astra-shield@^${VERSION} to package.json`);
    }
  }

  // Write token to .env.local
  const envFile = path.join(projectDir, '.env.local');
  const envLine = `${envVarName}=${appToken}`;
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    if (content.includes(envVarName)) {
      fs.writeFileSync(envFile, content.replace(new RegExp(`${envVarName}=.*`), envLine));
    } else {
      fs.appendFileSync(envFile, `\n${envLine}\n`);
    }
  } else {
    fs.writeFileSync(envFile, `${envLine}\n`);
  }
  ok(`Token written to .env.local as ${envVarName}`);

  // Gitignore .env.local
  const giPath = path.join(projectDir, '.gitignore');
  if (fs.existsSync(giPath)) {
    const gi = fs.readFileSync(giPath, 'utf8');
    if (!gi.includes('.env.local')) fs.appendFileSync(giPath, '\n.env.local\n');
  }

  // Build astra-init.js content
  const envRef = framework === 'nextjs'  ? 'process.env.NEXT_PUBLIC_ASTRA_TOKEN'
               : framework === 'vite'    ? 'import.meta.env.VITE_ASTRA_TOKEN'
               : framework === 'nuxt'    ? 'useRuntimeConfig().public.astraToken'
               : 'process.env.ASTRA_TOKEN';

  const initCode = `// Astra Shield — auto-generated by \`astra add\`
import { ASTRAShield } from 'astra-shield';

export const shield = new ASTRAShield({
  endpoint: '/api/astra/verify',
  appToken: ${envRef},
  theme: 'auto',
  debug: false,
  sessionDuration: 1800000,
  mutationInterval: 3600000,
});

shield.on('ready',     () => console.log('[Astra] Shield active'));
shield.on('tierChange',(d) => console.log('[Astra] Tier:', d.tier));
shield.on('success',   (d) => console.log('[Astra] Verified — tier:', d.tier));
shield.on('blocked',   (d) => console.log('[Astra] Blocked:', d.reason));
`;

  const initPath = path.join(projectDir, 'astra-init.js');
  if (!fs.existsSync(initPath)) {
    fs.writeFileSync(initPath, initCode);
    ok(`Created astra-init.js`);
  }

  // Auto-inject import into entry point — this is the key step
  injectIntoEntry(projectDir, framework);
}

function injectIntoEntry(projectDir, framework) {
  const importLine = `import './astra-init.js';`;
  let entryFile = null;

  if (framework === 'nextjs') {
    // Next.js App Router: layout.tsx/jsx. Pages Router: _app.tsx/jsx
    entryFile = findFile(projectDir, [
      'app/layout.tsx', 'app/layout.jsx', 'app/layout.js',
      'src/app/layout.tsx', 'src/app/layout.jsx',
      'pages/_app.tsx', 'pages/_app.jsx', 'pages/_app.js',
      'src/pages/_app.tsx', 'src/pages/_app.jsx',
    ]);
  } else if (framework === 'vite') {
    entryFile = findFile(projectDir, [
      'src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js',
      'src/index.tsx', 'src/index.jsx',
    ]);
  } else if (framework === 'nuxt') {
    // Nuxt: use a plugin file
    const pluginDir = path.join(projectDir, 'plugins');
    fs.mkdirSync(pluginDir, { recursive: true });
    const pluginPath = path.join(pluginDir, 'astra.client.js');
    if (!fs.existsSync(pluginPath)) {
      fs.writeFileSync(pluginPath, `import '../astra-init.js';\nexport default defineNuxtPlugin(() => {});\n`);
      ok(`Created plugins/astra.client.js (auto-loaded by Nuxt)`);
    }
    return;
  } else if (framework === 'angular') {
    entryFile = findFile(projectDir, ['src/main.ts', 'src/main.js']);
  } else {
    // Static / generic: inject <script> into index.html
    const htmlPath = path.join(projectDir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      if (!html.includes('astra-init.js')) {
        html = html.replace('</body>', `  <script type="module" src="/astra-init.js"></script>\n</body>`);
        fs.writeFileSync(htmlPath, html);
        ok(`Injected astra-init.js into index.html`);
      }
    }
    return;
  }

  if (!entryFile) {
    warn(`Could not find entry point — add this line manually to your app entry:\n     import './astra-init.js'`);
    return;
  }

  const content = fs.readFileSync(entryFile, 'utf8');
  if (content.includes('astra-init')) {
    warn(`${path.basename(entryFile)} already imports astra — skipping`);
    return;
  }

  // For Next.js layout.tsx add as first line (it's a server component root but import is fine)
  // For _app / main files prepend before other imports
  const updated = importLine + '\n' + content;
  fs.writeFileSync(entryFile, updated);
  ok(`Injected import into ${path.relative(projectDir, entryFile)}`);
}

async function cmdAdd(targetPath) {
  const projectDir = targetPath ? path.resolve(targetPath) : process.cwd();
  const projectName = path.basename(projectDir);

  if (!fs.existsSync(projectDir)) {
    console.log(`${C.red}✗${C.reset} Directory not found: ${projectDir}`);
    return;
  }

  console.log(logo());
  console.log(`${C.green}${C.bold}Generating app token for "${projectName}"${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  console.log();

  const astraDir = path.join(projectDir, '.astra');
  const tokenFile = path.join(astraDir, 'app-token.txt');

  // Warn if token already exists
  if (fs.existsSync(tokenFile)) {
    console.log(`${C.yellow}!${C.reset} App token already exists for this project.`);
    const answer = await prompt('Regenerate? This replaces the old token. (y/N)');
    if (answer.toLowerCase() !== 'y') {
      console.log();
      console.log(`${C.dim}Token unchanged. Find it at:${C.reset}`);
      console.log(`  ${C.cyan}${tokenFile}${C.reset}`);
      console.log();
      console.log(`${C.dim}Dashboard: https://astra-shield-site.vercel.app/dashboard${C.reset}`);
      return;
    }
    console.log();
  }

  // Generate token
  const appId = crypto.randomUUID();
  const dirHash = crypto.createHash('sha256').update(projectDir).digest('hex').slice(0, 12);
  const tokenPayload = {
    type: 'astra_app_token',
    v: 1,
    appId,
    projectName,
    dirHash,
    version: VERSION,
    createdAt: new Date().toISOString(),
  };
  const appToken = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');

  // Write .astra/
  fs.mkdirSync(astraDir, { recursive: true });
  fs.writeFileSync(tokenFile, appToken, 'utf8');
  fs.writeFileSync(
    path.join(astraDir, 'config.json'),
    JSON.stringify({ appId, projectName, version: VERSION, createdAt: tokenPayload.createdAt }, null, 2),
    'utf8'
  );

  // Gitignore
  const gitignorePath = path.join(projectDir, '.gitignore');
  const entry = '\n# Astra Shield\n.astra/app-token.txt\n';
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    if (!gi.includes('.astra/app-token.txt')) fs.appendFileSync(gitignorePath, entry);
  } else {
    fs.writeFileSync(gitignorePath, entry.trimStart());
  }

  // Register in ~/.astra/apps.json
  const appsData = loadApps();
  appsData.apps = appsData.apps.filter(a => a.path !== projectDir);
  appsData.apps.push({
    name: projectName,
    path: projectDir,
    appId,
    addedAt: new Date().toISOString().split('T')[0],
  });
  saveApps(appsData);

  ok(`Token saved to ${path.relative(projectDir, tokenFile)}`);
  ok(`.astra/app-token.txt added to .gitignore`);

  // Wire SDK into project
  wireSDK(projectDir, projectName, appToken);
  console.log();

  // Display token prominently
  const box = '═'.repeat(58);
  console.log(`${C.green}${C.bold}╔${box}╗${C.reset}`);
  console.log(`${C.green}${C.bold}║${C.reset}  ${C.bold}${C.cyan}Your App Token${C.reset}${' '.repeat(44)}${C.green}${C.bold}║${C.reset}`);
  console.log(`${C.green}${C.bold}╠${box}╣${C.reset}`);
  console.log(`${C.green}${C.bold}║${C.reset}                                                          ${C.green}${C.bold}║${C.reset}`);

  // Wrap token into ~56-char lines
  const chunks = appToken.match(/.{1,56}/g) || [appToken];
  for (const chunk of chunks) {
    const pad = ' '.repeat(58 - chunk.length - 2);
    console.log(`${C.green}${C.bold}║${C.reset}  ${C.cyan}${chunk}${C.reset}${pad}${C.green}${C.bold}║${C.reset}`);
  }

  console.log(`${C.green}${C.bold}║${C.reset}                                                          ${C.green}${C.bold}║${C.reset}`);
  console.log(`${C.green}${C.bold}╚${box}╝${C.reset}`);
  console.log();
  console.log(`${C.bold}Next steps:${C.reset}`);
  console.log(`  1. Import ${C.cyan}astra-init.js${C.reset} in your app entry point`);
  console.log(`  2. Run ${C.cyan}npm install${C.reset} to install astra-shield`);
  console.log(`  3. Go to ${C.bold}https://astra-shield-site.vercel.app/dashboard${C.reset}`);
  console.log(`  4. Click ${C.bold}+ Add app${C.reset} and paste the token above`);
  console.log();
  console.log(`  ${C.yellow}!${C.reset} ${C.dim}Keep this token private — do not commit it to git${C.reset}`);
  console.log();
}

async function cmdList() {
  const appsData = loadApps();
  console.log(`${C.green}${C.bold}ASTRA Protected Apps${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  if (appsData.apps.length === 0) {
    console.log();
    console.log(`${C.yellow}No apps added yet.${C.reset}`);
    console.log(`${C.dim}Run \`astra add\` to generate a token for your project.${C.reset}`);
    return;
  }
  console.log();
  appsData.apps.forEach((app, i) => {
    const num = `${C.green}${String(i + 1).padStart(2)}${C.reset}`;
    const tokenFile = path.join(app.path, '.astra', 'app-token.txt');
    const hasToken = fs.existsSync(tokenFile);
    const status = hasToken ? `${C.green}● token present${C.reset}` : `${C.red}● token missing${C.reset}`;
    console.log(`  ${num} ${C.bold}${app.name}${C.reset}`);
    console.log(`     ${C.dim}${app.path}${C.reset}`);
    console.log(`     ${C.gray}${app.addedAt}${C.reset}  ${status}`);
    console.log();
  });
  console.log(`${C.dim}  Total: ${appsData.apps.length} app(s)${C.reset}`);
}

async function cmdRemove(appName) {
  const projectDir = process.cwd();
  const appsData = loadApps();
  let target;
  if (appName) {
    target = appsData.apps.find(a => a.name.toLowerCase() === appName.toLowerCase());
  } else {
    target = appsData.apps.find(a => a.path === projectDir);
  }
  if (!target) {
    console.log(`${C.yellow}!${C.reset} No registered Astra app found here`);
    if (appsData.apps.length > 0) {
      console.log(`${C.dim}Registered apps:${C.reset}`);
      appsData.apps.forEach(a => console.log(`  ${C.cyan}${a.name}${C.reset} — ${C.dim}${a.path}${C.reset}`));
    }
    return;
  }

  const answer = await prompt(`Remove "${target.name}" from Astra? This deletes .astra/ in the project. (y/N)`);
  if (answer.toLowerCase() !== 'y') { console.log(`${C.dim}Cancelled.${C.reset}`); return; }

  const astraDir = path.join(target.path, '.astra');
  if (fs.existsSync(astraDir)) {
    fs.rmSync(astraDir, { recursive: true, force: true });
    ok(`Removed .astra/ from ${target.name}`);
  }
  appsData.apps = appsData.apps.filter(a => a.path !== target.path);
  saveApps(appsData);
  console.log();
  console.log(`${C.green}${C.bold}✓ "${target.name}" removed${C.reset}`);
  console.log(`${C.dim}  Disconnect it from your dashboard too: https://astra-shield-site.vercel.app/dashboard${C.reset}`);
}

async function cmdConfigure() {
  const config = loadConfig();
  console.log(`${C.green}${C.bold}ASTRA Configuration${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  console.log();
  console.log(`  Theme:   ${C.cyan}${config.theme}${C.reset}`);
  console.log(`  Debug:   ${C.cyan}${config.debug}${C.reset}`);
  console.log();
  console.log(`${C.dim}(Press Enter to keep current value)${C.reset}`);
  console.log();

  const theme = await prompt(`Theme? (auto/light/dark) [${config.theme}]`);
  const debugStr = await prompt(`Debug mode? (true/false) [${config.debug}]`);

  if (theme && ['auto', 'light', 'dark'].includes(theme)) config.theme = theme;
  if (debugStr && ['true', 'false'].includes(debugStr)) config.debug = debugStr === 'true';

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

  const tokenFile = path.join(projectDir, '.astra', 'app-token.txt');
  const configFile = path.join(projectDir, '.astra', 'config.json');
  const gitignore = path.join(projectDir, '.gitignore');

  const checks = [
    ['.astra/app-token.txt', fs.existsSync(tokenFile)],
    ['.astra/config.json', fs.existsSync(configFile)],
    ['.gitignore entry', fs.existsSync(gitignore) && fs.readFileSync(gitignore, 'utf8').includes('.astra/app-token.txt')],
  ];

  const appsData = loadApps();
  const registered = appsData.apps.find(a => a.path === projectDir);
  checks.push(['Registered locally', !!registered]);

  let allOk = true;
  checks.forEach(([name, isOk]) => {
    const icon = isOk ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    if (!isOk) allOk = false;
    console.log(`  ${icon} ${name.padEnd(28)} ${isOk ? C.green + 'ok' : C.yellow + 'missing'}${C.reset}`);
  });

  console.log();
  if (allOk) {
    console.log(`${C.green}${C.bold}  ✓ Astra Shield configured${C.reset}`);
    if (fs.existsSync(configFile)) {
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      console.log(`  ${C.dim}App ID: ${cfg.appId}${C.reset}`);
    }
  } else {
    console.log(`${C.yellow}${C.bold}  ! Not configured — run \`astra add\`${C.reset}`);
  }
  console.log();
  console.log(`  ${C.dim}Dashboard: https://astra-shield-site.vercel.app/dashboard${C.reset}`);
}

async function cmdDoctor() {
  const projectDir = process.cwd();
  const appsData = loadApps();

  console.log(`${C.green}${C.bold}ASTRA Doctor${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);
  console.log();

  console.log(`  ${C.green}✓${C.reset} Node.js ${C.cyan}${process.version}${C.reset}`);
  console.log(`  ${C.green}✓${C.reset} astra-shield ${C.cyan}v${VERSION}${C.reset}`);
  console.log(`  ${C.green}✓${C.reset} Registered apps: ${C.cyan}${appsData.apps.length}${C.reset}`);

  const tokenFile = path.join(projectDir, '.astra', 'app-token.txt');
  if (fs.existsSync(tokenFile)) {
    console.log(`  ${C.green}✓${C.reset} App token present in current directory`);
  } else {
    console.log(`  ${C.yellow}!${C.reset} No app token here — run ${C.cyan}\`astra add\`${C.reset}`);
  }
  console.log();
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
    case 'help': case undefined: cmdHelp(); break;
    case 'add': await cmdAdd(extraArgs[0]); break;
    case 'list': await cmdList(); break;
    case 'remove': case 'rm': await cmdRemove(extraArgs[0]); break;
    case 'configure': case 'config': case 'cfg': await cmdConfigure(); break;
    case 'status': await cmdStatus(); break;
    case 'doctor': await cmdDoctor(); break;
    case 'version': case '-v': case '--version': cmdVersion(); break;
    default:
      console.log(`${C.red}✗${C.reset} Unknown command: ${C.bold}${command}${C.reset}`);
      console.log(`${C.dim}Run \`astra help\` for available commands${C.reset}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`${C.red}Error:${C.reset}`, err.message);
  process.exit(1);
});
