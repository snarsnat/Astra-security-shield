/**
 * Angular Integration for ASTRA Shield
 */

import { Injectable, NgZone, InjectionToken } from '@angular/core';
import { ASTRAShield as Shield, ASTRAShieldOptions, VerificationResult } from '../index';

export const ASTRASHIELD_OPTIONS = new InjectionToken<ASTRAShieldOptions>('ASTRASHIELD_OPTIONS');

@Injectable({
  providedIn: 'root'
})
export class ASTRAShieldService {
  private shield: Shield | null = null;
  private _isReady = false;
  private _isVerifying = false;

  constructor(
    private ngZone: NgZone,
    private options: ASTRAShieldOptions = {}
  ) {
    this.initialize();
  }

  private initialize(): void {
    this.ngZone.runOutsideAngular(() => {
      this.shield = new Shield({
        ...this.options,
        onReady: () => {
          this._isReady = true;
        }
      });
    });
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get isVerifying(): boolean {
    return this._isVerifying;
  }

  get shieldInstance(): Shield | null {
    return this.shield;
  }

  async verify(): Promise<VerificationResult> {
    if (!this.shield) {
      return { success: false, tier: 0, reason: 'not_initialized' };
    }

    this._isVerifying = true;
    try {
      return await this.shield.verify();
    } finally {
      this._isVerifying = false;
    }
  }

  async protect(action: string, context?: Record<string, unknown>): Promise<VerificationResult> {
    if (!this.shield) {
      return { success: false, tier: 0, reason: 'not_initialized' };
    }
    return await this.shield.protect(action, context);
  }

  on(event: string, callback: (data: unknown) => void): void {
    this.shield?.on(event as any, callback);
  }

  off(event: string, callback: (data: unknown) => void): void {
    this.shield?.off(event as any, callback);
  }

  destroy(): void {
    this.shield?.destroy();
    this.shield = null;
    this._isReady = false;
  }
}

// Angular Module wrapper
import { ModuleWithProviders, NgModule } from '@angular/core';

@NgModule()
export class ASTRAShieldModule {
  static forRoot(options?: ASTRAShieldOptions): ModuleWithProviders<ASTRAShieldModule> {
    return {
      ngModule: ASTRAShieldModule,
      providers: [
        { provide: ASTRASHIELD_OPTIONS, useValue: options || {} },
        ASTRAShieldService
      ]
    };
  }
}
