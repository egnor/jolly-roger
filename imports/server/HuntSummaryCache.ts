import { Meteor } from "meteor/meteor";

interface CacheEntry {
  summary: string;
  timestamp: Date;
}

/**
 * In-memory cache and rate limiter for hunt summaries.
 * Prevents excessive API calls and provides fast responses for repeated requests.
 * Summaries are cached indefinitely and only regenerated on explicit user request.
 *
 * Rate limiting is per-hunt and per-time-window (not per-user):
 * - Each time window can be regenerated once every 15 minutes
 * - All users share the same cooldown for each (hunt, timeWindow) pair
 * - Users can generate different time windows independently
 */
class HuntSummaryCache {
  // Cache: key = "huntId:timeWindowMinutes", value = CacheEntry
  private cache: Map<string, CacheEntry> = new Map();

  private readonly RATE_LIMIT_COOLDOWN_MS = 30 * 1000; // 30 seconds (for testing)

  /**
   * Get a cached summary if it exists.
   * Summaries are cached indefinitely and only regenerated on user request.
   *
   * @param huntId The hunt ID
   * @param timeWindowMinutes The time window in minutes
   * @returns The cached summary with its timestamp, or null if not cached
   */
  getCached(
    huntId: string,
    timeWindowMinutes: number
  ): { summary: string; timestamp: Date } | null {
    const key = `${huntId}:${timeWindowMinutes}`;
    const entry = this.cache.get(key);
    return entry || null;
  }

  /**
   * Store a summary in the cache.
   *
   * @param huntId The hunt ID
   * @param timeWindowMinutes The time window in minutes
   * @param summary The summary text to cache
   */
  setCached(
    huntId: string,
    timeWindowMinutes: number,
    summary: string
  ): void {
    const key = `${huntId}:${timeWindowMinutes}`;
    this.cache.set(key, { summary, timestamp: new Date() });
  }

  /**
   * Check if a specific (hunt, timeWindow) pair can be regenerated.
   * Rate limit is global per (hunt, timeWindow): 1 generation per 15 minutes.
   * This means:
   * - Anyone can regenerate "Last hour" for Hunt A once every 15 minutes
   * - But "Last 4 hours" for Hunt A has its own independent 15-minute cooldown
   * - And "Last hour" for Hunt B has its own independent cooldown
   *
   * @param huntId The hunt ID
   * @param timeWindowMinutes The time window being requested
   * @returns Object with allowed flag and optional retryAfterSeconds
   */
  checkRateLimit(
    huntId: string,
    timeWindowMinutes: number
  ): {
    allowed: boolean;
    retryAfterSeconds?: number;
  } {
    const key = `${huntId}:${timeWindowMinutes}`;
    const cached = this.cache.get(key);

    // If no cached entry, allow generation
    if (!cached) {
      return { allowed: true };
    }

    // Check if 15 minutes have passed since last generation
    const now = Date.now();
    const timeSinceLastGeneration = now - cached.timestamp.getTime();

    if (timeSinceLastGeneration < this.RATE_LIMIT_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (this.RATE_LIMIT_COOLDOWN_MS - timeSinceLastGeneration) / 1000
      );
      return { allowed: false, retryAfterSeconds };
    }

    // Cooldown has expired, allow regeneration
    return { allowed: true };
  }

  /**
   * Clean up old cache entries.
   * Called periodically by Meteor.setInterval.
   * Note: We don't delete cache entries automatically - they persist until
   * explicitly regenerated. This method is here for future use if needed.
   */
  cleanup(): void {
    // Currently no cleanup needed since we keep summaries indefinitely
    // Could add logic here to remove very old summaries (e.g., > 7 days) if needed
  }
}

// Export singleton instance
export const huntSummaryCache = new HuntSummaryCache();

// Setup cleanup interval (runs every 10 minutes)
Meteor.setInterval(() => huntSummaryCache.cleanup(), 10 * 60 * 1000);
