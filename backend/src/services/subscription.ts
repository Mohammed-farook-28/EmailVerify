/**
 * Subscription Service
 *
 * Handles subscription-related operations including:
 * - Subscription downgrades (cancel bulk jobs, refund credits)
 * - Subscription cancellations
 * - Tier lookups
 */

import { db } from '../db/index.js';
import { subscription, bulkJob, bulkVerificationResult } from '../db/schema.js';
import { eq, and, or } from 'drizzle-orm';
import { logger as pinoLogger } from '../config/logger.js';
import { refundCredits, getBalance } from './credit.js';

const logger = pinoLogger.child({ module: 'subscription-service' });

/**
 * Plan tier hierarchy (lower index = lower tier)
 */
const TIER_ORDER = ['starter', 'growth', 'pro', 'scale', 'titan'];

/**
 * Plan ID to tier mapping
 */
const PLAN_TO_TIER: Record<string, string> = {
  'starter-monthly': 'starter',
  'starter-annual': 'starter',
  'growth-monthly': 'growth',
  'growth-annual': 'growth',
  'pro-monthly': 'pro',
  'pro-annual': 'pro',
  'scale-monthly': 'scale',
  'scale-annual': 'scale',
  'titan-monthly': 'titan',
  'titan-annual': 'titan',
};

/**
 * Tier-based bulk job limits
 */
const TIER_BULK_LIMITS: Record<string, { maxEmails: number; maxConcurrentJobs: number }> = {
  starter: { maxEmails: 10000, maxConcurrentJobs: 1 },
  growth: { maxEmails: 25000, maxConcurrentJobs: 2 },
  pro: { maxEmails: 50000, maxConcurrentJobs: 3 },
  scale: { maxEmails: 100000, maxConcurrentJobs: 5 },
  titan: { maxEmails: 500000, maxConcurrentJobs: 10 },
};

export interface DowngradeResult {
  cancelledJobs: string[];
  refundedCredits: number;
  newTier: string;
}

/**
 * Check if this is a downgrade (new tier is lower than old tier)
 */
export function isDowngrade(oldPlanId: string, newPlanId: string): boolean {
  const oldTier = PLAN_TO_TIER[oldPlanId] || 'starter';
  const newTier = PLAN_TO_TIER[newPlanId] || 'starter';

  const oldIndex = TIER_ORDER.indexOf(oldTier);
  const newIndex = TIER_ORDER.indexOf(newTier);

  return newIndex < oldIndex;
}

/**
 * Get tier from plan ID
 */
export function getTierFromPlan(planId: string): string {
  return PLAN_TO_TIER[planId] || 'starter';
}

/**
 * Get tier limits
 */
export function getTierLimits(tier: string) {
  return TIER_BULK_LIMITS[tier] || TIER_BULK_LIMITS.starter;
}

/**
 * Get user's current subscription tier
 */
export async function getUserTier(userId: string): Promise<string> {
  const sub = await db.query.subscription.findFirst({
    where: and(
      eq(subscription.userId, userId),
      eq(subscription.status, 'active')
    ),
    columns: { planId: true },
  });

  if (!sub) {
    return 'starter'; // Default tier for users without subscription
  }

  return getTierFromPlan(sub.planId);
}

/**
 * Handle subscription downgrade
 *
 * When a user downgrades their subscription:
 * 1. Check for pending/processing bulk jobs that exceed new tier limits
 * 2. Cancel those jobs
 * 3. Refund credits for unprocessed emails
 * 4. Update subscription
 */
export async function handleSubscriptionDowngrade(
  userId: string,
  oldPlanId: string,
  newPlanId: string
): Promise<DowngradeResult> {
  const newTier = getTierFromPlan(newPlanId);
  const newLimits = getTierLimits(newTier);

  logger.info(
    { userId, oldPlanId, newPlanId, newTier, newLimits },
    'Processing subscription downgrade'
  );

  const result: DowngradeResult = {
    cancelledJobs: [],
    refundedCredits: 0,
    newTier,
  };

  // Find active bulk jobs
  const activeJobs = await db
    .select()
    .from(bulkJob)
    .where(
      and(
        eq(bulkJob.userId, userId),
        or(
          eq(bulkJob.status, 'pending'),
          eq(bulkJob.status, 'processing')
        )
      )
    );

  logger.info({ userId, activeJobCount: activeJobs.length }, 'Found active bulk jobs');

  // Check which jobs need to be cancelled
  for (const job of activeJobs) {
    // Cancel if:
    // 1. Job size exceeds new tier limit
    // 2. Number of concurrent jobs exceeds new tier limit
    const shouldCancel = job.totalCount > newLimits.maxEmails;

    if (shouldCancel) {
      logger.info(
        { jobId: job.id, totalCount: job.totalCount, maxEmails: newLimits.maxEmails },
        'Cancelling bulk job due to downgrade'
      );

      // Calculate unprocessed emails for refund
      const unprocessedCount = job.totalCount - job.processedCount;

      if (unprocessedCount > 0) {
        try {
          // Refund credits for unprocessed emails
          await refundCredits(
            userId,
            unprocessedCount,
            `downgrade_refund_${job.id}`
          );
          result.refundedCredits += unprocessedCount;

          logger.info(
            { jobId: job.id, refunded: unprocessedCount },
            'Refunded credits for cancelled job'
          );
        } catch (err) {
          logger.error(
            { err, jobId: job.id, unprocessedCount },
            'Failed to refund credits for cancelled job'
          );
        }
      }

      // Mark job as failed
      await db
        .update(bulkJob)
        .set({
          status: 'failed',
          completedAt: new Date(),
        })
        .where(eq(bulkJob.id, job.id));

      result.cancelledJobs.push(job.id);
    }
  }

  // If we still have too many concurrent jobs (even if they don't exceed size limit),
  // we need to cancel the newest ones
  const remainingActiveJobs = await db
    .select()
    .from(bulkJob)
    .where(
      and(
        eq(bulkJob.userId, userId),
        or(
          eq(bulkJob.status, 'pending'),
          eq(bulkJob.status, 'processing')
        )
      )
    );

  if (remainingActiveJobs.length > newLimits.maxConcurrentJobs) {
    // Sort by creation date (oldest first), cancel excess
    const sorted = remainingActiveJobs.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const jobsToCancel = sorted.slice(newLimits.maxConcurrentJobs);

    for (const job of jobsToCancel) {
      if (!result.cancelledJobs.includes(job.id)) {
        logger.info(
          { jobId: job.id, reason: 'concurrent_limit_exceeded' },
          'Cancelling bulk job due to concurrent limit'
        );

        const unprocessedCount = job.totalCount - job.processedCount;

        if (unprocessedCount > 0) {
          try {
            await refundCredits(
              userId,
              unprocessedCount,
              `downgrade_refund_${job.id}`
            );
            result.refundedCredits += unprocessedCount;
          } catch (err) {
            logger.error(
              { err, jobId: job.id, unprocessedCount },
              'Failed to refund credits'
            );
          }
        }

        await db
          .update(bulkJob)
          .set({
            status: 'failed',
            completedAt: new Date(),
          })
          .where(eq(bulkJob.id, job.id));

        result.cancelledJobs.push(job.id);
      }
    }
  }

  logger.info(result, 'Subscription downgrade processed');

  return result;
}

/**
 * Handle subscription cancellation
 *
 * When a user cancels their subscription:
 * 1. Mark all pending bulk jobs as failed
 * 2. Refund credits for unprocessed emails
 */
export async function handleSubscriptionCancellation(userId: string): Promise<DowngradeResult> {
  logger.info({ userId }, 'Processing subscription cancellation');

  const result: DowngradeResult = {
    cancelledJobs: [],
    refundedCredits: 0,
    newTier: 'starter',
  };

  // Find all active bulk jobs
  const activeJobs = await db
    .select()
    .from(bulkJob)
    .where(
      and(
        eq(bulkJob.userId, userId),
        or(
          eq(bulkJob.status, 'pending'),
          eq(bulkJob.status, 'processing')
        )
      )
    );

  // Since cancelled users can only have starter-tier limits,
  // check if any jobs exceed those limits
  const starterLimits = TIER_BULK_LIMITS.starter;

  for (const job of activeJobs) {
    // Cancel if exceeds starter tier limits
    if (job.totalCount > starterLimits.maxEmails) {
      const unprocessedCount = job.totalCount - job.processedCount;

      if (unprocessedCount > 0) {
        try {
          await refundCredits(
            userId,
            unprocessedCount,
            `cancellation_refund_${job.id}`
          );
          result.refundedCredits += unprocessedCount;
        } catch (err) {
          logger.error({ err, jobId: job.id }, 'Failed to refund credits');
        }
      }

      await db
        .update(bulkJob)
        .set({
          status: 'failed',
          completedAt: new Date(),
        })
        .where(eq(bulkJob.id, job.id));

      result.cancelledJobs.push(job.id);
    }
  }

  logger.info(result, 'Subscription cancellation processed');

  return result;
}

export default {
  isDowngrade,
  getTierFromPlan,
  getTierLimits,
  getUserTier,
  handleSubscriptionDowngrade,
  handleSubscriptionCancellation,
};
