// ASTRA Shield — Quick Setup
// Import and initialize the full ASTRA security system
// This includes: behavioral tracking, OOS scoring, tier engine,
// challenge UIs (Pulse, Tilt, Flick, Breath), and the trust badge.

import { ASTRAShield } from './src/index.js';

const shield = new ASTRAShield({
  apiKey: 'your-api-key-here',
  endpoint: '/api/verify',
  theme: 'auto',
  debug: false,
  showBadge: true,
  onReady: () => console.log('[ASTRA] Shield ready'),
  onSuccess: (result) => console.log('[ASTRA] Verification passed', result),
  onBlocked: (result) => console.log('[ASTRA] Verification blocked', result),
});

// Protect a sensitive action
// shield.protect('login', { username: 'user' });

export { shield };
