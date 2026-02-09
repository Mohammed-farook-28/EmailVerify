/**
 * Subscription Renewal Worker
 *
 * Cron job that runs daily to process subscription renewals:
 * 1. Check for subscriptions that have renewed (currentPeriodEnd passed)
 * 2. Allocate new credits for the new period
 * 3. Expire old credits from the previous period
 *
 * Should run once per day, typically at midnight UTC.
 */

import { db } from '../db/index.js';
import { subscription as subscriptionTable } from '../db/schema.js';
import { lte, eq, and } from 'drizzle-orm';
import { logger } from '../config/logger.js';
import { stripeClient } from '../services/stripe-client.js';
import {
  addSubscriptionCredits,
  expireSubscriptionCredits,
} from '../services/credit.js';

/**
 * Plan credit mapping
 */
const PLAN_CREDITS: Record<string, number> = {
  'starter-monthly': 1000,
  'starter-annual': 1000,
  'growth-monthly': 5000,
  'growth-annual': 5000,
  'pro-monthly': 15000,
  'pro-annual': 15000,
  'scale-monthly': 50000,
  'scale-annual': 50000,
  'titan-monthly': 200000,
  'titan-annual': 200000,
};

/**
 * Process subscription renewals
 * Called by cron job daily
 */
export async function processSubscriptionRenewals(): Promise<void> {
  logger.info('Starting subscription renewal processing');

  try {
    // Find subscriptions that have passed their current period end
    // and are still active
    const now = new Date();
    const subscriptionsToRenew = await db
      .select()
      .from(subscriptionTable)
      .where(
        and(
          lte(subscriptionTable.currentPeriodEnd, now),
          eq(subscriptionTable.status, 'active')
        )
      );

    logger.info(
      { count: subscriptionsToRenew.length },
      'Found subscriptions to process for renewal'
    );

    let successCount = 0;
    let errorCount = 0;

    for (const subscription of subscriptionsToRenew) {
      try {
        await processSubscriptionRenewal(subscription);
        successCount++;
      } catch (error) {
        logger.error(
          { error, subscriptionId: subscription.id, userId: subscription.userId },
          'Failed to process subscription renewal'
        );
        errorCount++;
      }
    }

    logger.info(
      { total: subscriptionsToRenew.length, success: successCount, errors: errorCount },
      'Subscription renewal processing completed'
    );
  } catch (error) {
    logger.error({ error }, 'Subscription renewal worker failed');
    throw error;
  }
}

/**
 * Process a single subscription renewal
 */
async function processSubscriptionRenewal(subscription: any): Promise<void> {
  logger.info(
    { subscriptionId: subscription.id, userId: subscription.userId },
    'Processing subscription renewal'
  );

  // Get latest subscription data from Stripe
  const stripeSubscription = await stripeClient.getSubscription(
    subscription.stripeSubscriptionId
  );

  // Check if subscription is still active
  if (stripeSubscription.status !== 'active') {
    logger.warn(
      { subscriptionId: subscription.id, status: stripeSubscription.status },
      'Subscription is no longer active, skipping renewal'
    );

    // Update local status
    await db
      .update(subscriptionTable)
      .set({
        status: stripeSubscription.status,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionTable.id, subscription.id));

    return;
  }

  // Get credits for this plan
  const planCredits = PLAN_CREDITS[subscription.planId];
  if (!planCredits) {
    logger.error({ planId: subscription.planId }, 'Unknown plan ID');
    return;
  }

  // Check if period has actually changed
  const newPeriodEnd = stripeSubscription.currentPeriodEnd;
  if (newPeriodEnd.getTime() === subscription.currentPeriodEnd.getTime()) {
    // Period hasn't changed yet, skip
    logger.info(
      { subscriptionId: subscription.id },
      'Subscription period unchanged, skipping'
    );
    return;
  }

  // Wrap expire + add + update in a single transaction for atomicity
  await db.transaction(async (tx) => {
    // 1. Expire old subscription credits from previous period
    await expireSubscriptionCredits(
      subscription.userId,
      planCredits,
      subscription.stripeSubscriptionId,
      subscription.currentPeriodEnd,
      tx
    );
    logger.info(
      { userId: subscription.userId, credits: planCredits },
      'Expired old subscription credits'
    );

    // 2. Add new subscription credits for new period
    await addSubscriptionCredits(
      subscription.userId,
      planCredits,
      subscription.planId,
      subscription.stripeSubscriptionId,
      newPeriodEnd,
      tx
    );

    // 3. Update local subscription record with new period
    await tx
      .update(subscriptionTable)
      .set({
        currentPeriodStart: stripeSubscription.currentPeriodStart,
        currentPeriodEnd: stripeSubscription.currentPeriodEnd,
        status: stripeSubscription.status,
        stripePriceId: stripeSubscription.priceId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionTable.id, subscription.id));
  });

  logger.info(
    {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      credits: planCredits,
      newPeriodEnd,
    },
    'Subscription renewal processed successfully'
  );
}

/**
 * Run the worker once (for testing)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  processSubscriptionRenewals()
    .then(() => {
      logger.info('Subscription renewal worker completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Subscription renewal worker failed');
      process.exit(1);
    });
}
