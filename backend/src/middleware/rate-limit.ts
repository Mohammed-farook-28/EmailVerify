import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { RateLimitError } from '../lib/errors.js';
import { logger } from '../config/logger.js';

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
// Lua script: atomic global check + per-user check + both increments in 1 round-trip
// Uses redis.eval (ioredis method for Redis EVAL command) — NOT JavaScript eval()
const RATE_LIMIT_LUA = `
local globalKey = KEYS[1]
local userKey = KEYS[2]
local windowStart = tonumber(ARGV[1])
local now = ARGV[2]
local member = ARGV[3]
local globalMember = ARGV[4]
local globalLimit = tonumber(ARGV[5])
local userLimit = tonumber(ARGV[6])

redis.call('ZREMRANGEBYSCORE', globalKey, 0, windowStart)
redis.call('ZREMRANGEBYSCORE', userKey, 0, windowStart)

local globalCount = redis.call('ZCARD', globalKey)
if globalCount >= globalLimit then
  return {-1, globalCount}
end

redis.call('ZADD', userKey, now, member)
redis.call('EXPIRE', userKey, 2)
local userCount = redis.call('ZCARD', userKey)

if userCount > userLimit then
  return {-2, userCount}
end

redis.call('ZADD', globalKey, now, globalMember)
redis.call('EXPIRE', globalKey, 2)

return {0, userCount}
`;

export function apiRateLimit() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.apiKeyUserId;
    const tier = req.apiKeyUserTier || 'starter';

    if (!userId) {
      return next();
    }

    const limits = API_TIER_LIMITS[tier] || API_TIER_LIMITS.starter;
    const globalKey = 'ratelimit:api:global';
    const userKey = `ratelimit:api:${userId}`;
    const now = Date.now();
    const windowStart = now - 1000;

    try {
      // Single Redis round-trip via Lua script (ioredis EVAL command)
      const result = await (redis as any).eval(
        RATE_LIMIT_LUA,
        2,
        globalKey,
        userKey,
        windowStart.toString(),
        now.toString(),
        `${now}:${Math.random()}`,
        `${now}:${userId}:${Math.random()}`,
        GLOBAL_RATE_LIMIT.toString(),
        limits.requestsPerSecond.toString()
      ) as [number, number];

      const [status, count] = result;
      const resetTime = now + 1000;

      if (status === -1) {
        setRateLimitHeaders(res, GLOBAL_RATE_LIMIT, 0, resetTime);
        res.status(429).json({
          error: {
            code: 'GLOBAL_RATE_LIMIT_EXCEEDED',
            message: 'Global rate limit exceeded. Please try again later.',
          },
          requestId: req.requestId,
        });
        return;
      }

      if (status === -2) {
        setRateLimitHeaders(res, limits.requestsPerSecond, 0, resetTime);
        res.setHeader('Retry-After', '1');
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. You can make ${limits.requestsPerSecond} requests per second.`,
            retryAfter: 1,
          },
          requestId: req.requestId,
        });
        return;
      }

      const remaining = Math.max(0, limits.requestsPerSecond - count);
      setRateLimitHeaders(res, limits.requestsPerSecond, remaining, resetTime);
      next();
    } catch (err) {
      // On Redis error, fail open but log
      logger.error({ err }, 'Rate limit Redis error');
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
