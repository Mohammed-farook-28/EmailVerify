# Phase 0 Research: Billing & Credit Purchases

**Feature**: 003-billing
**Date**: 2026-02-01
**Purpose**: Technical research for Stripe SDK integration, subscription management, payment security, and testing strategies

---

## 1. Stripe SDK Integration

### Decision: Use Stripe TypeScript SDK with Standard Initialization

**Rationale**:
- Native TypeScript support with included type declarations (TypeScript 3.1+)
- Official Stripe SDK with automatic API version management
- Well-documented error handling with specific error types
- Production-ready patterns established by thousands of companies

**Implementation Pattern**:

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia', // Latest stable version
  typescript: true,
  telemetry: true,
  appInfo: {
    name: 'EmailKit',
    version: '1.0.0',
  },
});
```

**Environment Variables** (separate test/production):
```
STRIPE_SECRET_KEY=sk_test_... (development)
STRIPE_SECRET_KEY=sk_live_... (production)
STRIPE_PUBLISHABLE_KEY=pk_test_... (frontend, development)
STRIPE_PUBLISHABLE_KEY=pk_live_... (frontend, production)
STRIPE_WEBHOOK_SECRET=whsec_... (webhook signature verification)
```

**Error Handling Pattern**:

```typescript
try {
  const result = await stripe.operation();
} catch (error) {
  if (error instanceof Stripe.errors.StripeError) {
    switch (error.type) {
      case 'StripeCardError': // Payment declined
      case 'StripeInvalidRequestError': // Invalid params
      case 'StripeAPIError': // Stripe server error
      case 'StripeAuthenticationError': // Bad API keys
      case 'StripeIdempotencyError': // Duplicate idempotency key
    }
  }
}
```

**Alternatives Considered**:
- Building custom HTTP client → Rejected (reinventing wheel, no type safety, error handling complexity)
- Using unofficial third-party wrappers → Rejected (maintenance risk, outdated API versions)

---

## 2. Checkout Sessions (Hosted Checkout)

### Decision: Use Stripe Hosted Checkout with 1-Hour Session Expiry

**Rationale**:
- PCI DSS compliance handled by Stripe (no sensitive card data on our servers)
- Mobile-optimized checkout UI maintained by Stripe
- Automatic fraud detection and 3D Secure handling
- Session expiry prevents abandoned checkout inventory issues

**Implementation Pattern**:

```typescript
// One-time purchase
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${APP_URL}/cancel`,
  customer: customerId, // Attach to existing customer
  expires_at: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
  metadata: { userId, packageId },
});

// Subscription
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${APP_URL}/subscription/cancel`,
  customer: customerId,
  billing_address_collection: 'required',
  allow_promotion_codes: true,
});
```

**Session Expiry**:
- Default: 24 hours
- **Our choice: 1 hour** (matches clarification #4, prevents long-abandoned sessions)
- Minimum allowed: 30 minutes

**Handling Success/Cancel**:
- Success URL receives `session_id` parameter → fetch session details
- **Don't rely on success URL for fulfillment** → Use `checkout.session.completed` webhook
- Cancel URL → Show "Payment cancelled, try again" message

**Alternatives Considered**:
- Stripe Elements (embedded payment form) → Rejected (more PCI scope, custom UI maintenance)
- Payment Links → Rejected (less programmatic control, no metadata support)
- 24-hour default expiry → Rejected (inventory held too long, user chose 1 hour)

---

## 3. Subscription Lifecycle Management

### Decision: No Proration on Upgrades (Full Tier Charge)

**Rationale** (from clarification #7):
- Simplifies pricing logic (no complex proration calculations)
- Clearer for users (full price = full credits immediately)
- Reduces edge cases (proration + partial credits = confusion)
- Easier to test and validate

**Subscription Status States**:

| Status | Description | Action Required |
|--------|-------------|----------------|
| `incomplete` | Payment required but not completed | Wait for webhook or expire |
| `trialing` | Trial period active | None (will auto-convert to active) |
| `active` | Paid and current | None |
| `past_due` | Payment failed, retrying | Send dunning email, allow grace period |
| `canceled` | Subscription ended | Revoke access |
| `unpaid` | Retries exhausted, not auto-canceled | Revoke access |

**Upgrade Pattern (Immediate)**:

```typescript
// No proration - charge full new tier price
const subscription = await stripe.subscriptions.update(subscriptionId, {
  items: [{ id: subscriptionItemId, price: newPriceId }],
  proration_behavior: 'none', // No proration
  billing_cycle_anchor: 'now', // Bill immediately
});
```

**Downgrade Pattern (Scheduled)**:

```typescript
// Change takes effect at next renewal
const subscription = await stripe.subscriptions.update(subscriptionId, {
  items: [{ id: subscriptionItemId, price: newPriceId }],
  proration_behavior: 'none',
  billing_cycle_anchor: 'unchanged', // Wait until period end
});
```

**Cancellation Patterns**:

```typescript
// Cancel at period end (our choice per spec)
const subscription = await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: true,
});

// Reactivate before period ends
const subscription = await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: false,
});
```

**Failed Renewal Handling**:

- **Stripe Smart Retries**: Automatically retries using ML (500+ attributes)
- **Recommended schedule**: 8 retries over 2 weeks
- **Our implementation**: Rely on Stripe automatic retries (clarification #8)
- **Email notifications**: Send via Resend when `invoice.payment_failed` webhook received
- **Grace period**: Keep subscription in `past_due` status (credits usable)

**Alternatives Considered**:
- Daily proration → Rejected (user chose no proration for simplicity)
- Hourly proration → Rejected (over-engineered, minimal benefit)
- Immediate cancellation → Rejected (poor UX, period-end is standard)
- Custom retry logic → Rejected (Stripe retries are battle-tested, user chose provider retries)

---

## 4. Webhook Security & Processing

### Decision: Signature Verification Only (No Rate Limiting)

**Rationale** (from clarification #2):
- Signature verification prevents unauthorized webhook calls
- Stripe webhook signature includes timestamp (5-minute replay attack window)
- Rate limiting complexity not needed for webhook endpoint
- Can add rate limiting later if abuse detected

**Signature Verification Implementation**:

```typescript
import express from 'express';

app.post(
  '/home/billing/webhook',
  express.raw({ type: 'application/json' }), // CRITICAL: Raw body needed
  async (req, res) => {
    const sig = req.headers['stripe-signature']!;

    try {
      // Verify signature and construct event
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      // Process event (async)
      await processWebhookEvent(event);

      // Return 200 quickly (before long operations)
      res.json({ received: true });
    } catch (err) {
      console.log(`Webhook signature failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);
```

**Critical Webhook Events**:

```typescript
// Checkout completed → allocate credits
'checkout.session.completed'

// Invoice paid → renew subscription credits
'invoice.paid'

// Invoice payment failed → send dunning email
'invoice.payment_failed'

// Subscription updated → sync status to database
'customer.subscription.updated'

// Subscription deleted → revoke access
'customer.subscription.deleted'
```

**Idempotency Pattern**:

```typescript
// Check if webhook already processed
const existingEvent = await db.processedWebhookEvents.findUnique({
  where: { eventId: event.id }
});

if (existingEvent) {
  console.log(`Event ${event.id} already processed`);
  return;
}

// Process event
await allocateCredits(event.data);

// Mark as processed
await db.processedWebhookEvents.create({
  data: { eventId: event.id, processedAt: new Date() }
});
```

**Retry Behavior**:
- **Stripe automatic retries**: Up to 3 days with exponential backoff
- **Our implementation**: Rely on Stripe retries (clarification #8), log failures for monitoring
- **Alert threshold**: 5 minutes (NFR-004) - alert if webhook not processed within 5 min

**Alternatives Considered**:
- Rate limiting (100 req/min) → Rejected (user chose signature-only for now)
- IP whitelisting → Rejected (Stripe IPs can change, maintenance burden)
- Replay attack prevention beyond 5-min timestamp → Rejected (Stripe's 5-min window sufficient)
- Custom retry queue (BullMQ) → Rejected (user chose provider retries, avoid duplication)

---

## 5. Transaction History & Compliance

### Decision: 7-Year Retention with 90-Day Live Query Window

**Rationale** (from clarifications #3, #5):
- **7 years**: Standard for financial records (IRS, most jurisdictions)
- **90 days live**: Covers 99% of user queries, prevents slow deep pagination
- **CSV export**: Maintains full audit trail access for older data

**Database Schema for credit_events**:

```sql
CREATE TABLE credit_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- 'purchase', 'subscription', 'deduct', 'refund', 'expire'
  amount INTEGER NOT NULL, -- Positive = credit, negative = debit
  balance_after INTEGER NOT NULL,
  description TEXT NOT NULL,
  reference_id TEXT, -- Invoice ID, job ID, etc.
  idempotency_key TEXT UNIQUE, -- Prevent duplicates
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_events_user_date ON credit_events(user_id, created_at DESC);
CREATE INDEX idx_credit_events_created ON credit_events(created_at); -- For cleanup
```

**Live Query Pattern** (90-day window):

```typescript
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

const transactions = await db.creditEvents
  .findMany({
    where: {
      userId: userId,
      createdAt: { gte: ninetyDaysAgo }
    },
    orderBy: { createdAt: 'desc' },
    take: 20, // Page size
    skip: page * 20
  });
```

**CSV Export Pattern** (full 7 years):

```typescript
import { stringify } from 'csv-stringify';

async function exportTransactions(userId: string): Promise<Stream> {
  const transactions = await db.creditEvents
    .findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

  return stringify(transactions, {
    header: true,
    columns: ['id', 'created_at', 'type', 'amount', 'balance_after', 'description', 'reference_id']
  });
}
```

**Cleanup Strategy**:

```sql
-- Delete credit_events older than 7 years
DELETE FROM credit_events
WHERE created_at < NOW() - INTERVAL '7 years';
```

**Performance**:
- **NFR-009**: Live queries <500ms (index on userId + createdAt)
- **NFR-010**: CSV export <30s for 50K records (streaming)

**Alternatives Considered**:
- Indefinite retention → Rejected (storage cost, GDPR compliance complexity)
- 2 years → Rejected (insufficient for tax compliance)
- Match user data retention (30 days) → Rejected (billing records need longer retention)
- No pagination limits → Rejected (causes slow queries on large datasets)

---

## 6. Testing Strategies

### Decision: Stripe Test Mode + Test Clocks + Local Webhook Testing

**Test Cards**:

```
Success: 4242 4242 4242 4242
Declined: 4000 0000 0000 0002
Insufficient funds: 4000 0000 0000 9995
3D Secure required: 4000 0027 6000 3184
```

**Stripe CLI for Local Webhooks**:

```bash
# Install
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/home/billing/webhook

# Get webhook secret from output:
# > whsec_xxx...

# In .env.development
STRIPE_WEBHOOK_SECRET=whsec_xxx...

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
```

**Test Clocks for Subscription Testing**:

```typescript
// Create test clock
const testClock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
  name: 'subscription-test',
});

// Create customer attached to test clock
const customer = await stripe.customers.create({
  email: 'test@example.com',
  test_clock: testClock.id,
});

// Create subscription
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: priceId }],
  trial_period_days: 14,
});

// Advance 15 days → trial ends
await stripe.testHelpers.testClocks.advance(testClock.id, {
  frozen_time: testClock.frozen_time + (15 * 24 * 60 * 60),
});

// Advance 30 days → renewal
await stripe.testHelpers.testClocks.advance(testClock.id, {
  frozen_time: testClock.frozen_time + (30 * 24 * 60 * 60),
});
```

**Integration Test Pattern**:

```typescript
describe('Checkout Flow', () => {
  it('should allocate credits after successful checkout', async () => {
    // Create checkout session
    const session = await createCheckout(userId, 'credits_10k');

    // Simulate webhook (using Stripe SDK)
    const event = stripe.webhooks.constructEvent(
      JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: session },
      }),
      mockSignature,
      webhookSecret
    );

    await handleWebhook(event);

    // Verify credits allocated
    const balance = await getCreditBalance(userId);
    expect(balance).toBe(10000);
  });
});
```

**Mocking Stripe SDK**:

```typescript
import Stripe from 'stripe';
import { jest } from '@jest/globals';

jest.mock('stripe');

const mockStripe = {
  checkout: {
    sessions: {
      create: jest.fn().mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/...' }),
    },
  },
};

(Stripe as jest.MockedClass<typeof Stripe>).mockImplementation(() => mockStripe as any);
```

**Alternatives Considered**:
- Real payments in test mode → Rejected (too slow for CI/CD)
- Mock all Stripe calls → Rejected (misses integration bugs, test clocks are better)
- Wait real time for subscriptions → Rejected (test clocks simulate time passage)

---

## 7. Customer Portal (Self-Service)

### Decision: Use Stripe Billing Portal for Payment Method Management

**Rationale**:
- Pre-built UI for updating payment methods
- Handles payment method validation and PCI compliance
- Consistent with Stripe checkout experience
- Less frontend code to maintain

**Implementation**:

```typescript
async function createCustomerPortalSession(customerId: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.APP_URL}/home/billing`,
  });

  return session.url; // Redirect user to this URL
}
```

**Portal Features** (configurable in Stripe Dashboard):
- Update payment methods ✅
- View invoices ✅
- Cancel subscriptions ✅
- View subscription history ✅

**When to Use**:
- User clicks "Update payment method" → redirect to portal
- User needs to fix failed payment → redirect to portal
- User wants to view past invoices → redirect to portal

**Alternatives Considered**:
- Build custom payment method form → Rejected (PCI scope, UI maintenance)
- Stripe Elements for payment method update → Rejected (more complex than portal)

---

## 8. Production Configuration

### Stripe Products/Prices Setup

**Required Stripe Configuration** (27 total prices):

**One-Time Packages** (9):
1. 1,000 credits → `price_1k`
2. 2,000 credits → `price_2k`
3. 5,000 credits → `price_5k`
4. 10,000 credits → `price_10k`
5. 25,000 credits → `price_25k`
6. 50,000 credits → `price_50k`
7. 100,000 credits → `price_100k`
8. 500,000 credits → `price_500k`
9. 1,000,000 credits → `price_1m`

**Subscription Plans** (9 × 2 billing cycles = 18):
- Starter (monthly, annual)
- Popular (monthly, annual)
- Professional (monthly, annual)
- Business (monthly, annual)
- Enterprise (monthly, annual)
- Premium (monthly, annual)
- Ultimate (monthly, annual)
- Mega (monthly, annual)
- Titan (monthly, annual)

**Environment Variables**:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Package Price IDs
STRIPE_PRICE_1K=price_xxx...
STRIPE_PRICE_2K=price_xxx...
# ... (all 27 price IDs)

# App URLs
APP_URL=https://emailkit.io
```

**Startup Validation**:

```typescript
// Verify all price IDs exist at startup
async function validateStripePrices() {
  const requiredPrices = [
    process.env.STRIPE_PRICE_1K,
    process.env.STRIPE_PRICE_2K,
    // ... all 27
  ];

  for (const priceId of requiredPrices) {
    try {
      await stripe.prices.retrieve(priceId!);
    } catch (err) {
      throw new Error(`Invalid Stripe price ID: ${priceId}`);
    }
  }
}
```

---

## 9. Monitoring & Observability

### Decision: Structured Logging with Stripe Request IDs

**Pattern** (from clarification #1):

```typescript
import { logger } from './config/logger';

// INFO level: Successful operations
logger.info({
  event: 'checkout_session_created',
  userId,
  packageId,
  stripeSessionId: session.id,
  stripeRequestId: session.livemode ? 'req_xxx' : undefined,
  timestamp: new Date().toISOString(),
});

// ERROR level: Failures and alerts
logger.error({
  event: 'webhook_processing_failed',
  eventId: event.id,
  eventType: event.type,
  error: err.message,
  stripeRequestId: event.request?.id,
  timestamp: new Date().toISOString(),
});
```

**Alert Thresholds**:
- Webhook not processed within 5 minutes → ERROR (NFR-004)
- Checkout session creation failure → ERROR (NFR-005)
- Failed payment → INFO + send user email (not error, expected)

**Stripe Dashboard Monitoring**:
- Webhooks → Developers → Webhooks → View failed deliveries
- Payments → Failed payments → Review decline codes
- Billing → Subscription churn → Track cancellations

---

## 10. Key Decisions Summary

| Decision Area | Choice | Rationale |
|--------------|--------|-----------|
| **Payment Provider** | Stripe (phase 1) | Industry standard, excellent TypeScript SDK, comprehensive docs |
| **Proration** | None (full tier charge) | Simplicity, user choice |
| **Webhook Security** | Signature verification only | Sufficient for phase 1, user choice |
| **Retry Logic** | Stripe automatic retries | Battle-tested, user choice |
| **Transaction Retention** | 7 years | Tax compliance |
| **Query Window** | 90 days live + CSV export | Performance vs audit trail balance |
| **Session Expiry** | 1 hour | Prevent long-abandoned inventory |
| **Checkout Flow** | Hosted Checkout | PCI compliance, mobile-optimized |
| **Testing** | Test mode + Test Clocks + Stripe CLI | Comprehensive, fast, reliable |
| **Customer Portal** | Stripe Billing Portal | Less code to maintain, PCI compliant |

---

## 11. Additional Implementation Decisions

### Stripe Products/Prices Setup

**Decision**: Manual setup in Stripe Dashboard (document in quickstart)

**Implementation**:
- Create 9 one-time products manually in Stripe Dashboard
- Create 9 subscription products with monthly + annual pricing (18 prices total)
- Document exact setup steps in quickstart.md
- Store all 27 price IDs in environment variables
- Validate price IDs exist on application startup

**Alternative**: Helper script for test mode auto-creation could be added later if needed for developer onboarding.

### Checkout Return Polling Strategy

**Decision**: Poll every 2 seconds for maximum 30 seconds

**Implementation**:

```typescript
async function pollCheckoutStatus(sessionId: string): Promise<'completed' | 'pending' | 'failed'> {
  const maxAttempts = 15; // 30 seconds / 2 seconds
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkSessionStatus(sessionId);

    if (status === 'completed' || status === 'failed') {
      return status;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // After 30s, show "Processing" message
  return 'pending';
}
```

**User Experience**:
- User returns from Stripe → Show loading spinner
- Poll every 2s checking if webhook processed
- If completed within 30s → Show success modal
- If still pending after 30s → Show "Payment processing, you'll receive email confirmation" message

### Past-Due Subscription Handling

**Decision**: Rely on Stripe automatic cancellation

**Implementation**:
- Enable "Cancel subscriptions after all retries fail" in Stripe Dashboard → Billing → Retries
- Stripe automatically moves subscription from `past_due` to `canceled` after retry schedule exhausted
- Listen to `customer.subscription.deleted` webhook to revoke access
- No custom worker needed for cancellation logic

**Grace Period**:
- Stripe Smart Retries: 8 attempts over 2 weeks (recommended configuration)
- During this time, subscription remains `past_due` and credits remain usable (per spec FR-022)
- User receives dunning emails via `invoice.payment_failed` webhook handler

## 12. Implementation Checklist

### Phase 1: Setup
- [ ] Install Stripe SDK (`npm install stripe`)
- [ ] Create Stripe account (test mode)
- [ ] Configure environment variables (test keys)
- [ ] Set up webhook endpoint with signature verification
- [ ] Test webhook delivery with Stripe CLI

### Phase 2: Products/Prices
- [ ] Create 9 one-time package products in Stripe
- [ ] Create 9 subscription plan products (18 prices: monthly + annual)
- [ ] Document all price IDs in environment variables
- [ ] Implement startup validation for price IDs

### Phase 3: Database
- [ ] Add `stripeCustomerId` to users table
- [ ] Create `subscriptions` table
- [ ] Create `checkout_sessions` table
- [ ] Extend `credit_events` types
- [ ] Create `processed_webhook_events` table

### Phase 4: Core Integration
- [ ] Implement checkout session creation (one-time + subscription)
- [ ] Implement webhook handler with signature verification
- [ ] Implement credit allocation logic
- [ ] Implement subscription lifecycle handling
- [ ] Implement upgrade/downgrade/cancel logic

### Phase 5: Testing
- [ ] Unit tests with mocked Stripe SDK
- [ ] Integration tests with Stripe test mode
- [ ] Subscription lifecycle tests with test clocks
- [ ] Webhook processing tests with Stripe CLI
- [ ] E2E tests with Playwright

### Phase 6: Production
- [ ] Switch to live mode API keys
- [ ] Configure production webhook endpoint (requires public URL)
- [ ] Set up monitoring and alerting
- [ ] Test with small real transaction
- [ ] Document rollback procedure

---

## Sources

- [Stripe TypeScript SDK Documentation](https://docs.stripe.com/sdks)
- [Stripe Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions)
- [Stripe Subscriptions Guide](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe Webhooks Best Practices](https://docs.stripe.com/webhooks)
- [Stripe Test Mode Documentation](https://docs.stripe.com/testing)
- [Stripe CLI Reference](https://docs.stripe.com/stripe-cli)
- [Stripe Test Clocks](https://docs.stripe.com/billing/testing/test-clocks)
- [Stripe Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
- [Stripe Billing Portal](https://docs.stripe.com/customer-management)
