/**
 * Data Retention Cleanup Worker
 *
 * Runs daily at 2 AM UTC to delete old verification results.
 * Uses BullMQ repeat jobs for scheduling.
 */

import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';
import { cleanupAll } from '../services/retention-cleanup.js';

/**
 * Cleanup job data
 */
interface CleanupJobData {
  triggeredAt: string;
}

// Create cleanup queue
const cleanupQueue = new Queue<CleanupJobData>('retention-cleanup', {
  connection: redis,
});

/**
 * Process cleanup job
 */
async function processCleanup(job: Job<CleanupJobData>): Promise<void> {
  const jobLogger = createLogger({
    jobId: job.id,
    operation: 'retention-cleanup',
  });

  jobLogger.info('Starting data retention cleanup');

  try {
    const summary = await cleanupAll();

    jobLogger.info(
      {
        summary,
      },
      'Data retention cleanup completed'
    );

    // Alert if many records deleted
    if (summary.totalDeleted > 100000) {
      jobLogger.warn(
        {
          totalDeleted: summary.totalDeleted,
        },
        'Large number of records deleted during cleanup'
      );
    }
  } catch (error: any) {
    jobLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Cleanup job failed'
    );
    throw error;
  }
}

/**
 * Create cleanup worker
 */
export function createCleanupWorker(): Worker<CleanupJobData> {
  const worker = new Worker<CleanupJobData>(
    'retention-cleanup',
    async (job: Job<CleanupJobData>) => {
      await processCleanup(job);
    },
    {
      connection: redis,
      concurrency: 1, // Only one cleanup at a time
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Cleanup job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        error: err.message,
        stack: err.stack,
      },
      'Cleanup job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message, stack: err.stack }, 'Cleanup worker error');
  });

  logger.info('Cleanup worker started');

  return worker;
}

/**
 * Schedule recurring cleanup job
 */
export async function scheduleCleanup() {
  // Add recurring job (daily at 2 AM UTC)
  await cleanupQueue.add(
    'cleanup',
    {
      triggeredAt: new Date().toISOString(),
    },
    {
      repeat: {
        pattern: '0 2 * * *', // Daily at 2 AM UTC
      },
      jobId: 'cleanup-cron', // Prevent duplicate jobs
    }
  );

  logger.info('Cleanup cron job scheduled (daily at 2 AM UTC)');
}

// Start worker and schedule cron if running as standalone process
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createCleanupWorker();

  // Schedule cron job
  scheduleCleanup().catch((err) => {
    logger.error({ error: err.message }, 'Failed to schedule cleanup');
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down cleanup worker');
    await worker.close();
    await cleanupQueue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down cleanup worker');
    await worker.close();
    await cleanupQueue.close();
    process.exit(0);
  });
}
