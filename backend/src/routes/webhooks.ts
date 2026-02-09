import { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { verifyStripeSignature } from '../middleware/stripe-signature.js';
import { db } from '../db/index.js';
import {
  checkoutSession,
  processedWebhookEvent,
  user,
  subscription as subscriptionTable,
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../config/logger.js';
import {
  addPurchaseCredits,
  addSubscriptionCredits,
  expireSubscriptionCredits,
} from '../services/credit.js';
import { nanoid } from 'nanoid';

const router = Router();

// Webhook route configuration (must use raw body)
// This should be set up in app.ts with express.raw({ type: 'application/json' })

/**
 * POST /api/billing/webhook
 * Handle Stripe webhook events
 */
router.post('/webhook', verifyStripeSignature, async (req: Request, res: Response) => {
  const event: Stripe.Event = (req as any).stripeEvent;

  try {
    // Check idempotency - have we already processed this event?
    const [existing] = await db
      .select()
      .from(processedWebhookEvent)
      .where(eq(processedWebhookEvent.id, event.id))
      .limit(1);

    if (existing) {
      logger.info({ eventId: event.id, type: event.type }, 'Webhook event already processed');
      return res.json({ received: true, alreadyProcessed: true });
    }

    // Process event based on type
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        logger.info({ type: event.type }, 'Unhandled webhook event type');
    }

    // Mark event as processed
    await db.insert(processedWebhookEvent).values({
      id: event.id,
      type: event.type,
      processedAt: new Date(),
    });

    logger.info({ eventId: event.id, type: event.type }, 'Webhook event processed successfully');
    res.json({ received: true });
  } catch (error) {
    logger.error({ error, eventId: event.id, type: event.type }, 'Failed to process webhook event');
    // Return 500 so Stripe retries
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle checkout.session.completed event
 * Triggered when user completes payment for one-time purchase or subscription
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  logger.info({ sessionId: session.id, mode: session.mode }, 'Processing checkout.session.completed');

  // Update local checkout session record
  await db
    .update(checkoutSession)
    .set({
      status: 'complete',
      paymentStatus: session.payment_status,
      completedAt: new Date(),
    })
    .where(eq(checkoutSession.id, session.id));

  // Get session metadata to determine type
  const [localSession] = await db
    .select()
    .from(checkoutSession)
    .where(eq(checkoutSession.id, session.id))
    .limit(1);

  if (!localSession) {
    logger.error({ sessionId: session.id }, 'Checkout session not found in database');
    return;
  }

  if (localSession.type === 'one_time_purchase' && session.payment_status === 'paid') {
    // Add credits immediately for one-time purchase
    const metadata = localSession.metadata as { credits: number; price?: number };
    await addPurchaseCredits(
      localSession.userId,
      metadata.credits,
      session.id,
      `${metadata.credits} credits`
    );
    logger.info(
      { userId: localSession.userId, credits: metadata.credits },
      'One-time purchase credits added'
    );
  } else if (localSession.type === 'subscription') {
    // Subscription will be handled by customer.subscription.created
    logger.info({ sessionId: session.id }, 'Subscription checkout completed, waiting for subscription creation');
  }
}

/**
 * Handle payment_intent.succeeded event
 * Add credits for successful one-time purchase
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  logger.info({ paymentIntentId: paymentIntent.id }, 'Processing payment_intent.succeeded');

  // Find the checkout session associated with this payment intent
  // We need to get the checkout session from Stripe to find our local record
  // For now, we'll rely on invoice.paid for subscription renewals
  // and checkout.session.completed metadata for one-time purchases

  // Check if this is a one-time payment (not invoice-based)
  if (!paymentIntent.invoice) {
    logger.info({ paymentIntentId: paymentIntent.id }, 'One-time payment succeeded, credits added via checkout.session.completed');
  }
}

/**
 * Handle payment_intent.payment_failed event
 * Log failed payment attempts
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  logger.error(
    { paymentIntentId: paymentIntent.id, error: paymentIntent.last_payment_error },
    'Payment failed'
  );

  // Update checkout session if exists
  // In production, we might want to send email notifications here
}

/**
 * Handle invoice.paid event
 * Add subscription credits when invoice is paid
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  logger.info({ invoiceId: invoice.id, subscriptionId: invoice.subscription }, 'Processing invoice.paid');

  if (!invoice.subscription) {
    logger.info({ invoiceId: invoice.id }, 'Invoice not associated with subscription, skipping');
    return;
  }

  // Get subscription from database
  const [subscription] = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.stripeSubscriptionId, invoice.subscription as string))
    .limit(1);

  if (!subscription) {
    logger.error({ subscriptionId: invoice.subscription }, 'Subscription not found in database');
    return;
  }

  // Determine credits from plan
  const planCredits = getPlanCredits(subscription.planId);
  if (!planCredits) {
    logger.error({ planId: subscription.planId }, 'Unknown plan ID');
    return;
  }

  // Add subscription credits
  await addSubscriptionCredits(
    subscription.userId,
    planCredits,
    subscription.planId,
    subscription.stripeSubscriptionId,
    subscription.currentPeriodEnd
  );

  logger.info(
    { userId: subscription.userId, credits: planCredits, planId: subscription.planId },
    'Subscription credits added'
  );
}

/**
 * Handle invoice.payment_failed event
 * Send notification to user about failed payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  logger.error(
    { invoiceId: invoice.id, subscriptionId: invoice.subscription },
    'Invoice payment failed'
  );

  // In production, send email notification to user
  // Update subscription status to 'past_due' if needed (Stripe does this automatically)
}

/**
 * Handle customer.subscription.created/updated event
 * Update local subscription record
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  logger.info({ subscriptionId: subscription.id, status: subscription.status }, 'Processing subscription update');

  // Find user by customer ID
  const [existingUser] = await db
    .select()
    .from(user)
    .where(eq(user.paymentCustomerId, subscription.customer as string))
    .limit(1);

  if (!existingUser) {
    logger.error({ customerId: subscription.customer }, 'User not found for subscription');
    return;
  }

  // Extract plan ID from metadata or price
  const planId = subscription.metadata?.planId || 'unknown';
  if (planId === 'unknown') {
    logger.warn({ subscriptionId: subscription.id }, 'Subscription missing planId in metadata');
  }
  const priceId = subscription.items.data[0].price.id;

  // Upsert subscription record
  const [existingSubscription] = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.userId, existingUser.id))
    .limit(1);

  if (existingSubscription) {
    // Update existing
    await db
      .update(subscriptionTable)
      .set({
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        planId,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionTable.id, existingSubscription.id));
  } else {
    // Create new
    await db.insert(subscriptionTable).values({
      id: nanoid(),
      userId: existingUser.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      planId,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add initial subscription credits for new subscription
    const planCredits = getPlanCredits(planId);
    if (planCredits) {
      await addSubscriptionCredits(
        existingUser.id,
        planCredits,
        planId,
        subscription.id,
        new Date(subscription.current_period_end * 1000)
      );
      logger.info({ userId: existingUser.id, credits: planCredits }, 'Initial subscription credits added');
    }
  }

  logger.info({ subscriptionId: subscription.id, userId: existingUser.id }, 'Subscription updated');
}

/**
 * Handle customer.subscription.deleted event
 * Mark subscription as canceled in database
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  logger.info({ subscriptionId: subscription.id }, 'Processing subscription deletion');

  await db
    .update(subscriptionTable)
    .set({
      status: 'canceled',
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionTable.stripeSubscriptionId, subscription.id));

  logger.info({ subscriptionId: subscription.id }, 'Subscription marked as canceled');
}

/**
 * Helper: Get credits for a plan ID
 */
function getPlanCredits(planId: string): number | null {
  const planMap: Record<string, number> = {
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

  return planMap[planId] || null;
}

export default router;
