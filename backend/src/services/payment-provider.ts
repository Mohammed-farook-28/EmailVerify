/**
 * Payment Provider Interface
 *
 * Abstraction over payment processors (Stripe, Razorpay, etc.) to support
 * multiple payment gateways while keeping business logic provider-agnostic.
 *
 * Current implementation: Stripe
 * Future: Razorpay support for Indian market
 */

export interface PaymentProvider {
  /**
   * Create a Stripe customer for a user
   * @param userId - EmailKit user ID
   * @param email - User's email address
   * @param name - User's full name
   * @returns Stripe customer ID
   */
  createCustomer(userId: string, email: string, name: string): Promise<string>;

  /**
   * Create a checkout session for one-time credit purchase
   * @param customerId - Stripe customer ID
   * @param credits - Number of credits to purchase
   * @param amountCents - Price in cents
   * @returns Checkout session ID and URL
   */
  createOneTimeCheckout(
    customerId: string,
    credits: number,
    amountCents: number
  ): Promise<{ sessionId: string; url: string }>;

  /**
   * Create a checkout session for subscription
   * @param customerId - Stripe customer ID
   * @param planId - Plan identifier (e.g., "starter-monthly", "pro-annual")
   * @param priceId - Stripe price ID for the plan
   * @returns Checkout session ID and URL
   */
  createSubscriptionCheckout(
    customerId: string,
    planId: string,
    priceId: string
  ): Promise<{ sessionId: string; url: string }>;

  /**
   * Get checkout session status
   * @param sessionId - Checkout session ID
   * @returns Session status and payment details
   */
  getCheckoutSessionStatus(sessionId: string): Promise<{
    status: 'open' | 'complete' | 'expired';
    paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
    customerId?: string;
    subscriptionId?: string;
    metadata?: Record<string, string>;
  }>;

  /**
   * Upgrade a subscription immediately (no proration)
   * @param subscriptionId - Stripe subscription ID
   * @param newPriceId - New Stripe price ID
   * @returns Updated subscription
   */
  upgradeSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<{ subscriptionId: string; currentPeriodEnd: Date }>;

  /**
   * Downgrade a subscription (scheduled for next billing period)
   * @param subscriptionId - Stripe subscription ID
   * @param newPriceId - New Stripe price ID
   * @returns Scheduled change confirmation
   */
  downgradeSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<{ subscriptionId: string; scheduledChangeDate: Date }>;

  /**
   * Cancel a subscription at period end
   * @param subscriptionId - Stripe subscription ID
   * @returns Cancellation confirmation with end date
   */
  cancelSubscription(subscriptionId: string): Promise<{
    subscriptionId: string;
    cancelAt: Date;
  }>;

  /**
   * Reactivate a canceled subscription
   * @param subscriptionId - Stripe subscription ID
   * @returns Reactivation confirmation
   */
  reactivateSubscription(subscriptionId: string): Promise<{
    subscriptionId: string;
    status: string;
  }>;

  /**
   * Get subscription details
   * @param subscriptionId - Stripe subscription ID
   * @returns Subscription information
   */
  getSubscription(subscriptionId: string): Promise<{
    id: string;
    status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'unpaid';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    priceId: string;
  }>;

  /**
   * Verify webhook signature
   * @param payload - Raw webhook payload
   * @param signature - Stripe signature header
   * @returns Parsed webhook event
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Promise<any>;
}
