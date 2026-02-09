// IMPORTANT: Import instrumentation FIRST, before any other imports
import './instrumentation.js';

import { app } from './app.js';
import { env } from './config/env.js';
import { validateStripePriceIds, getStripeConfigSummary } from './config/stripe-validation.js';
import { logger } from './config/logger.js';
import { closeRedis } from './config/redis.js';
import { closePool as closeDbPool } from './db/index.js';
import { closePool as closeUpstreamPool } from './services/upstream-client.js';
import { closeQueue } from './services/queue.js';
import { stopLastUsedFlushTask } from './services/api-key.js';

// Validate Stripe configuration on startup (non-strict mode for development)
const strictMode = env.isProduction;
validateStripePriceIds(strictMode);

const stripeConfig = getStripeConfigSummary();
logger.info(
  `Stripe configuration: ${stripeConfig.configured}/${stripeConfig.total} price IDs configured (${stripeConfig.percentage}%)`
);

const server = app.listen(env.port, () => {
  logger.info(`EmailKit backend running on port ${env.port} [${env.nodeEnv}]`);
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    // 2. Stop background tasks
    stopLastUsedFlushTask();

    // 3. Close queue connections
    await closeQueue();
    logger.info('Queue closed');

    // 4. Close upstream connection pool
    await closeUpstreamPool();
    logger.info('Upstream pool closed');

    // 5. Close Redis
    await closeRedis();
    logger.info('Redis closed');

    // 6. Close database pool
    await closeDbPool();
    logger.info('Database pool closed');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
