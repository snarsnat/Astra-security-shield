/**
 * Accessibility Manager
 * Ensures all challenges are accessible to everyone
 */

export class AccessibilityManager {
  constructor(options = {}) {
    this.options = options;

    // Accessibility preferences
    this.preferences = {
      reduceMotion: false,
      highContrast: false,
      largeText: false,
      audioCues: false,
      extendedTime: false,
      simplifiedMode: false
    };

    // Check system preferences
    this.detectSystemPreferences();
  }

  /**
   * Initialize and load preferences
   */
  async init() {
    // Load saved preferences
    this.loadPreferences();

    // Listen for system preference changes
    this.setupListeners();

    return this;
  }

  /**
   * Detect system accessibility preferences
   */
  detectSystemPreferences() {
    // Check reduced motion preference
    if (window.matchMedia) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.preferences.reduceMotion = reducedMotion.matches;

      reducedMotion.addEventListener('change', (e) => {
        this.preferences.reduceMotion = e.matches;
        this.applyPreferences();
      });

      // Check high contrast
      const highContrast = window.matchMedia('(prefers-contrast: more)');
      this.preferences.highContrast = highContrast.matches;

      // Check forced colors
      const forcedColors = window.matchMedia('(forced-colors: active)');
      this.preferences.highContrast = this.preferences.highContrast || forcedColors.matches;
    }
  }

  /**
   * Load preferences from storage
   */
  loadPreferences() {
    try {
      const stored = localStorage.getItem('astra_accessibility');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = { ...this.preferences, ...parsed };
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Save preferences to storage
   */
  savePreferences() {
    try {
      localStorage.setItem('astra_accessibility', JSON.stringify(this.preferences));
    } catch {
      // Ignore
    }
  }

  /**
   * Setup listeners for preference changes
   */
  setupListeners() {
    // Handle visibility change for focus management
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handlePageHidden();
      } else {
        this.handlePageVisible();
      }
    });
  }

  /**
   * Update a specific preference
   */
  setPreference(key, value) {
    if (key in this.preferences) {
      this.preferences[key] = value;
      this.savePreferences();
      this.applyPreferences();
    }
  }

  /**
   * Get preference
   */
  getPreference(key) {
    return this.preferences[key];
  }

  /**
   * Get all preferences
   */
  getAllPreferences() {
    return { ...this.preferences };
  }

  /**
   * Apply preferences to document
   */
  applyPreferences() {
    const root = document.documentElement;

    if (this.preferences.reduceMotion) {
      root.style.setProperty('--astra-transition-duration', '0ms');
    }

    if (this.preferences.largeText) {
      root.style.setProperty('--astra-font-scale', '1.25');
    }

    if (this.preferences.highContrast) {
      root.classList.add('astra-high-contrast');
    } else {
      root.classList.remove('astra-high-contrast');
    }
  }

  /**
   * Handle page hidden
   */
  handlePageHidden() {
    // Pause any active animations
    // Could be used to pause ongoing challenges
  }

  /**
   * Handle page visible
   */
  handlePageVisible() {
    // Resume animations or re-focus
  }

  /**
   * Get accessible alternative for challenge
   */
  getAccessibleAlternative(challengeType) {
    const alternatives = {
      pulse: {
        type: 'audio',
        title: 'Audio Challenge',
        description: 'Listen and press spacebar when you hear the tone',
        action: 'Press spacebar'
      },
      tilt: {
        type: 'click',
        title: 'Click Challenge',
        description: 'Click the button repeatedly to verify',
        action: 'Click button'
      },
      flick: {
        type: 'tap',
        title: 'Tap Challenge',
        description: 'Tap the screen when ready',
        action: 'Tap anywhere'
      },
      breath: {
        type: 'hold',
        title: 'Hold Challenge',
        description: 'Click and hold the button for the indicated time',
        action: 'Hold button'
      }
    };

    return alternatives[challengeType] || alternatives.tap;
  }

  /**
   * Announce to screen readers
   */
  announce(message, priority = 'polite') {
    const announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'astra-sr-only';
    announcer.textContent = message;

    document.body.appendChild(announcer);

    // Remove after announcement
    setTimeout(() => {
      announcer.remove();
    }, 1000);
  }

  /**
   * Focus trap for modal
   */
  trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    element.addEventListener('keydown', handleTab);

    // Return cleanup function
    return () => {
      element.removeEventListener('keydown', handleTab);
    };
  }

  /**
   * Get challenge duration modifier based on preferences
   */
  getDurationModifier() {
    return this.preferences.extendedTime ? 1.5 : 1;
  }

  /**
   * Check if audio cues should be enabled
   */
  shouldUseAudioCues() {
    return this.preferences.audioCues || this.preferences.highContrast;
  }

  /**
   * Reset to system defaults
   */
  resetToDefaults() {
    this.detectSystemPreferences();
    this.savePreferences();
    this.applyPreferences();
  }
}
