# 🛡️ ASTRA Shield
![Astra Banner](banner1.png)

**Invisible bot detection & human verification** — the best security is the security you never notice.

A complete behavioral analysis system with multi-layer fingerprinting, ML-powered risk scoring, 11 challenge types, and a real-time analytics dashboard.

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
# Start the analytics dashboard
astra dashboard

# Add ASTRA to your project
astra add

# View all protected apps
astra list
```

## Usage

### CLI Commands

| Command | Description |
|---|---|
| `astra add [path]` | Add ASTRA Shield to a project |
| `astra list` | List all protected apps |
| `astra remove <name>` | Remove a project |
| `astra configure` | Configure settings |
| `astra status` | Check integration status |
| `astra init` | Initialize in a new project |
| `astra dashboard` | Start analytics dashboard |
| `astra dashboard start` | Start as background service |
| `astra dashboard stop` | Stop services |
| `astra dashboard restart` | Restart services |
| `astra dashboard status` | Check service status |
| `astra dashboard logs` | View recent logs |
| `astra doctor` | Diagnose issues |
| `astra help` | Show help |

### JavaScript API

```javascript
import { ASTRAShield } from 'astra-shield';

const astra = new ASTRAShield({
  endpoint: '/api/astra/verify',
  apiKey: 'your-api-key',
  tiers: {
    ghost: { max: 1.5 },
    whisper: { max: 2.0 },
    nudge: { max: 2.5 },
    pause: { max: 3.0 },
    gate: { max: Infinity },
  },
});

astra.init();

// Protect a form submission
astra.protect('#my-form', {
  onSuccess: (result) => console.log('Verified:', result),
  onChallenge: (challenge) => console.log('Challenge:', challenge),
  onError: (err) => console.error('Error:', err),
});

// Manual verification
const result = await astra.verify({ action: 'login' });
```

### React Integration

```javascript
import { ASTRAShieldProvider, useASTRAShield } from 'astra-shield/react';

function App() {
  return (
    <ASTRAShieldProvider apiKey="your-api-key">
      <MyComponent />
    </ASTRAShieldProvider>
  );
}

function MyComponent() {
  const { verify, session } = useASTRAShield();

  const handleSubmit = async () => {
    const result = await verify({ action: 'submit' });
    if (result.success) { /* proceed */ }
  };
}
```

### Vue 3 Integration

```javascript
import { createApp } from 'vue';
import ASTRAPlugin from 'astra-shield/vue';

const app = createApp(App);
app.use(ASTRAPlugin, { apiKey: 'your-api-key' });
```

### Angular Integration

```typescript
import { ASTRAShieldModule } from 'astra-shield/angular';

@NgModule({
  imports: [
    ASTRAShieldModule.forRoot({ apiKey: 'your-api-key' }),
  ],
})
export class AppModule {}
```

## Server

The shield server provides the verification API:

```bash
# Start the shield server
node node_modules/astra-shield/server/index.js

# Or programmatically
import { app, services } from 'astra-shield/shield-server';
app.listen(3001);
```

### Server Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `POST /api/verify` | API Key | Main verification |
| `POST /api/analyze` | None | Behavioral analysis |
| `POST /api/challenge` | None | Generate challenge |
| `POST /api/challenge/verify` | None | Verify challenge |
| `POST /api/session/create` | None | Create session |
| `POST /api/session/refresh` | None | Refresh tokens |
| `GET /api/stats` | None | Service statistics |
| `GET /api/health` | None | Health check |
| `POST /api/keys/generate` | Admin | Generate API key |
| `GET /api/keys/list` | Admin | List API keys |
| `POST /api/keys/revoke` | Admin | Revoke API key |
| `GET /api/dashboards/list` | None | List dashboards |
| `POST /api/dashboards/create` | None | Create dashboard |
| `GET /api/dashboards/:id/stats` | None | Dashboard stats |
| `GET /api/dashboards/:id/apps` | None | Dashboard apps |

## Dashboard

Real-time analytics with 8 pages: Overview, Protection, Flagged Activity, Traffic, OOS Scores, Live Feed, Challenges, Sessions.

```bash
astra dashboard          # Start + open browser
astra dashboard start    # Background service
astra dashboard stop     # Stop services
astra dashboard status   # Check status
astra dashboard logs     # View logs
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Browser   │────▶│  ASTRA SDK   │────▶│  Shield Server  │
│   (Client)  │     │  (Behavioral │     │  (Port 3001)    │
│             │     │   Tracking)  │     │                 │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                                           ┌──────▼───────┐
                                           │   Dashboard   │
                                           │  (Port 3000)  │
                                           └──────────────┘
```

## Challenge Types

| Name | Description | Tier |
|---|---|---|
| **Pulse** | Tap along with a rhythm | 1-2 |
| **Tilt** | Tilt device to balance a ball | 1-2 |
| **Flick** | Swipe in a direction | 1-2 |
| **Breath** | Follow a breathing circle | 1-3 |
| **Rhythm** | Tap a specific pattern | 2-3 |
| **Pressure** | Hold with specific pressure | 2-3 |
| **Path** | Trace a path on screen | 2-4 |
| **Semantic** | Identify an object/shape | 3-4 |
| **Microchain** | Chain of micro-actions | 3-4 |
| **Gaze** | Look at a target area | 3-4 |
| **Contextual** | Answer a contextual question | 4 |

## 5-Tier Friction Model

| Tier | Score | Experience |
|---|---|---|
| **Ghost** | 0–1.5 | Invisible — no friction |
| **Whisper** | 1.5–2.0 | 200ms delay — barely noticed |
| **Nudge** | 2.0–2.5 | Simple gesture challenge |
| **Pause** | 2.5–3.0 | Extended challenge |
| **Gate** | 3.0+ | Full verification required |

## License

MIT © [Nausheen Suraj](https://github.com/snarsnat)
