import { db } from '../db/index.js';
import { bulkJob, bulkVerificationResult } from '../db/schema.js';
import { eq, and, or, sql, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { deductCredits } from './credit.js';
import { parseEmailFile } from './file-parser.js';
import { JobStatus, SourceType, type BulkUploadResponse } from '../types/bulk.js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

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
 */
export async function createBulkJob(
  params: CreateBulkJobParams
): Promise<BulkUploadResponse> {
  const { userId, filePath, filename, sourceType } = params;

  // Check for existing active job
  const existingJob = await getActiveJob(userId);
  if (existingJob) {
    throw new Error(
      'You already have an active verification job. Please wait for it to complete.'
    );
  }

  // Parse the file
  const parseResult = await parseEmailFile(filePath, filename);
  const { emails, totalCount } = parseResult;

  if (totalCount === 0) {
    throw new Error('No valid emails found in file');
  }

  const maxEmails = parseInt(process.env.MAX_EMAILS || '100000', 10);
  if (totalCount > maxEmails) {
    throw new Error(
      `File contains ${totalCount} emails, but maximum allowed is ${maxEmails}`
    );
  }

  // Deduct credits atomically
  const jobId = nanoid();
  await deductCredits(userId, totalCount, jobId);

  // Calculate expiration date (14 days from now)
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '14', 10);
  const resultExpiresAt = new Date();
  resultExpiresAt.setDate(resultExpiresAt.getDate() + retentionDays);

  // Create bulk job record
  await db.insert(bulkJob).values({
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

  // Insert all emails as verification results (pending state)
  const verificationRecords = emails.map((email) => ({
    id: nanoid(),
    jobId,
    email,
    status: 'pending',
    deliverable: false,
    risky: false,
    unknown: true,
    riskScore: 0,
    isFreeEmail: false,
    isRoleBased: false,
    isCatchAll: false,
    isDisposable: false,
    hasMxRecords: false,
    createdAt: new Date(),
  }));

  // Insert in batches of 1000
  const batchSize = 1000;
  for (let i = 0; i < verificationRecords.length; i += batchSize) {
    const batch = verificationRecords.slice(i, i + batchSize);
    await db.insert(bulkVerificationResult).values(batch);
  }

  // Enqueue the job for processing
  await bulkVerificationQueue.add(
    'process-bulk-job',
    {
      jobId,
      userId,
      totalCount,
    },
    {
      priority: 5, // Lower priority than single verifications (which use 1)
      jobId: `bulk-${jobId}`,
    }
  );

  return {
    jobId,
    totalCount,
    creditsDeducted: totalCount,
  };
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
 */
export async function deleteBulkJob(jobId: string, userId: string) {
  const result = await db
    .delete(bulkJob)
    .where(and(eq(bulkJob.id, jobId), eq(bulkJob.userId, userId)))
    .returning({ id: bulkJob.id });

  return result.length > 0;
}
