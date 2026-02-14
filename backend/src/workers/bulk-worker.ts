/**
 * Bulk Email Verification Worker
 *
 * Processes bulk verification jobs by polling the upstream /verify/file API.
 *
 * Job Processing:
 * 1. Mark job as PROCESSING
 * 2. Poll upstream GET /verify/file/{taskId} for progress
 * 3. Update our bulk_job record with upstream progress
 * 4. When upstream completes, download results
 * 5. Insert results into bulk_verification_result table
 * 6. Generate CSV and upload to S3
 *
 * Error Handling:
 * - Upstream failures are retried by BullMQ (3 attempts, exponential backoff)
 * - If upstream job fails, our job is marked as failed
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { bulkVerificationResult, verificationResult } from '../db/schema.js';
import { logger, createLogger } from '../config/logger.js';
import {
  getUpstreamFileJobStatus,
  downloadUpstreamResults,
} from '../services/upstream-client.js';
import {
  updateBulkJobStatus,
  getBulkJob,
} from '../services/bulk-verification.js';
import { generateAndUploadResults } from '../services/result-storage.js';
import { JobStatus } from '../types/bulk.js';

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

// Polling interval for upstream job status (ms)
const POLL_INTERVAL = parseInt(process.env.UPSTREAM_POLL_INTERVAL || '3000', 10);

// Max poll duration before timing out (ms) — 2 hours
const MAX_POLL_DURATION = parseInt(process.env.MAX_POLL_DURATION || '7200000', 10);

interface BulkJobData {
  jobId: string;
  userId: string;
  totalCount: number;
  upstreamJobId: string;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map upstream status string to our internal status
 */
function mapStatus(status: string): 'valid' | 'invalid' | 'risky' | 'unknown' {
  const statusMap: Record<string, 'valid' | 'invalid' | 'risky' | 'unknown'> = {
    valid: 'valid',
    invalid: 'invalid',
    risky: 'risky',
    unknown: 'unknown',
    role: 'risky',
    disposable: 'invalid',
    'catch-all': 'risky',
    'catch_all': 'risky',
    spamtrap: 'invalid',
    abuse: 'risky',
    'do_not_mail': 'invalid',
  };
  return statusMap[status] || 'unknown';
}

/**
 * Process a bulk verification job by polling upstream /verify/file
 */
async function processBulkJob(job: Job<BulkJobData>): Promise<void> {
  const { jobId, userId, totalCount, upstreamJobId } = job.data;
  const jobLogger = createLogger({
    bulkJobId: jobId,
    userId,
    totalCount,
    upstreamJobId,
  });

  jobLogger.info('Starting bulk verification job (upstream file mode)');

  if (!upstreamJobId) {
    jobLogger.error('No upstreamJobId provided, cannot process job');
    await updateBulkJobStatus(jobId, JobStatus.FAILED, {
      completedAt: new Date(),
    });
    throw new Error('Missing upstreamJobId');
  }

  try {
    // Mark job as processing
    await updateBulkJobStatus(jobId, JobStatus.PROCESSING, {
      startedAt: new Date(),
    });

    // Poll upstream for progress
    const pollStartTime = Date.now();
    let lastProgressPercentage = 0;

    while (true) {
      // Check for timeout
      if (Date.now() - pollStartTime > MAX_POLL_DURATION) {
        jobLogger.error('Upstream job polling timed out');
        await updateBulkJobStatus(jobId, JobStatus.FAILED, {
          completedAt: new Date(),
        });
        throw new Error('Upstream job timed out');
      }

      const upstreamStatus = await getUpstreamFileJobStatus(upstreamJobId);

      jobLogger.debug(
        {
          upstreamStatus: upstreamStatus.status,
          progress: upstreamStatus.progress_percent,
          processed: upstreamStatus.processed_emails,
        },
        'Upstream status poll'
      );

      // Update our job with upstream progress
      const processedCount = upstreamStatus.processed_emails || 0;
      const currentPercentage = upstreamStatus.progress_percent || 0;

      if (currentPercentage > lastProgressPercentage) {
        await updateBulkJobStatus(jobId, JobStatus.PROCESSING, {
          processedCount,
          validCount: upstreamStatus.valid_count,
          invalidCount: upstreamStatus.invalid_count,
          riskyCount: upstreamStatus.risky_count,
          unknownCount: upstreamStatus.unknown_count,
        });

        lastProgressPercentage = currentPercentage;

        // Update BullMQ job progress
        await job.updateProgress(currentPercentage);

        jobLogger.info(
          {
            processedCount,
            totalCount,
            percentage: currentPercentage,
          },
          'Progress update'
        );
      }

      // Check if upstream job is done
      if (upstreamStatus.status === 'completed') {
        jobLogger.info('Upstream job completed, downloading results');
        break;
      }

      if (upstreamStatus.status === 'failed') {
        jobLogger.error('Upstream job failed');
        await updateBulkJobStatus(jobId, JobStatus.FAILED, {
          completedAt: new Date(),
        });
        throw new Error('Upstream verification job failed');
      }

      // Wait before next poll
      await sleep(POLL_INTERVAL);
    }

    // Download results from upstream
    const results = await downloadUpstreamResults(upstreamJobId);

    jobLogger.info(
      { resultCount: results.length },
      'Downloaded upstream results, inserting into database'
    );

    // Insert results into bulk_verification_result table
    let validCount = 0;
    let invalidCount = 0;
    let riskyCount = 0;
    let unknownCount = 0;

    const BATCH_SIZE = 1000;
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);

      const bulkResultRecords = batch.map((row) => {
        const mappedStatus = mapStatus(row.status);
        switch (mappedStatus) {
          case 'valid': validCount++; break;
          case 'invalid': invalidCount++; break;
          case 'risky': riskyCount++; break;
          case 'unknown': unknownCount++; break;
        }

        return {
          id: nanoid(),
          jobId,
          email: row.email.toLowerCase(),
          status: mappedStatus,
          deliverable: row.is_deliverable,
          risky: mappedStatus === 'risky',
          unknown: mappedStatus === 'unknown',
          riskScore: row.score,
          mxRecords: row.mx_records ? { records: row.mx_records } : null,
          smtpProvider: null,
          isFreeEmail: row.is_free,
          isRoleBased: row.is_role,
          isCatchAll: row.is_catchall,
          isDisposable: row.is_disposable,
          hasMxRecords: Array.isArray(row.mx_records) && row.mx_records.length > 0,
          createdAt: new Date(),
        };
      });

      await db.insert(bulkVerificationResult).values(bulkResultRecords);

      // Dual write to verification_result for unified usage history
      const unifiedRecords = batch.map((row) => ({
        id: nanoid(),
        userId,
        email: row.email.toLowerCase(),
        status: mapStatus(row.status),
        score: row.score,
        deliverability: row.is_deliverable ? 'deliverable' : (mapStatus(row.status) === 'risky' ? 'risky' : (mapStatus(row.status) === 'unknown' ? 'unknown' : 'undeliverable')),
        attributes: {
          disposable: row.is_disposable,
          freeProvider: row.is_free,
          roleAccount: row.is_role,
          catchAll: row.is_catchall,
          mxRecordsFound: Array.isArray(row.mx_records) && row.mx_records.length > 0,
          smtpValid: row.smtp_check,
        },
        serverInfo: {
          processingTime: 0,
          requestId: `upstream-file-${upstreamJobId}`,
          timestamp: new Date().toISOString(),
          method: 'bulk',
          bulkJobId: jobId,
        },
      }));

      await db.insert(verificationResult).values(unifiedRecords);
    }

    // Generate CSV and upload to S3
    jobLogger.info('Results inserted, generating CSV for S3');
    const resultUrl = await generateAndUploadResults(jobId);

    // Mark job as completed
    await updateBulkJobStatus(jobId, JobStatus.COMPLETED, {
      processedCount: results.length,
      validCount,
      invalidCount,
      riskyCount,
      unknownCount,
      completedAt: new Date(),
      resultUrl,
    });

    jobLogger.info(
      {
        processedCount: results.length,
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

    // Mark job as failed (if not already)
    const currentJob = await getBulkJob(jobId);
    if (currentJob && currentJob.status !== JobStatus.FAILED) {
      await updateBulkJobStatus(jobId, JobStatus.FAILED, {
        completedAt: new Date(),
      });
    }

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
