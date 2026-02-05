import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requireReauth } from '../../middleware/require-reauth.js';
import { createApiKeySchema } from '../../lib/schemas.js';
import {
  createApiKey,
  listApiKeys,
  getApiKey,
  deleteApiKey,
  ApiKeyError,
} from '../../services/api-key.js';
import { logger as pinoLogger } from '../../config/logger.js';

const logger = pinoLogger.child({ module: 'dashboard-api-keys' });

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /home/api-keys
 *
 * List all API keys for the authenticated user
 * Keys are returned with masked values (only prefix shown)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const keys = await listApiKeys(userId);

    res.json({
      keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        isTest: key.isTest,
        status: key.status,
        expiresAt: key.expiresAt?.toISOString() || null,
        lastUsedAt: key.lastUsedAt?.toISOString() || null,
        usageCount: key.usageCount,
        createdAt: key.createdAt.toISOString(),
      })),
      total: keys.length,
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to list API keys');
    next(err);
  }
});

/**
 * GET /home/api-keys/:id
 *
 * Get a single API key by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const keyId = req.params.id as string;

    const key = await getApiKey(keyId, userId);

    if (!key) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found',
        },
      });
      return;
    }

    res.json({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      isTest: key.isTest,
      status: key.status,
      expiresAt: key.expiresAt?.toISOString() || null,
      lastUsedAt: key.lastUsedAt?.toISOString() || null,
      usageCount: key.usageCount,
      createdAt: key.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id, keyId: req.params.id }, 'Failed to get API key');
    next(err);
  }
});

/**
 * POST /home/api-keys
 *
 * Create a new API key
 * REQUIRES re-authentication (password or OAuth within last 10 minutes)
 * Returns the full key ONCE - it will never be shown again
 */
router.post(
  '/',
  requireReauth, // Require recent authentication (FR-001)
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // Validate request body
      const parseResult = createApiKeySchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const { name, expiresIn, isTest } = parseResult.data;

      // Create the API key
      const result = await createApiKey({
        userId,
        name,
        expiresIn,
        isTest,
      });

      logger.info({ userId, keyId: result.id, isTest }, 'API key created via dashboard');

      // Return the full key (only shown once!)
      res.status(201).json({
        id: result.id,
        name: result.name,
        keyPrefix: result.keyPrefix,
        fullKey: result.fullKey, // IMPORTANT: Only returned at creation!
        isTest: result.isTest,
        expiresAt: result.expiresAt?.toISOString() || null,
        createdAt: result.createdAt.toISOString(),
        warning: 'Save this API key now. It will not be shown again.',
      });
    } catch (err) {
      if (err instanceof ApiKeyError) {
        const statusCode = err.code === 'MAX_KEYS_EXCEEDED' ? 400 : 500;
        res.status(statusCode).json({
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      logger.error({ err, userId: req.user?.id }, 'Failed to create API key');
      next(err);
    }
  }
);

/**
 * DELETE /home/api-keys/:id
 *
 * Soft-delete (revoke) an API key
 * The key is immediately invalidated but kept for 90 days for audit purposes
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const keyId = req.params.id as string;

    const deleted = await deleteApiKey(keyId, userId);

    if (!deleted) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found',
        },
      });
      return;
    }

    logger.info({ userId, keyId }, 'API key deleted via dashboard');

    res.status(200).json({
      success: true,
      message: 'API key has been revoked',
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id, keyId: req.params.id }, 'Failed to delete API key');
    next(err);
  }
});

export default router;
