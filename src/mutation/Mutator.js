/**
 * Mutation System - Hourly challenge rotation
 * Ensures challenges constantly change to prevent bot learning
 */

export class Mutator {
  constructor(options = {}) {
    this.options = options;
    this.mutationInterval = options.mutationInterval || 60 * 60 * 1000; // 1 hour

    // Challenge pools for each tier
    this.challengePools = {
      2: ['pulse', 'tilt', 'flick', 'breath'],
      3: ['pulse', 'tilt', 'breath', 'pulse', 'tilt'], // Weighted
      4: ['pulse', 'breath'] // More physical challenges for high tier
    };

    // Current active challenges (mutated hourly)
    this.activeChallenges = {};
    this.lastMutation = null;

    // Seed for randomization
    this.seed = this.generateSeed();
  }

  /**
   * Initialize mutator
   */
  async init() {
    this.mutate();
    this.startMutationTimer();
    return this;
  }

  /**
   * Generate seed based on current hour
   */
  generateSeed() {
    const now = new Date();
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() + now.getHours();
  }

  /**
   * Perform mutation
   */
  mutate() {
    this.lastMutation = Date.now();
    this.seed = this.generateSeed();

    // Shuffle challenge pools with seeded random
    for (const tier of Object.keys(this.challengePools)) {
      this.activeChallenges[tier] = this.shuffleWithSeed(
        [...this.challengePools[tier]],
        this.seed + parseInt(tier)
      );
    }
  }

  /**
   * Seeded shuffle (deterministic randomness)
   */
  shuffleWithSeed(array, seed) {
    const result = [...array];
    let currentSeed = seed;

    for (let i = result.length - 1; i > 0; i--) {
      currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
      const j = currentSeed % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  /**
   * Start mutation timer
   */
  startMutationTimer() {
    // Calculate time until next hour
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);

    const timeUntilNextHour = nextHour.getTime() - now.getTime();

    // Schedule next mutation
    setTimeout(() => {
      this.mutate();
      // Then mutate every hour
      setInterval(() => {
        this.mutate();
      }, this.mutationInterval);
    }, timeUntilNextHour);
  }

  /**
   * Get challenge for specific tier
   */
  getChallengeForTier(tier) {
    // Check if mutation is needed
    if (this.shouldMutate()) {
      this.mutate();
    }

    const pool = this.activeChallenges[tier];
    if (!pool || pool.length === 0) {
      // Fallback to random
      const fallback = this.challengePools[tier] || this.challengePools[2];
      return fallback[Math.floor(Math.random() * fallback.length)];
    }

    // Get current challenge index based on time
    const timeIndex = Math.floor((Date.now() - this.lastMutation) / 60000) % pool.length;
    return pool[timeIndex];
  }

  /**
   * Check if mutation should occur
   */
  shouldMutate() {
    if (!this.lastMutation) return true;

    const elapsed = Date.now() - this.lastMutation;
    return elapsed >= this.mutationInterval;
  }

  /**
   * Get time until next mutation
   */
  getTimeUntilMutation() {
    if (!this.lastMutation) return 0;

    const elapsed = Date.now() - this.lastMutation;
    return Math.max(0, this.mutationInterval - elapsed);
  }

  /**
   * Get mutation info
   */
  getMutationInfo() {
    return {
      lastMutation: this.lastMutation,
      nextMutation: this.lastMutation + this.mutationInterval,
      timeUntilMutation: this.getTimeUntilMutation(),
      activeChallenges: { ...this.activeChallenges },
      seed: this.seed
    };
  }

  /**
   * Force mutation
   */
  forceMutation() {
    this.mutate();
    return this.getMutationInfo();
  }
}
