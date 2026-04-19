/**
 * React Integration for ASTRA Shield
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { ASTRAShield as Shield, ASTRAShieldOptions, VerificationResult } from '../index';

interface ASTRAShieldContextValue {
  shield: Shield | null;
  verify: () => Promise<VerificationResult>;
  protect: (action: string, context?: Record<string, unknown>) => Promise<VerificationResult>;
  isReady: boolean;
  isVerifying: boolean;
}

const ASTRAShieldContext = createContext<ASTRAShieldContextValue | null>(null);

interface ASTRAShieldProviderProps {
  children: ReactNode;
  options?: ASTRAShieldOptions;
}

export function ASTRAShieldProvider({ children, options = {} }: ASTRAShieldProviderProps): JSX.Element {
  const [shield, setShield] = useState<Shield | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const astraShield = new Shield({
      ...options,
      onReady: () => setIsReady(true)
    });

    setShield(astraShield);

    return () => {
      astraShield.destroy();
    };
  }, []);

  const verify = useCallback(async (): Promise<VerificationResult> => {
    if (!shield) return { success: false, tier: 0, reason: 'not_initialized' };
    setIsVerifying(true);
    try {
      return await shield.verify();
    } finally {
      setIsVerifying(false);
    }
  }, [shield]);

  const protect = useCallback(async (action: string, context?: Record<string, unknown>): Promise<VerificationResult> => {
    if (!shield) return { success: false, tier: 0, reason: 'not_initialized' };
    return await shield.protect(action, context);
  }, [shield]);

  const value: ASTRAShieldContextValue = {
    shield,
    verify,
    protect,
    isReady,
    isVerifying
  };

  return (
    <ASTRAShieldContext.Provider value={value}>
      {children}
    </ASTRAShieldContext.Provider>
  );
}

export function useASTRAShield(): ASTRAShieldContextValue {
  const context = useContext(ASTRAShieldContext);
  if (!context) {
    throw new Error('useASTRAShield must be used within an ASTRAShieldProvider');
  }
  return context;
}

interface UseVerifyOptions {
  onSuccess?: (result: VerificationResult) => void;
  onError?: (result: VerificationResult) => void;
}

export function useVerify(options: UseVerifyOptions = {}): {
  verify: () => Promise<VerificationResult>;
  isVerifying: boolean;
} {
  const { verify: verifyContext, isVerifying } = useASTRAShield();
  const { onSuccess, onError } = options;

  const verify = useCallback(async (): Promise<VerificationResult> => {
    const result = await verifyContext();
    if (result.success) {
      onSuccess?.(result);
    } else {
      onError?.(result);
    }
    return result;
  }, [verifyContext, onSuccess, onError]);

  return { verify, isVerifying };
}

/**
 * Higher-order component for protecting components
 */
export function withVerification<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  action: string
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithVerification: React.FC<P> = (props) => {
    const { protect, isReady } = useASTRAShield();

    const handleClick = useCallback(async () => {
      await protect(action, { component: displayName });
    }, [protect, action, displayName]);

    return (
      <WrappedComponent
        {...props}
        onVerify={handleClick}
        astraShieldReady={isReady}
      />
    );
  };

  WithVerification.displayName = `withVerification(${displayName})`;
  return WithVerification;
}
