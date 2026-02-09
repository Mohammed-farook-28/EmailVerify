/**
 * Email Verification Worker
 *
 * Processes verification jobs from BullMQ queue.
 * Concurrency: 50 jobs per worker instance
 *
 * Job Processing:
 * 1. Check circuit breaker state (skip if OPEN)
 * 2. Call upstream API via circuit breaker
 * 3. Store result in PostgreSQL
 * 4. Return result for job completion
 *
 * Error Handling:
 * - Retryable: Network errors, timeouts, 5xx responses
 * - Non-retryable: Invalid email format, circuit breaker open
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { verificationResult } from '../db/schema.js';
import { redis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';
import { verifyWithCircuitBreaker, isCircuitOpen } from '../services/circuit-breaker.js';
import { jobProcessingDuration, verificationCounter, verificationDuration, verificationErrorRate } from '../lib/metrics.js';
import type { VerificationJobData } from '../services/queue.js';
import type { VerificationResult as UpstreamResult } from '../services/upstream-client.js';

// Create Redis connection for worker
const connection = new IORedis.default({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Worker concurrency (number of jobs processed in parallel)
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '50', 10);

/**
 * Process a verification job
 */
async function processVerificationJob(job: Job<VerificationJobData>): Promise<UpstreamResult> {
  const { email, userId, jobType, bulkJobId } = job.data;
  const jobLogger = createLogger({
    jobId: job.id,
    email,
    userId,
    jobType,
    bulkJobId,
  });

  const startTime = Date.now();

  try {
    jobLogger.info('Processing verification job');

    // Check circuit breaker state
    const circuitOpen = await isCircuitOpen();
    if (circuitOpen) {
      jobLogger.warn('Circuit breaker is OPEN, skipping job');
      verificationErrorRate.inc({ error_type: 'circuit_breaker_open' });
      throw new Error('Circuit breaker is open - service temporarily unavailable');
    }

    // Update job progress
    await job.updateProgress(25);

    // Verify email via circuit breaker
    const result = await verifyWithCircuitBreaker(email, userId);

    await job.updateProgress(75);

    // Store result in PostgreSQL
    const resultId = nanoid();
    const method = jobType === 'bulk' ? 'bulk' : 'web';
    const storedResult = {
      id: resultId,
      userId,
      email: email.toLowerCase(),
      status: result.status,
      score: result.score,
      deliverability: result.deliverability,
      attributes: result.attributes,
      serverInfo: { ...result.serverInfo, method },
    };
    await db.insert(verificationResult).values(storedResult);

    // Publish result via Redis pub/sub for SSE listeners
    await redis.publish(
      `verify:result:${userId}`,
      JSON.stringify({ email: email.toLowerCase(), result: storedResult })
    ).catch((err) => {
      jobLogger.warn({ err }, 'Failed to publish result to Redis pub/sub');
    });

    await job.updateProgress(100);

    const duration = (Date.now() - startTime) / 1000;

    // Update metrics
    jobProcessingDuration.observe({ status: 'completed' }, duration);
    verificationCounter.inc({ status: result.status, deliverability: result.deliverability });
    verificationDuration.observe(duration);

    jobLogger.info(
      {
        resultId,
        status: result.status,
        score: result.score,
        deliverability: result.deliverability,
        duration,
      },
      'Verification job completed'
    );

    return result;
  } catch (error: any) {
    const duration = (Date.now() - startTime) / 1000;

    jobProcessingDuration.observe({ status: 'failed' }, duration);

    // Classify error type
    if (error.message?.includes('Circuit breaker')) {
      verificationErrorRate.inc({ error_type: 'circuit_breaker_open' });
    } else if (error.message?.includes('timeout')) {
      verificationErrorRate.inc({ error_type: 'network' });
    } else if (error.message?.includes('Upstream API')) {
      verificationErrorRate.inc({ error_type: 'upstream_error' });
    } else {
      verificationErrorRate.inc({ error_type: 'validation' });
    }

    jobLogger.error(
      {
        error: error.message,
        stack: error.stack,
        duration,
      },
      'Verification job failed'
    );

    throw error; // Re-throw for BullMQ retry logic
  }
}

// Create worker
export const worker = new Worker<VerificationJobData, UpstreamResult>(
  'email-verification',
  processVerificationJob,
  {
    connection,
    concurrency: CONCURRENCY,
    limiter: {
      // Global rate limit: 1000 jobs per second
      max: 1000,
      duration: 1000,
    },
  }
);

// Worker event handlers
worker.on('ready', () => {
  logger.info({ concurrency: CONCURRENCY }, 'Verification worker ready');
});

worker.on('active', (job) => {
  logger.debug({ jobId: job.id, email: job.data.email }, 'Job active');
});

worker.on('completed', (job, result) => {
  logger.info(
    {
      jobId: job.id,
      email: job.data.email,
      status: result.status,
      score: result.score,
    },
    'Job completed'
  );
});

worker.on('failed', (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      email: job?.data.email,
      error: error.message,
      attemptsMade: job?.attemptsMade,
      attemptsLeft: job ? job.opts.attempts! - job.attemptsMade : 0,
    },
    'Job failed'
  );
});

worker.on('error', (error) => {
  logger.error({ error: error.message }, 'Worker error');
});

worker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'Job stalled (worker may have crashed)');
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down worker...');
  await worker.close();
  await connection.quit();
  logger.info('Worker shut down successfully');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Export worker for testing
export default worker;

// If running as main module, keep process alive
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Starting verification worker as standalone process');
  logger.info(`Worker concurrency: ${CONCURRENCY}`);
  logger.info('Press Ctrl+C to stop');
}
