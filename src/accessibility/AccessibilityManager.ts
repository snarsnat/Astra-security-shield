/**
 * Accessibility Manager
 */

import { AccessibilityPreferences, AccessibilityOptions, ChallengeType, AccessibleAlternative } from '../types';

export class AccessibilityManager {
  private options: AccessibilityOptions;
  public preferences: AccessibilityPreferences;

  constructor(options: AccessibilityOptions = {}) {
    this.options = options;
    this.preferences = {
      reduceMotion: false,
      highContrast: false,
      largeText: false,
      audioCues: false,
      extendedTime: false,
      simplifiedMode: false
    };

    this.detectSystemPreferences();
  }

  async init(): Promise<AccessibilityManager> {
    this.loadPreferences();
    this.setupListeners();
    this.applyPreferences();
    return this;
  }

  private detectSystemPreferences(): void {
    if (window.matchMedia) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.preferences.reduceMotion = reducedMotion.matches;
      reducedMotion.addEventListener('change', (e) => {
        this.preferences.reduceMotion = e.matches;
        this.applyPreferences();
      });

      const highContrast = window.matchMedia('(prefers-contrast: more)');
      this.preferences.highContrast = highContrast.matches || window.matchMedia('(forced-colors: active)').matches;
    }
  }

  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem('astra_accessibility');
      if (stored) {
        this.preferences = { ...this.preferences, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore
    }
  }

  private savePreferences(): void {
    try {
      localStorage.setItem('astra_accessibility', JSON.stringify(this.preferences));
    } catch {
      // Ignore
    }
  }

  private setupListeners(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.handlePageHidden();
      else this.handlePageVisible();
    });
  }

  setPreference(key: keyof AccessibilityPreferences, value: boolean): void {
    if (key in this.preferences) {
      this.preferences[key] = value;
      this.savePreferences();
      this.applyPreferences();
    }
  }

  getPreference(key: keyof AccessibilityPreferences): boolean {
    return this.preferences[key];
  }

  getAllPreferences(): AccessibilityPreferences {
    return { ...this.preferences };
  }

  applyPreferences(): void {
    const root = document.documentElement;

    if (this.preferences.reduceMotion) {
      root.style.setProperty('--astra-transition-duration', '0ms');
    } else {
      root.style.removeProperty('--astra-transition-duration');
    }

    if (this.preferences.largeText) {
      root.style.setProperty('--astra-font-scale', '1.25');
    } else {
      root.style.removeProperty('--astra-font-scale');
    }

    if (this.preferences.highContrast) {
      root.classList.add('astra-high-contrast');
    } else {
      root.classList.remove('astra-high-contrast');
    }
  }

  private handlePageHidden(): void {
    // Pause animations when hidden
  }

  private handlePageVisible(): void {
    // Resume when visible
  }

  getAccessibleAlternative(challengeType: ChallengeType): AccessibleAlternative {
    const alternatives: Record<ChallengeType, AccessibleAlternative> = {
      pulse: { type: 'audio', title: 'Audio Challenge', description: 'Listen and press spacebar when you hear the tone', action: 'Press spacebar' },
      tilt: { type: 'click', title: 'Click Challenge', description: 'Click the button repeatedly to verify', action: 'Click button' },
      flick: { type: 'tap', title: 'Tap Challenge', description: 'Tap the screen when ready', action: 'Tap anywhere' },
      breath: { type: 'hold', title: 'Hold Challenge', description: 'Click and hold the button for the indicated time', action: 'Hold button' }
    };
    return alternatives[challengeType] || alternatives.tap;
  }

  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'astra-sr-only';
    announcer.textContent = message;
    document.body.appendChild(announcer);
    setTimeout(() => announcer.remove(), 1000);
  }

  trapFocus(element: HTMLElement): () => void {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    element.addEventListener('keydown', handleTab);
    return () => element.removeEventListener('keydown', handleTab);
  }

  getDurationModifier(): number {
    return this.preferences.extendedTime ? 1.5 : 1;
  }

  shouldUseAudioCues(): boolean {
    return this.preferences.audioCues || this.preferences.highContrast;
  }

  resetToDefaults(): void {
    this.detectSystemPreferences();
    this.savePreferences();
    this.applyPreferences();
  }
}
