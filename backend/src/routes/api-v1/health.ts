import { Router, Request, Response } from 'express';
import { db } from '../../db/index.js';
import { redis } from '../../config/redis.js';
import { sql } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/v1/health
 *
 * Public health check endpoint - no authentication required
 * Returns minimal status for monitoring services
 *
 * Requirements from FR-027:
 * - Must be public (no auth)
 * - Must respond within 100ms under normal load (SC-009)
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Quick checks - timeout after 500ms each
    const checks = await Promise.allSettled([
      // Database check
      Promise.race([
        db.execute(sql`SELECT 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ]),
      // Redis check
      Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ]),
    ]);

    const dbOk = checks[0].status === 'fulfilled';
    const redisOk = checks[1].status === 'fulfilled';
    const allOk = dbOk && redisOk;

    const responseTime = Date.now() - startTime;

    // Return appropriate status code
    const statusCode = allOk ? 200 : 503;

    res.status(statusCode).json({
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database: dbOk ? 'ok' : 'error',
        cache: redisOk ? 'ok' : 'error',
      },
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database: 'error',
        cache: 'error',
      },
    });
  }
});

export default router;
