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
