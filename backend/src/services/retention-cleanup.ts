/**
 * Data Retention Cleanup Service
 *
 * Deletes old verification results based on user's dataRetentionDays setting.
 * Runs daily at 2 AM UTC.
 *
 * Flow:
 * 1. Get all users with their retention policies
 * 2. For each user, delete verification results older than their policy
 * 3. Process in batches to avoid locks
 * 4. Log and emit metrics
 */

import { db } from '../db/index.js';
import { verificationResult, user } from '../db/schema.js';
import { eq, and, lt, sql, inArray } from 'drizzle-orm';
import { logger, createLogger } from '../config/logger.js';

/**
 * Cleanup result for a single user
 */
export interface CleanupResult {
  userId: string;
  retentionDays: number;
  deletedCount: number;
}

/**
 * Summary of cleanup run
 */
export interface CleanupSummary {
  totalUsers: number;
  usersProcessed: number;
  totalDeleted: number;
  errors: number;
  duration: number; // milliseconds
}

/**
 * Default retention policy (30 days)
 */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Batch size for deletion (avoid locks)
 */
const BATCH_SIZE = 1000;

/**
 * Get user's retention policy
 *
 * @param userId - User ID
 * @returns Retention days
 */
export async function getRetentionPolicy(userId: string): Promise<number> {
  const userRecord = await db
    .select({ dataRetentionDays: user.dataRetentionDays })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
    .execute();

  return userRecord[0]?.dataRetentionDays ?? DEFAULT_RETENTION_DAYS;
}

/**
 * Clean up old verification results for a user
 *
 * @param userId - User ID
 * @returns Cleanup result
 */
export async function cleanupForUser(userId: string): Promise<CleanupResult> {
  const serviceLogger = createLogger({
    userId,
    operation: 'cleanup-user',
  });

  try {
    // Get retention policy
    const retentionDays = await getRetentionPolicy(userId);

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    serviceLogger.info(
      {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
      },
      'Starting cleanup for user'
    );

    let totalDeleted = 0;

    // Delete in batches to avoid locks
    while (true) {
      // SELECT records to delete (with LIMIT for proper batching)
      const toDelete = await db
        .select({ id: verificationResult.id })
        .from(verificationResult)
        .where(
          and(
            eq(verificationResult.userId, userId),
            lt(verificationResult.createdAt, cutoffDate)
          )
        )
        .limit(BATCH_SIZE)
        .execute();

      // If nothing to delete, we're done
      if (toDelete.length === 0) {
        break;
      }

      // Delete the batch by IDs
      const ids = toDelete.map((r) => r.id);
      await db
        .delete(verificationResult)
        .where(inArray(verificationResult.id, ids))
        .execute();

      totalDeleted += toDelete.length;

      serviceLogger.debug(
        {
          batchDeleted: toDelete.length,
          totalDeleted,
        },
        'Batch deleted'
      );

      // If batch was smaller than BATCH_SIZE, we're done
      if (toDelete.length < BATCH_SIZE) {
        break;
      }

      // Small delay to avoid overwhelming the database
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    serviceLogger.info(
      {
        deletedCount: totalDeleted,
        retentionDays,
      },
      'Cleanup completed for user'
    );

    return {
      userId,
      retentionDays,
      deletedCount: totalDeleted,
    };
  } catch (error: any) {
    serviceLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Cleanup failed for user'
    );
    throw error;
  }
}

/**
 * Clean up old verification results for all users
 *
 * @returns Cleanup summary
 */
export async function cleanupAll(): Promise<CleanupSummary> {
  const serviceLogger = createLogger({
    operation: 'cleanup-all',
  });

  const startTime = Date.now();

  serviceLogger.info('Starting data retention cleanup for all users');

  const summary: CleanupSummary = {
    totalUsers: 0,
    usersProcessed: 0,
    totalDeleted: 0,
    errors: 0,
    duration: 0,
  };

  try {
    // Get all users with verification results
    const usersWithResults = await db
      .selectDistinct({ userId: verificationResult.userId })
      .from(verificationResult)
      .execute();

    summary.totalUsers = usersWithResults.length;

    serviceLogger.info({ totalUsers: summary.totalUsers }, 'Users to process');

    // Process users sequentially (to avoid overwhelming DB)
    for (const userRecord of usersWithResults) {
      try {
        const result = await cleanupForUser(userRecord.userId);
        summary.usersProcessed++;
        summary.totalDeleted += result.deletedCount;
      } catch (error: any) {
        summary.errors++;
        serviceLogger.error(
          {
            userId: userRecord.userId,
            error: error.message,
          },
          'Failed to cleanup user'
        );
      }
    }

    summary.duration = Date.now() - startTime;

    serviceLogger.info(
      {
        summary,
      },
      'Data retention cleanup completed'
    );

    return summary;
  } catch (error: any) {
    serviceLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Cleanup failed'
    );
    throw error;
  }
}
