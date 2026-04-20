/**
 * Happiness Tracker
 */

import { ChallengeType, HappinessMetrics, ChallengeMetrics, HappinessOptions, HappinessTargets } from '../types';

export class HappinessTracker {
  private options: HappinessOptions;
  private metrics = {
    challenges: {} as Record<ChallengeType, ChallengeMetrics>,
    totalChallenges: 0,
    successfulChallenges: 0,
    failedChallenges: 0,
    totalTime: 0,
    averageTime: 0,
    satisfaction: [] as number[]
  };

  constructor(options: HappinessOptions = {}) {
    this.options = options;
    this.loadMetrics();
  }

  trackChallengeCompletion(success: boolean, duration: number, challengeType: ChallengeType): void {
    this.metrics.totalChallenges++;
    this.metrics.totalTime += duration;

    if (success) {
      this.metrics.successfulChallenges++;
    } else {
      this.metrics.failedChallenges++;
    }

    this.metrics.averageTime = this.metrics.totalTime / this.metrics.totalChallenges;

    if (!this.metrics.challenges[challengeType]) {
      this.metrics.challenges[challengeType] = { attempts: 0, successes: 0, totalTime: 0 };
    }

    this.metrics.challenges[challengeType].attempts++;
    this.metrics.challenges[challengeType].totalTime += duration;
    if (success) this.metrics.challenges[challengeType].successes++;

    this.saveMetrics();
    this.options.onMetricUpdate?.(this.getSummary());
  }

  trackSatisfaction(rating: number): void {
    this.metrics.satisfaction.push(Math.min(5, Math.max(1, rating)));
    this.saveMetrics();
  }

  getCompletionRate(): number {
    if (this.metrics.totalChallenges === 0) return 1;
    return this.metrics.successfulChallenges / this.metrics.totalChallenges;
  }

  getAverageTime(): number {
    return Math.round(this.metrics.averageTime);
  }

  getSatisfactionScore(): number {
    if (this.metrics.satisfaction.length === 0) return 4.5;
    const sum = this.metrics.satisfaction.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.metrics.satisfaction.length) * 10) / 10;
  }

  getSummary(): HappinessMetrics {
    return {
      totalChallenges: this.metrics.totalChallenges,
      completionRate: Math.round(this.getCompletionRate() * 100),
      averageTime: this.getAverageTime(),
      satisfactionScore: this.getSatisfactionScore(),
      challenges: { ...this.metrics.challenges }
    };
  }

  meetsTargets(): HappinessTargets {
    const targets = { completionRate: 99, averageTime: 3000, satisfactionScore: 4.5 };
    const summary = this.getSummary();

    return {
      completionRate: summary.completionRate >= targets.completionRate,
      averageTime: summary.averageTime <= targets.averageTime,
      satisfactionScore: summary.satisfactionScore >= targets.satisfactionScore,
      overall: summary.completionRate >= targets.completionRate &&
               summary.averageTime <= targets.averageTime &&
               summary.satisfactionScore >= targets.satisfactionScore
    };
  }

  private loadMetrics(): void {
    try {
      const stored = localStorage.getItem('astra_happiness');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 3600000) {
          this.metrics = { ...this.metrics, ...parsed.data };
        }
      }
    } catch {
      // Ignore
    }
  }

  private saveMetrics(): void {
    try {
      localStorage.setItem('astra_happiness', JSON.stringify({
        timestamp: Date.now(),
        data: this.metrics
      }));
    } catch {
      // Ignore
    }
  }

  reset(): void {
    this.metrics = {
      challenges: {},
      totalChallenges: 0,
      successfulChallenges: 0,
      failedChallenges: 0,
      totalTime: 0,
      averageTime: 0,
      satisfaction: []
    };
    this.saveMetrics();
  }
}
