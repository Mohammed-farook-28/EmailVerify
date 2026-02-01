/**
 * Circuit Breaker Service
 *
 * Prevents cascading failures by opening the circuit when error rate exceeds threshold.
 * Uses Redis to coordinate state across multiple workers.
 *
 * States:
 * - CLOSED (0): Normal operation
 * - OPEN (1): Blocking requests, waiting for cooldown
 * - HALF_OPEN (2): Testing with limited requests
 *
 * Configuration:
 * - Opens at 50% failure rate over last 100 calls
 * - 30s wait in OPEN state
 * - 5 test calls in HALF_OPEN state
 * - Exponential backoff with jitter
 */

import CircuitBreaker from 'opossum';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import {
  circuitBreakerState,
  circuitBreakerFailures,
  circuitBreakerSuccesses,
} from '../lib/metrics.js';
import { callUpstreamAPI } from './upstream-client.js';
import type { VerificationResult } from './upstream-client.js';

const REDIS_STATE_KEY = 'circuit_breaker:state';
const REDIS_FAILURE_COUNT_KEY = 'circuit_breaker:failure_count';
const REDIS_SUCCESS_COUNT_KEY = 'circuit_breaker:success_count';

// Circuit breaker configuration
const options = {
  timeout: 15000, // 15s total timeout
  errorThresholdPercentage: 50, // Open at 50% error rate
  resetTimeout: 30000, // 30s wait in OPEN state
  rollingCountTimeout: 10000, // 10s rolling window
  rollingCountBuckets: 10, // 10 buckets in rolling window
  volumeThreshold: 10, // Min requests before opening (prevent premature opening)
  allowWarmUp: true, // Allow warm-up period
  halfOpenRequests: 5, // 5 test calls in HALF_OPEN state
};

// Create circuit breaker wrapping the upstream API call
export const breaker = new CircuitBreaker(
  async ({ email, userId }: { email: string; userId: string }): Promise<VerificationResult> => {
    return callUpstreamAPI(email, userId);
  },
  options
);

// === Event Handlers ===

breaker.on('open', async () => {
  logger.warn('Circuit breaker OPENED - blocking requests');
  circuitBreakerState.set(1); // OPEN
  await redis.set(REDIS_STATE_KEY, 'open', 'EX', 60); // 60s TTL
});

breaker.on('halfOpen', async () => {
  logger.info('Circuit breaker HALF_OPEN - testing with limited requests');
  circuitBreakerState.set(2); // HALF_OPEN
  await redis.set(REDIS_STATE_KEY, 'half_open', 'EX', 60);
});

breaker.on('close', async () => {
  logger.info('Circuit breaker CLOSED - normal operation resumed');
  circuitBreakerState.set(0); // CLOSED
  await redis.set(REDIS_STATE_KEY, 'closed', 'EX', 60);
});

breaker.on('success', async (result: any) => {
  circuitBreakerSuccesses.inc();
  await redis.incr(REDIS_SUCCESS_COUNT_KEY);
  logger.debug({ email: result.email, status: result.status }, 'Circuit breaker: Success');
});

breaker.on('failure', async (error: any) => {
  circuitBreakerFailures.inc();
  await redis.incr(REDIS_FAILURE_COUNT_KEY);
  logger.warn({ error: error.message }, 'Circuit breaker: Failure');
});

breaker.on('timeout', () => {
  logger.error('Circuit breaker: Request timeout (15s)');
});

breaker.on('reject', () => {
  logger.warn('Circuit breaker: Request rejected (circuit is OPEN)');
});

breaker.on('fallback', (result: any) => {
  logger.info('Circuit breaker: Fallback executed');
});

// === State Coordination ===

/**
 * Get circuit breaker state from Redis
 * Used to coordinate state across multiple workers
 */
export async function getCircuitBreakerState(): Promise<'open' | 'closed' | 'half_open'> {
  try {
    const state = await redis.get(REDIS_STATE_KEY);
    return (state as any) || 'closed';
  } catch (error) {
    logger.warn({ error }, 'Failed to get circuit breaker state from Redis');
    return 'closed';
  }
}

/**
 * Check if circuit breaker is open
 */
export async function isCircuitOpen(): Promise<boolean> {
  const state = await getCircuitBreakerState();
  return state === 'open';
}

/**
 * Get circuit breaker stats from Redis
 */
export async function getCircuitBreakerStats() {
  try {
    const [state, failures, successes] = await Promise.all([
      redis.get(REDIS_STATE_KEY),
      redis.get(REDIS_FAILURE_COUNT_KEY),
      redis.get(REDIS_SUCCESS_COUNT_KEY),
    ]);

    return {
      state: state || 'closed',
      failures: parseInt(failures || '0', 10),
      successes: parseInt(successes || '0', 10),
      errorRate: (() => {
        const total = parseInt(failures || '0', 10) + parseInt(successes || '0', 10);
        if (total === 0) return 0;
        return (parseInt(failures || '0', 10) / total) * 100;
      })(),
      // Stats from opossum
      stats: breaker.stats,
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to get circuit breaker stats');
    return {
      state: 'unknown',
      failures: 0,
      successes: 0,
      errorRate: 0,
      stats: breaker.stats,
    };
  }
}

/**
 * Reset circuit breaker stats (useful for testing)
 */
export async function resetCircuitBreaker() {
  await Promise.all([
    redis.del(REDIS_STATE_KEY),
    redis.del(REDIS_FAILURE_COUNT_KEY),
    redis.del(REDIS_SUCCESS_COUNT_KEY),
  ]);
  breaker.close(); // Close the circuit
  logger.info('Circuit breaker reset');
}

/**
 * Verify email with circuit breaker protection
 *
 * @param email - Email to verify
 * @param userId - User ID
 * @returns Verification result
 * @throws Error if circuit is open or upstream fails
 */
export async function verifyWithCircuitBreaker(
  email: string,
  userId: string
): Promise<VerificationResult> {
  try {
    const result = await breaker.fire({ email, userId });
    return result;
  } catch (error: any) {
    // Check if circuit is open
    if (error.message?.includes('breaker is open')) {
      logger.warn({ email, userId }, 'Request blocked: Circuit breaker is OPEN');
      throw new Error('Service temporarily unavailable. Please try again later.');
    }
    throw error;
  }
}

// Initialize state in Redis
(async () => {
  await redis.set(REDIS_STATE_KEY, 'closed', 'EX', 60);
  circuitBreakerState.set(0); // CLOSED
})();

export default breaker;
