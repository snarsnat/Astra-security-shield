/**
 * Challenge Manager - Orchestrates all challenge types
 * Creates engaging, accessible verification challenges
 */

export class ChallengeManager {
  constructor(options, mutator, accessibility) {
    this.options = options;
    this.mutator = mutator;
    this.accessibility = accessibility;

    this.activeOverlay = null;
    this.currentChallenge = null;
    this.callback = null;

    // Challenge types
    this.challenges = {
      pulse: {
        name: 'Pulse',
        description: 'Tap along with the rhythm',
        duration: 3000,
        accessibility: true
      },
      tilt: {
        name: 'Tilt',
        description: 'Balance the ball on the target',
        duration: 4000,
        accessibility: true
      },
      flick: {
        name: 'Flick',
        description: 'Swipe in the indicated direction',
        duration: 2000,
        accessibility: true
      },
      breath: {
        name: 'Breath',
        description: 'Follow the breathing rhythm',
        duration: 5000,
        accessibility: true
      }
    };
  }

  /**
   * Create and show challenge UI
   */
  createChallengeUI(tier, callback) {
    this.callback = callback;

    // Remove existing overlay
    this.removeOverlay();

    // Get challenge type based on mutation
    const challengeType = this.mutator.getChallengeForTier(tier);

    // Create overlay
    this.activeOverlay = document.createElement('div');
    this.activeOverlay.id = 'astra-overlay';
    this.activeOverlay.className = 'astra-overlay';
    this.activeOverlay.setAttribute('role', 'dialog');
    this.activeOverlay.setAttribute('aria-modal', 'true');
    this.activeOverlay.setAttribute('aria-labelledby', 'astra-title');

    // Build challenge UI based on type
    const challengeUI = this.buildChallengeUI(challengeType, tier);

    this.activeOverlay.innerHTML = challengeUI;
    document.body.appendChild(this.activeOverlay);

    // Trigger animation
    requestAnimationFrame(() => {
      this.activeOverlay.classList.add('active');
    });

    // Initialize the specific challenge
    this.initChallenge(challengeType, tier);

    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        this.cancelChallenge();
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Build challenge UI HTML
   */
  buildChallengeUI(challengeType, tier) {
    const challenge = this.challenges[challengeType];

    return `
      <div class="astra-modal">
        <div class="astra-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <h2 class="astra-title" id="astra-title">Quick Verification</h2>
        <p class="astra-subtitle">${challenge.description}</p>

        <div class="astra-progress">
          <div class="astra-progress-bar" id="astra-progress" style="width: 100%"></div>
        </div>

        <div class="astra-challenge-area" id="astra-challenge-area">
          ${this.getChallengeContent(challengeType)}
        </div>

        <button class="astra-btn" id="astra-skip" style="display: none;">
          Skip to Alternatives
        </button>

        <p class="astra-instruction" id="astra-instruction">
          ${this.getInstruction(challengeType)}
        </p>
      </div>
    `;
  }

  /**
   * Get challenge-specific content HTML
   */
  getChallengeContent(challengeType) {
    switch (challengeType) {
      case 'pulse':
        return `
          <div class="astra-pulse-container" id="pulse-container">
            <div class="astra-pulse-ring" id="pulse-ring-1"></div>
            <div class="astra-pulse-ring" id="pulse-ring-2"></div>
            <div class="astra-pulse-ring" id="pulse-ring-3"></div>
            <div class="astra-pulse-core" id="pulse-core"></div>
            <div class="astra-pulse-indicator" id="pulse-indicator">Tap 3 times</div>
          </div>
        `;

      case 'tilt':
        return `
          <div class="astra-tilt-container" id="tilt-container">
            <div class="astra-tilt-target" id="tilt-target"></div>
            <div class="astra-tilt-ball" id="tilt-ball"></div>
          </div>
          <p style="margin-top: 16px; font-size: 14px; color: #64748B;">
            Tilt your device or drag the ball
          </p>
        `;

      case 'flick':
        return `
          <div class="astra-flick-container" id="flick-container">
            <div class="astra-flick-arrow" id="flick-arrow">
              <svg id="flick-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14"/>
                <path d="m12 5 7 7-7 7"/>
              </svg>
            </div>
          </div>
          <p style="margin-top: 16px; font-size: 14px; color: #64748B;">
            Swipe in the arrow direction
          </p>
        `;

      case 'breath':
        return `
          <div class="astra-breath-container" id="breath-container">
            <div class="astra-breath-circle" id="breath-circle"></div>
            <div class="astra-breath-text" id="breath-text">Breathe In</div>
          </div>
        `;

      default:
        return '<p>Loading challenge...</p>';
    }
  }

  /**
   * Get instruction text for challenge
   */
  getInstruction(challengeType) {
    const instructions = {
      pulse: 'TAP WITH THE RHYTHM',
      tilt: 'TILT OR DRAG TO BALANCE',
      flick: 'SWIPE THE DIRECTION',
      breath: 'FOLLOW THE BREATHING'
    };
    return instructions[challengeType] || 'COMPLETE THE CHALLENGE';
  }

  /**
   * Initialize specific challenge
   */
  initChallenge(challengeType, tier) {
    switch (challengeType) {
      case 'pulse':
        this.initPulseChallenge(tier);
        break;
      case 'tilt':
        this.initTiltChallenge(tier);
        break;
      case 'flick':
        this.initFlickChallenge(tier);
        break;
      case 'breath':
        this.initBreathChallenge(tier);
        break;
    }
  }

  /**
   * Initialize Pulse challenge - tap in rhythm with vibration
   */
  initPulseChallenge(tier) {
    const pulseCount = tier === 2 ? 3 : 5;
    let currentPulse = 0;
    const tapTimes = [];
    const expectedIntervals = [];
    const duration = 3000;

    // Generate expected tap times
    const interval = duration / (pulseCount + 1);
    for (let i = 1; i <= pulseCount; i++) {
      expectedIntervals.push(interval * i);
    }

    // Start visual and haptic feedback
    const startTime = Date.now();
    const progressBar = document.getElementById('astra-progress');
    const indicator = document.getElementById('pulse-indicator');
    const core = document.getElementById('pulse-core');
    const rings = [
      document.getElementById('pulse-ring-1'),
      document.getElementById('pulse-ring-2'),
      document.getElementById('pulse-ring-3')
    ];

    // Animate rings
    rings.forEach((ring, i) => {
      setTimeout(() => {
        ring.classList.add('animate');
      }, i * 400);
    });

    // Visual pulse indicator
    const animatePulse = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration * 100));
      progressBar.style.width = `${remaining}%`;

      // Pulse core animation
      const cycle = (elapsed % 1200) / 1200;
      if (cycle < 0.5) {
        core.style.transform = 'translate(-50%, -50%) scale(1)';
      } else {
        core.style.transform = 'translate(-50%, -50%) scale(1.2)';
      }

      // Update indicator
      indicator.textContent = `Tap ${pulseCount - currentPulse} times`;

      if (elapsed < duration) {
        requestAnimationFrame(animatePulse);
      }
    };
    animatePulse();

    // Haptic feedback if available
    const vibrate = () => {
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    };

    // Vibration pattern
    expectedIntervals.forEach(time => {
      setTimeout(vibrate, time);
    });

    // Handle tap
    const handleTap = () => {
      const tapTime = Date.now() - startTime;

      // Check if tap is within acceptable window
      const matchingExpected = expectedIntervals.find(expected =>
        Math.abs(tapTime - expected) < 400
      );

      if (matchingExpected && currentPulse < pulseCount) {
        currentPulse++;
        tapTimes.push(tapTime);
        core.classList.add('active');
        setTimeout(() => core.classList.remove('active'), 100);
        vibrate(30);

        indicator.textContent = `Tap ${pulseCount - currentPulse} times`;

        if (currentPulse >= pulseCount) {
          document.removeEventListener('click', handleTap);
          document.removeEventListener('touchstart', handleTap);
          this.completeChallenge(true, 'pulse', tier);
        }
      }
    };

    // Add tap listeners
    document.addEventListener('click', handleTap);
    document.addEventListener('touchstart', handleTap);

    // Timeout
    setTimeout(() => {
      if (currentPulse < pulseCount) {
        document.removeEventListener('click', handleTap);
        document.removeEventListener('touchstart', handleTap);
        this.completeChallenge(false, 'pulse', tier);
      }
    }, duration + 500);
  }

  /**
   * Initialize Tilt challenge - balance ball on target
   */
  initTiltChallenge(tier) {
    const ball = document.getElementById('tilt-ball');
    const target = document.getElementById('tilt-target');
    const container = document.getElementById('tilt-container');
    const progressBar = document.getElementById('astra-progress');
    const duration = 4000;
    const startTime = Date.now();

    let ballX = 80; // Start center
    let ballY = 80;
    let targetX = 80;
    let targetY = 80;
    let isBalanced = 0;
    const requiredBalance = tier === 2 ? 15 : 25; // frames of balance
    const tolerance = tier === 2 ? 20 : 15;
    let dragMode = false;

    // Progress animation
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration * 100));
      progressBar.style.width = `${remaining}%`;

      // Check if ball is within target
      const distance = Math.sqrt(Math.pow(ballX - targetX, 2) + Math.pow(ballY - targetY, 2));

      if (distance < tolerance) {
        isBalanced++;
      } else {
        isBalanced = Math.max(0, isBalanced - 2);
      }

      ball.style.left = `${ballX}px`;
      ball.style.top = `${ballY}px`;
      ball.style.transform = 'translate(-50%, -50%)';

      // Move target occasionally
      if (Math.random() < 0.02) {
        targetX = 60 + Math.random() * 80;
        targetY = 60 + Math.random() * 80;
        target.style.left = `${targetX}px`;
        target.style.top = `${targetY}px`;
        target.style.transform = 'translate(-50%, -50%)';
      }

      // Check completion
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

    // Device orientation
    const handleOrientation = (e) => {
      if (dragMode) return;

      const gamma = e.gamma || 0; // Left-right tilt
      const beta = e.beta || 0; // Front-back tilt

      ballX = Math.max(20, Math.min(160, ballX - gamma * 0.5));
      ballY = Math.max(20, Math.min(160, ballY + beta * 0.3));
    };

    // Touch/drag fallback
    const handleDrag = (e) => {
      if (!dragMode) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX || e.touches?.[0]?.clientX;
      const y = e.clientY || e.touches?.[0]?.clientY;

      if (x && y) {
        ballX = Math.max(20, Math.min(160, x - rect.left));
        ballY = Math.max(20, Math.min(160, y - rect.top));
      }
    };

    const startDrag = () => {
      dragMode = true;
    };

    const endDrag = () => {
      dragMode = false;
    };

    // Check if device supports orientation
    if (window.DeviceOrientationEvent) {
      // Request permission for iOS 13+
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // Will use drag as fallback initially
        dragMode = true;
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    } else {
      dragMode = true;
    }

    // Add drag listeners
    container.addEventListener('mousedown', startDrag);
    container.addEventListener('touchstart', startDrag);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('touchmove', handleDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    this.currentChallenge = {
      cleanup: () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('touchmove', handleDrag);
      }
    };

    animate();
  }

  /**
   * Initialize Flick challenge - swipe in direction
   */
  initFlickChallenge(tier) {
    const container = document.getElementById('flick-container');
    const arrow = document.getElementById('flick-arrow');
    const svg = document.getElementById('flick-svg');
    const progressBar = document.getElementById('astra-progress');
    const duration = 3000;
    const startTime = Date.now();

    // Random direction
    const directions = ['right', 'left', 'up', 'down'];
    const targetDirection = directions[Math.floor(Math.random() * directions.length)];

    // Set arrow direction
    const rotations = { right: 0, down: 90, left: 180, up: 270 };
    svg.style.transform = `rotate(${rotations[targetDirection]}deg)`;

    // Track swipe
    let startX = 0;
    let startY = 0;
    let isTracking = false;

    const handleStart = (e) => {
      startX = e.clientX || e.touches?.[0]?.clientX;
      startY = e.clientY || e.touches?.[0]?.clientY;
      isTracking = true;
    };

    const handleMove = (e) => {
      if (!isTracking) return;

      const currentX = e.clientX || e.touches?.[0]?.clientX;
      const currentY = e.clientY || e.touches?.[0]?.clientY;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      // Check if swipe is significant
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > 50) {
        isTracking = false;
        const swipeDirection = this.getSwipeDirection(deltaX, deltaY);

        if (swipeDirection === targetDirection) {
          // Success - animate and complete
          arrow.style.transform = `rotate(${rotations[targetDirection]}deg) scale(1.3)`;
          arrow.style.transition = 'transform 0.3s ease';

          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }

          this.completeChallenge(true, 'flick', tier);
        } else {
          // Wrong direction - reset
          startX = currentX;
          startY = currentY;
          isTracking = true;
        }
      }
    };

    const handleEnd = () => {
      isTracking = false;
    };

    container.addEventListener('mousedown', handleStart);
    container.addEventListener('touchstart', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);

    this.currentChallenge = {
      cleanup: () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchend', handleEnd);
      }
    };

    // Progress and timeout
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration * 100));
      progressBar.style.width = `${remaining}%`;

      if (elapsed < duration) {
        requestAnimationFrame(animate);
      } else {
        this.completeChallenge(false, 'flick', tier);
      }
    };
    animate();
  }

  /**
   * Initialize Breath challenge - follow breathing rhythm
   */
  initBreathChallenge(tier) {
    const circle = document.getElementById('breath-circle');
    const text = document.getElementById('breath-text');
    const progressBar = document.getElementById('astra-progress');
    const duration = 6000;
    const startTime = Date.now();

    // Breath cycle: 4s in, 4s hold, 4s out (simplified)
    const breathDuration = 4000; // Full breath cycle
    let isHolding = false;
    let holdStart = 0;
    const requiredHoldDuration = tier === 2 ? 2000 : 3000;
    let totalHoldTime = 0;

    // Track if user is pressing
    let isPressing = false;

    const handlePressStart = () => {
      isPressing = true;
    };

    const handlePressEnd = () => {
      isPressing = false;
    };

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
      const remaining = Math.max(0, 100 - (elapsed / duration * 100));
      progressBar.style.width = `${remaining}%`;

      // Breath phase
      const cycleTime = elapsed % (breathDuration * 2);
      const breathPhase = cycleTime / breathDuration;

      if (breathPhase < 1) {
        // Breathing in
        const scale = 0.6 + (breathPhase * 0.6);
        circle.style.transform = `scale(${scale})`;
        text.textContent = 'Breathe In';
        circle.style.opacity = 0.6 + (breathPhase * 0.4);
      } else {
        // Breathing out
        const scale = 1.2 - ((breathPhase - 1) * 0.6);
        circle.style.transform = `scale(${scale})`;
        text.textContent = 'Breathe Out';
        circle.style.opacity = 1 - ((breathPhase - 1) * 0.4);
      }

      // Track hold time if user is pressing during "in" phase
      if (breathPhase < 0.5 && isPressing) {
        totalHoldTime += 16; // Approximate frame time
      }

      // Check completion
      if (totalHoldTime >= requiredHoldDuration) {
        if ('vibrate' in navigator) {
          navigator.vibrate([50, 50, 50]);
        }
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

  /**
   * Get swipe direction from delta
   */
  getSwipeDirection(deltaX, deltaY) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > absY) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'down' : 'up';
    }
  }

  /**
   * Complete challenge
   */
  completeChallenge(success, type, tier) {
    // Cleanup current challenge
    if (this.currentChallenge?.cleanup) {
      this.currentChallenge.cleanup();
    }

    if (success) {
      this.showSuccess(() => {
        this.removeOverlay();
        if (this.callback) {
          this.callback({
            success: true,
            type,
            tier
          });
        }
      });
    } else {
      this.showFailure(() => {
        // Allow retry
        this.callback({
          success: false,
          reason: 'timeout',
          type,
          tier,
          attempts: 1
        });
      });
    }
  }

  /**
   * Cancel challenge
   */
  cancelChallenge() {
    if (this.currentChallenge?.cleanup) {
      this.currentChallenge.cleanup();
    }

    this.removeOverlay();
    if (this.callback) {
      this.callback({
        success: false,
        reason: 'cancelled'
      });
    }
  }

  /**
   * Remove overlay
   */
  removeOverlay() {
    if (this.currentChallenge?.cleanup) {
      this.currentChallenge.cleanup();
    }

    const overlay = document.getElementById('astra-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  /**
   * Show success animation
   */
  showSuccess(callback) {
    const modal = document.querySelector('.astra-modal');
    if (modal) {
      modal.innerHTML = `
        <div class="astra-success-check">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
            <circle class="check-circle" cx="26" cy="26" r="25" fill="none" stroke="#10B981" stroke-width="2"/>
            <path class="check-check" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M14 27l7 7 16-16"/>
          </svg>
        </div>
        <h2 class="astra-title" style="color: #10B981;">Verified!</h2>
        <p class="astra-subtitle">You're all set.</p>
      `;
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([50, 100, 50]);
    }

    setTimeout(callback, 1500);
  }

  /**
   * Show failure state
   */
  showFailure(callback) {
    const modal = document.querySelector('.astra-modal');
    if (modal) {
      modal.innerHTML = `
        <div class="astra-icon" style="background: linear-gradient(135deg, #EF4444, #F59E0B);">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
        </div>
        <h2 class="astra-title">Time's Up</h2>
        <p class="astra-subtitle">Let's try again with a different challenge.</p>
        <button class="astra-btn" id="astra-retry">Try Again</button>
      `;

      document.getElementById('astra-retry')?.addEventListener('click', () => {
        this.removeOverlay();
        callback();
      });
    }
  }
}
