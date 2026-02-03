/**
 * Bulk Email Verification Worker
 *
 * Processes bulk verification jobs from BullMQ queue.
 * Concurrency: 50 jobs per worker instance
 *
 * Job Processing:
 * 1. Fetch pending emails in batches of 100
 * 2. Verify each email via circuit breaker
 * 3. Update results in database
 * 4. Update job progress (every 1% or 5 seconds)
 * 5. On completion, generate CSV and upload to S3
 *
 * Error Handling:
 * - Individual email failures don't fail the entire job
 * - Job continues even if circuit breaker opens
 * - Failed emails are marked as 'unknown'
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '../db/index.js';
import { bulkVerificationResult } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logger, createLogger } from '../config/logger.js';
import { verifyWithCircuitBreaker, isCircuitOpen } from '../services/circuit-breaker.js';
import {
  updateBulkJobStatus,
  getBulkJob,
} from '../services/bulk-verification.js';
import { generateAndUploadResults } from '../services/result-storage.js';
import { JobStatus } from '../types/bulk.js';
import type { VerificationResult as UpstreamResult } from '../services/upstream-client.js';

// Create Redis connection for worker
const connection = new IORedis.default({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Worker concurrency
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '50', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);

interface BulkJobData {
  jobId: string;
  userId: string;
  totalCount: number;
}

/**
 * Process a bulk verification job
 */
async function processBulkJob(job: Job<BulkJobData>): Promise<void> {
  const { jobId, userId, totalCount } = job.data;
  const jobLogger = createLogger({
    bulkJobId: jobId,
    userId,
    totalCount,
  });

  jobLogger.info('Starting bulk verification job');

  try {
    // Mark job as processing
    await updateBulkJobStatus(jobId, JobStatus.PROCESSING, {
      startedAt: new Date(),
    });

    let processedCount = 0;
    let validCount = 0;
    let invalidCount = 0;
    let riskyCount = 0;
    let unknownCount = 0;
    let lastProgressUpdate = Date.now();
    let lastProgressPercentage = 0;

    // Process in batches
    while (processedCount < totalCount) {
      // Fetch next batch of pending results
      const batch = await db
        .select()
        .from(bulkVerificationResult)
        .where(
          and(
            eq(bulkVerificationResult.jobId, jobId),
            eq(bulkVerificationResult.status, 'pending')
          )
        )
        .limit(BATCH_SIZE);

      if (batch.length === 0) {
        // No more pending results
        break;
      }

      jobLogger.info(
        {
          batchSize: batch.length,
          processedCount,
          totalCount,
        },
        'Processing batch'
      );

      // Check circuit breaker state
      const circuitOpen = await isCircuitOpen();

      // Process each email in the batch
      for (const result of batch) {
        try {
          let verificationResult: UpstreamResult;

          if (circuitOpen) {
            // Circuit breaker is open, mark as unknown
            jobLogger.warn(
              { email: result.email },
              'Circuit breaker open, marking as unknown'
            );

            verificationResult = {
              email: result.email,
              status: 'unknown',
              score: 0,
              deliverability: 'unknown',
              attributes: {
                disposable: false,
                freeProvider: false,
                roleAccount: false,
                catchAll: false,
                mxRecordsFound: false,
                smtpValid: false,
              },
              serverInfo: {
                processingTime: 0,
                requestId: 'circuit-breaker-open',
                timestamp: new Date().toISOString(),
              },
            };
          } else {
            // Verify email via circuit breaker
            verificationResult = await verifyWithCircuitBreaker(
              result.email,
              userId
            );
          }

          // Update result in database
          await db
            .update(bulkVerificationResult)
            .set({
              status: verificationResult.status,
              deliverable: verificationResult.deliverability === 'deliverable',
              risky: verificationResult.deliverability === 'risky',
              unknown: verificationResult.deliverability === 'unknown',
              riskScore: verificationResult.score,
              mxRecords: {
                found: verificationResult.attributes.mxRecordsFound,
              },
              smtpProvider: verificationResult.serverInfo.requestId, // Placeholder
              isFreeEmail: verificationResult.attributes.freeProvider,
              isRoleBased: verificationResult.attributes.roleAccount,
              isCatchAll: verificationResult.attributes.catchAll,
              isDisposable: verificationResult.attributes.disposable,
              hasMxRecords: verificationResult.attributes.mxRecordsFound,
            })
            .where(eq(bulkVerificationResult.id, result.id));

          // Update counts
          processedCount++;
          switch (verificationResult.status) {
            case 'valid':
              validCount++;
              break;
            case 'invalid':
              invalidCount++;
              break;
            case 'risky':
              riskyCount++;
              break;
            case 'unknown':
              unknownCount++;
              break;
          }
        } catch (error: any) {
          // Individual email verification failed
          jobLogger.error(
            { email: result.email, error },
            'Email verification failed, marking as unknown'
          );

          // Mark as unknown
          await db
            .update(bulkVerificationResult)
            .set({
              status: 'unknown',
              deliverable: false,
              risky: false,
              unknown: true,
              riskScore: 0,
            })
            .where(eq(bulkVerificationResult.id, result.id));

          processedCount++;
          unknownCount++;
        }
      }

      // Calculate progress
      const currentPercentage = Math.round(
        (processedCount / totalCount) * 100
      );
      const timeSinceLastUpdate = Date.now() - lastProgressUpdate;

      // Emit progress if 1% or 5 seconds passed
      const shouldEmitProgress =
        currentPercentage > lastProgressPercentage ||
        timeSinceLastUpdate >= 5000;

      if (shouldEmitProgress) {
        await updateBulkJobStatus(jobId, JobStatus.PROCESSING, {
          processedCount,
          validCount,
          invalidCount,
          riskyCount,
          unknownCount,
        });

        lastProgressUpdate = Date.now();
        lastProgressPercentage = currentPercentage;

        jobLogger.info(
          {
            processedCount,
            totalCount,
            percentage: currentPercentage,
          },
          'Progress update'
        );

        // Update BullMQ job progress
        await job.updateProgress(currentPercentage);
      }
    }

    // Job complete - generate results CSV and upload to S3
    jobLogger.info('Bulk job complete, generating results CSV');

    const resultUrl = await generateAndUploadResults(jobId);

    // Mark job as completed
    await updateBulkJobStatus(jobId, JobStatus.COMPLETED, {
      processedCount,
      validCount,
      invalidCount,
      riskyCount,
      unknownCount,
      completedAt: new Date(),
      resultUrl,
    });

    jobLogger.info(
      {
        processedCount,
        validCount,
        invalidCount,
        riskyCount,
        unknownCount,
        resultUrl,
      },
      'Bulk verification job completed successfully'
    );
  } catch (error: any) {
    jobLogger.error({ error }, 'Bulk verification job failed');

    // Mark job as failed
    await updateBulkJobStatus(jobId, JobStatus.FAILED, {
      completedAt: new Date(),
    });

    throw error;
  }
}

/**
 * Create and start the bulk verification worker
 */
export const bulkWorker = new Worker<BulkJobData>(
  'bulk-verification',
  async (job: Job<BulkJobData>) => {
    await processBulkJob(job);
  },
  {
    connection,
    concurrency: CONCURRENCY,
    limiter: {
      max: 50, // Max 50 jobs per second per worker
      duration: 1000,
    },
  }
);

// === Event Handlers ===

bulkWorker.on('ready', () => {
  logger.info({ concurrency: CONCURRENCY }, 'Bulk verification worker ready');
});

bulkWorker.on('active', (job) => {
  logger.info({ jobId: job.id, data: job.data }, 'Bulk job active');
});

bulkWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Bulk job completed');
});

bulkWorker.on('failed', (job, error) => {
  logger.error(
    { jobId: job?.id, error },
    'Bulk job failed'
  );
});

bulkWorker.on('error', (error) => {
  logger.error({ error }, 'Bulk worker error');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down bulk worker...');
  await bulkWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down bulk worker...');
  await bulkWorker.close();
  process.exit(0);
});
