/**
 * Dashboard Routes
 *
 * Endpoints:
 * - GET /api/dashboard/stats - Summary statistics
 * - GET /api/dashboard/metrics/distribution - Status distribution
 * - GET /api/dashboard/metrics/trend - Verification trend
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../config/logger.js';
import {
  getDashboardStats,
  getStatusDistribution,
  getVerificationTrend,
} from '../services/dashboard.js';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * GET /api/dashboard/stats
 *
 * Get dashboard summary statistics
 *
 * Query params:
 * - range: number (7, 30, or 90 days, default: 30)
 *
 * Response:
 * - 200: Summary statistics (credits, total verifications, etc.)
 */
router.get('/stats', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const range = parseInt(req.query.range as string, 10) || 30;

  // Validate range
  const validRanges = [7, 30, 90];
  const rangeDays = validRanges.includes(range) ? range : 30;

  const requestLogger = createLogger({
    userId,
    operation: 'get-dashboard-stats',
    rangeDays,
  });

  try {
    requestLogger.info('Processing dashboard stats request');

    const stats = await getDashboardStats(userId, rangeDays);

    requestLogger.info('Dashboard stats retrieved successfully');

    return res.json({
      success: true,
      stats,
      range: rangeDays,
    });
  } catch (error: any) {
    requestLogger.error(
      { error: error.message, stack: error.stack },
      'Failed to get dashboard stats'
    );
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve dashboard statistics',
    });
  }
});

/**
 * GET /api/dashboard/metrics/distribution
 *
 * Get status distribution (counts grouped by status)
 *
 * Query params:
 * - range: number (7, 30, or 90 days, default: 30)
 *
 * Response:
 * - 200: Array of status distributions with counts and percentages
 */
router.get('/metrics/distribution', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const range = parseInt(req.query.range as string, 10) || 30;

  // Validate range
  const validRanges = [7, 30, 90];
  const rangeDays = validRanges.includes(range) ? range : 30;

  const requestLogger = createLogger({
    userId,
    operation: 'get-status-distribution',
    rangeDays,
  });

  try {
    requestLogger.info('Processing status distribution request');

    const distribution = await getStatusDistribution(userId, rangeDays);

    requestLogger.info('Status distribution retrieved successfully');

    return res.json({
      success: true,
      distribution,
      range: rangeDays,
    });
  } catch (error: any) {
    requestLogger.error(
      { error: error.message, stack: error.stack },
      'Failed to get status distribution'
    );
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve status distribution',
    });
  }
});

/**
 * GET /api/dashboard/metrics/trend
 *
 * Get verification trend (daily counts over time)
 *
 * Query params:
 * - range: number (7, 30, or 90 days, default: 30)
 *
 * Response:
 * - 200: Array of trend data points (date, count)
 */
router.get('/metrics/trend', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const range = parseInt(req.query.range as string, 10) || 30;

  // Validate range
  const validRanges = [7, 30, 90];
  const rangeDays = validRanges.includes(range) ? range : 30;

  const requestLogger = createLogger({
    userId,
    operation: 'get-verification-trend',
    rangeDays,
  });

  try {
    requestLogger.info('Processing verification trend request');

    const trend = await getVerificationTrend(userId, rangeDays);

    requestLogger.info('Verification trend retrieved successfully');

    return res.json({
      success: true,
      trend,
      range: rangeDays,
    });
  } catch (error: any) {
    requestLogger.error(
      { error: error.message, stack: error.stack },
      'Failed to get verification trend'
    );
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve verification trend',
    });
  }
});

export default router;
