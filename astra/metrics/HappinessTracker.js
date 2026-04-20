/**
 * Happiness Tracker - Monitors user experience quality
 * Ensures security doesn't come at the cost of user happiness
 */

export class HappinessTracker {
  constructor(options = {}) {
    this.options = options;

    // Metrics storage
    this.metrics = {
      challenges: [],
      totalChallenges: 0,
      successfulChallenges: 0,
      failedChallenges: 0,
      totalTime: 0,
      averageTime: 0,
      satisfaction: []
    };

    // Load from storage
    this.loadMetrics();
  }

  /**
   * Track challenge completion
   */
  trackChallengeCompletion(success, duration, challengeType) {
    this.metrics.totalChallenges++;
    this.metrics.totalTime += duration;

    if (success) {
      this.metrics.successfulChallenges++;
    } else {
      this.metrics.failedChallenges++;
    }

    // Calculate average time
    this.metrics.averageTime = this.metrics.totalTime / this.metrics.totalChallenges;

    // Track by challenge type
    if (!this.metrics.challenges[challengeType]) {
      this.metrics.challenges[challengeType] = {
        attempts: 0,
        successes: 0,
        totalTime: 0
      };
    }

    this.metrics.challenges[challengeType].attempts++;
    this.metrics.challenges[challengeType].totalTime += duration;
    if (success) {
      this.metrics.challenges[challengeType].successes++;
    }

    // Save metrics
    this.saveMetrics();

    // Emit event if available
    if (this.options.onMetricUpdate) {
      this.options.onMetricUpdate(this.getSummary());
    }
  }

  /**
   * Track user satisfaction
   */
  trackSatisfaction(rating) {
    // Rating should be 1-5
    this.metrics.satisfaction.push(Math.min(5, Math.max(1, rating)));
    this.saveMetrics();
  }

  /**
   * Get completion rate
   */
  getCompletionRate() {
    if (this.metrics.totalChallenges === 0) return 1;
    return this.metrics.successfulChallenges / this.metrics.totalChallenges;
  }

  /**
   * Get average completion time
   */
  getAverageTime() {
    return Math.round(this.metrics.averageTime);
  }

  /**
   * Get satisfaction score
   */
  getSatisfactionScore() {
    if (this.metrics.satisfaction.length === 0) return 4.5; // Default target

    const sum = this.metrics.satisfaction.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.metrics.satisfaction.length) * 10) / 10;
  }

  /**
   * Get metrics summary
   */
  getSummary() {
    return {
      totalChallenges: this.metrics.totalChallenges,
      completionRate: Math.round(this.getCompletionRate() * 100),
      averageTime: this.getAverageTime(),
      satisfactionScore: this.getSatisfactionScore(),
      challenges: { ...this.metrics.challenges }
    };
  }

  /**
   * Check if metrics meet targets
   */
  meetsTargets() {
    const targets = {
      completionRate: 99, // 99%
      averageTime: 3000, // 3 seconds
      satisfactionScore: 4.5
    };

    const summary = this.getSummary();

    return {
      completionRate: summary.completionRate >= targets.completionRate,
      averageTime: summary.averageTime <= targets.averageTime,
      satisfactionScore: summary.satisfactionScore >= targets.satisfactionScore,
      overall:
        summary.completionRate >= targets.completionRate &&
        summary.averageTime <= targets.averageTime &&
        summary.satisfactionScore >= targets.satisfactionScore
    };
  }

  /**
   * Load metrics from storage
   */
  loadMetrics() {
    try {
      const stored = localStorage.getItem('astra_happiness');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only load recent data (within last hour)
        if (parsed.timestamp && Date.now() - parsed.timestamp < 3600000) {
          this.metrics = { ...this.metrics, ...parsed.data };
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Save metrics to storage
   */
  saveMetrics() {
    try {
      localStorage.setItem('astra_happiness', JSON.stringify({
        timestamp: Date.now(),
        data: this.metrics
      }));
    } catch {
      // Ignore
    }
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      challenges: [],
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
