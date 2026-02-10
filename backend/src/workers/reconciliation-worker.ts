/**
 * Credit Reconciliation Worker
 *
 * Runs every 5 minutes to sync Redis with PostgreSQL.
 * Uses BullMQ repeat jobs for scheduling.
 */

import { Queue, Worker, Job } from 'bullmq';
import { bullRedis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';
import { reconcileAll } from '../services/reconciliation.js';

/**
 * Reconciliation job data
 */
interface ReconciliationJobData {
  batchSize: number;
  triggeredAt: string;
}

// Create reconciliation queue
const reconciliationQueue = new Queue<ReconciliationJobData>('credit-reconciliation', {
  connection: bullRedis,
});

/**
 * Process reconciliation job
 */
async function processReconciliation(job: Job<ReconciliationJobData>): Promise<void> {
  const jobLogger = createLogger({
    jobId: job.id,
    operation: 'reconciliation',
  });

  jobLogger.info('Starting credit reconciliation');

  try {
    const summary = await reconcileAll(job.data.batchSize);

    jobLogger.info(
      {
        summary,
      },
      'Credit reconciliation completed'
    );

    // Alert if significant drift detected
    if (summary.driftDetected > 0) {
      jobLogger.warn(
        {
          driftDetected: summary.driftDetected,
          totalDrift: summary.totalDrift,
          corrected: summary.corrected,
        },
        'Credit drift detected during reconciliation'
      );
    }
  } catch (error: any) {
    jobLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Reconciliation job failed'
    );
    throw error;
  }
}

/**
 * Create reconciliation worker
 */
export function createReconciliationWorker(): Worker<ReconciliationJobData> {
  const worker = new Worker<ReconciliationJobData>(
    'credit-reconciliation',
    async (job: Job<ReconciliationJobData>) => {
      await processReconciliation(job);
    },
    {
      connection: bullRedis,
      concurrency: 1, // Only one reconciliation at a time
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Reconciliation job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        error: err.message,
        stack: err.stack,
      },
      'Reconciliation job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message, stack: err.stack }, 'Reconciliation worker error');
  });

  logger.info('Reconciliation worker started');

  return worker;
}

/**
 * Schedule recurring reconciliation job
 */
export async function scheduleReconciliation() {
  // Add recurring job (every 5 minutes)
  await reconciliationQueue.add(
    'reconcile',
    {
      batchSize: 1000,
      triggeredAt: new Date().toISOString(),
    },
    {
      repeat: {
        pattern: '*/5 * * * *', // Every 5 minutes
      },
      jobId: 'reconciliation-cron', // Prevent duplicate jobs
    }
  );

  logger.info('Reconciliation cron job scheduled (every 5 minutes)');
}

// Start worker and schedule cron if running as standalone process
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createReconciliationWorker();

  // Schedule cron job
  scheduleReconciliation().catch((err) => {
    logger.error({ error: err.message }, 'Failed to schedule reconciliation');
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down reconciliation worker');
    await worker.close();
    await reconciliationQueue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down reconciliation worker');
    await worker.close();
    await reconciliationQueue.close();
    process.exit(0);
  });
}
