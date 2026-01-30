# Epic 3: Billing & Credit Purchases

## Epic Goal

Users can purchase one-time credit packages (9 tiers, 1K–1M), subscribe to plans (9 tiers, monthly/yearly), upgrade/downgrade, and cancel subscriptions. Payment integration is abstracted to support Stripe or Razorpay. Subscription credits expire at period end with no rollover; one-time credits never expire. Credit transaction history is viewable. Payment success/failure communicated via modals.

**FRs covered:** FR24, FR25, FR26, FR27, FR30, FR50, FR55, FR56, FR64
**Dependencies:** Epic 1 (users, sessions), Epic 2 (credit system, credit_events table)

---

## Story 3.1: Payment Provider Integration & One-Time Credit Purchases

As a user,
I want to buy credit packages through a secure checkout,
So that I can verify more emails beyond my free allocation.

**FRs:** FR24, FR55, FR64 | **NFRs:** NFR34

**Acceptance Criteria:**

**Given** a signed-in user on /home/billing
**When** they select a credit package (9 tiers: 1K, 2K, 5K, 10K, 25K, 50K, 100K, 500K, 1M)
**Then** a checkout session is created via the payment provider's hosted checkout
**And** the user is redirected to the provider's payment page

**Given** a successful payment
**When** the payment provider sends a webhook notification (checkout completed)
**Then** the webhook signature is verified
**And** credits are allocated atomically (Redis INCRBY + credit_events INSERT type='purchase')
**And** the user is redirected to /home/billing?success=true
**And** a success modal is displayed

**Given** a failed or cancelled payment
**When** the user returns to the billing page
**Then** a failure modal is displayed with retry option
**And** no credits are allocated

**Edge Cases:**
- Webhook arrives before redirect → credits available immediately when user returns
- Webhook arrives after redirect → polling or short delay before credits appear
- Duplicate webhook (same event ID) → idempotent processing via credit_events.idempotency_key
- Payment provider downtime → show maintenance message on billing page

**Technical Context:**
- Payment provider: TBD (Stripe or Razorpay) — architecture Section 10
- Abstraction: payment provider interface so core billing logic is provider-agnostic (NFR34)
- Tables: `subscriptions` (architecture Section 12) — also used for subscription state
- Webhook endpoint: `POST /home/billing/webhook` — verify signature, process idempotently
- Payment event idempotency: provider event ID used as idempotency_key in credit_events
- Customer mapping: provider customer ID stored on `users.stripe_customer_id` (field name may change)
- UI screens: `docs/figma/settings/spec.md` — Billing page, credit packages
- Modal screens: `docs/figma/error-states/spec.md` — Payment success/failure modals
- Credit packages: 9 tiers with progressive discount (up to 93% at 1M) — pricing TBD

---

## Story 3.2: Subscription Plans & Recurring Billing

As a user,
I want to subscribe to a monthly or yearly plan,
So that I receive credits automatically each period without manual purchases.

**FRs:** FR25, FR56 | **NFRs:** NFR34

**Acceptance Criteria:**

**Given** a signed-in user on /home/billing
**When** they select a subscription plan (9 tiers: Starter through Titan) and billing cycle (monthly or yearly)
**Then** a checkout session is created in subscription mode
**And** the user is redirected to the hosted checkout page

**Given** a successful subscription creation
**When** the payment provider sends checkout.completed + invoice.paid webhooks
**Then** a subscription record is created (plan_name, credits_per_period, billing_cycle, status='active', period dates)
**And** the initial credit allocation is applied (Redis + credit_events type='subscription')

**Given** a subscription renewal
**When** the payment provider sends an invoice.paid webhook
**Then** credits for the new period are allocated
**And** current_period_start and current_period_end are updated

**Given** a failed renewal payment
**When** the payment provider sends an invoice.payment_failed webhook
**Then** subscription status is set to 'past_due'
**And** the user is notified via email
**And** existing credits remain usable

**Edge Cases:**
- User already has an active subscription → prevent duplicate, show current plan
- Yearly billing at 50% discount — pricing handled by payment provider product/price config
- Webhook processing order: checkout.completed may arrive before invoice.paid → handle both independently

**Technical Context:**
- Subscription tiers: Starter, Popular, Professional, Business, Enterprise, Premium, Ultimate, Mega, Titan
- Billing cycles: monthly, yearly (yearly at 50% discount)
- Architecture Section 10 — Subscription flow, lifecycle events
- Webhook events to handle: checkout.session.completed, invoice.paid, invoice.payment_failed
- Subscription table: architecture Section 12 (subscriptions table)
- UI screens: `docs/figma/settings/spec.md` — Plan selection, billing cycle toggle

---

## Story 3.3: Subscription Management (Upgrade, Downgrade, Cancel)

As a subscriber,
I want to change or cancel my plan,
So that I can adjust my service level as my needs change.

**FRs:** FR26, FR27 | **NFRs:** NFR34

**Acceptance Criteria:**

**Given** a user with an active subscription
**When** they select an upgrade to a higher-tier plan
**Then** the upgrade is applied immediately
**And** the charge is prorated for the remaining period
**And** the difference in credits is added instantly

**Given** a user with an active subscription
**When** they select a downgrade to a lower-tier plan
**Then** the downgrade is scheduled for the next billing cycle
**And** current period credits remain unchanged
**And** the user sees a confirmation of the pending change

**Given** a user cancelling their subscription
**When** they confirm cancellation on /home/billing
**Then** the subscription is set to cancel_at_period_end (not immediate)
**And** credits remain usable until current_period_end
**And** after period ends: subscription status → 'expired', no new credits allocated

**Given** a user who cancelled but period hasn't ended
**When** they choose to reactivate
**Then** the cancellation is reversed
**And** the subscription continues as before

**Edge Cases:**
- Upgrade during cancellation period → reactivates subscription at new tier
- Downgrade + cancel in same period → cancellation takes precedence
- Plan change webhook (customer.subscription.updated) → update subscription record

**Technical Context:**
- Architecture Section 10 — Plan Changes (upgrade: immediate + prorate; downgrade: next cycle)
- Cancellation: cancel_at_period_end pattern (architecture Section 10)
- Reactivation: reverse cancellation before period end
- UI screens: `docs/figma/settings/spec.md` — Current plan display, change plan, cancel subscription

---

## Story 3.4: Credit Expiry & Transaction History

As a user,
I want to see my credit transaction history and understand credit expiry rules,
So that I can track my spending and plan purchases.

**FRs:** FR30, FR50

**Acceptance Criteria:**

**Given** a user with subscription credits
**When** the subscription period ends
**Then** unused subscription credits expire (balance_after adjusted)
**And** a credit_event is recorded (type='expire')
**And** the user is notified if significant credits expired

**Given** a user with one-time purchased credits
**When** any amount of time passes
**Then** one-time credits never expire — they remain indefinitely

**Given** a signed-in user on the billing page
**When** they view their credit transaction history
**Then** all transactions are listed: purchases, subscription allocations, deductions, refunds, expirations
**And** each entry shows: date, type, amount, balance_after, reference (job ID, invoice, etc.)
**And** the list is paginated and sorted by most recent first

**Edge Cases:**
- Mixed credits (subscription + one-time) → subscription credits consumed first (FIFO by type)
- Credit expiry job runs at period end — slight delay acceptable
- Large transaction history (10K+ entries) → server-side pagination

**Technical Context:**
- Credit expiry: architecture Section 10 — subscription credits expire at current_period_end
- No rollover: PRD Section "Subscription Tiers"
- Transaction history: credit_events table with type, amount, balance_after, reference_type/id
- UI screens: `docs/figma/credit-history/spec.md` — Credit transaction history
- Page spec: `docs/pages/06-billing.md` — billing and credit display
- API: `GET /home/billing` returns plan info + recent transactions
