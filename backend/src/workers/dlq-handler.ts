/**
 * Dead Letter Queue (DLQ) Handler
 *
 * Processes failed verification jobs from the DLQ:
 * - Classifies failures (retryable vs permanent)
 * - Refunds credits for permanent failures
 * - Logs failure details for debugging
 */

import { Job, Worker } from 'bullmq';
import { bullRedis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';
import { refundCredits } from '../services/credit.js';
import { incrementDlqMetrics } from '../lib/metrics.js';
import { db } from '../db/index.js';
import { creditEvent } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Job data interface
 */
interface VerificationJobData {
  email: string;
  userId: string;
}

/**
 * Error classification
 */
enum ErrorType {
  RETRYABLE = 'retryable', // Network errors, timeouts, circuit breaker open
  PERMANENT = 'permanent', // Validation errors, invalid data, upstream 4xx
}

/**
 * Classify error based on message and stack
 *
 * @param error - Error object
 * @returns Error type classification
 */
function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();

  // Permanent errors (validation, invalid data, upstream 4xx, auth errors)
  if (
    message.includes('invalid email') ||
    message.includes('validation') ||
    message.includes('bad request') ||
    message.includes('404') ||
    message.includes('400') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return ErrorType.PERMANENT;
  }

  // Retryable errors (network, timeout, circuit breaker, 5xx, rate limits)
  if (
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('circuit breaker') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('500') ||
    message.includes('429') ||
    message.includes('rate limit')
  ) {
    return ErrorType.RETRYABLE;
  }

  // Default to retryable (safer to retry than to lose credits)
  return ErrorType.RETRYABLE;
}

/**
 * Process failed job from DLQ
 *
 * @param job - Failed job
 */
async function processDlqJob(job: Job<VerificationJobData>): Promise<void> {
  const jobLogger = createLogger({
    jobId: job.id,
    userId: job.data.userId,
    email: job.data.email,
    operation: 'dlq-handler',
  });

  jobLogger.info('Processing DLQ job');

  try {
    // Get failure reason
    const failedReason = job.failedReason || 'Unknown error';
    const attemptsMade = job.attemptsMade;

    // Classify error
    const error = new Error(failedReason);
    const errorType = classifyError(error);

    jobLogger.warn(
      {
        failedReason,
        attemptsMade,
        errorType,
        stackTrace: job.stacktrace?.join('\n'),
      },
      'Job failed permanently'
    );

    // Refund credits for permanent failures only
    if (errorType === ErrorType.PERMANENT) {
      try {
        // Check if refund already exists (prevent double refund)
        const existingRefund = await db
          .select()
          .from(creditEvent)
          .where(eq(creditEvent.referenceId, `verification_failed:${job.id}`))
          .limit(1)
          .execute();

        if (existingRefund.length > 0) {
          jobLogger.info(
            { jobId: job.id },
            'Refund already issued for this job, skipping'
          );
        } else {
          // Refund not yet issued, process it
          await refundCredits(job.data.userId, 1, `verification_failed:${job.id}`);

          jobLogger.info(
            {
              refundAmount: 1,
              reason: failedReason,
            },
            'Credits refunded for permanent failure'
          );
        }
      } catch (refundError: any) {
        jobLogger.error(
          {
            error: refundError.message,
            stack: refundError.stack,
          },
          'Failed to refund credits'
        );
      }
    }

    // Increment DLQ metrics
    incrementDlqMetrics(errorType);

    // Mark job as processed (will be removed from DLQ)
    return;
  } catch (error: any) {
    jobLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Error processing DLQ job'
    );
    throw error;
  }
}

/**
 * Create DLQ worker
 *
 * @returns BullMQ Worker instance
 */
export function createDlqWorker(): Worker<VerificationJobData> {
  const worker = new Worker<VerificationJobData>(
    'email-verification-dlq',
    async (job: Job<VerificationJobData>) => {
      await processDlqJob(job);
    },
    {
      connection: bullRedis,
      concurrency: 10, // Process 10 DLQ jobs concurrently
      removeOnComplete: { count: 100 }, // Keep last 100 completed DLQ jobs
      removeOnFail: { count: 100 }, // Keep last 100 failed DLQ jobs
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'DLQ job processed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        error: err.message,
        stack: err.stack,
      },
      'DLQ job processing failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message, stack: err.stack }, 'DLQ worker error');
  });

  logger.info('DLQ worker started');

  return worker;
}

// Start DLQ worker if running as standalone process
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createDlqWorker();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down DLQ worker gracefully');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down DLQ worker gracefully');
    await worker.close();
    process.exit(0);
  });
}
