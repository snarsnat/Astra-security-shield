# ASTRA Shield
![Astra Banner](banner1.png)
[![npm](https://img.shields.io/npm/v/astra-shield?color=crimson)](https://www.npmjs.com/package/astra-shield)
[![X](https://img.shields.io/badge/Follow-@happinezreal-000000?style=flat&logo=x)](https://x.com/happinezreal)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Donate-orange?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/nebsol)

**Invisible bot detection & human verification** — the best security is the security you never notice.

Multi-layer behavioral analysis, headless browser detection, IP reputation, and signal-silence detection — with a real-time cloud analytics dashboard.

## Installation

```bash
npm install astra-shield
```

Or globally for the CLI:

```bash
npm install -g astra-shield
```

## Quick Start

```bash
# Add ASTRA to your project (copies SDK files)
astra add

# Connect to the cloud dashboard
astra connect

# Check integration status
astra status
```

Then sign in at **[astra-shield-site.vercel.app](https://astra-shield-site.vercel.app)** to view your analytics.

## CLI Commands

| Command | Description |
|---|---|
| `astra add [path]` | Copy ASTRA Shield SDK into a project |
| `astra connect` | Connect project to cloud dashboard |
| `astra list` | List all connected apps |
| `astra remove <name>` | Disconnect a project |
| `astra status` | Check integration status |
| `astra doctor` | Diagnose issues |
| `astra help` | Show help |

## JavaScript API

```javascript
import { ASTRAShield } from 'astra-shield';

const shield = new ASTRAShield({
  appToken: 'your-app-token',  // from `astra connect`
  debug: false,
});

// Protect any action
const result = await shield.protect('purchase');
if (result.success) {
  // human verified — proceed
}

// Listen to events
shield.on('ready', () => console.log('Shield active'));
shield.on('tierChange', ({ tier }) => console.log('Tier:', tier));
shield.on('blocked', ({ reason }) => console.log('Blocked:', reason));
shield.on('challenge', ({ type }) => console.log('Challenge:', type));
```

## Detection Layers

ASTRA runs eight independent detection signals, each contributing to an OOS (Out-of-Suspicion) score:

| Signal | What it detects | Weight |
|---|---|---|
| **Headless anomaly** | `navigator.webdriver`, missing `window.chrome`, zero plugins, 20 automation globals, WebGL SwiftShader/llvmpipe renderer | 0.28 |
| **Signal silence** | Clicks or actions with zero pointer/touch movement — strongest real-browser bot signal | 0.14 |
| **Mouse anomaly** | Inhuman velocity, zero variance, straight-line paths, low Shannon path entropy | 0.12 |
| **Click anomaly** | Robotic timing regularity, sub-50ms intervals, coefficient of variation < 0.1 | 0.11 |
| **Keyboard anomaly** | Uniform keystroke cadence, impossible typing speed | 0.10 |
| **Session anomaly** | Low trust score, rapid actions on fresh session | 0.10 |
| **Touch anomaly** | Perfect-velocity swipes, inhuman gesture consistency | 0.08 |
| **Scroll anomaly** | Constant-velocity scrolling, no human deceleration | 0.07 |

Server-side, each event is also checked against **IP reputation** (proxy/datacenter detection) — events from flagged IPs are automatically escalated to `blocked` regardless of client score.

### Signal Silence Detection (v2.3.0)

Bots using real browsers often skip mouse/touch simulation entirely. ASTRA now treats the *absence* of behavioral signals as a signal itself:

- Clicks recorded but zero pointer movement → `silenceAnomaly: 0.75`
- Keyboard input but no pointer activity → `silenceAnomaly: 0.30`
- Complete behavioral darkness after 5s → `silenceAnomaly: 0.25`
- Score escalates with time since page load

## 5-Tier Friction Model

OOS score drives progressive friction — humans feel nothing, bots hit walls:

| Tier | OOS Score | Experience |
|---|---|---|
| **Ghost** | 0–1.5 | Invisible — zero friction |
| **Whisper** | 1.5–2.0 | 200ms delay, imperceptible |
| **Nudge** | 2.0–2.5 | Simple gesture challenge |
| **Pause** | 2.5–3.0 | Extended verification |
| **Gate** | 3.0+ | Full challenge required |

## Challenge Types

11 human-native challenges, assigned by tier:

| Challenge | Tier |
|---|---|
| Pulse — tap a rhythm | 1–2 |
| Tilt — balance a ball | 1–2 |
| Flick — directional swipe | 1–2 |
| Breath — follow a circle | 1–3 |
| Rhythm — tap a pattern | 2–3 |
| Pressure — hold with force | 2–3 |
| Path — trace a route | 2–4 |
| Semantic — identify an object | 3–4 |
| Microchain — chain of micro-actions | 3–4 |
| Gaze — look at a target | 3–4 |
| Contextual — contextual question | 4 |

## Cloud Dashboard

Real-time analytics at [astra-shield-site.vercel.app](https://astra-shield-site.vercel.app):

- Total scanned / blocked / challenged / pass rate
- Daily timeline chart
- Tier distribution breakdown
- Signal and challenge breakdown
- Live event feed (last 20 events with country, device, browser, reason)

Sign in with GitHub or Google — apps persist across sessions and devices.

## Architecture

```
Browser (SDK)
  └─ behavioral signals → OOS score → tier → protect()
       └─ telemetry → POST /api/events/ingest (Vercel)
            ├─ IP reputation check (ip-api.com)
            ├─ INSERT events (Supabase)
            └─ increment daily_stats (atomic RPC)

Dashboard (astra-shield-site.vercel.app)
  └─ GET /api/apps/stats → Supabase → charts
```

## Bot Lockout

After 3 **consecutive** failed challenges, session locks for 10 minutes:

```javascript
const shield = new ASTRAShield({
  appToken: 'your-token',
  maxChallengeFailures: 3,       // consecutive failures before lockout (default: 3)
  lockoutCooldownMs: 600000,     // lockout duration in ms (default: 10 min)
});

shield.on('blocked', ({ reason, status, retryIn, remainingAttempts }) => {
  if (reason === 'bot_lockout') {
    // session locked — show retryIn seconds to user
  } else {
    // challenge failed — show remainingAttempts warning
  }
});
```

**Human path:** fail → warned with `remainingAttempts` → pass any challenge → counter resets → never locked.  
**Bot path:** fail 3 consecutive → locked 10min → fails again immediately → re-locked.

## Changelog

### 2.4.1
- Lockout now tracks **consecutive** failures only — passing any challenge resets counter to 0
- Lockout lifts after cooldown (default 10min) — humans who struggle get another chance
- `retryIn` (seconds) returned on lockout response
- `remainingAttempts` returned on each non-lockout failure

### 2.4.0
- Bot lockout after N consecutive failed challenges → `{ success: false, blocked: true, reason: 'bot_lockout', status: 403 }`
- Configurable via `maxChallengeFailures` and `lockoutCooldownMs`
- `locked` event added to listener types

### 2.3.0
- Signal silence detection — bots with no pointer movement flagged at `silenceAnomaly: 0.75`
- Clicks + zero pointer movement → 0.75, keyboard only → 0.30, total darkness after 5s → 0.25
- Score escalates with time since page load
- Rebalanced OOS weights (headless 0.28, silence 0.14)

### 2.2.0
- Headless browser detection: `navigator.webdriver`, missing `window.chrome`, zero plugins, 20 automation globals, WebGL SwiftShader/llvmpipe renderer, canvas fingerprint
- Shannon entropy mouse path analysis (8-octant bucketing)
- IP reputation via ip-api.com — proxy/datacenter IPs auto-escalated to `blocked`
- Atomic daily stats increment via Supabase RPC (`ON CONFLICT DO UPDATE SET col = col + 1`)

### 2.1.0
- Cloud dashboard at astra-shield-site.vercel.app
- App token system — `astra connect` links project to dashboard
- Supabase telemetry pipeline (events + daily_stats tables)
- OAuth sign-in (GitHub + Google) — apps persist across sessions/devices

### 2.0.0
- 5-tier friction model (Ghost → Whisper → Nudge → Pause → Gate)
- 11 challenge types
- OOS scoring engine with weighted behavioral signals
- `astra add` CLI command copies SDK into any project

### 1.0.0
- Initial release — behavioral tracking (mouse, click, keyboard, scroll, touch)
- Session fingerprinting
- Basic bot detection

## License

MIT © [Snarsnat](https://github.com/snarsnat)
