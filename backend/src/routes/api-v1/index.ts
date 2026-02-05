import { Router, Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from '../../middleware/request-id.js';
import healthRoutes from './health.js';
import verifyRoutes from './verify.js';
import creditsRoutes from './credits.js';
import webhooksRoutes from './webhooks.js';

const router = Router();

/**
 * API v1 Router Aggregation
 *
 * URL versioning: /api/v1/
 * UTF-8 encoding for all responses
 * NO CORS middleware (server-side API only per FR-029)
 */

// Apply request ID middleware to all API routes
router.use(requestIdMiddleware);

// Set UTF-8 content type for all JSON responses (FR-030)
router.use((req: Request, res: Response, next: NextFunction) => {
  // Override res.json to ensure UTF-8 encoding
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  };
  next();
});

// Public routes (no authentication required)
router.use('/health', healthRoutes);

// Protected routes (API key authentication handled within each router)
router.use('/verify', verifyRoutes);
router.use('/credits', creditsRoutes);
router.use('/webhooks', webhooksRoutes);

// 404 handler for unknown API routes
router.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
    },
    requestId: req.requestId,
  });
});

export default router;
