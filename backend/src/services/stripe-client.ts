import Stripe from 'stripe';
import { stripe, stripeConfig } from '../config/stripe.js';
import type { PaymentProvider } from './payment-provider.js';
import { logger } from '../config/logger.js';

/**
 * Stripe implementation of PaymentProvider interface
 *
 * Handles all Stripe API interactions for EmailKit billing system.
 */
export class StripeClient implements PaymentProvider {
  async createCustomer(userId: string, email: string, name: string): Promise<string> {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: { userId },
      });

      logger.info({ customerId: customer.id, userId }, 'Stripe customer created');
      return customer.id;
    } catch (error) {
      logger.error({ error, userId, email }, 'Failed to create Stripe customer');
      throw new Error('Failed to create payment customer');
    }
  }

  async createOneTimeCheckout(
    customerId: string,
    packageId: string,
    priceId: string,
    quantity: number = 1
  ): Promise<{ sessionId: string; url: string }> {
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity,
          },
        ],
        success_url: stripeConfig.getSuccessUrl('{CHECKOUT_SESSION_ID}'),
        cancel_url: stripeConfig.getCancelUrl(),
        expires_at: Math.floor(Date.now() / 1000) + stripeConfig.checkoutSessionExpiration,
        metadata: {
          type: 'one_time_purchase',
          packageId,
        },
      });

      logger.info(
        { sessionId: session.id, customerId, packageId, priceId },
        'One-time checkout session created'
      );

      return {
        sessionId: session.id,
        url: session.url!,
      };
    } catch (error) {
      logger.error({ error, customerId, packageId }, 'Failed to create one-time checkout session');
      throw new Error('Failed to create checkout session');
    }
  }

  async createSubscriptionCheckout(
    customerId: string,
    planId: string,
    priceId: string
  ): Promise<{ sessionId: string; url: string }> {
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: stripeConfig.getSuccessUrl('{CHECKOUT_SESSION_ID}'),
        cancel_url: stripeConfig.getCancelUrl(),
        expires_at: Math.floor(Date.now() / 1000) + stripeConfig.checkoutSessionExpiration,
        subscription_data: {
          metadata: {
            planId,
          },
        },
        metadata: {
          type: 'subscription',
          planId,
        },
      });

      logger.info(
        { sessionId: session.id, customerId, planId, priceId },
        'Subscription checkout session created'
      );

      return {
        sessionId: session.id,
        url: session.url!,
      };
    } catch (error) {
      logger.error({ error, customerId, planId }, 'Failed to create subscription checkout session');
      throw new Error('Failed to create checkout session');
    }
  }

  async getCheckoutSessionStatus(sessionId: string): Promise<{
    status: 'open' | 'complete' | 'expired';
    paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
    customerId?: string;
    subscriptionId?: string;
    metadata?: Record<string, string>;
  }> {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      return {
        status: session.status as 'open' | 'complete' | 'expired',
        paymentStatus: session.payment_status as 'paid' | 'unpaid' | 'no_payment_required',
        customerId: session.customer as string | undefined,
        subscriptionId: session.subscription as string | undefined,
        metadata: session.metadata as Record<string, string> | undefined,
      };
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to retrieve checkout session status');
      throw new Error('Failed to get checkout session status');
    }
  }

  async upgradeSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<{ subscriptionId: string; currentPeriodEnd: Date }> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      // Update subscription immediately with no proration
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'none', // No proration on upgrade
        billing_cycle_anchor: 'now', // Start new billing cycle immediately
      });

      logger.info(
        { subscriptionId, newPriceId, currentPeriodEnd: updated.current_period_end },
        'Subscription upgraded'
      );

      return {
        subscriptionId: updated.id,
        currentPeriodEnd: new Date(updated.current_period_end * 1000),
      };
    } catch (error) {
      logger.error({ error, subscriptionId, newPriceId }, 'Failed to upgrade subscription');
      throw new Error('Failed to upgrade subscription');
    }
  }

  async downgradeSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<{ subscriptionId: string; scheduledChangeDate: Date }> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      // Schedule downgrade for next billing period
      await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'none',
        billing_cycle_anchor: 'unchanged', // Keep current billing cycle
      });

      logger.info(
        { subscriptionId, newPriceId, scheduledChangeDate: subscription.current_period_end },
        'Subscription downgrade scheduled'
      );

      return {
        subscriptionId: subscription.id,
        scheduledChangeDate: new Date(subscription.current_period_end * 1000),
      };
    } catch (error) {
      logger.error({ error, subscriptionId, newPriceId }, 'Failed to downgrade subscription');
      throw new Error('Failed to downgrade subscription');
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<{
    subscriptionId: string;
    cancelAt: Date;
  }> {
    try {
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      logger.info(
        { subscriptionId, cancelAt: updated.cancel_at },
        'Subscription canceled at period end'
      );

      return {
        subscriptionId: updated.id,
        cancelAt: new Date(updated.cancel_at! * 1000),
      };
    } catch (error) {
      logger.error({ error, subscriptionId }, 'Failed to cancel subscription');
      throw new Error('Failed to cancel subscription');
    }
  }

  async reactivateSubscription(subscriptionId: string): Promise<{
    subscriptionId: string;
    status: string;
  }> {
    try {
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      logger.info({ subscriptionId, status: updated.status }, 'Subscription reactivated');

      return {
        subscriptionId: updated.id,
        status: updated.status,
      };
    } catch (error) {
      logger.error({ error, subscriptionId }, 'Failed to reactivate subscription');
      throw new Error('Failed to reactivate subscription');
    }
  }

  async getSubscription(subscriptionId: string): Promise<{
    id: string;
    status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'unpaid';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    priceId: string;
  }> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      return {
        id: subscription.id,
        status: subscription.status as any,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        priceId: subscription.items.data[0].price.id,
      };
    } catch (error) {
      logger.error({ error, subscriptionId }, 'Failed to get subscription');
      throw new Error('Failed to get subscription details');
    }
  }

  async verifyWebhookSignature(payload: string | Buffer, signature: string): Promise<Stripe.Event> {
    try {
      const event = stripe.webhooks.constructEvent(payload, signature, stripeConfig.webhookSecret);
      return event;
    } catch (error) {
      logger.error({ error }, 'Webhook signature verification failed');
      throw new Error('Invalid webhook signature');
    }
  }
}

/**
 * Singleton instance of StripeClient
 */
export const stripeClient = new StripeClient();
