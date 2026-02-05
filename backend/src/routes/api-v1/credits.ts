import { Router, Request, Response, NextFunction } from 'express';
import { apiKeyAuthMiddleware } from '../../middleware/api-key-auth.js';
import { apiRateLimit } from '../../middleware/rate-limit.js';
import { getBalance } from '../../services/credit.js';
import { logger as pinoLogger } from '../../config/logger.js';

const logger = pinoLogger.child({ module: 'api-v1-credits' });

const router = Router();

// All routes require API key authentication
router.use(apiKeyAuthMiddleware);

// Apply rate limiting
router.use(apiRateLimit());

/**
 * GET /api/v1/credits
 *
 * Get current credit balance for the authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.apiKeyUserId!;

    const balance = await getBalance(userId);

    res.json({
      balance,
      updatedAt: new Date().toISOString(),
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error({ err, userId: req.apiKeyUserId }, 'Failed to get credit balance');
    next(err);
  }
});

export default router;
