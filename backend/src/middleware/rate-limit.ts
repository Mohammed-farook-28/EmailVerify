import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { RateLimitError } from '../lib/errors.js';

interface RateLimitConfig {
  keyPrefix: string;
  maxAttempts: number;
  windowSeconds: number;
  keyExtractor: (req: Request) => string;
  lockoutDuration?: number;
}

export function rateLimit(config: RateLimitConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identifier = config.keyExtractor(req);
    const key = `ratelimit:${config.keyPrefix}:${identifier}`;

    if (config.lockoutDuration) {
      const lockoutKey = `lockout:${identifier}`;
      const locked = await redis.get(lockoutKey);
      if (locked) {
        const ttl = await redis.ttl(lockoutKey);
        next(new RateLimitError('Account temporarily locked', ttl > 0 ? ttl : config.lockoutDuration));
        return;
      }
    }

    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, config.windowSeconds);
    const results = await pipeline.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;

    if (count > config.maxAttempts) {
      if (config.lockoutDuration) {
        const lockoutKey = `lockout:${identifier}`;
        await redis.set(lockoutKey, '1', 'EX', config.lockoutDuration);
      }

      next(
        new RateLimitError(
          'Too many requests',
          config.lockoutDuration ?? config.windowSeconds,
        ),
      );
      return;
    }

    next();
  };
}

export function byIp(prefix: string, max: number, windowSeconds: number) {
  return rateLimit({
    keyPrefix: prefix,
    maxAttempts: max,
    windowSeconds,
    keyExtractor: (req) => req.ip ?? 'unknown',
  });
}

export function byBody(
  prefix: string,
  field: string,
  max: number,
  windowSeconds: number,
  lockoutDuration?: number,
) {
  return rateLimit({
    keyPrefix: prefix,
    maxAttempts: max,
    windowSeconds,
    lockoutDuration,
    keyExtractor: (req) => (req.body as Record<string, string>)?.[field] ?? 'unknown',
  });
}

export function byUser(prefix: string, max: number, windowSeconds: number) {
  return rateLimit({
    keyPrefix: prefix,
    maxAttempts: max,
    windowSeconds,
    keyExtractor: (req) => req.user?.id ?? 'unknown',
  });
}

// ============================================
// API Rate Limiting (Tier-based)
// ============================================

/**
 * Tier-based rate limit configuration
 * Values from FR-020: Starter: 10/s, Growth: 15/s, Pro: 25/s, Scale: 50/s, Titan: 100/s
 */
export interface TierRateLimits {
  requestsPerSecond: number;
  maxConcurrent: number;
}

export const API_TIER_LIMITS: Record<string, TierRateLimits> = {
  starter: { requestsPerSecond: 10, maxConcurrent: 5 },
  growth: { requestsPerSecond: 15, maxConcurrent: 10 },
  pro: { requestsPerSecond: 25, maxConcurrent: 15 },
  scale: { requestsPerSecond: 50, maxConcurrent: 30 },
  titan: { requestsPerSecond: 100, maxConcurrent: 50 },
};

// Global rate limit: 2000 req/s across all users
const GLOBAL_RATE_LIMIT = 2000;

/**
 * API rate limit middleware with tier-based limits
 * Sets X-RateLimit-* headers on all responses
 */
export function apiRateLimit() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Get user tier from API key auth middleware
    const userId = req.apiKeyUserId;
    const tier = req.apiKeyUserTier || 'starter';

    if (!userId) {
      // No authenticated user - skip rate limiting (will fail auth anyway)
      return next();
    }

    const limits = API_TIER_LIMITS[tier] || API_TIER_LIMITS.starter;
    const key = `ratelimit:api:${userId}`;
    const now = Date.now();
    const windowMs = 1000; // 1 second window
    const windowStart = now - windowMs;

    try {
      // Check global rate limit first
      const globalKey = 'ratelimit:api:global';
      const globalPipeline = redis.pipeline();
      globalPipeline.zremrangebyscore(globalKey, 0, windowStart);
      globalPipeline.zcard(globalKey);
      const globalResults = await globalPipeline.exec();
      const globalCount = (globalResults?.[1]?.[1] as number) ?? 0;

      if (globalCount >= GLOBAL_RATE_LIMIT) {
        const retryAfter = 1;
        setRateLimitHeaders(res, GLOBAL_RATE_LIMIT, 0, now + 1000);
        res.status(429).json({
          error: {
            code: 'GLOBAL_RATE_LIMIT_EXCEEDED',
            message: 'Global rate limit exceeded. Please try again later.',
          },
          requestId: req.requestId,
        });
        return;
      }

      // Check per-user rate limit
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
      pipeline.zcard(key);
      pipeline.expire(key, 2); // Expire after 2 seconds
      const results = await pipeline.exec();

      const count = (results?.[2]?.[1] as number) ?? 0;
      const remaining = Math.max(0, limits.requestsPerSecond - count);
      const resetTime = now + windowMs;

      // Set rate limit headers on all responses
      setRateLimitHeaders(res, limits.requestsPerSecond, remaining, resetTime);

      if (count > limits.requestsPerSecond) {
        const retryAfter = Math.ceil((resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. You can make ${limits.requestsPerSecond} requests per second.`,
            retryAfter,
          },
          requestId: req.requestId,
        });
        return;
      }

      // Increment global counter
      await redis.zadd(globalKey, now.toString(), `${now}:${userId}:${Math.random()}`);
      await redis.expire(globalKey, 2);

      next();
    } catch (err) {
      // On Redis error, fail open but log
      console.error('Rate limit Redis error:', err);
      next();
    }
  };
}

/**
 * Set X-RateLimit headers on response
 */
function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetTime: number): void {
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
}

/**
 * Get rate limits for a tier (useful for credits endpoint)
 */
export function getTierLimits(tier: string): TierRateLimits {
  return API_TIER_LIMITS[tier] || API_TIER_LIMITS.starter;
}
