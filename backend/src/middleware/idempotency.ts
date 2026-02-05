import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { logger as pinoLogger } from '../config/logger.js';

const logger = pinoLogger.child({ module: 'idempotency' });

// Idempotency key TTL: 24 hours
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

// Extend Express Request to include idempotency info
declare global {
  namespace Express {
    interface Request {
      idempotencyKey?: string;
      isIdempotentReplay?: boolean;
    }
  }
}

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  requestHash: string;
  createdAt: number;
}

/**
 * Generate a hash of the request for deduplication
 */
function hashRequest(req: Request): string {
  const data = JSON.stringify({
    method: req.method,
    path: req.path,
    body: req.body,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Get Redis key for idempotency storage
 */
function getIdempotencyKey(userId: string, idempotencyKey: string): string {
  return `idempotency:${userId}:${idempotencyKey}`;
}

/**
 * Middleware to handle idempotency for POST requests
 *
 * Requirements:
 * - Idempotency-Key header required for all POST requests
 * - Must be valid UUID v4 format
 * - Same key + same request body = cached response
 * - Same key + different request body = 422 error
 * - Keys expire after 24 hours
 */
export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply to POST requests
  if (req.method !== 'POST') {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'];

  // Validate idempotency key is present
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    res.status(400).json({
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required for POST requests',
      },
      requestId: req.requestId,
    });
    return;
  }

  // Validate UUID v4 format
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidV4Regex.test(idempotencyKey)) {
    res.status(400).json({
      error: {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be a valid UUID v4',
      },
      requestId: req.requestId,
    });
    return;
  }

  req.idempotencyKey = idempotencyKey;

  // Get user ID from authenticated request (set by api-key-auth middleware)
  const userId = (req as any).apiKeyUserId || (req as any).user?.id || 'anonymous';
  const redisKey = getIdempotencyKey(userId, idempotencyKey);
  const requestHash = hashRequest(req);

  // Check for existing cached response
  redis.get(redisKey)
    .then(async (cached) => {
      if (cached) {
        const cachedResponse: CachedResponse = JSON.parse(cached);

        // Verify request body matches
        if (cachedResponse.requestHash !== requestHash) {
          res.status(422).json({
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Idempotency key has already been used with a different request body',
            },
            requestId: req.requestId,
          });
          return;
        }

        // Return cached response
        logger.info({ idempotencyKey, userId }, 'Returning cached idempotent response');
        req.isIdempotentReplay = true;

        // Set cached headers
        Object.entries(cachedResponse.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });

        res.status(cachedResponse.statusCode).json(cachedResponse.body);
        return;
      }

      // No cached response - proceed with request and cache the result
      // Override res.json to capture the response
      const originalJson = res.json.bind(res);
      res.json = function (body: unknown) {
        // Only cache successful responses (2xx)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const responseToCache: CachedResponse = {
            statusCode: res.statusCode,
            headers: {
              'Content-Type': 'application/json',
            },
            body,
            requestHash,
            createdAt: Date.now(),
          };

          // Store in Redis with TTL
          redis.setex(redisKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(responseToCache))
            .catch((err) => {
              logger.error({ err, idempotencyKey }, 'Failed to cache idempotent response');
            });
        }

        return originalJson(body);
      };

      next();
    })
    .catch((err) => {
      logger.error({ err, idempotencyKey }, 'Redis error in idempotency check');
      // On Redis error, proceed without idempotency (fail open)
      next();
    });
}

export default idempotencyMiddleware;
