/**
 * API Key Expiration Worker
 *
 * Runs daily to check for API keys that have expired and updates their status.
 * Keys are marked as 'expired' when their expiresAt date has passed.
 */

import { Queue, Worker, Job } from 'bullmq';
import { bullRedis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';
import { db } from '../db/index.js';
import { apiKey } from '../db/schema.js';
import { and, eq, lt, isNotNull } from 'drizzle-orm';

interface ExpiryJobData {
  triggeredAt: string;
}

// Create expiry check queue
const expiryQueue = new Queue<ExpiryJobData>('api-key-expiry', {
  connection: bullRedis,
});

/**
 * Process API key expiration check
 */
async function processExpiryCheck(job: Job<ExpiryJobData>): Promise<{ expiredCount: number }> {
  const jobLogger = createLogger({
    jobId: job.id,
    operation: 'api-key-expiry',
  });

  jobLogger.info('Starting API key expiration check');

  try {
    const now = new Date();

    // Find all active keys that have passed their expiration date
    const expiredKeys = await db
      .select({ id: apiKey.id, userId: apiKey.userId })
      .from(apiKey)
      .where(
        and(
          eq(apiKey.status, 'active'),
          isNotNull(apiKey.expiresAt),
          lt(apiKey.expiresAt, now)
        )
      );

    if (expiredKeys.length === 0) {
      jobLogger.info('No expired API keys found');
      return { expiredCount: 0 };
    }

    jobLogger.info({ count: expiredKeys.length }, 'Found expired API keys to process');

    // Update all expired keys in a batch
    const keyIds = expiredKeys.map((k) => k.id);

    await db
      .update(apiKey)
      .set({ status: 'expired' })
      .where(
        and(
          eq(apiKey.status, 'active'),
          isNotNull(apiKey.expiresAt),
          lt(apiKey.expiresAt, now)
        )
      );

    // Invalidate Redis cache for expired keys
    for (const key of expiredKeys) {
      try {
        // Get the key hash to invalidate cache (we can't since we only store hash)
        // The validation will naturally fail on next use since status != 'active'
        jobLogger.debug({ keyId: key.id, userId: key.userId }, 'Marked API key as expired');
      } catch (err) {
        jobLogger.error({ err, keyId: key.id }, 'Failed to invalidate cache for expired key');
      }
    }

    jobLogger.info({ expiredCount: expiredKeys.length }, 'API key expiration check completed');

    return { expiredCount: expiredKeys.length };
  } catch (error: any) {
    jobLogger.error(
      { error: error.message, stack: error.stack },
      'API key expiry check failed'
    );
    throw error;
  }
}

/**
 * Create the expiry check worker
 */
export function createApiKeyExpiryWorker(): Worker<ExpiryJobData> {
  const worker = new Worker<ExpiryJobData>(
    'api-key-expiry',
    async (job: Job<ExpiryJobData>) => {
      return await processExpiryCheck(job);
    },
    {
      connection: bullRedis,
      concurrency: 1, // Only one check at a time
    }
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'API key expiry check completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message, stack: err.stack },
      'API key expiry check failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message, stack: err.stack }, 'API key expiry worker error');
  });

  logger.info('API key expiry worker started');

  return worker;
}

/**
 * Schedule recurring expiry check (daily at 3 AM UTC)
 */
export async function scheduleApiKeyExpiryCheck(): Promise<void> {
  await expiryQueue.add(
    'expiry-check',
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        pattern: '0 3 * * *', // Daily at 3 AM UTC
      },
      jobId: 'api-key-expiry-cron',
    }
  );

  logger.info('API key expiry cron job scheduled (daily at 3 AM UTC)');
}

/**
 * Run once manually (for testing)
 */
export async function runApiKeyExpiryCheckOnce(): Promise<void> {
  await expiryQueue.add('expiry-check-manual', {
    triggeredAt: new Date().toISOString(),
  });
}

// Export queue for external access
export { expiryQueue };

// Start worker if running as standalone process
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createApiKeyExpiryWorker();

  scheduleApiKeyExpiryCheck().catch((err) => {
    logger.error({ error: err.message }, 'Failed to schedule API key expiry check');
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down API key expiry worker');
    await worker.close();
    await expiryQueue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down API key expiry worker');
    await worker.close();
    await expiryQueue.close();
    process.exit(0);
  });
}
