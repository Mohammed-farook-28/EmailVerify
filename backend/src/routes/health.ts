/**
 * Health Check and Metrics Endpoints
 *
 * Kubernetes-ready health probes:
 * - /health/live - Liveness probe (process running)
 * - /health/ready - Readiness probe (dependencies ready)
 * - /health/startup - Startup probe (workers connected)
 *
 * Monitoring:
 * - /metrics - Prometheus metrics endpoint
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { redis } from '../config/redis.js';
import { getMetrics } from '../lib/metrics.js';
import { getQueueStats } from '../services/queue.js';
import { getCircuitBreakerStats } from '../services/circuit-breaker.js';
import { logger } from '../config/logger.js';
import { sql } from 'drizzle-orm';

const router = Router();

/**
 * GET /health/live
 *
 * Liveness probe - Always returns 200 if process is running
 * Kubernetes uses this to restart unhealthy pods
 */
router.get('/live', async (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/ready
 *
 * Readiness probe - Returns 200 only if all dependencies are ready
 * Kubernetes uses this to route traffic to the pod
 *
 * Checks:
 * - PostgreSQL connection
 * - Redis connection
 */
router.get('/ready', async (req: Request, res: Response) => {
  const checks = {
    postgres: false,
    redis: false,
  };

  try {
    // Check PostgreSQL
    await db.execute(sql`SELECT 1`);
    checks.postgres = true;
  } catch (error: any) {
    logger.error({ error: error.message }, 'PostgreSQL health check failed');
  }

  try {
    // Check Redis
    await redis.ping();
    checks.redis = true;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Redis health check failed');
  }

  const allReady = checks.postgres && checks.redis;

  res.status(allReady ? 200 : 503).json({
    status: allReady ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * GET /health/startup
 *
 * Startup probe - Returns 200 only if workers are connected to queue
 * Kubernetes uses this to know when the app has fully started
 *
 * Checks:
 * - PostgreSQL connection
 * - Redis connection
 * - Queue connection (can process jobs)
 */
router.get('/startup', async (req: Request, res: Response) => {
  const checks = {
    postgres: false,
    redis: false,
    queue: false,
  };

  try {
    // Check PostgreSQL
    await db.execute(sql`SELECT 1`);
    checks.postgres = true;
  } catch (error: any) {
    logger.error({ error: error.message }, 'PostgreSQL startup check failed');
  }

  try {
    // Check Redis
    await redis.ping();
    checks.redis = true;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Redis startup check failed');
  }

  try {
    // Check queue (can get stats)
    const stats = await getQueueStats();
    checks.queue = true;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Queue startup check failed');
  }

  const allReady = checks.postgres && checks.redis && checks.queue;

  res.status(allReady ? 200 : 503).json({
    status: allReady ? 'ok' : 'starting',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * GET /metrics
 *
 * Prometheus metrics endpoint (text format)
 * Scrape interval: 15s (recommended)
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to generate metrics');
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

/**
 * GET /health/stats (optional)
 *
 * Human-readable stats for debugging
 * Not used by Kubernetes, but useful for ops
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [queueStats, circuitBreakerStats] = await Promise.all([
      getQueueStats(),
      getCircuitBreakerStats(),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
      },
      queue: queueStats,
      circuitBreaker: circuitBreakerStats,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to generate stats');
    res.status(500).json({ error: 'Failed to generate stats' });
  }
});

export default router;
