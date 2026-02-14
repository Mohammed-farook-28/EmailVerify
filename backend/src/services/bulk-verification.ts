import { db } from '../db/index.js';
import { bulkJob, bulkVerificationResult, creditEvent } from '../db/schema.js';
import { eq, and, or, sql, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { deductCredits } from './credit.js';
import { parseEmailFile } from './file-parser.js';
import { uploadFileToUpstream } from './upstream-client.js';
import { JobStatus, SourceType, type BulkUploadResponse } from '../types/bulk.js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Create Redis connection for BullMQ
const connection = new IORedis.default({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Create bulk verification queue
export const bulkVerificationQueue = new Queue('bulk-verification', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: { count: 100 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

interface CreateBulkJobParams {
  userId: string;
  filePath: string;
  filename: string;
  sourceType: SourceType;
}

/**
 * Check if user has an active bulk job
 */
export async function getActiveJob(userId: string) {
  const activeJobs = await db
    .select()
    .from(bulkJob)
    .where(
      and(
        eq(bulkJob.userId, userId),
        or(
          eq(bulkJob.status, JobStatus.PENDING),
          eq(bulkJob.status, JobStatus.PROCESSING)
        )
      )
    )
    .limit(1);

  return activeJobs[0] || null;
}

/**
 * Create a new bulk verification job
 *
 * Flow:
 * 1. Parse file locally for validation and email count
 * 2. Deduct credits in a DB transaction
 * 3. Create bulk_job record
 * 4. Upload file to upstream /verify/file API
 * 5. Store upstream task_id in bulk_job
 * 6. Enqueue worker job to poll for progress
 *
 * Uses a Redis lock to prevent concurrent bulk job creation for the same user.
 */
export async function createBulkJob(
  params: CreateBulkJobParams
): Promise<BulkUploadResponse> {
  const { userId, filePath, filename, sourceType } = params;

  // Acquire Redis lock to prevent concurrent bulk job creation
  const lockKey = `bulkjob:lock:${userId}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
  if (!lockAcquired) {
    throw new Error('A bulk job is already being created. Please try again shortly.');
  }

  try {
    // Check for existing active job
    const existingJob = await getActiveJob(userId);
    if (existingJob) {
      throw new Error(
        'You already have an active verification job. Please wait for it to complete.'
      );
    }

    // Parse the file locally for validation and count
    const parseResult = await parseEmailFile(filePath, filename);
    const { totalCount } = parseResult;

    if (totalCount === 0) {
      throw new Error('No valid emails found in file');
    }

    const maxEmails = parseInt(process.env.MAX_EMAILS || '100000', 10);
    if (totalCount > maxEmails) {
      throw new Error(
        `File contains ${totalCount} emails, but maximum allowed is ${maxEmails}`
      );
    }

    const jobId = nanoid();

    // Calculate expiration date (14 days from now)
    const retentionDays = parseInt(process.env.RETENTION_DAYS || '14', 10);
    const resultExpiresAt = new Date();
    resultExpiresAt.setDate(resultExpiresAt.getDate() + retentionDays);

    // Wrap credit deduction + job creation in a transaction
    await db.transaction(async (tx) => {
      // Deduct credits within the transaction
      const latestEvent = await tx
        .select()
        .from(creditEvent)
        .where(eq(creditEvent.userId, userId))
        .orderBy(desc(creditEvent.createdAt))
        .limit(1)
        .for('update');

      const currentBalance = latestEvent[0]?.balanceAfter ?? 0;
      if (currentBalance < totalCount) {
        throw new Error('Insufficient credits');
      }

      const newBalance = currentBalance - totalCount;
      const { nanoid: generateId } = await import('nanoid');

      await tx.insert(creditEvent).values({
        id: generateId(),
        userId,
        type: 'verification_used',
        amount: -totalCount,
        balanceAfter: newBalance,
        referenceType: 'verification_job',
        referenceId: jobId,
        createdAt: new Date(),
      });

      // Create bulk job record (no individual email rows — upstream handles processing)
      await tx.insert(bulkJob).values({
        id: jobId,
        userId,
        sourceType,
        filename,
        totalCount,
        processedCount: 0,
        status: JobStatus.PENDING,
        validCount: 0,
        invalidCount: 0,
        riskyCount: 0,
        unknownCount: 0,
        createdAt: new Date(),
        resultExpiresAt,
      });

      // Update Redis cache with new balance
      await redis.set(`credit:balance:${userId}`, newBalance.toString());
    });

    // Upload file to upstream /verify/file API
    let upstreamJobId: string;
    try {
      const uploadResult = await uploadFileToUpstream(filePath, filename);
      upstreamJobId = uploadResult.task_id;

      // Store upstream task_id in our job record
      await db
        .update(bulkJob)
        .set({ upstreamJobId })
        .where(eq(bulkJob.id, jobId));

      logger.info(
        { jobId, upstreamJobId, totalCount },
        'File uploaded to upstream, job created'
      );
    } catch (uploadError: any) {
      // Upload failed — mark job as failed
      logger.error(
        { jobId, error: uploadError.message },
        'Failed to upload file to upstream, marking job as failed'
      );
      await updateBulkJobStatus(jobId, JobStatus.FAILED, {
        completedAt: new Date(),
      });
      throw new Error(`Failed to upload file for verification: ${uploadError.message}`);
    }

    // Enqueue the worker job to poll upstream for progress
    await bulkVerificationQueue.add(
      'process-bulk-job',
      {
        jobId,
        userId,
        totalCount,
        upstreamJobId,
      },
      {
        priority: 5,
        jobId: `bulk-${jobId}`,
      }
    );

    return {
      jobId,
      totalCount,
      creditsDeducted: totalCount,
    };
  } finally {
    // Always release the lock
    await redis.del(lockKey);
  }
}

/**
 * Get all bulk jobs for a user, ordered by most recent first
 */
export async function getUserBulkJobs(userId: string, limit = 50, offset = 0) {
  const jobs = await db
    .select()
    .from(bulkJob)
    .where(eq(bulkJob.userId, userId))
    .orderBy(sql`${bulkJob.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  return jobs;
}

/**
 * Get bulk job by ID
 */
export async function getBulkJob(jobId: string) {
  const jobs = await db
    .select()
    .from(bulkJob)
    .where(eq(bulkJob.id, jobId))
    .limit(1);

  return jobs[0] || null;
}

/**
 * Update bulk job status
 */
export async function updateBulkJobStatus(
  jobId: string,
  status: JobStatus,
  updates: Partial<{
    processedCount: number;
    validCount: number;
    invalidCount: number;
    riskyCount: number;
    unknownCount: number;
    startedAt: Date;
    completedAt: Date;
    resultUrl: string;
  }>
) {
  const updateData: any = { status };

  if (updates.processedCount !== undefined) {
    updateData.processedCount = updates.processedCount;
  }
  if (updates.validCount !== undefined) {
    updateData.validCount = updates.validCount;
  }
  if (updates.invalidCount !== undefined) {
    updateData.invalidCount = updates.invalidCount;
  }
  if (updates.riskyCount !== undefined) {
    updateData.riskyCount = updates.riskyCount;
  }
  if (updates.unknownCount !== undefined) {
    updateData.unknownCount = updates.unknownCount;
  }
  if (updates.startedAt) {
    updateData.startedAt = updates.startedAt;
  }
  if (updates.completedAt) {
    updateData.completedAt = updates.completedAt;
  }
  if (updates.resultUrl) {
    updateData.resultUrl = updates.resultUrl;
  }

  await db.update(bulkJob).set(updateData).where(eq(bulkJob.id, jobId));
}

/**
 * Get paginated email results for a bulk job
 */
export async function getBulkJobEmails(
  jobId: string,
  params: { status?: string; limit?: number; offset?: number }
) {
  const { status = 'all', limit = 50, offset = 0 } = params;

  const conditions = [eq(bulkVerificationResult.jobId, jobId)];
  if (status !== 'all') {
    conditions.push(eq(bulkVerificationResult.status, status));
  }

  const [emails, countResult] = await Promise.all([
    db
      .select()
      .from(bulkVerificationResult)
      .where(and(...conditions))
      .orderBy(desc(bulkVerificationResult.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bulkVerificationResult)
      .where(and(...conditions))
      .execute(),
  ]);

  const total = countResult[0]?.count || 0;

  return {
    emails,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Rename a bulk job
 */
export async function renameBulkJob(jobId: string, userId: string, filename: string) {
  const result = await db
    .update(bulkJob)
    .set({ filename })
    .where(and(eq(bulkJob.id, jobId), eq(bulkJob.userId, userId)))
    .returning();

  return result[0] || null;
}

/**
 * Delete a bulk job (cascades to bulk_verification_result)
 * Rejects deletion of jobs that are still PENDING or PROCESSING.
 */
export async function deleteBulkJob(jobId: string, userId: string) {
  // Check job status before deleting
  const job = await getBulkJob(jobId);
  if (!job) {
    return false;
  }
  if (job.userId !== userId) {
    return false;
  }
  if (job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING) {
    throw new Error(
      `Cannot delete a job that is ${job.status.toLowerCase()}. Wait for it to complete or fail.`
    );
  }

  const result = await db
    .delete(bulkJob)
    .where(and(eq(bulkJob.id, jobId), eq(bulkJob.userId, userId)))
    .returning({ id: bulkJob.id });

  return result.length > 0;
}
