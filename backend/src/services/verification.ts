/**
 * Email Verification Service
 *
 * Business logic for email verification operations.
 * Handles both single and bulk verifications with credit management.
 */

import { db } from '../db/index.js';
import { verificationResult } from '../db/schema.js';
import { logger, createLogger } from '../config/logger.js';
import { eq, desc, and, gt, count, sql } from 'drizzle-orm';
import type { VerificationResult } from '../db/schema.js';

/**
 * Get recent verification results for a user
 *
 * @param userId - User ID
 * @param limit - Number of results to return (default: 10)
 * @returns Array of verification results, newest first
 */
export async function getRecentVerifications(
  userId: string,
  limit: number = 10,
  offset: number = 0
): Promise<{ results: VerificationResult[]; total: number }> {
  const serviceLogger = createLogger({ userId, operation: 'getRecentVerifications' });

  try {
    const [results, [{ total }]] = await Promise.all([
      db
        .select()
        .from(verificationResult)
        .where(eq(verificationResult.userId, userId))
        .orderBy(desc(verificationResult.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(verificationResult)
        .where(eq(verificationResult.userId, userId)),
    ]);

    serviceLogger.info({ count: results.length, total }, 'Retrieved recent verifications');

    return { results, total };
  } catch (error: any) {
    serviceLogger.error({ error: error.message }, 'Failed to get recent verifications');
    throw error;
  }
}

/**
 * Get a single verification result by ID
 *
 * @param resultId - Verification result ID
 * @param userId - User ID (for authorization)
 * @returns Verification result or null if not found
 */
export async function getVerificationById(
  resultId: string,
  userId: string
): Promise<VerificationResult | null> {
  const serviceLogger = createLogger({ userId, resultId, operation: 'getVerificationById' });

  try {
    const results = await db
      .select()
      .from(verificationResult)
      .where(
        and(
          eq(verificationResult.id, resultId),
          eq(verificationResult.userId, userId) // Authorization check
        )
      )
      .limit(1);

    if (results.length === 0) {
      serviceLogger.warn('Verification result not found or access denied');
      return null;
    }

    serviceLogger.info('Retrieved verification result');
    return results[0];
  } catch (error: any) {
    serviceLogger.error({ error: error.message }, 'Failed to get verification result');
    throw error;
  }
}

/**
 * Get verification statistics for a user
 *
 * @param userId - User ID
 * @returns Statistics object
 */
export async function getVerificationStats(userId: string) {
  const serviceLogger = createLogger({ userId, operation: 'getVerificationStats' });

  try {
    // Use SQL aggregation instead of loading all rows into memory
    const [statusCounts, deliverCounts, avgResult] = await Promise.all([
      db
        .select({
          status: verificationResult.status,
          count: sql<number>`count(*)::int`,
        })
        .from(verificationResult)
        .where(eq(verificationResult.userId, userId))
        .groupBy(verificationResult.status),
      db
        .select({
          deliverability: verificationResult.deliverability,
          count: sql<number>`count(*)::int`,
        })
        .from(verificationResult)
        .where(eq(verificationResult.userId, userId))
        .groupBy(verificationResult.deliverability),
      db
        .select({
          avgScore: sql<number>`coalesce(avg(${verificationResult.score}), 0)`,
          total: sql<number>`count(*)::int`,
        })
        .from(verificationResult)
        .where(eq(verificationResult.userId, userId)),
    ]);

    const statusMap = Object.fromEntries(statusCounts.map((r) => [r.status, r.count]));
    const deliverMap = Object.fromEntries(deliverCounts.map((r) => [r.deliverability, r.count]));

    const stats = {
      total: avgResult[0]?.total ?? 0,
      byStatus: {
        valid: statusMap['valid'] ?? 0,
        invalid: statusMap['invalid'] ?? 0,
        risky: statusMap['risky'] ?? 0,
        unknown: statusMap['unknown'] ?? 0,
      },
      byDeliverability: {
        deliverable: deliverMap['deliverable'] ?? 0,
        undeliverable: deliverMap['undeliverable'] ?? 0,
        risky: deliverMap['risky'] ?? 0,
        unknown: deliverMap['unknown'] ?? 0,
      },
      averageScore: avgResult[0]?.avgScore ?? 0,
    };

    serviceLogger.info({ stats }, 'Retrieved verification stats');

    return stats;
  } catch (error: any) {
    serviceLogger.error({ error: error.message }, 'Failed to get verification stats');
    throw error;
  }
}

/**
 * Delete old verification results based on user's data retention policy
 *
 * @param userId - User ID
 * @param retentionDays - Number of days to retain data
 * @returns Number of deleted results
 */
export async function deleteOldVerifications(
  userId: string,
  retentionDays: number
): Promise<number> {
  const serviceLogger = createLogger({ userId, retentionDays, operation: 'deleteOldVerifications' });

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Note: Drizzle doesn't return affected count for DELETE yet
    // This is a placeholder implementation
    const oldResults = await db
      .select()
      .from(verificationResult)
      .where(
        and(
          eq(verificationResult.userId, userId)
          // TODO: Add date filter once Drizzle supports lt() for timestamps
        )
      );

    // TODO: Implement actual deletion
    // await db.delete(verificationResult).where(...)

    serviceLogger.info({ count: 0 }, 'Deleted old verification results');

    return 0;
  } catch (error: any) {
    serviceLogger.error({ error: error.message }, 'Failed to delete old verifications');
    throw error;
  }
}

/**
 * Get a verification result for a specific email created after a given timestamp
 */
export async function getVerificationByEmailSince(
  userId: string,
  email: string,
  since: Date
): Promise<VerificationResult | null> {
  const results = await db
    .select()
    .from(verificationResult)
    .where(
      and(
        eq(verificationResult.userId, userId),
        eq(verificationResult.email, email.toLowerCase()),
        gt(verificationResult.createdAt, since)
      )
    )
    .orderBy(desc(verificationResult.createdAt))
    .limit(1);

  return results[0] || null;
}

export default {
  getRecentVerifications,
  getVerificationById,
  getVerificationStats,
  deleteOldVerifications,
  getVerificationByEmailSince,
};
