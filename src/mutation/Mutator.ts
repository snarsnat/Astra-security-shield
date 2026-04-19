/**
 * Mutation System - Hourly challenge rotation
 */

import { TierLevel, ChallengeType, MutatorOptions, MutatorInfo } from '../types';

export class Mutator {
  private options: Required<MutatorOptions>;
  private challengePools: Record<TierLevel, ChallengeType[]>;
  private activeChallenges: Record<TierLevel, ChallengeType[]> = {} as Record<TierLevel, ChallengeType[]>;
  private lastMutation: number = 0;
  private seed: number = 0;

  constructor(options: MutatorOptions = {}) {
    this.options = {
      mutationInterval: options.mutationInterval || 60 * 60 * 1000
    };

    this.challengePools = {
      0: [],
      1: [],
      2: ['pulse', 'tilt', 'flick', 'breath'],
      3: ['pulse', 'tilt', 'breath', 'pulse', 'tilt'],
      4: ['pulse', 'breath']
    };
  }

  async init(): Promise<Mutator> {
    this.mutate();
    this.startMutationTimer();
    return this;
  }

  private generateSeed(): number {
    const now = new Date();
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() + now.getHours();
  }

  mutate(): void {
    this.lastMutation = Date.now();
    this.seed = this.generateSeed();

    for (const tier of Object.keys(this.challengePools) as TierLevel[]) {
      this.activeChallenges[tier] = this.shuffleWithSeed(
        [...this.challengePools[tier]],
        this.seed + tier
      );
    }
  }

  private shuffleWithSeed(array: ChallengeType[], seed: number): ChallengeType[] {
    const result = [...array];
    let currentSeed = seed;

    for (let i = result.length - 1; i > 0; i--) {
      currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
      const j = currentSeed % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  private startMutationTimer(): void {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);

    const timeUntilNextHour = nextHour.getTime() - now.getTime();

    setTimeout(() => {
      this.mutate();
      setInterval(() => this.mutate(), this.options.mutationInterval);
    }, timeUntilNextHour);
  }

  getChallengeForTier(tier: TierLevel): ChallengeType {
    if (this.shouldMutate()) this.mutate();

    const pool = this.activeChallenges[tier];
    if (!pool || pool.length === 0) {
      const fallback = this.challengePools[tier] || this.challengePools[2];
      return fallback[Math.floor(Math.random() * fallback.length)];
    }

    const timeIndex = Math.floor((Date.now() - this.lastMutation) / 60000) % pool.length;
    return pool[timeIndex];
  }

  shouldMutate(): boolean {
    if (!this.lastMutation) return true;
    return Date.now() - this.lastMutation >= this.options.mutationInterval;
  }

  getTimeUntilMutation(): number {
    if (!this.lastMutation) return 0;
    return Math.max(0, this.options.mutationInterval - (Date.now() - this.lastMutation));
  }

  getMutationInfo(): MutatorInfo {
    return {
      lastMutation: this.lastMutation,
      nextMutation: this.lastMutation + this.options.mutationInterval,
      timeUntilMutation: this.getTimeUntilMutation(),
      activeChallenges: { ...this.activeChallenges },
      seed: this.seed
    };
  }

  forceMutation(): MutatorInfo {
    this.mutate();
    return this.getMutationInfo();
  }
}
