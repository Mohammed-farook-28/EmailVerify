import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { apiKey, user, subscription } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { redis } from '../config/redis.js';
import { logger as pinoLogger } from '../config/logger.js';

const logger = pinoLogger.child({ module: 'api-key-auth' });

// Extend Express Request to include API key info
declare global {
  namespace Express {
    interface Request {
      apiKeyId?: string;
      apiKeyUserId?: string;
      apiKeyIsTest?: boolean;
      apiKeyUserTier?: string;
    }
  }
}

// Cache API key lookups in Redis for 5 minutes
const API_KEY_CACHE_TTL_SECONDS = 300;

interface CachedApiKeyInfo {
  keyId: string;
  userId: string;
  isTest: boolean;
  status: string;
  expiresAt: string | null;
  userTier: string;
}

/**
 * Hash an API key for lookup (same algorithm used during creation)
 */
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Get user's subscription tier
 */
async function getUserTier(userId: string): Promise<string> {
  const sub = await db.query.subscription.findFirst({
    where: and(
      eq(subscription.userId, userId),
      eq(subscription.status, 'active')
    ),
  });

  if (!sub) {
    return 'starter'; // Default tier for users without subscription
  }

  // Extract tier from planId (e.g., 'pro-monthly' -> 'pro')
  const tierMatch = sub.planId.match(/^(starter|growth|pro|scale|titan)/i);
  return tierMatch ? tierMatch[1].toLowerCase() : 'starter';
}

/**
 * Middleware to authenticate API requests using Bearer token (API key)
 *
 * Requirements:
 * - Authorization header: Bearer ek_xxx or Bearer ek_test_xxx
 * - Valid, non-revoked, non-expired API key
 * - Updates last_used_at timestamp (async, batched)
 * - Sets req.apiKeyId, req.apiKeyUserId, req.apiKeyIsTest, req.apiKeyUserTier
 */
export async function apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  // Check for Authorization header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'MISSING_API_KEY',
        message: 'Authorization header with Bearer token is required',
      },
      requestId: req.requestId,
    });
    return;
  }

  const apiKeyValue = authHeader.slice(7); // Remove 'Bearer '

  // Validate API key format
  if (!apiKeyValue.startsWith('ek_') && !apiKeyValue.startsWith('ek_test_')) {
    res.status(401).json({
      error: {
        code: 'INVALID_API_KEY_FORMAT',
        message: 'API key must start with ek_ or ek_test_',
      },
      requestId: req.requestId,
    });
    return;
  }

  const keyHash = hashApiKey(apiKeyValue);
  const cacheKey = `apikey:info:${keyHash}`;

  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    let keyInfo: CachedApiKeyInfo;

    if (cached) {
      keyInfo = JSON.parse(cached);
    } else {
      // Look up in database
      const dbKey = await db.query.apiKey.findFirst({
        where: eq(apiKey.keyHash, keyHash),
      });

      if (!dbKey) {
        res.status(401).json({
          error: {
            code: 'INVALID_API_KEY',
            message: 'API key not found or invalid',
          },
          requestId: req.requestId,
        });
        return;
      }

      // Get user tier
      const userTier = await getUserTier(dbKey.userId);

      keyInfo = {
        keyId: dbKey.id,
        userId: dbKey.userId,
        isTest: dbKey.isTest,
        status: dbKey.status,
        expiresAt: dbKey.expiresAt?.toISOString() || null,
        userTier,
      };

      // Cache the result (only for active keys)
      if (dbKey.status === 'active') {
        await redis.setex(cacheKey, API_KEY_CACHE_TTL_SECONDS, JSON.stringify(keyInfo));
      }
    }

    // Validate key status
    if (keyInfo.status === 'revoked') {
      res.status(401).json({
        error: {
          code: 'API_KEY_REVOKED',
          message: 'API key has been revoked',
        },
        requestId: req.requestId,
      });
      return;
    }

    if (keyInfo.status === 'expired') {
      res.status(401).json({
        error: {
          code: 'API_KEY_EXPIRED',
          message: 'API key has expired',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Check expiration date
    if (keyInfo.expiresAt && new Date(keyInfo.expiresAt) < new Date()) {
      // Key has expired - update status in background
      db.update(apiKey)
        .set({ status: 'expired' })
        .where(eq(apiKey.id, keyInfo.keyId))
        .execute()
        .catch((err) => logger.error({ err }, 'Failed to update expired API key status'));

      // Invalidate cache
      await redis.del(cacheKey);

      res.status(401).json({
        error: {
          code: 'API_KEY_EXPIRED',
          message: 'API key has expired',
        },
        requestId: req.requestId,
      });
      return;
    }

    // Set request properties
    req.apiKeyId = keyInfo.keyId;
    req.apiKeyUserId = keyInfo.userId;
    req.apiKeyIsTest = keyInfo.isTest;
    req.apiKeyUserTier = keyInfo.userTier;

    // Update last_used_at async (batched via Redis to reduce DB writes)
    const lastUsedKey = `apikey:lastused:${keyInfo.keyId}`;
    redis.set(lastUsedKey, Date.now().toString())
      .catch((err) => logger.error({ err }, 'Failed to update API key last used timestamp'));

    logger.debug(
      { keyId: keyInfo.keyId, userId: keyInfo.userId, isTest: keyInfo.isTest },
      'API key authenticated'
    );

    next();
  } catch (err) {
    logger.error({ err }, 'Error during API key authentication');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during authentication',
      },
      requestId: req.requestId,
    });
  }
}

export default apiKeyAuthMiddleware;
