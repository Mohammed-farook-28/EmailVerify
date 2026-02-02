# Feature Specification: Billing & Credit Purchases

**Feature Branch**: `003-billing`
**Created**: 2026-02-01
**Status**: Draft
**Input**: Epic 3: Billing & Credit Purchases - Users can purchase one-time credit packages (9 tiers, 1K–1M), subscribe to plans (9 tiers, monthly/annual), upgrade/downgrade, and cancel subscriptions. Payment integration is abstracted to support Stripe or Razorpay. Subscription credits expire at period end with no rollover; one-time credits never expire. Credit transaction history is viewable. Payment success/failure communicated via modals.

## Clarifications

### Session 2026-02-01

- Q: Which billing operations require structured logging and alerting? → A: Log all successful payments, subscription changes, and credit allocations (INFO level) + Alert on all failures/webhooks not processed within 5 minutes (ERROR level)
- Q: What additional security measures should protect the webhook endpoint? → A: Signature verification only (no additional rate limiting for now)
- Q: How long should credit transaction history be retained? → A: 7 years - Standard financial records retention period for tax/accounting compliance
- Q: How should the system handle multiple open checkout sessions from the same user? → A: Allow multiple sessions but auto-expire older incomplete sessions after 1 hour - Standard payment provider session timeout
- Q: Should there be a maximum pagination depth limit for transaction history queries? → A: Limit live queries to last 90 days, provide separate CSV export for older transactions (balances performance with compliance)
- Q: Which payment provider should we implement first for the billing system? → A: Stripe (industry standard with excellent TypeScript SDK and comprehensive webhook system)
- Q: What granularity should be used for proration when users upgrade their subscription plan mid-cycle? → A: No proration - charge full new tier immediately (simplest approach)
- Q: How should the system handle webhook processing failures? → A: Rely on payment provider retries only (Stripe automatically retries for 3 days with exponential backoff)
- Q: How many credits should each subscription plan tier provide per month? → A: Define during pricing configuration phase (schema supports any amounts, exact values determined when creating Stripe products)

## User Scenarios & Testing

### User Story 1 - One-Time Credit Purchase (Priority: P1)

As a user who occasionally verifies emails, I want to buy credit packages when I need them, so that I can verify emails without committing to a subscription.

**Why this priority**: This is the simplest purchase flow and generates immediate revenue. Users can start spending without subscription commitment, reducing friction for new customers.

**Independent Test**: Can be fully tested by selecting a credit package, completing checkout, and verifying credits appear in balance. Delivers standalone value - users can verify emails immediately after purchase.

**Acceptance Scenarios**:

1. **Given** I am on the billing page, **When** I select a credit package (e.g., 10K credits) and click purchase, **Then** I am redirected to a secure payment page hosted by the payment provider
2. **Given** I complete payment successfully, **When** I return to the platform, **Then** my credit balance increases by the purchased amount and a success modal displays
3. **Given** I cancel payment on the provider's page, **When** I return to the platform, **Then** no credits are added and I see a cancellation message
4. **Given** payment fails (e.g., card declined), **When** I return to the platform, **Then** no credits are added and I see an error modal with retry option
5. **Given** the payment webhook arrives before I return to the platform, **When** I navigate back, **Then** credits are already available in my balance
6. **Given** I am a new user with no payment profile, **When** I make my first purchase, **Then** a customer record is created automatically at the payment provider

---

### User Story 2 - Subscription Plan Purchase (Priority: P1)

As a user with consistent verification needs, I want to subscribe to a monthly or annual plan, so that I receive credits automatically each period without manual purchases.

**Why this priority**: Subscriptions provide predictable recurring revenue and are core to the business model. Equal priority to one-time purchases as both are essential payment flows.

**Independent Test**: Can be fully tested by subscribing to a plan, verifying credits allocation, waiting for renewal period, and confirming automatic credit refresh. Delivers standalone value - users get predictable credit allocation.

**Acceptance Scenarios**:

1. **Given** I am on the plans page, **When** I select a plan (e.g., Professional) and billing cycle (monthly/annual), **Then** I am redirected to checkout
2. **Given** I complete subscription payment successfully, **When** I return to the platform, **Then** my subscription shows as active with period dates and credits are allocated
3. **Given** my subscription renews, **When** the new billing period starts, **Then** new credits are allocated and old subscription credits expire
4. **Given** I already have an active subscription, **When** I try to purchase another subscription, **Then** I receive an error indicating I must cancel or change my current plan first
5. **Given** my subscription payment fails at renewal, **When** the payment provider retries fail, **Then** my subscription status shows "past_due" and I receive an email notification
6. **Given** annual billing is selected, **When** I complete checkout, **Then** I receive 50% discount compared to monthly billing cost × 12

---

### User Story 3 - Subscription Management (Priority: P2)

As a subscriber, I want to upgrade, downgrade, or cancel my plan, so that I can adjust my service level as my needs change.

**Why this priority**: Important for customer retention and revenue optimization, but depends on having an active subscription first (User Story 2).

**Independent Test**: Can be fully tested by creating a subscription, changing plans (up/down), cancelling, and reactivating. Delivers standalone value - users maintain control over their subscription lifecycle.

**Acceptance Scenarios**:

1. **Given** I have an active subscription, **When** I upgrade to a higher tier plan, **Then** the upgrade applies immediately, I am charged the full price of the new tier, and receive the new tier's full credit allocation instantly
2. **Given** I have an active subscription, **When** I downgrade to a lower tier plan, **Then** the change is scheduled for the next billing cycle and my current period credits remain unchanged
3. **Given** I have an active subscription, **When** I cancel my subscription, **Then** the cancellation is scheduled for period end (not immediate), credits remain usable until period ends, and subscription shows "cancelling" status
4. **Given** I cancelled my subscription but it hasn't ended yet, **When** I reactivate, **Then** the cancellation is reversed and subscription continues normally
5. **Given** I upgrade during a cancellation period, **When** the upgrade completes, **Then** the subscription reactivates at the new tier
6. **Given** my subscription is in past_due status, **When** I try to change plans, **Then** I am prompted to update payment method first and plan changes are blocked

---

### User Story 4 - Credit Transaction History (Priority: P2)

As a user, I want to view a complete record of all credit transactions, so that I can track my spending and understand credit expiry rules.

**Why this priority**: Important for transparency and user trust, but secondary to the actual purchase flows.

**Independent Test**: Can be fully tested by performing various credit transactions (purchases, verifications, refunds) and verifying they appear in history with correct details. Delivers standalone value - users can audit their credit usage.

**Acceptance Scenarios**:

1. **Given** I have performed various credit transactions, **When** I view the billing page, **Then** I see recent transactions (last 10) with date, type, amount, and resulting balance
2. **Given** I want to see full transaction history, **When** I navigate to transaction history or paginate, **Then** I see all transactions sorted by date (newest first)
3. **Given** my subscription period ended, **When** I view transaction history, **Then** I see an "expire" entry for unused subscription credits
4. **Given** I have one-time purchased credits, **When** time passes (days, months, years), **Then** those credits never expire and remain in my balance
5. **Given** I have both subscription and one-time credits, **When** I perform verifications, **Then** subscription credits are consumed first (FIFO by type)
6. **Given** I want to understand a transaction, **When** I view its details, **Then** I see type badge (color-coded), description, reference ID (job ID, invoice ID, etc.), and balance after transaction

---

### User Story 5 - Pricing Display & Package Selection (Priority: P3)

As a potential customer, I want to see all available credit packages and subscription plans with clear pricing, so that I can choose the best option for my needs.

**Why this priority**: Essential for user decision-making but lower priority as it's primarily UI presentation that supports the core purchase flows.

**Independent Test**: Can be fully tested by viewing pricing pages, comparing plans, seeing discounts, and understanding tier differences. Delivers standalone value - users can make informed purchasing decisions.

**Acceptance Scenarios**:

1. **Given** I am on the landing page or billing section, **When** I view pricing, **Then** I see 9 credit packages (1K-1M) with progressive discounts clearly displayed
2. **Given** I am comparing subscription plans, **When** I toggle between monthly and annual billing, **Then** I see annual pricing at 50% discount
3. **Given** I am viewing plans, **When** I see the plan tiers (Starter through Titan), **Then** each shows credits per period, price, and key features
4. **Given** I want to compare packages, **When** I view the package grid, **Then** popular packages are highlighted
5. **Given** I am already subscribed to a plan, **When** I view pricing, **Then** my current plan is highlighted and same-tier selections are disabled

---

### Edge Cases

- **Webhook timing**: What happens when payment webhook arrives before user returns from checkout? (Credits should be available immediately when user returns, polling may be needed for slow webhooks)
- **Duplicate webhooks**: How does system handle the same webhook event ID multiple times? (Idempotency via unique event ID prevents duplicate credit allocation)
- **Payment provider downtime**: What happens when checkout creation fails due to provider unavailability? (Return 503 error with retry guidance, no charge to user)
- **Session expiry**: What happens when user doesn't complete checkout and session expires? (Session expires at provider, no credits allocated, user can retry)
- **Multiple checkout sessions**: What happens when user opens multiple checkout tabs/windows without completing any? (Multiple sessions allowed, older incomplete sessions auto-expire after 1 hour via payment provider timeout)
- **Concurrent operations**: What happens when reconciliation runs while credits are being purchased? (Locks prevent race conditions, reconciliation skips locked users)
- **Mixed credit types**: How are subscription and one-time credits consumed? (Subscription credits consumed first via FIFO by type)
- **Zero balance expiry**: What happens when all subscription credits expire but balance is 0? (No expiry event needed, just period end recorded)
- **Failed renewal with usage**: What happens when renewal fails but user still has credits? (Subscription goes to past_due, existing credits remain usable, user notified via email)
- **Large transaction history**: How does pagination work with 10,000+ transactions? (Live queries limited to last 90 days with server-side pagination at 20 items per page; older transactions accessible via CSV export)
- **Annual to monthly downgrade**: What happens to the remaining prepaid annual period? (Downgrade scheduled for next billing cycle, current annual period honored)
- **Upgrade during past_due**: What happens when user tries to upgrade while payment method is failing? (Blocked - must update payment method first)
- **Customer deletion**: What happens when a customer record must be deleted at the payment provider? (Handle via webhook, archive locally, prevent new purchases until recreated)

## Requirements

### Functional Requirements

- **FR-001**: System MUST support 9 one-time credit package tiers (1K, 2K, 5K, 10K, 25K, 50K, 100K, 500K, 1M) with progressive discount pricing
- **FR-002**: System MUST support 9 subscription plan tiers (Starter, Popular, Professional, Business, Enterprise, Premium, Ultimate, Mega, Titan) with monthly and annual billing cycles
- **FR-003**: System MUST offer annual billing at 50% discount compared to monthly billing
- **FR-004**: System MUST create checkout sessions via payment provider's hosted checkout API for both one-time and subscription purchases
- **FR-005**: System MUST verify webhook signatures from payment provider before processing any payment events
- **FR-006**: System MUST allocate credits atomically (Redis INCRBY + PostgreSQL INSERT) after successful payment webhook
- **FR-007**: System MUST prevent duplicate credit allocation via idempotency keys tied to payment provider event IDs
- **FR-008**: System MUST create customer records at payment provider on first purchase if none exists
- **FR-009**: System MUST track subscription status (active, past_due, cancelling, expired) and period dates
- **FR-010**: System MUST allocate new credits and expire old credits when subscription renews
- **FR-011**: System MUST support immediate upgrades charging full price of new tier with instant allocation of new tier's full credit amount (no proration)
- **FR-012**: System MUST schedule downgrades for next billing cycle while preserving current period credits
- **FR-013**: System MUST support subscription cancellation at period end (not immediate) with credits remaining usable
- **FR-014**: System MUST support subscription reactivation if cancellation hasn't taken effect yet
- **FR-015**: System MUST expire unused subscription credits at period end with no rollover
- **FR-016**: System MUST never expire one-time purchased credits
- **FR-017**: System MUST consume subscription credits before one-time credits (FIFO by type)
- **FR-018**: System MUST record all credit transactions (purchase, subscription, deduct, refund, expire, signup_bonus, subscription_upgrade) in credit_events table
- **FR-019**: System MUST return current plan info, credit balance, and recent transactions on billing page load
- **FR-020**: System MUST provide paginated transaction history with server-side pagination (20 items per page) limited to the last 90 days for live queries
- **FR-021**: System MUST send email notifications via Resend when subscription payment fails
- **FR-022**: System MUST block plan changes when subscription is in past_due status
- **FR-023**: System MUST display payment success modal after successful checkout return
- **FR-024**: System MUST display payment failure modal with retry option after failed checkout
- **FR-025**: System MUST support polling checkout session status when webhook is delayed
- **FR-026**: System MUST implement Stripe as the payment provider, using PaymentProvider interface abstraction to enable future Razorpay support
- **FR-027**: System MUST store payment provider customer ID on users table (payment_customer_id field)
- **FR-028**: System MUST return 503 error with retry guidance when payment provider is unavailable
- **FR-029**: System MUST return 409 error when user attempts to create second subscription while one is active
- **FR-030**: System MUST provide public endpoint to fetch all packages and plans for landing page pricing display
- **FR-031**: System MUST retain credit transaction history for 7 years to meet financial records compliance requirements for tax and accounting purposes
- **FR-032**: System MUST allow users to create multiple concurrent checkout sessions, with incomplete sessions automatically expiring after 1 hour via payment provider timeout mechanism
- **FR-033**: System MUST provide CSV export functionality for transaction history older than 90 days to maintain access to full 7-year audit trail while optimizing live query performance
- **FR-034**: System MUST rely on Stripe's automatic webhook retry mechanism (3-day retry period with exponential backoff) for handling webhook processing failures, logging failures for monitoring without implementing custom retry logic

### Key Entities

- **Credit Package**: Represents a one-time credit purchase tier with credits amount, price in cents, price per credit, and popular flag. Nine tiers ranging from 1K to 1M credits.
- **Subscription Plan**: Represents a recurring billing plan with plan name, monthly price, annual price, credits per month, feature list, and popular flag. Nine tiers from Starter to Titan.
- **Subscription**: Represents an active user subscription with plan details, billing cycle, status (active/past_due/cancelling/expired), period dates, and cancellation flag. One active subscription per user maximum.
- **Credit Transaction**: Represents a single credit event with type (purchase/subscription/deduct/refund/expire/signup_bonus/subscription_upgrade), amount (positive or negative), balance after transaction, description, reference ID, and timestamp. Complete audit trail of all credit movements. Retained for 7 years for compliance with financial records requirements.
- **Checkout Session**: Represents a payment provider checkout flow with session ID, user ID, type (one_time/subscription), package/plan ID, status (pending/completed/failed/expired), and creation timestamp. Tracks payment flow completion. Multiple concurrent sessions allowed per user; incomplete sessions auto-expire after 1 hour.
- **Customer Record**: Represents user's profile at payment provider with customer ID, user mapping, payment methods, and billing history. Created on first purchase, used for all subsequent transactions.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can complete one-time credit purchase in under 3 minutes from package selection to credit availability
- **SC-002**: Users can subscribe to a plan and receive allocated credits within 2 minutes of payment confirmation
- **SC-003**: 95% of checkout sessions complete successfully when payment succeeds
- **SC-004**: Zero duplicate credit allocations occur even when webhooks are delivered multiple times
- **SC-005**: Plan upgrades apply within 30 seconds with full new tier charge and immediate credit allocation
- **SC-006**: Plan downgrades schedule correctly for next billing cycle in 100% of cases
- **SC-007**: Subscription credits expire accurately at period end with zero rollover
- **SC-008**: One-time credits never expire regardless of time elapsed
- **SC-009**: Transaction history loads within 1 second for users with up to 10,000 transactions
- **SC-010**: Payment failure notifications are sent within 5 minutes of renewal failure
- **SC-011**: System architecture supports future addition of Razorpay alongside Stripe through PaymentProvider interface without business logic changes
- **SC-012**: Users can cancel and reactivate subscriptions within their current period successfully
- **SC-013**: 90% of users successfully complete their intended purchase action on first attempt
- **SC-014**: Reduce billing-related support tickets by 60% through clear pricing, transaction history, and error messages

## Non-Functional Requirements

### Observability

- **NFR-001**: System MUST log all successful payment events (one-time purchases, subscription creations, renewals, upgrades, downgrades, cancellations) at INFO level with structured fields: user ID, transaction type, amount, payment provider transaction ID, timestamp
- **NFR-002**: System MUST log all credit allocation events (purchase credits added, subscription credits added, credits expired, refunds) at INFO level with structured fields: user ID, credit type, amount, balance after, reference ID, timestamp
- **NFR-003**: System MUST log all subscription state changes (active→past_due, cancelling→active, active→expired) at INFO level with structured fields: user ID, plan name, old status, new status, timestamp
- **NFR-004**: System MUST alert (ERROR level) when payment webhooks fail processing or are not processed within 5 minutes of receipt with fields: webhook event ID, event type, error message, retry count
- **NFR-005**: System MUST alert (ERROR level) when checkout session creation fails due to payment provider errors with fields: user ID, package/plan ID, provider error code, timestamp

### Security

- **NFR-006**: Webhook endpoint security relies on signature verification only (as specified in FR-005) for this phase; no additional rate limiting, IP whitelisting, or replay attack prevention required
- **NFR-007**: System MUST reject webhooks with invalid or missing signatures and log rejection attempts at WARN level

### Performance

- **NFR-008**: Transaction history live queries MUST be limited to the last 90 days to prevent slow deep pagination queries on large datasets
- **NFR-009**: Transaction history pagination MUST return results within 500ms for queries within the 90-day window at 20 items per page
- **NFR-010**: CSV export for transactions older than 90 days MUST complete within 30 seconds for up to 50,000 transactions
