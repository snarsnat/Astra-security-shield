/**
 * Vue 3 Integration for ASTRA Shield
 */

import { App, inject, InjectionKey, onMounted, onUnmounted, computed } from 'vue';
import { ASTRAShield, ASTRAShieldOptions, VerificationResult } from '../index';

interface ASTRAShieldPlugin {
  shield: ASTRAShield | null;
  verify: () => Promise<VerificationResult>;
  protect: (action: string, context?: Record<string, unknown>) => Promise<VerificationResult>;
  isReady: boolean;
  isVerifying: boolean;
}

const ASTRA_KEY: InjectionKey<ASTRAShieldPlugin> = Symbol('astra-shield');

export function createASTRAShield(options: ASTRAShieldOptions = {}): ASTRAShieldPlugin {
  let shield: ASTRAShield | null = null;
  let isReady = false;
  let isVerifying = false;

  const verify = async (): Promise<VerificationResult> => {
    if (!shield) return { success: false, tier: 0, reason: 'not_initialized' };
    isVerifying = true;
    try {
      return await shield.verify();
    } finally {
      isVerifying = false;
    }
  };

  const protect = async (action: string, context?: Record<string, unknown>): Promise<VerificationResult> => {
    if (!shield) return { success: false, tier: 0, reason: 'not_initialized' };
    return await shield.protect(action, context);
  };

  // Initialize shield
  shield = new ASTRAShield({
    ...options,
    onReady: () => { isReady = true; }
  });

  return {
    get shield() { return shield; },
    get isReady() { return isReady; },
    get isVerifying() { return isVerifying; },
    verify,
    protect
  };
}

export function install(app: App, options: ASTRAShieldOptions = {}): void {
  const plugin = createASTRAShield(options);
  app.provide(ASTRA_KEY, plugin);

  // Also make available globally
  app.config.globalProperties.$astra = plugin;
}

export function useASTRAShield(): ASTRAShieldPlugin {
  const plugin = inject(ASTRA_KEY);
  if (!plugin) {
    throw new Error('useASTRAShield must be used after install has been called');
  }
  return plugin;
}

// Composable for Vue components
export function useVerify() {
  const astra = useASTRAShield();
  const isVerifying = computed(() => astra.isVerifying);

  const verify = async (): Promise<VerificationResult> => {
    return await astra.verify();
  };

  const protect = async (action: string, context?: Record<string, unknown>): Promise<VerificationResult> => {
    return await astra.protect(action, context);
  };

  return {
    verify,
    protect,
    isVerifying,
    shield: astra.shield,
    isReady: astra.isReady
  };
}

// Directive for auto-verification
export const vAstraVerify = {
  mounted(el: HTMLElement, binding: any) {
    const astra = useASTRAShield();
    const action = binding.value || 'default';
    const event = binding.arg || 'click';

    const handler = async () => {
      const result = await astra.protect(action);
      if (result.success) {
        el.dispatchEvent(new CustomEvent('astra-success', { detail: result }));
      } else {
        el.dispatchEvent(new CustomEvent('astra-failed', { detail: result }));
      }
    };

    el.addEventListener(event, handler);
    el._astraHandler = handler;
  },
  unmounted(el: HTMLElement) {
    if (el._astraHandler) {
      el.removeEventListener('click', el._astraHandler);
    }
  }
};

// Augment HTMLElement type
declare module '@vue/runtime-core' {
  interface HTMLElement {
    _astraHandler?: () => void;
  }
}
