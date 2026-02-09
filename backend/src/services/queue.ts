/**
 * BullMQ Queue Service
 *
 * Priority-based job queue for email verification.
 * Uses BullMQ Free (not Pro), so we use priority instead of tenant groups.
 *
 * Priority levels:
 * - 1 (highest): Single email verification
 * - 5 (normal): Bulk verification batches
 *
 * Job options:
 * - removeOnComplete: true (keep queue lean)
 * - attempts: 3 (retry failed jobs)
 * - backoff: exponential with jitter
 */

import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../config/logger.js';
import { queueDepthGauge } from '../lib/metrics.js';

// Create Redis connection for BullMQ
const connection = new IORedis.default({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false, // Required for BullMQ
});

export interface VerificationJobData {
  email: string;
  userId: string;
  jobType: 'single' | 'bulk';
  bulkJobId?: string; // For bulk verification, link to parent job
}

// Create verification queue
export const verificationQueue = new Queue<VerificationJobData>('email-verification', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true, // Keep queue lean
    removeOnFail: { count: 100 }, // Keep last 100 failed jobs
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2s delay
    },
  },
  // Note: stalledInterval is a Worker option, not a Queue option
});

// Create DLQ queue for permanently failed jobs
export const dlqQueue = new Queue<VerificationJobData>('email-verification-dlq', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 }, // Keep last 100 completed DLQ jobs
    removeOnFail: { count: 100 }, // Keep last 100 failed DLQ jobs
    attempts: 1, // Don't retry DLQ jobs
  },
});

// Create queue events for monitoring
export const queueEvents = new QueueEvents('email-verification', {
  connection: connection.duplicate(),
});

// === Event Handlers ===

queueEvents.on('waiting', ({ jobId }) => {
  logger.debug({ jobId }, 'Job waiting in queue');
});

queueEvents.on('active', ({ jobId }) => {
  logger.debug({ jobId }, 'Job active');
});

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info({ jobId, returnvalue }, 'Job completed successfully');
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, 'Job failed');
});

queueEvents.on('progress', ({ jobId, data }) => {
  logger.debug({ jobId, progress: data }, 'Job progress');
});

// === Metrics Collection ===

// Update queue depth metrics every 5 seconds
setInterval(async () => {
  try {
    const [waiting, active, delayed, failed] = await Promise.all([
      verificationQueue.getWaitingCount(),
      verificationQueue.getActiveCount(),
      verificationQueue.getDelayedCount(),
      verificationQueue.getFailedCount(),
    ]);

    queueDepthGauge.set({ status: 'waiting' }, waiting);
    queueDepthGauge.set({ status: 'active' }, active);
    queueDepthGauge.set({ status: 'delayed' }, delayed);
    queueDepthGauge.set({ status: 'failed' }, failed);
  } catch (error) {
    logger.warn({ error }, 'Failed to update queue depth metrics');
  }
}, 5000);

// === Queue Operations ===

/**
 * Add a single email verification job to the queue
 *
 * @param email - Email to verify
 * @param userId - User ID
 * @returns Job ID
 */
export async function enqueueSingleVerification(
  email: string,
  userId: string
): Promise<string> {
  const job = await verificationQueue.add(
    'verify-single' as any,
    {
      email,
      userId,
      jobType: 'single',
    },
    {
      priority: 1, // Highest priority
      jobId: `single-${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }
  );

  logger.info(
    {
      jobId: job.id,
      email,
      userId,
      priority: 1,
    },
    'Enqueued single verification job'
  );

  return job.id!;
}

/**
 * Add a bulk email verification job to the queue
 *
 * @param emails - Array of emails to verify
 * @param userId - User ID
 * @param bulkJobId - Parent bulk job ID
 * @returns Array of job IDs
 */
export async function enqueueBulkVerification(
  emails: string[],
  userId: string,
  bulkJobId: string
): Promise<string[]> {
  const bulkJobs = emails.map((email, index) => ({
    name: 'verify-bulk' as any,
    data: {
      email,
      userId,
      jobType: 'bulk' as const,
      bulkJobId,
    },
    opts: {
      priority: 5,
      jobId: `bulk-${bulkJobId}-${index}`,
    },
  }));

  const jobs = await verificationQueue.addBulk(bulkJobs);

  logger.info(
    {
      bulkJobId,
      userId,
      count: emails.length,
      priority: 5,
    },
    'Enqueued bulk verification jobs'
  );

  return jobs.map((job) => job.id!);
}

/**
 * Get current queue stats
 */
export async function getQueueStats() {
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    verificationQueue.getWaitingCount(),
    verificationQueue.getActiveCount(),
    verificationQueue.getDelayedCount(),
    verificationQueue.getFailedCount(),
    verificationQueue.getCompletedCount(),
  ]);

  return {
    waiting,
    active,
    delayed,
    failed,
    completed,
    total: waiting + active + delayed,
  };
}

/**
 * Check if queue is overloaded (for load shedding)
 *
 * Thresholds:
 * - 500K bulk jobs
 * - 1M total jobs
 */
export async function isQueueOverloaded(): Promise<boolean> {
  const stats = await getQueueStats();

  // Simple heuristic: total jobs > 1M
  // In production, we'd track bulk vs single separately
  return stats.total > 1_000_000;
}

/**
 * Gracefully close queue connections
 */
export async function closeQueue() {
  await verificationQueue.close();
  await queueEvents.close();
  await connection.quit();
  logger.info('Queue connections closed');
}

export default verificationQueue;
