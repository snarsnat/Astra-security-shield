/**
 * Challenge Manager - Anti-Trope Design
 *
 * Design Philosophy:
 * - No generic AI aesthetics (no indigo gradients, no glassmorphism, no glows)
 * - Utilitarian, minimal, functional design
 * - Space Grotesk typography
 * - Stark black/white with single accent color
 * - Sharp edges, no decorative elements
 */

import { TierLevel, ChallengeType, ASTRAShieldOptions, VerificationResult } from '../types';
import { Mutator } from '../mutation/Mutator';
import { AccessibilityManager } from '../accessibility/AccessibilityManager';

type ChallengeCallback = (result: VerificationResult) => void;

export class ChallengeManager {
  private options: ASTRAShieldOptions;
  private mutator: Mutator;
  private accessibility: AccessibilityManager;
  private activeOverlay: HTMLElement | null = null;
  private currentChallenge: { cleanup?: () => void } | null = null;
  private callback: ChallengeCallback | null = null;
  private challengeCompleted: boolean = false;

  // Anti-trope: Clean, functional challenge definitions
  private challenges: Record<ChallengeType, { name: string; description: string; duration: number; accessibility: boolean }> = {
    pulse: { name: 'Pulse', description: 'Tap along with the rhythm', duration: 5000, accessibility: true },
    tilt: { name: 'Tilt', description: 'Balance the ball on the target', duration: 6000, accessibility: true },
    flick: { name: 'Flick', description: 'Swipe in the indicated direction', duration: 4000, accessibility: true },
    breath: { name: 'Breath', description: 'Follow the breathing rhythm', duration: 10000, accessibility: true },
    rhythm: { name: 'Rhythm', description: 'Tap the rhythm pattern precisely', duration: 6000, accessibility: true },
    pressure: { name: 'Pressure', description: 'Hold with varying pressure', duration: 8000, accessibility: true },
    path: { name: 'Path', description: 'Follow the squiggly path', duration: 7000, accessibility: true },
    semantic: { name: 'Semantic', description: 'Identify the correct element', duration: 5000, accessibility: true },
    microchain: { name: 'Micro-Chain', description: 'Complete the interaction chain', duration: 8000, accessibility: false },
    gaze: { name: 'Gaze', description: 'Look at the indicated location', duration: 5000, accessibility: false },
    contextual: { name: 'Contextual', description: 'Answer based on recent context', duration: 6000, accessibility: true }
  };

  constructor(options: ASTRAShieldOptions, mutator: Mutator, accessibility: AccessibilityManager) {
    this.options = options;
    this.mutator = mutator;
    this.accessibility = accessibility;
  }

  createChallengeUI(tier: TierLevel, callback: ChallengeCallback): void {
    this.callback = callback;
    this.challengeCompleted = false;
    this.removeOverlay();

    const challengeType = this.mutator.getChallengeForTier(tier);

    this.activeOverlay = document.createElement('div');
    this.activeOverlay.id = 'astra-overlay';
    this.activeOverlay.className = 'astra-overlay';
    this.activeOverlay.setAttribute('role', 'dialog');
    this.activeOverlay.setAttribute('aria-modal', 'true');

    this.activeOverlay.innerHTML = this.buildChallengeUI(challengeType, tier);
    document.body.appendChild(this.activeOverlay);

    requestAnimationFrame(() => {
      this.activeOverlay?.classList.add('active');
    });

    this.initChallenge(challengeType, tier);
  }

  private buildChallengeUI(challengeType: ChallengeType, tier: TierLevel): string {
    const challenge = this.challenges[challengeType];

    return `
      <div class="astra-container">
        <div class="astra-header">
          <span class="astra-logo-text">ASTRA</span>
          <span class="astra-challenge-label">${challenge.name} Challenge</span>
        </div>

        <h2 class="astra-instruction">${this.getInstruction(challengeType)}</h2>
        <p class="astra-subtitle">${challenge.description}</p>

        <div class="astra-progress">
          <div class="astra-progress-fill" id="astra-progress" style="width: 100%"></div>
        </div>

        <div class="astra-challenge-area">
          ${this.getChallengeContent(challengeType)}
        </div>

        <div class="astra-footer">
          <button class="astra-btn" disabled id="astra-btn">Waiting...</button>
          <span class="astra-meta">${challenge.name.toUpperCase()}-${tier}</span>
        </div>
      </div>
    `;
  }

  private getChallengeContent(type: ChallengeType): string {
    switch (type) {
      case 'pulse':
        return `
          <div class="astra-pulse-container" id="pulse-container">
            <div class="astra-pulse-ring"></div>
            <div class="astra-pulse-ring"></div>
            <div class="astra-pulse-ring"></div>
            <div class="astra-pulse-core" id="pulse-core"></div>
            <div class="astra-pulse-counter" id="pulse-counter">0/3</div>
          </div>
        `;
      case 'tilt':
        return `
          <div class="astra-tilt-container" id="tilt-container">
            <div class="astra-tilt-target" id="tilt-target"></div>
            <div class="astra-tilt-ball" id="tilt-ball"></div>
          </div>
          <div class="astra-tilt-status">
            <span>Balanced: <strong id="balanced-count">0</strong></span>
            <span>Required: <strong>15</strong></span>
          </div>
        `;
      case 'flick':
        return `
          <div class="astra-flick-container" id="flick-container">
            <div class="astra-flick-indicator" id="flick-indicator">
              <svg class="astra-flick-arrow" viewBox="0 0 24 24">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
            <div class="astra-direction-labels">
              <span class="top">N</span>
              <span class="bottom">S</span>
              <span class="left">W</span>
              <span class="right">E</span>
            </div>
          </div>
        `;
      case 'breath':
        return `
          <div class="astra-breath-container" id="breath-container">
            <div class="astra-breath-circle" id="breath-circle"></div>
            <div class="astra-breath-text" id="breath-text">Press to start</div>
          </div>
          <div class="astra-breath-status">
            <span>Hold: <strong id="hold-time">0.0s</strong></span>
            <span>Required: <strong>3.0s</strong></span>
          </div>
        `;
      case 'rhythm':
        return `
          <div class="astra-rhythm-container" id="rhythm-container">
            <div class="astra-rhythm-display" id="rhythm-display">
              <div class="astra-rhythm-pad" id="rhythm-pad-1"></div>
              <div class="astra-rhythm-pad" id="rhythm-pad-2"></div>
              <div class="astra-rhythm-pad" id="rhythm-pad-3"></div>
            </div>
            <div class="astra-rhythm-wave" id="rhythm-wave"></div>
          </div>
          <div class="astra-rhythm-status">
            <span>Pattern: <strong id="rhythm-pattern">3-1-2</strong></span>
            <span>Progress: <strong id="rhythm-progress">0/3</strong></span>
          </div>
        `;
      case 'pressure':
        return `
          <div class="astra-pressure-container" id="pressure-container">
            <div class="astra-pressure-circle" id="pressure-circle"></div>
            <div class="astra-pressure-ring" id="pressure-ring"></div>
            <div class="astra-pressure-fill" id="pressure-fill"></div>
          </div>
          <div class="astra-pressure-status">
            <span>Pressure: <strong id="pressure-value">0%</strong></span>
            <span>Required: <strong>80%</strong></span>
          </div>
        `;
      case 'path':
        return `
          <div class="astra-path-container" id="path-container">
            <canvas class="astra-path-canvas" id="path-canvas" width="200" height="200"></canvas>
            <div class="astra-path-target" id="path-target"></div>
          </div>
          <div class="astra-path-status">
            <span>Progress: <strong id="path-progress">0%</strong></span>
          </div>
        `;
      case 'semantic':
        return `
          <div class="astra-semantic-container" id="semantic-container">
            <div class="astra-semantic-shapes" id="semantic-shapes"></div>
            <div class="astra-semantic-instruction" id="semantic-instruction">Tap the blue circle</div>
          </div>
        `;
      case 'microchain':
        return `
          <div class="astra-microchain-container" id="microchain-container">
            <div class="astra-microchain-area" id="microchain-area">
              <div class="astra-microchain-step" id="microchain-step-1">1</div>
              <div class="astra-microchain-arrow" id="microchain-arrow-1"></div>
              <div class="astra-microchain-step" id="microchain-step-2">2</div>
              <div class="astra-microchain-arrow" id="microchain-arrow-2"></div>
              <div class="astra-microchain-step" id="microchain-step-3">3</div>
            </div>
            <div class="astra-microchain-status" id="microchain-status">Flick up</div>
          </div>
        `;
      case 'gaze':
        return `
          <div class="astra-gaze-container" id="gaze-container">
            <div class="astra-gaze-area" id="gaze-area">
              <div class="astra-gaze-target" id="gaze-target"></div>
            </div>
            <div class="astra-gaze-indicator" id="gaze-indicator">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7z"/>
              </svg>
            </div>
          </div>
        `;
      case 'contextual':
        return `
          <div class="astra-contextual-container" id="contextual-container">
            <div class="astra-contextual-display" id="contextual-display">
              <p class="astra-contextual-sentence">The red button was clicked in the previous step.</p>
            </div>
            <div class="astra-contextual-question" id="contextual-question">What color was the button?</div>
            <div class="astra-contextual-options" id="contextual-options"></div>
          </div>
        `;
      default:
        return '<p>Loading...</p>';
    }
  }

  private getInstruction(type: ChallengeType): string {
    const instructions: Record<ChallengeType, string> = {
      pulse: 'TAP WITH THE RHYTHM',
      tilt: 'TILT OR DRAG TO BALANCE',
      flick: 'SWIPE THE DIRECTION',
      breath: 'FOLLOW THE BREATHING',
      rhythm: 'TAP THE RHYTHM PATTERN',
      pressure: 'HOLD WITH PRESSURE',
      path: 'FOLLOW THE PATH',
      semantic: 'TAP THE CORRECT SHAPE',
      microchain: 'COMPLETE THE CHAIN',
      gaze: 'LOOK AT THE TARGET',
      contextual: 'ANSWER THE QUESTION'
    };
    return instructions[type];
  }

  private initChallenge(type: ChallengeType, tier: TierLevel): void {
    switch (type) {
      case 'pulse': this.initPulseChallenge(tier); break;
      case 'tilt': this.initTiltChallenge(tier); break;
      case 'flick': this.initFlickChallenge(tier); break;
      case 'breath': this.initBreathChallenge(tier); break;
      case 'rhythm': this.initRhythmChallenge(tier); break;
      case 'pressure': this.initPressureChallenge(tier); break;
      case 'path': this.initPathChallenge(tier); break;
      case 'semantic': this.initSemanticChallenge(tier); break;
      case 'microchain': this.initMicrochainChallenge(tier); break;
      case 'gaze': this.initGazeChallenge(tier); break;
      case 'contextual': this.initContextualChallenge(tier); break;
    }
  }

  private initPulseChallenge(tier: TierLevel): void {
    const pulseCount = tier === 2 ? 3 : 5;
    let currentPulse = 0;
    const duration = 3000;
    const startTime = Date.now();
    const progressBar = document.getElementById('astra-progress');
    const core = document.getElementById('pulse-core');
    const rings = document.querySelectorAll('.astra-pulse-ring');

    rings.forEach((ring, i) => setTimeout(() => ring.classList.add('animate'), i * 400));

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;
      if (elapsed < duration) requestAnimationFrame(animate);
    };
    animate();

    const handleTap = () => {
      const elapsed = Date.now() - startTime;
      const expectedTimes = Array.from({ length: pulseCount }, (_, i) => (duration / (pulseCount + 1)) * (i + 1));
      const isValid = expectedTimes.some(t => Math.abs(elapsed - t) < 400);

      if (isValid && currentPulse < pulseCount) {
        currentPulse++;
        core?.classList.add('active');
        setTimeout(() => core?.classList.remove('active'), 100);
        if ('vibrate' in navigator) navigator.vibrate(30);

        if (currentPulse >= pulseCount) {
          document.removeEventListener('click', handleTap);
          document.removeEventListener('touchstart', handleTap);
          this.completeChallenge(true, 'pulse', tier);
        }
      }
    };

    document.addEventListener('click', handleTap);
    document.addEventListener('touchstart', handleTap);

    this.currentChallenge = {
      cleanup: () => {
        document.removeEventListener('click', handleTap);
        document.removeEventListener('touchstart', handleTap);
      }
    };

    setTimeout(() => {
      if (currentPulse < pulseCount) {
        (this.currentChallenge as any)?.cleanup?.();
        this.completeChallenge(false, 'pulse', tier);
      }
    }, duration + 500);
  }

  private initTiltChallenge(tier: TierLevel): void {
    const ball = document.getElementById('tilt-ball') as HTMLElement;
    const target = document.getElementById('tilt-target') as HTMLElement;
    const container = document.getElementById('tilt-container') as HTMLElement;
    const progressBar = document.getElementById('astra-progress');
    const duration = 4000;
    const startTime = Date.now();

    let ballX = 80, ballY = 80, targetX = 80, targetY = 80;
    let isBalanced = 0;
    const requiredBalance = tier === 2 ? 15 : 25;
    const tolerance = tier === 2 ? 20 : 15;
    let dragMode = false;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;

      const distance = Math.sqrt(Math.pow(ballX - targetX, 2) + Math.pow(ballY - targetY, 2));
      if (distance < tolerance) isBalanced++;
      else isBalanced = Math.max(0, isBalanced - 2);

      if (ball) {
        ball.style.left = `${ballX}px`;
        ball.style.top = `${ballY}px`;
      }

      if (Math.random() < 0.02 && target) {
        targetX = 60 + Math.random() * 80;
        targetY = 60 + Math.random() * 80;
        target.style.left = `${targetX}px`;
        target.style.top = `${targetY}px`;
      }

      if (isBalanced >= requiredBalance) {
        this.completeChallenge(true, 'tilt', tier);
        return;
      }

      if (elapsed < duration) {
        requestAnimationFrame(animate);
      } else {
        this.completeChallenge(false, 'tilt', tier);
      }
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (dragMode) return;
      const gamma = (e.gamma || 0) * 0.5;
      const beta = (e.beta || 0) * 0.3;
      ballX = Math.max(20, Math.min(160, ballX - gamma));
      ballY = Math.max(20, Math.min(160, ballY + beta));
    };

    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      window.addEventListener('deviceorientation', handleOrientation);
    } else {
      dragMode = true;
    }

    const handleDrag = (e: MouseEvent | TouchEvent) => {
      if (!dragMode) return;
      const rect = container.getBoundingClientRect();
      const x = 'clientX' in (e as MouseEvent) ? (e as MouseEvent).clientX : (e as TouchEvent).touches?.[0]?.clientX;
      const y = 'clientY' in (e as MouseEvent) ? (e as MouseEvent).clientY : (e as TouchEvent).touches?.[0]?.clientY;
      if (x !== undefined && y !== undefined) {
        ballX = Math.max(20, Math.min(160, x - rect.left));
        ballY = Math.max(20, Math.min(160, y - rect.top));
      }
    };

    const handleDragStart = () => { dragMode = true; };
    const handleDragEnd = () => { dragMode = false; };

    container?.addEventListener('mousedown', handleDragStart);
    container?.addEventListener('touchstart', handleDragStart);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('touchmove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);

    this.currentChallenge = {
      cleanup: () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        container?.removeEventListener('mousedown', handleDragStart);
        container?.removeEventListener('touchstart', handleDragStart);
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('touchmove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchend', handleDragEnd);
      }
    };

    animate();
  }

  private initFlickChallenge(tier: TierLevel): void {
    const container = document.getElementById('flick-container');
    const arrow = document.getElementById('flick-arrow') as HTMLElement;
    const progressBar = document.getElementById('astra-progress');
    const duration = 3000;
    const startTime = Date.now();

    const directions = ['right', 'left', 'up', 'down'];
    const targetDir = directions[Math.floor(Math.random() * directions.length)];
    const rotations: Record<string, number> = { right: 0, down: 90, left: 180, up: 270 };

    if (arrow) arrow.style.transform = `rotate(${rotations[targetDir]}deg)`;

    let startX = 0, startY = 0, isTracking = false;

    const handleStart = (e: MouseEvent | TouchEvent) => {
      const evt = e as MouseEvent;
      const touch = (e as TouchEvent).touches?.[0];
      startX = evt.clientX || touch?.clientX || 0;
      startY = evt.clientY || touch?.clientY || 0;
      isTracking = true;
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isTracking) return;
      const evt = e as MouseEvent;
      const touch = (e as TouchEvent).touches?.[0];
      const deltaX = (evt.clientX || touch?.clientX || 0) - startX;
      const deltaY = (evt.clientY || touch?.clientY || 0) - startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > 50) {
        isTracking = false;
        const swipeDir = Math.abs(deltaX) > Math.abs(deltaY)
          ? (deltaX > 0 ? 'right' : 'left')
          : (deltaY > 0 ? 'down' : 'up');

        if (swipeDir === targetDir) {
          if (arrow) arrow.style.transform = `rotate(${rotations[targetDir]}deg) scale(1.3)`;
          if ('vibrate' in navigator) navigator.vibrate(50);
          this.completeChallenge(true, 'flick', tier);
        } else {
          startX = evt.clientX || touch?.clientX || 0;
          startY = evt.clientY || touch?.clientY || 0;
          isTracking = true;
        }
      }
    };

    const handleEnd = () => { isTracking = false; };

    container?.addEventListener('mousedown', handleStart);
    container?.addEventListener('touchstart', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);

    this.currentChallenge = {
      cleanup: () => {
        container?.removeEventListener('mousedown', handleStart);
        container?.removeEventListener('touchstart', handleStart);
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchend', handleEnd);
      }
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;
      if (elapsed < duration) requestAnimationFrame(animate);
      else this.completeChallenge(false, 'flick', tier);
    };
    animate();
  }

  private initBreathChallenge(tier: TierLevel): void {
    const circle = document.getElementById('breath-circle') as HTMLElement;
    const text = document.getElementById('breath-text') as HTMLElement;
    const progressBar = document.getElementById('astra-progress');
    const duration = 6000;
    const startTime = Date.now();
    const breathDuration = 4000;
    let totalHoldTime = 0;
    let isPressing = false;

    const handlePressStart = () => { isPressing = true; };
    const handlePressEnd = () => { isPressing = false; };

    document.addEventListener('mousedown', handlePressStart);
    document.addEventListener('touchstart', handlePressStart);
    document.addEventListener('mouseup', handlePressEnd);
    document.addEventListener('touchend', handlePressEnd);

    this.currentChallenge = {
      cleanup: () => {
        document.removeEventListener('mousedown', handlePressStart);
        document.removeEventListener('touchstart', handlePressStart);
        document.removeEventListener('mouseup', handlePressEnd);
        document.removeEventListener('touchend', handlePressEnd);
      }
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;

      const cycleTime = elapsed % (breathDuration * 2);
      const breathPhase = cycleTime / breathDuration;

      if (breathPhase < 1) {
        const scale = 0.6 + (breathPhase * 0.6);
        if (circle) circle.style.transform = `scale(${scale})`;
        if (text) text.textContent = 'Breathe In';
        if (circle) circle.style.opacity = String(0.6 + (breathPhase * 0.4));
      } else {
        const scale = 1.2 - ((breathPhase - 1) * 0.6);
        if (circle) circle.style.transform = `scale(${scale})`;
        if (text) text.textContent = 'Breathe Out';
        if (circle) circle.style.opacity = String(1 - ((breathPhase - 1) * 0.4));
      }

      if (breathPhase < 0.5 && isPressing) totalHoldTime += 16;

      if (totalHoldTime >= (tier === 2 ? 2000 : 3000)) {
        if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
        this.completeChallenge(true, 'breath', tier);
        return;
      }

      if (elapsed < duration) {
        requestAnimationFrame(animate);
      } else {
        this.completeChallenge(false, 'breath', tier);
      }
    };
    animate();
  }

  // RYTHHM CHALLENGE - Tap a specific rhythm pattern
  private initRhythmChallenge(tier: TierLevel): void {
    const progressBar = document.getElementById('astra-progress');
    const duration = 5000;
    const startTime = Date.now();
    const pattern = [0, 300, 600, 900]; // Quick-quick-quick pause pattern
    let currentStep = 0;
    let lastTapTime = 0;
    const tolerance = 200;

    const pads = [
      document.getElementById('rhythm-pad-1'),
      document.getElementById('rhythm-pad-2'),
      document.getElementById('rhythm-pad-3')
    ];
    const progress = document.getElementById('rhythm-progress');

    // Highlight pads in pattern
    pads.forEach((pad, i) => {
      if (pad) {
        pad.style.background = 'var(--astra-surface-alt)';
        pad.style.border = '2px solid var(--astra-border)';
      }
    });

    const handleTap = () => {
      const elapsed = Date.now() - startTime;
      const expectedTime = pattern[currentStep];

      if (Math.abs(elapsed - expectedTime) <= tolerance) {
        if (pads[currentStep]) {
          pads[currentStep]!.style.background = 'var(--astra-accent)';
          pads[currentStep]!.style.borderColor = 'var(--astra-accent)';
        }
        if (progress) progress.textContent = `${currentStep + 1}/3`;
        if ('vibrate' in navigator) navigator.vibrate(30);
        currentStep++;

        if (currentStep >= 3) {
          document.removeEventListener('click', handleTap);
          document.removeEventListener('touchstart', handleTap);
          this.completeChallenge(true, 'rhythm', tier);
        }
      }
    };

    document.addEventListener('click', handleTap);
    document.addEventListener('touchstart', handleTap);

    this.currentChallenge = {
      cleanup: () => {
        document.removeEventListener('click', handleTap);
        document.removeEventListener('touchstart', handleTap);
      }
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;
      if (elapsed < duration) requestAnimationFrame(animate);
      else if (currentStep < 3) this.completeChallenge(false, 'rhythm', tier);
    };
    animate();
  }

  // PRESSURE CHALLENGE - Hold with variable pressure
  private initPressureChallenge(tier: TierLevel): void {
    const container = document.getElementById('pressure-container');
    const circle = document.getElementById('pressure-circle');
    const ring = document.getElementById('pressure-ring');
    const fill = document.getElementById('pressure-fill');
    const progressBar = document.getElementById('astra-progress');
    const pressureValue = document.getElementById('pressure-value');
    const duration = 6000;
    const startTime = Date.now();
    let currentPressure = 0;
    let targetPressure = tier === 2 ? 60 : 80;
    let isHolding = false;
    let holdDuration = 0;
    let requiredHoldTime = 2000;

    const updatePressureDisplay = () => {
      if (circle) circle.style.transform = `scale(${0.8 + (currentPressure / 100) * 0.4})`;
      if (fill) fill.style.height = `${currentPressure}%`;
      if (ring) ring.style.borderColor = currentPressure >= targetPressure ? 'var(--astra-accent)' : 'var(--astra-border)';
      if (pressureValue) pressureValue.textContent = `${Math.round(currentPressure)}%`;
    };

    const handleHoldStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isHolding = true;
    };

    const handleHoldEnd = () => {
      isHolding = false;
      currentPressure = 0;
      updatePressureDisplay();
    };

    container?.addEventListener('mousedown', handleHoldStart);
    container?.addEventListener('touchstart', handleHoldStart);
    document.addEventListener('mouseup', handleHoldEnd);
    document.addEventListener('touchend', handleHoldEnd);

    this.currentChallenge = {
      cleanup: () => {
        container?.removeEventListener('mousedown', handleHoldStart);
        container?.removeEventListener('touchstart', handleHoldStart);
        document.removeEventListener('mouseup', handleHoldEnd);
        document.removeEventListener('touchend', handleHoldEnd);
      }
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;

      if (isHolding) {
        // Simulate pressure increase (in real implementation, use Force Touch API)
        currentPressure = Math.min(100, currentPressure + 2);
      } else {
        currentPressure = Math.max(0, currentPressure - 3);
      }
      updatePressureDisplay();

      if (currentPressure >= targetPressure) {
        holdDuration += 16;
        if (holdDuration >= requiredHoldTime) {
          if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
          this.completeChallenge(true, 'pressure', tier);
          return;
        }
      } else {
        holdDuration = 0;
      }

      if (elapsed < duration) {
        requestAnimationFrame(animate);
      } else {
        this.completeChallenge(false, 'pressure', tier);
      }
    };
    animate();
  }

  // PATH TRACING CHALLENGE - Follow a squiggly path
  private initPathChallenge(tier: TierLevel): void {
    const canvas = document.getElementById('path-canvas') as HTMLCanvasElement;
    const progressBar = document.getElementById('astra-progress');
    const pathProgress = document.getElementById('path-progress');
    const ctx = canvas?.getContext('2d');
    const duration = 6000;
    const startTime = Date.now();

    if (!canvas || !ctx) return;

    // Generate a random squiggly path
    const pathPoints: {x: number, y: number}[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const x = 20 + (i / steps) * 160;
      const y = 100 + Math.sin(i * 0.5) * 60 + (Math.random() - 0.5) * 20;
      pathPoints.push({ x, y });
    }

    // Draw the target path
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 1; i < pathPoints.length; i++) {
      ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
    }
    ctx.stroke();

    // Draw visible path line
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 1; i < pathPoints.length; i++) {
      ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // User's drawn path
    let userPath: {x: number, y: number}[] = [];
    let isDrawing = false;
    let currentStep = 0;

    const getCanvasCoords = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = 'clientX' in (e as MouseEvent) ? (e as MouseEvent).clientX - rect.left : (e as TouchEvent).touches?.[0]?.clientX - rect.left;
      const y = 'clientY' in (e as MouseEvent) ? (e as MouseEvent).clientY - rect.top : (e as TouchEvent).touches?.[0]?.clientY - rect.top;
      return { x, y };
    };

    const handleStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawing = true;
      const coords = getCanvasCoords(e);
      userPath = [coords];
      ctx!.strokeStyle = '#22c55e';
      ctx!.lineWidth = 4;
      ctx!.beginPath();
      ctx!.moveTo(coords.x, coords.y);
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const coords = getCanvasCoords(e);
      userPath.push(coords);
      ctx!.lineTo(coords.x, coords.y);
      ctx!.stroke();

      // Check if user is following the path
      const targetPoint = pathPoints[Math.min(currentStep + 1, pathPoints.length - 1)];
      const dist = Math.sqrt(Math.pow(coords.x - targetPoint.x, 2) + Math.pow(coords.y - targetPoint.y, 2));

      if (dist < 40) {
        currentStep = Math.min(currentStep + 1, pathPoints.length - 1);
        const progressPercent = Math.round((currentStep / (pathPoints.length - 1)) * 100);
        if (pathProgress) pathProgress.textContent = `${progressPercent}%`;

        if (currentStep >= pathPoints.length - 2) {
          isDrawing = false;
          this.completeChallenge(true, 'path', tier);
          return;
        }
      }
    };

    const handleEnd = () => {
      isDrawing = false;
    };

    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('touchstart', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('touchmove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);

    this.currentChallenge = {
      cleanup: () => {
        canvas.removeEventListener('mousedown', handleStart);
        canvas.removeEventListener('touchstart', handleStart);
        canvas.removeEventListener('mousemove', handleMove);
        canvas.removeEventListener('touchmove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchend', handleEnd);
      }
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;
      if (elapsed < duration) requestAnimationFrame(animate);
      else if (currentStep < pathPoints.length - 2) this.completeChallenge(false, 'path', tier);
    };
    animate();
  }

  // SEMANTIC CHALLENGE - Identify shapes/colors
  private initSemanticChallenge(tier: TierLevel): void {
    const container = document.getElementById('semantic-shapes');
    const instruction = document.getElementById('semantic-instruction');
    const progressBar = document.getElementById('astra-progress');
    const duration = 4000;
    const startTime = Date.now();

    // Generate random shapes
    const shapes = ['circle', 'square', 'triangle'];
    const colors = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b'];
    const targets = [
      { shape: 'circle', color: colors[0] },
      { shape: 'square', color: colors[1] },
      { shape: 'triangle', color: colors[2] }
    ];
    const target = targets[Math.floor(Math.random() * targets.length)];

    if (instruction) {
      instruction.textContent = `Tap the ${target.shape === 'circle' ? 'blue' : target.shape === 'square' ? 'red' : 'yellow'} ${target.shape}`;
    }

    // Create shape elements
    if (container) {
      container.innerHTML = '';
      shapes.forEach((shape, i) => {
        const color = colors[i];
        const el = document.createElement('div');
        el.className = `astra-shape astra-shape-${shape}`;
        el.style.background = color;
        el.dataset.shape = shape;
        el.dataset.color = color;
        el.addEventListener('click', () => {
          if (el.dataset.shape === target.shape && el.dataset.color === target.color) {
            if ('vibrate' in navigator) navigator.vibrate(50);
            this.completeChallenge(true, 'semantic', tier);
          } else {
            el.style.opacity = '0.3';
          }
        });
        container.appendChild(el);
      });
    }

    this.currentChallenge = {
      cleanup: () => {}
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;
      if (elapsed < duration) requestAnimationFrame(animate);
      else this.completeChallenge(false, 'semantic', tier);
    };
    animate();
  }

  // MICRO-CHAIN CHALLENGE - Complete interaction chain
  private initMicrochainChallenge(tier: TierLevel): void {
    const area = document.getElementById('microchain-area');
    const status = document.getElementById('microchain-status');
    const progressBar = document.getElementById('astra-progress');
    const duration = 7000;
    const startTime = Date.now();

    const actions = [
      { type: 'flick', direction: 'up', label: 'Flick up' },
      { type: 'tap', count: 2, label: 'Tap twice' },
      { type: 'hold', duration: 1000, label: 'Hold 1s' }
    ];
    let currentAction = 0;
    let tapCount = 0;
    let holdStart = 0;
    let isHolding = false;
    let startX = 0, startY = 0;

    const updateStatus = () => {
      if (status) status.textContent = actions[currentAction].label;
    };
    updateStatus();

    const handleTap = () => {
      if (actions[currentAction].type === 'tap') {
        tapCount++;
        if (tapCount >= (actions[currentAction] as any).count) {
          advanceAction();
        }
      }
    };

    const handleHoldStart = () => {
      if (actions[currentAction].type === 'hold') {
        isHolding = true;
        holdStart = Date.now();
      }
    };

    const handleHoldEnd = () => {
      isHolding = false;
    };

    const handleFlick = (e: MouseEvent | TouchEvent) => {
      if (actions[currentAction].type !== 'flick') return;

      const evt = e as MouseEvent;
      const touch = (e as TouchEvent).touches?.[0];
      const x = evt.clientX || touch?.clientX || 0;
      const y = evt.clientY || touch?.clientY || 0;

      if (startX === 0 && startY === 0) {
        startX = x;
        startY = y;
        return;
      }

      const deltaY = startY - y;
      if (deltaY > 50) {
        advanceAction();
      }
    };

    const advanceAction = () => {
      currentAction++;
      tapCount = 0;
      isHolding = false;
      holdStart = 0;
      startX = 0;
      startY = 0;

      if (currentAction >= actions.length) {
        if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
        this.completeChallenge(true, 'microchain', tier);
        return;
      }

      updateStatus();

      // Highlight next step
      const steps = document.querySelectorAll('.astra-microchain-step');
      steps.forEach((step, i) => {
        (step as HTMLElement).style.borderColor = i <= currentAction ? 'var(--astra-accent)' : 'var(--astra-border)';
        (step as HTMLElement).style.background = i <= currentAction ? 'var(--astra-accent)' : 'var(--astra-surface-alt)';
      });
    };

    area?.addEventListener('click', handleTap);
    area?.addEventListener('mousedown', handleHoldStart);
    area?.addEventListener('touchstart', handleHoldStart);
    document.addEventListener('mouseup', handleHoldEnd);
    document.addEventListener('touchend', handleHoldEnd);
    document.addEventListener('mousemove', handleFlick);
    document.addEventListener('touchmove', handleFlick as any);

    this.currentChallenge = {
      cleanup: () => {
        area?.removeEventListener('click', handleTap);
        area?.removeEventListener('mousedown', handleHoldStart);
        area?.removeEventListener('touchstart', handleHoldStart);
        document.removeEventListener('mouseup', handleHoldEnd);
        document.removeEventListener('touchend', handleHoldEnd);
        document.removeEventListener('mousemove', handleFlick);
        document.removeEventListener('touchmove', handleFlick as any);
      }
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;

      // Check hold duration
      if (isHolding && actions[currentAction].type === 'hold') {
        if (Date.now() - holdStart >= (actions[currentAction] as any).duration) {
          advanceAction();
        }
      }

      if (elapsed < duration) requestAnimationFrame(animate);
      else this.completeChallenge(false, 'microchain', tier);
    };
    animate();
  }

  // GAZE CHALLENGE - Look at target location
  private initGazeChallenge(tier: TierLevel): void {
    const area = document.getElementById('gaze-area');
    const target = document.getElementById('gaze-target');
    const indicator = document.getElementById('gaze-indicator');
    const progressBar = document.getElementById('astra-progress');
    const duration = 4000;
    const startTime = Date.now();

    // Random target position
    const positions = [
      { x: 20, y: 20 },
      { x: 160, y: 20 },
      { x: 20, y: 160 },
      { x: 160, y: 160 }
    ];
    const targetPos = positions[Math.floor(Math.random() * positions.length)];

    if (target) {
      target.style.left = `${targetPos.x}px`;
      target.style.top = `${targetPos.y}px`;
    }

    let gazeTime = 0;
    const requiredGazeTime = 1500;

    // Use mouse position as proxy for gaze (simplified - real implementation would use webcam)
    const handleMouseMove = (e: MouseEvent) => {
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dist = Math.sqrt(Math.pow(x - targetPos.x - 20, 2) + Math.pow(y - targetPos.y - 20, 2));

      if (dist < 50) {
        gazeTime += 16;
        if (indicator) indicator.style.color = 'var(--astra-accent)';
      } else {
        gazeTime = Math.max(0, gazeTime - 5);
        if (indicator) indicator.style.color = 'var(--astra-text-muted)';
      }

      if (gazeTime >= requiredGazeTime) {
        document.removeEventListener('mousemove', handleMouseMove);
        if ('vibrate' in navigator) navigator.vibrate(50);
        this.completeChallenge(true, 'gaze', tier);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    this.currentChallenge = {
      cleanup: () => {
        document.removeEventListener('mousemove', handleMouseMove);
      }
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;
      if (elapsed < duration) requestAnimationFrame(animate);
      else this.completeChallenge(false, 'gaze', tier);
    };
    animate();
  }

  // CONTEXTUAL CHALLENGE - Answer based on context
  private initContextualChallenge(tier: TierLevel): void {
    const optionsContainer = document.getElementById('contextual-options');
    const question = document.getElementById('contextual-question');
    const display = document.getElementById('contextual-display');
    const progressBar = document.getElementById('astra-progress');
    const duration = 5000;
    const startTime = Date.now();

    // Generate contextual question
    const scenarios = [
      {
        sentence: 'The user clicked the blue button.',
        question: 'What color was the button?',
        options: ['Red', 'Blue', 'Green'],
        answer: 'Blue'
      },
      {
        sentence: 'The form had three fields: name, email, and password.',
        question: 'How many fields were there?',
        options: ['Two', 'Three', 'Four'],
        answer: 'Three'
      },
      {
        sentence: 'The login page showed at 10:30 AM.',
        question: 'When was the page shown?',
        options: ['Morning', 'Afternoon', 'Evening'],
        answer: 'Morning'
      }
    ];

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

    if (display) {
      display.innerHTML = `<p class="astra-contextual-sentence">${scenario.sentence}</p>`;
    }
    if (question) {
      question.textContent = scenario.question;
    }

    if (optionsContainer) {
      optionsContainer.innerHTML = '';
      scenario.options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'astra-contextual-option';
        btn.textContent = option;
        btn.addEventListener('click', () => {
          if (option === scenario.answer) {
            if ('vibrate' in navigator) navigator.vibrate(50);
            this.completeChallenge(true, 'contextual', tier);
          } else {
            btn.style.opacity = '0.3';
            btn.disabled = true;
          }
        });
        optionsContainer.appendChild(btn);
      });
    }

    this.currentChallenge = {
      cleanup: () => {}
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (progressBar) progressBar.style.width = `${Math.max(0, 100 - (elapsed / duration * 100))}%`;
      if (elapsed < duration) requestAnimationFrame(animate);
      else this.completeChallenge(false, 'contextual', tier);
    };
    animate();
  }

  completeChallenge(success: boolean, type: ChallengeType, tier: TierLevel): void {
    // Guard against double-completion (timeout + success race)
    if (this.challengeCompleted) return;
    this.challengeCompleted = true;

    this.currentChallenge?.cleanup?.();

    if (success) {
      this.showSuccess(() => {
        this.removeOverlay();
        this.callback?.({ success: true, type, tier });
      });
    } else {
      this.callback?.({ success: false, reason: 'timeout', type, tier, attempts: 1 });
    }
  }

  private showSuccess(callback: () => void): void {
    const container = document.querySelector('.astra-container');
    if (container) {
      container.innerHTML = `
        <div class="astra-header">
          <span class="astra-logo-text">ASTRA</span>
        </div>
        <div class="astra-success-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 class="astra-instruction" style="color: var(--astra-accent);">Verified</h2>
        <p class="astra-subtitle">You're all set. No further action required.</p>
      `;
    }
    if ('vibrate' in navigator) navigator.vibrate([50, 100, 50]);
    setTimeout(callback, 1500);
  }

  removeOverlay(): void {
    this.currentChallenge?.cleanup?.();
    const overlay = document.getElementById('astra-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
  }
}
