


import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { stripeClient } from '../services/stripe-client.js';
import { db } from '../db/index.js';
import { user, checkoutSession, subscription as subscriptionTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { logger } from '../config/logger.js';
import { getBillingInfo, getTransactionHistory, exportTransactionsCSV } from '../services/billing.js';

const router = Router();

// Dynamic pricing tiers for one-time purchases
// Linear interpolation between these anchor points
const PRICE_TIERS: [number, number][] = [
  [1_000, 10],
  [2_000, 18],
  [5_000, 40],
  [10_000, 75],
  [25_000, 175],
  [50_000, 325],
  [100_000, 600],
];

// Valid credit stops matching the frontend slider
const VALID_CREDIT_STOPS = new Set([
  1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000,
  15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000, 50_000,
  60_000, 70_000, 80_000, 90_000, 100_000,
]);

/**
 * Calculate price for a credit amount using linear interpolation
 */
function calculatePrice(credits: number): number {
  if (credits <= PRICE_TIERS[0][0]) return PRICE_TIERS[0][1];
  if (credits >= PRICE_TIERS[PRICE_TIERS.length - 1][0]) return PRICE_TIERS[PRICE_TIERS.length - 1][1];

  for (let i = 0; i < PRICE_TIERS.length - 1; i++) {
    const [lowCredits, lowPrice] = PRICE_TIERS[i];
    const [highCredits, highPrice] = PRICE_TIERS[i + 1];

    if (credits >= lowCredits && credits <= highCredits) {
      const ratio = (credits - lowCredits) / (highCredits - lowCredits);
      const price = lowPrice + ratio * (highPrice - lowPrice);
      return Math.round(price * 100) / 100;
    }
  }

  return PRICE_TIERS[PRICE_TIERS.length - 1][1];
}

// Subscription plan configuration (10 plans: 5 tiers x 2 billing cycles)
// Prices must match Stripe product configuration
const PLANS = {
  'starter-monthly': { credits: 1000, price: 9, priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY },
  'starter-annual': { credits: 1000, price: 90, priceId: process.env.STRIPE_PRICE_STARTER_ANNUAL },
  'growth-monthly': { credits: 5000, price: 39, priceId: process.env.STRIPE_PRICE_GROWTH_MONTHLY },
  'growth-annual': { credits: 5000, price: 390, priceId: process.env.STRIPE_PRICE_GROWTH_ANNUAL },
  'pro-monthly': { credits: 15000, price: 99, priceId: process.env.STRIPE_PRICE_PRO_MONTHLY },
  'pro-annual': { credits: 15000, price: 990, priceId: process.env.STRIPE_PRICE_PRO_ANNUAL },
  'scale-monthly': { credits: 50000, price: 299, priceId: process.env.STRIPE_PRICE_SCALE_MONTHLY },
  'scale-annual': { credits: 50000, price: 2990, priceId: process.env.STRIPE_PRICE_SCALE_ANNUAL },
  'titan-monthly': { credits: 200000, price: 999, priceId: process.env.STRIPE_PRICE_TITAN_MONTHLY },
  'titan-annual': { credits: 200000, price: 9990, priceId: process.env.STRIPE_PRICE_TITAN_ANNUAL },
} as const;

/**
 * POST /api/billing/checkout/one-time
 * Create a checkout session for one-time credit purchase
 *
 * Body: { credits: number }
 * Credits must be one of the valid slider stops (1K-100K)
 */
router.post(
  '/checkout/one-time',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { credits } = req.body;
      const userId = req.user!.id;

      // Validate credits is a valid stop
      if (!credits || typeof credits !== 'number' || !VALID_CREDIT_STOPS.has(credits)) {
        return res.status(400).json({
          error: 'Invalid credit amount',
          message: `Credits must be one of: ${Array.from(VALID_CREDIT_STOPS).join(', ')}`,
        });
      }

      // Calculate price server-side (authoritative)
      const price = calculatePrice(credits);
      const amountCents = Math.round(price * 100);

      // Get or create Stripe customer
      const [existingUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

      let customerId = existingUser.paymentCustomerId;
      if (!customerId) {
        customerId = await stripeClient.createCustomer(
          userId,
          existingUser.email,
          existingUser.name
        );
        await db.update(user).set({ paymentCustomerId: customerId }).where(eq(user.id, userId));
      }

      // Create checkout session with dynamic price_data
      const { sessionId, url } = await stripeClient.createOneTimeCheckout(
        customerId,
        credits,
        amountCents
      );

      // Save checkout session for tracking
      await db.insert(checkoutSession).values({
        id: sessionId,
        userId,
        type: 'one_time_purchase',
        status: 'open',
        paymentStatus: 'unpaid',
        metadata: { credits, price },
        createdAt: new Date(),
      });

      logger.info({ userId, credits, price, sessionId }, 'One-time checkout session created');

      res.json({ sessionId, url });
    } catch (error) {
      logger.error({ error }, 'Failed to create one-time checkout session');
      next(error);
    }
  }
);

/**
 * POST /api/billing/checkout/subscription
 * Create a checkout session for subscription
 */
router.post(
  '/checkout/subscription',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { planId } = req.body;
      const userId = req.user!.id;

      if (!planId || !(planId in PLANS)) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      // Check if user already has an active subscription
      const [existingSubscription] = await db
        .select()
        .from(subscriptionTable)
        .where(eq(subscriptionTable.userId, userId))
        .limit(1);

      if (existingSubscription && existingSubscription.status === 'active') {
        logger.warn({ userId, planId }, 'User already has active subscription');
        return res.status(409).json({ error: 'You already have an active subscription' });
      }

      const plan = PLANS[planId as keyof typeof PLANS];
      if (!plan.priceId) {
        logger.error({ planId }, 'Price ID not configured for plan');
        return res.status(500).json({ error: 'Plan not configured' });
      }

      // Get or create Stripe customer
      const [existingUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

      let customerId = existingUser.paymentCustomerId;
      if (!customerId) {
        // Create Stripe customer
        customerId = await stripeClient.createCustomer(
          userId,
          existingUser.email,
          existingUser.name
        );

        // Save customer ID
        await db.update(user).set({ paymentCustomerId: customerId }).where(eq(user.id, userId));
      }

      // Create subscription checkout session
      const { sessionId, url } = await stripeClient.createSubscriptionCheckout(
        customerId,
        planId,
        plan.priceId
      );

      // Save checkout session for tracking
      await db.insert(checkoutSession).values({
        id: sessionId,
        userId,
        type: 'subscription',
        status: 'open',
        paymentStatus: 'unpaid',
        metadata: { planId, credits: plan.credits },
        createdAt: new Date(),
      });

      logger.info({ userId, planId, sessionId }, 'Subscription checkout session created');

      res.json({ sessionId, url });
    } catch (error) {
      logger.error({ error }, 'Failed to create subscription checkout session');
      next(error);
    }
  }
);

/**
 * GET /api/billing/checkout/status/:sessionId
 * Poll checkout session status
 */
router.get(
  '/checkout/status/:sessionId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user!.id;

      // Verify session belongs to user
      const [session] = await db
        .select()
        .from(checkoutSession)
        .where(eq(checkoutSession.id, sessionId))
        .limit(1);

      if (!session || session.userId !== userId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get latest status from Stripe
      const status = await stripeClient.getCheckoutSessionStatus(sessionId);

      // Update local session if status changed
      if (status.status !== session.status || status.paymentStatus !== session.paymentStatus) {
        await db
          .update(checkoutSession)
          .set({
            status: status.status,
            paymentStatus: status.paymentStatus,
            completedAt: status.status === 'complete' ? new Date() : null,
          })
          .where(eq(checkoutSession.id, sessionId));
      }

      const meta = session.metadata as Record<string, unknown>;
      res.json({
        status: status.status,
        paymentStatus: status.paymentStatus,
        type: session.type,
        credits: meta?.credits,
        planId: meta?.planId,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.sessionId }, 'Failed to get checkout status');
      next(error);
    }
  }
);

/**
 * GET /api/billing/info
 * Get billing information (balance + subscription)
 */
router.get('/info', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const billingInfo = await getBillingInfo(userId);
    res.json(billingInfo);
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get billing info');
    next(error);
  }
});

/**
 * GET /api/billing/transactions
 * Get transaction history with pagination
 */
router.get(
  '/transactions',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);

      // Validate startDate if provided
      const rawStartDate = req.query.startDate as string | undefined;
      let startDate: Date;
      if (rawStartDate) {
        const parsed = new Date(rawStartDate);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'Invalid startDate format' });
        }
        startDate = parsed;
      } else {
        // Default to last 90 days for live queries
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      }

      const result = await getTransactionHistory(userId, limit, offset, startDate);

      res.json(result);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, 'Failed to get transaction history');
      next(error);
    }
  }
);

/**
 * GET /api/billing/transactions/export
 * Export transaction history as CSV
 */
router.get(
  '/transactions/export',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // Optional start date filter with validation
      let startDate: Date | undefined;
      if (req.query.startDate) {
        const parsed = new Date(req.query.startDate as string);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'Invalid startDate format' });
        }
        startDate = parsed;
      }

      const csv = await exportTransactionsCSV(userId, startDate);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="transactions-${userId}-${Date.now()}.csv"`
      );
      res.send(csv);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, 'Failed to export transactions');
      next(error);
    }
  }
);

/**
 * POST /api/billing/subscription/change
 * Upgrade or downgrade subscription
 */
router.post(
  '/subscription/change',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newPlanId } = req.body;
      const userId = req.user!.id;

      if (!newPlanId || !(newPlanId in PLANS)) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      // Get current subscription
      const [subscription] = await db
        .select()
        .from(subscriptionTable)
        .where(eq(subscriptionTable.userId, userId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: 'No active subscription found' });
      }

      // Block changes if subscription is past_due
      if (subscription.status === 'past_due') {
        return res.status(403).json({ error: 'Cannot change subscription while payment is past due' });
      }

      const newPlan = PLANS[newPlanId as keyof typeof PLANS];
      if (!newPlan.priceId) {
        logger.error({ newPlanId }, 'Price ID not configured for plan');
        return res.status(500).json({ error: 'Plan not configured' });
      }

      // Determine if upgrade or downgrade based on credits
      const currentPlan = PLANS[subscription.planId as keyof typeof PLANS];
      const isUpgrade = newPlan.credits > currentPlan.credits;

      if (isUpgrade) {
        // Upgrade immediately, no proration
        const result = await stripeClient.upgradeSubscription(
          subscription.stripeSubscriptionId,
          newPlan.priceId
        );

        // Update local subscription record
        await db
          .update(subscriptionTable)
          .set({
            planId: newPlanId,
            stripePriceId: newPlan.priceId,
            currentPeriodEnd: result.currentPeriodEnd,
            updatedAt: new Date(),
          })
          .where(eq(subscriptionTable.id, subscription.id));

        logger.info({ userId, oldPlan: subscription.planId, newPlan: newPlanId }, 'Subscription upgraded');

        res.json({
          success: true,
          type: 'upgrade',
          effectiveDate: new Date(),
          message: 'Subscription upgraded immediately'
        });
      } else {
        // Downgrade scheduled for next billing period
        const result = await stripeClient.downgradeSubscription(
          subscription.stripeSubscriptionId,
          newPlan.priceId
        );

        logger.info({ userId, oldPlan: subscription.planId, newPlan: newPlanId }, 'Subscription downgrade scheduled');

        res.json({
          success: true,
          type: 'downgrade',
          effectiveDate: result.scheduledChangeDate,
          message: 'Downgrade will take effect at the end of your current billing period'
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to change subscription');
      next(error);
    }
  }
);

/**
 * POST /api/billing/subscription/cancel
 * Cancel subscription at period end
 */
router.post(
  '/subscription/cancel',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // Get current subscription
      const [subscription] = await db
        .select()
        .from(subscriptionTable)
        .where(eq(subscriptionTable.userId, userId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: 'No active subscription found' });
      }

      if (subscription.cancelAtPeriodEnd) {
        return res.status(400).json({ error: 'Subscription is already scheduled for cancellation' });
      }

      // Cancel at period end
      const result = await stripeClient.cancelSubscription(subscription.stripeSubscriptionId);

      // Update local subscription record
      await db
        .update(subscriptionTable)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionTable.id, subscription.id));

      logger.info({ userId, subscriptionId: subscription.id, cancelAt: result.cancelAt }, 'Subscription canceled');

      res.json({
        success: true,
        cancelAt: result.cancelAt,
        message: 'Your subscription will be canceled at the end of the current billing period'
      });
    } catch (error) {
      logger.error({ error }, 'Failed to cancel subscription');
      next(error);
    }
  }
);

/**
 * POST /api/billing/subscription/reactivate
 * Reactivate a canceled subscription
 */
router.post(
  '/subscription/reactivate',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // Get current subscription
      const [subscription] = await db
        .select()
        .from(subscriptionTable)
        .where(eq(subscriptionTable.userId, userId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({ error: 'No subscription found' });
      }

      if (!subscription.cancelAtPeriodEnd) {
        return res.status(400).json({ error: 'Subscription is not scheduled for cancellation' });
      }

      // Reactivate subscription
      const result = await stripeClient.reactivateSubscription(subscription.stripeSubscriptionId);

      // Update local subscription record
      await db
        .update(subscriptionTable)
        .set({
          cancelAtPeriodEnd: false,
          status: result.status,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionTable.id, subscription.id));

      logger.info({ userId, subscriptionId: subscription.id }, 'Subscription reactivated');

      res.json({
        success: true,
        message: 'Your subscription has been reactivated'
      });
    } catch (error) {
      logger.error({ error }, 'Failed to reactivate subscription');
      next(error);
    }
  }
);

/**
 * GET /api/billing/packages (public)
 * Returns the pricing tiers and valid credit stops for the slider
 */
router.get('/packages', async (req: Request, res: Response) => {
  const stops = Array.from(VALID_CREDIT_STOPS).map((credits) => ({
    credits,
    price: calculatePrice(credits),
  }));
  res.json({ stops, tiers: PRICE_TIERS });
});

/**
 * GET /api/billing/plans (public)
 * Get all available subscription plans
 */
router.get('/plans', async (req: Request, res: Response) => {
  // Group plans by tier
  const tiers = ['starter', 'growth', 'pro', 'scale', 'titan'];
  const plans = tiers.map((tier) => {
    const monthlyPlan = PLANS[`${tier}-monthly` as keyof typeof PLANS];
    const annualPlan = PLANS[`${tier}-annual` as keyof typeof PLANS];

    return {
      id: tier,
      name: tier.charAt(0).toUpperCase() + tier.slice(1),
      credits: monthlyPlan.credits,
      monthlyPrice: monthlyPlan.price,
      annualPrice: annualPlan.price,
    };
  });
  res.json({ plans });
});

export default router;
