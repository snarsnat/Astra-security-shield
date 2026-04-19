/**
 * Session Management
 */

import { SessionInfo, SessionMetadata, SessionOptions } from '../types';

export class Session {
  private options: Required<SessionOptions>;
  private storage: Storage;

  public id: string = '';
  public createdAt: number = 0;
  public lastActivity: number = 0;
  public trust: number = 1.0;
  private metadata: SessionMetadata = {} as SessionMetadata;

  constructor(options: SessionOptions = {}) {
    this.options = {
      storagePrefix: options.storagePrefix || 'astra_',
      sessionDuration: options.sessionDuration || 30 * 60 * 1000
    };
    this.storage = localStorage;
  }

  async init(): Promise<Session> {
    const stored = this.getStored();

    if (stored && this.isValid(stored)) {
      this.id = stored.id;
      this.createdAt = stored.createdAt;
      this.lastActivity = Date.now();
      this.trust = stored.trust || 1.0;
      this.metadata = stored.metadata || this.getInitialMetadata();
    } else {
      this.id = this.generateId();
      this.createdAt = Date.now();
      this.lastActivity = Date.now();
      this.trust = 1.0;
      this.metadata = this.getInitialMetadata();
    }

    this.save();
    return this;
  }

  private getStored(): any {
    try {
      const item = this.storage.getItem(this.options.storagePrefix + 'session');
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }

  private isValid(stored: any): boolean {
    if (!stored || !stored.id || !stored.createdAt) return false;
    const age = Date.now() - stored.createdAt;
    return age < this.options.sessionDuration;
  }

  private generateId(): string {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 15);
  }

  private getInitialMetadata(): SessionMetadata {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchEnabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      cookieEnabled: navigator.cookieEnabled
    };
  }

  private save(): void {
    try {
      this.storage.setItem(this.options.storagePrefix + 'session', JSON.stringify({
        id: this.id,
        createdAt: this.createdAt,
        lastActivity: this.lastActivity,
        trust: this.trust,
        metadata: this.metadata
      }));
    } catch {
      // Storage unavailable
    }
  }

  touch(): void {
    this.lastActivity = Date.now();
    this.save();
  }

  increaseTrust(amount: number = 0.05): number {
    this.trust = Math.min(1.0, this.trust + amount);
    this.touch();
    return this.trust;
  }

  decreaseTrust(amount: number = 0.1): number {
    this.trust = Math.max(0, this.trust - amount);
    this.touch();
    return this.trust;
  }

  getTrust(): number {
    return this.trust;
  }

  getAge(): number {
    return Date.now() - this.createdAt;
  }

  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }

  getInfo(): SessionInfo {
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      trust: this.trust,
      age: this.getAge(),
      idleTime: this.getIdleTime(),
      metadata: this.metadata
    };
  }

  updateMetadata(data: Partial<SessionMetadata>): void {
    this.metadata = { ...this.metadata, ...data };
    this.save();
  }

  clear(): void {
    try {
      this.storage.removeItem(this.options.storagePrefix + 'session');
    } catch {
      // Ignore
    }
    this.id = '';
    this.createdAt = 0;
    this.trust = 1.0;
    this.metadata = {} as SessionMetadata;
  }
}
