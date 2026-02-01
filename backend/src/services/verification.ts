/**
 * Email Verification Service
 *
 * Business logic for email verification operations.
 * Handles both single and bulk verifications with credit management.
 */

import { db } from '../db/index.js';
import { verificationResult } from '../db/schema.js';
import { logger, createLogger } from '../config/logger.js';
import { eq, desc, and } from 'drizzle-orm';
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
  limit: number = 10
): Promise<VerificationResult[]> {
  const serviceLogger = createLogger({ userId, operation: 'getRecentVerifications' });

  try {
    const results = await db
      .select()
      .from(verificationResult)
      .where(eq(verificationResult.userId, userId))
      .orderBy(desc(verificationResult.createdAt))
      .limit(limit);

    serviceLogger.info({ count: results.length }, 'Retrieved recent verifications');

    return results;
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
    const results = await db
      .select()
      .from(verificationResult)
      .where(eq(verificationResult.userId, userId));

    const stats = {
      total: results.length,
      byStatus: {
        valid: results.filter((r: any) => r.status === 'valid').length,
        invalid: results.filter((r: any) => r.status === 'invalid').length,
        risky: results.filter((r: any) => r.status === 'risky').length,
        unknown: results.filter((r: any) => r.status === 'unknown').length,
      },
      byDeliverability: {
        deliverable: results.filter((r: any) => r.deliverability === 'deliverable').length,
        undeliverable: results.filter((r: any) => r.deliverability === 'undeliverable').length,
        risky: results.filter((r: any) => r.deliverability === 'risky').length,
        unknown: results.filter((r: any) => r.deliverability === 'unknown').length,
      },
      averageScore:
        results.length > 0
          ? results.reduce((sum: number, r: any) => sum + r.score, 0) / results.length
          : 0,
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

export default {
  getRecentVerifications,
  getVerificationById,
  getVerificationStats,
  deleteOldVerifications,
};
