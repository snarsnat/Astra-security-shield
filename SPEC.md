# ASTRA Shield - Invisible Security System

## 1. Concept & Vision

ASTRA Shield is a revolutionary invisible security framework that operates on a **5-tier friction model**, where 95% of users experience Tier 0-1 (completely invisible to imperceptible), and only detected threats face higher tiers. Inspired by astra-security's philosophy: *"The best security is the security you never notice."*

This isn't another annoying CAPTCHA — it's a intelligent guardian that knows when to stay invisible and when to gently ask for confirmation. Think of it as a digital doorman who recognizes regulars, opens doors automatically, and only asks for ID when something seems off — then apologizes for the inconvenience.

**Core Philosophy:** Security should feel like a helpful assistant, not an interrogation.

## 2. Design Language

### Aesthetic Direction
- **Minimal & Unobtrusive:** Glassmorphic overlays that don't interrupt workflow
- **Calm & Reassuring:** Soft gradients, gentle animations that feel organic
- **Accessible by Default:** High contrast, clear focus states, screen reader friendly

### Color Palette
- **Primary:** `#6366F1` (Indigo-500) - Trust, intelligence
- **Secondary:** `#8B5CF6` (Violet-500) - Innovation
- **Success:** `#10B981` (Emerald-500) - Completion, verification
- **Warning:** `#F59E0B` (Amber-500) - Attention needed
- **Background:** `rgba(255, 255, 255, 0.95)` - Semi-transparent white
- **Dark Background:** `rgba(15, 23, 42, 0.95)` - For dark mode
- **Text:** `#1E293B` (Slate-800) / `#F8FAFC` (Slate-50 for dark)

### Typography
- **Primary Font:** Inter (Google Fonts) - Clean, modern, excellent readability
- **Fallback:** -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- **Scale:** 14px base, 1.5 line-height for body, 1.2 for headings

### Spatial System
- **Base unit:** 4px
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64px
- **Border radius:** 8px (small), 16px (medium), 24px (large/overlay)
- **Shadows:** Soft, layered shadows for depth

### Motion Philosophy
- **Micro-interactions:** 150-200ms ease-out for immediate feedback
- **Transitions:** 300-400ms ease-in-out for state changes
- **Challenge animations:** Organic, breathing-like motions (not robotic)
- **Progress indicators:** Smooth, continuous animations
- **Respect `prefers-reduced-motion`:** All animations skippable

### Visual Assets
- **Icons:** Lucide icons (consistent stroke width, friendly aesthetic)
- **Illustrations:** Minimal, abstract shapes representing security concepts
- **Decorative:** Subtle gradient orbs, soft particle effects (optional, disabled for accessibility)

## 3. The 5-Tier Friction Model

### Tier 0 - Ghost (OOS 0.0-1.5)
- **Experience:** Nothing at all
- **User feels:** Normal browsing, no interruption
- **Implementation:**
  - Passive behavioral analysis (mouse patterns, scroll velocity, click timing)
  - Hardware fingerprinting (subtle, privacy-respecting)
  - Session continuity verification

### Tier 1 - Whisper (OOS 1.5-2.0)
- **Experience:** 100-200ms micro-delay
- **User feels:** "Page loaded slightly slower" or "click took a moment"
- **Implementation:**
  - Adds imperceptible delay to sensitive actions
  - Verifies timing consistency with biological human behavior
  - No user-visible indication

### Tier 2 - Nudge (OOS 2.0-2.5)
- **Experience:** Single intuitive gesture challenge
- **User feels:** "Oh, that was quick"
- **Challenges available:**
  - **Pulse:** Tap in rhythm with device vibration (3 pulses)
  - **Tilt:** Gently tilt device to follow on-screen indicator
  - **Flick:** Swipe in indicated direction
  - **Breath:** Hold and release following visual cue
- **Duration:** 2-5 seconds
- **Mutates hourly** to prevent bot learning

### Tier 3 - Pause (OOS 2.5-3.0)
- **Experience:** 10-second engaging challenge
- **User feels:** "Minor inconvenience"
- **Challenges:** Extended versions of Tier 2 with multiple steps
- **Multiple verification methods:** Can combine gesture + timing

### Tier 4 - Gate (OOS 3.0+)
- **Experience:** Manual review or enhanced verification
- **User feels:** "Security check" (rare, only for suspicious activity)
- **Implementation:**
  - Email/SMS verification option
  - Delayed approval for very sensitive actions
  - Admin review queue (for high-value transactions)

## 4. Challenge System

### Challenge Types (Rotate hourly via mutation)

#### 1. Pulse Challenge
- **Concept:** Tap along with haptic feedback
- **Mechanism:** Device vibrates 3 times, user taps in sync
- **Accessibility:** Visual pulse option with audio cue for hearing users
- **Duration:** 3 seconds
- **Success criteria:** 80% timing accuracy

#### 2. Tilt Challenge
- **Concept:** Tilt device to follow indicator
- **Mechanism:** On-screen ball follows path, user tilts phone to guide it
- **Accessibility:** Touch-based alternative (drag instead of tilt)
- **Duration:** 4 seconds
- **Success criteria:** Complete path within tolerance

#### 3. Flick Challenge
- **Concept:** Quick gesture recognition
- **Mechanism:** Show arrow direction, user flicks accordingly
- **Accessibility:** Tap alternatives available
- **Duration:** 2 seconds
- **Success criteria:** Correct direction + velocity

#### 4. Breath Challenge
- **Concept:** Calm, meditative verification
- **Mechanism:** Animated circle expands/contracts, user holds during expand
- **Accessibility:** Click-and-hold alternative
- **Duration:** 5 seconds
- **Success criteria:** Duration + timing match

### Challenge Mutation System
- **Hourly rotation:** Different challenge sets activate each hour
- **Random selection:** Within each hour, challenges are randomly selected
- **Difficulty adjustment:** Subtle variations in timing tolerance
- **Anti-bot measures:** Pattern analysis of challenge responses

## 5. Component Inventory

### ShieldOverlay Component
- **Default:** Invisible, positioned fixed over viewport
- **Active:** Glassmorphic overlay with centered challenge
- **Success:** Brief success animation, auto-dismiss
- **Failure:** Gentle shake, retry option
- **Accessibility:** Focus trapped, ESC to close (where appropriate)

### ChallengeModal Component
- **States:** idle, active, success, error, timeout
- **Content:** Challenge visualization, instructions, progress indicator
- **Actions:** Primary button (complete challenge), secondary (accessibility options)
- **Animations:** Entrance fade + scale, exit fade out

### PulseChallenge Component
- **Visual:** Central pulse indicator with expanding circles
- **Haptic:** Vibration API for physical feedback
- **States:** waiting, pulsing, recording, complete
- **Progress:** 3/3 indicators showing pulse count

### TiltChallenge Component
- **Visual:** Ball on gradient surface, target zone
- **Device:** DeviceOrientationEvent for tilt detection
- **Fallback:** Touch-drag for non-tilt devices
- **States:** idle, tracking, success, timeout

### FlickChallenge Component
- **Visual:** Arrow indicator with direction
- **Detection:** Touch velocity and direction analysis
- **Alternative:** Tap-to-confirm for accessibility
- **States:** showing, swiping, evaluating, complete

### BreathChallenge Component
- **Visual:** Expanding/contracting circle with calming animation
- **Instructions:** "Breathe in" / "Hold" / "Breathe out" text
- **Detection:** Hold duration measurement
- **Alternative:** Click-and-hold for non-mobile

### ProgressIndicator Component
- **Visual:** Thin progress bar at top of challenge
- **Animation:** Smooth width transition
- **Color:** Primary → Success gradient

### AccessibilityPanel Component
- **Options:** Audio cues, larger text, simplified mode, alternative verification
- **Trigger:** "Accessibility options" link below challenge
- **Content:** Toggle switches for various accommodations

### NotificationToast Component
- **Types:** success, error, info, warning
- **Position:** Bottom-center, auto-dismiss
- **Animation:** Slide up + fade in
- **Accessibility:** role="alert", aria-live="polite"

## 6. Technical Approach

### Framework & Architecture
- **Language:** JavaScript (ES6+) with TypeScript-ready structure
- **Module System:** ES Modules for tree-shaking
- **No external dependencies:** Vanilla JS for maximum compatibility
- **Browser Support:** Modern browsers (ES2020+), graceful degradation

### Core Modules

```
src/
├── core/
│   ├── Shield.js           # Main entry point
│   ├── Session.js         # Session management & scoring
│   ├── Detector.js        # Behavioral analysis engine
│   └── Storage.js         # Encrypted local storage
├── tiers/
│   ├── TierEngine.js      # Tier management
│   ├── GhostTier.js       # Tier 0 implementation
│   ├── WhisperTier.js     # Tier 1 implementation
│   ├── NudgeTier.js       # Tier 2 implementation
│   ├── PauseTier.js       # Tier 3 implementation
│   └── GateTier.js        # Tier 4 implementation
├── challenges/
│   ├── ChallengeManager.js    # Challenge orchestration
│   ├── PulseChallenge.js      # Pulse challenge
│   ├── TiltChallenge.js       # Tilt challenge
│   ├── FlickChallenge.js      # Flick challenge
│   └── BreathChallenge.js     # Breath challenge
├── mutation/
│   ├── Mutator.js         # Hourly mutation logic
│   └── Schedule.js        # Challenge scheduling
├── accessibility/
│   ├── AccessibilityManager.js
│   ├── ScreenReader.js
│   └── MotorAlternatives.js
├── metrics/
│   ├── HappinessTracker.js
│   └── SecurityMetrics.js
├── ui/
│   ├── components/        # UI components
│   ├── styles/           # CSS (injected dynamically)
│   └── animations/       # Animation utilities
└── utils/
    ├── crypto.js         # Encryption utilities
    ├── device.js         # Device detection
    └── time.js           # Timing utilities
```

### API Design

#### Initialization
```javascript
const shield = new ASTRAShield({
  apiKey: 'your-api-key',
  endpoint: 'https://api.yoursite.com/verify',
  debug: false,
  theme: 'auto' | 'light' | 'dark'
});
```

#### Verification Trigger
```javascript
// Automatic (on sensitive actions)
shield.protect('login', { userId: '123' });
shield.protect('checkout', { amount: 99.99 });
shield.protect('comment', { postId: '456' });

// Manual verification
const verified = await shield.verify();
if (verified.success) {
  // Proceed with action
}
```

#### Event Callbacks
```javascript
shield.on('challenge', (challenge) => {
  console.log('Challenge started:', challenge.type);
});

shield.on('success', (data) => {
  console.log('Verification complete:', data.tier);
});

shield.on('blocked', (reason) => {
  console.log('Blocked:', reason);
});
```

### Behavioral Analysis Engine

#### Signals Collected (Tier 0)
- **Mouse patterns:** Velocity, acceleration, pause patterns
- **Scroll behavior:** Speed, direction changes, pause points
- **Click timing:** Inter-click intervals, click patterns
- **Keyboard:** Typing rhythm, error correction patterns
- **Touch:** Swipe gestures, pinch patterns
- **Session:** Time on page, navigation patterns

#### OOS (Out-of-Suspicion) Scoring
- **Baseline:** 1.0 (normal user)
- **Factors:** Each anomaly adds 0.1-0.5 to score
- **Thresholds:** 0-1.5 (Tier 0), 1.5-2.0 (Tier 1), 2.0-2.5 (Tier 2), etc.
- **Decay:** Scores decay over time for repeated sessions

### Accessibility Features

#### Screen Reader Support
- All challenges have text alternatives
- ARIA live regions for status updates
- Focus management during challenges

#### Motor Accessibility
- Touch alternatives for all gesture challenges
- Extended time limits
- Simplified mode with fewer steps

#### Visual Accessibility
- High contrast mode
- Color-blind friendly (shapes + colors)
- Resizable challenge areas
- Reduced motion support

#### Cognitive Accessibility
- Simple, clear instructions
- Progress indicators
- Unlimited retries with hints
- Option to request human verification

### Installation & Usage

#### NPM Installation
```bash
npm install astra-shield
```

#### CDN Usage
```html
<script src="https://cdn.astrashield.io/v1/astra.min.js"></script>
<script>
  const shield = new ASTRAShield({ apiKey: '...' });
</script>
```

#### Framework Integrations
- **React:** `astra-shield/react`
- **Vue:** `astra-shield/vue`
- **Angular:** `astra-shield/angular`

### Privacy Considerations
- No persistent tracking across unrelated sites
- Behavioral data stays local until verification
- Encrypted storage for session data
- GDPR-compliant data handling
- Option to disable all tracking

## 7. User Happiness Metrics

### Target Metrics
- **Time to verify:** <3 seconds for 95% of users
- **Completion rate:** >99% for legitimate users
- **User satisfaction:** >4.5/5
- **Accessibility pass rate:** 100% for users who request alternatives

### Tracked Metrics
- Challenge completion time
- Retry rate per challenge type
- User-reported frustration (optional feedback)
- Session abandonment rate
- False positive rate (blocked humans)

## 8. Success Criteria

### For 95% of Users
- [ ] Zero friction on normal browsing
- [ ] Imperceptible delays on Tier 1
- [ ] <3 second challenges on Tier 2
- [ ] Feeling of "helpful security" not "hostile gatekeeping"

### For Security
- [ ] <1% bot pass rate at Tier 2+
- [ ] No static patterns bots can learn
- [ ] Hourly challenge mutation working
- [ ] Adaptive difficulty adjustment

### For Accessibility
- [ ] WCAG 2.1 AA compliance
- [ ] All challenges have alternatives
- [ ] Screen reader compatibility
- [ ] Motor accessibility options
- [ ] 100% completion rate for accessibility users
