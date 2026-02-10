/**
 * API Key Cleanup Worker
 *
 * Runs daily to permanently delete API keys that were revoked more than 90 days ago.
 * This is the hard-delete phase after soft-delete (revocation).
 */

import { Queue, Worker, Job } from 'bullmq';
import { bullRedis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';
import { db } from '../db/index.js';
import { apiKey } from '../db/schema.js';
import { and, isNotNull, lte } from 'drizzle-orm';

interface CleanupJobData {
  triggeredAt: string;
}

// Create cleanup queue
const cleanupQueue = new Queue<CleanupJobData>('api-key-cleanup', {
  connection: bullRedis,
});

/**
 * Process API key hard deletion
 */
async function processCleanup(job: Job<CleanupJobData>): Promise<{ deletedCount: number }> {
  const jobLogger = createLogger({
    jobId: job.id,
    operation: 'api-key-cleanup',
  });

  jobLogger.info('Starting API key hard deletion cleanup');

  try {
    const now = new Date();

    // Find all keys where hardDeleteAt has passed
    const keysToDelete = await db
      .select({ id: apiKey.id, userId: apiKey.userId, keyPrefix: apiKey.keyPrefix })
      .from(apiKey)
      .where(
        and(
          isNotNull(apiKey.hardDeleteAt),
          lte(apiKey.hardDeleteAt, now)
        )
      );

    if (keysToDelete.length === 0) {
      jobLogger.info('No API keys to hard delete');
      return { deletedCount: 0 };
    }

    jobLogger.info({ count: keysToDelete.length }, 'Found API keys to hard delete');

    // Delete keys in batches to avoid long transactions
    const BATCH_SIZE = 100;
    let deletedCount = 0;

    for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
      const batch = keysToDelete.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((k) => k.id);

      // Log which keys are being deleted (for audit)
      for (const key of batch) {
        jobLogger.info(
          { keyId: key.id, userId: key.userId, keyPrefix: key.keyPrefix },
          'Hard deleting API key'
        );
      }

      // Delete the batch
      await db
        .delete(apiKey)
        .where(
          and(
            isNotNull(apiKey.hardDeleteAt),
            lte(apiKey.hardDeleteAt, now)
          )
        );

      deletedCount += batch.length;
    }

    jobLogger.info({ deletedCount }, 'API key hard deletion completed');

    return { deletedCount };
  } catch (error: any) {
    jobLogger.error(
      { error: error.message, stack: error.stack },
      'API key cleanup failed'
    );
    throw error;
  }
}

/**
 * Create the cleanup worker
 */
export function createApiKeyCleanupWorker(): Worker<CleanupJobData> {
  const worker = new Worker<CleanupJobData>(
    'api-key-cleanup',
    async (job: Job<CleanupJobData>) => {
      return await processCleanup(job);
    },
    {
      connection: bullRedis,
      concurrency: 1, // Only one cleanup at a time
    }
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'API key cleanup job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message, stack: err.stack },
      'API key cleanup job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message, stack: err.stack }, 'API key cleanup worker error');
  });

  logger.info('API key cleanup worker started');

  return worker;
}

/**
 * Schedule recurring cleanup (daily at 4 AM UTC)
 */
export async function scheduleApiKeyCleanup(): Promise<void> {
  await cleanupQueue.add(
    'cleanup',
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        pattern: '0 4 * * *', // Daily at 4 AM UTC
      },
      jobId: 'api-key-cleanup-cron',
    }
  );

  logger.info('API key cleanup cron job scheduled (daily at 4 AM UTC)');
}

/**
 * Run once manually (for testing)
 */
export async function runApiKeyCleanupOnce(): Promise<void> {
  await cleanupQueue.add('cleanup-manual', {
    triggeredAt: new Date().toISOString(),
  });
}

// Export queue for external access
export { cleanupQueue };

// Start worker if running as standalone process
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createApiKeyCleanupWorker();

  scheduleApiKeyCleanup().catch((err) => {
    logger.error({ error: err.message }, 'Failed to schedule API key cleanup');
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down API key cleanup worker');
    await worker.close();
    await cleanupQueue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down API key cleanup worker');
    await worker.close();
    await cleanupQueue.close();
    process.exit(0);
  });
}
