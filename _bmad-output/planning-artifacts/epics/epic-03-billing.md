# Epic 3: Billing & Credit Purchases

## Epic Goal

Users can purchase one-time credit packages (9 tiers, 1K–1M), subscribe to plans (9 tiers, monthly/annual), upgrade/downgrade, and cancel subscriptions. Payment integration is abstracted to support Stripe or Razorpay. Subscription credits expire at period end with no rollover; one-time credits never expire. Credit transaction history is viewable. Payment success/failure communicated via modals.

**FRs covered:** FR24, FR25, FR26, FR27, FR30, FR50, FR55, FR56, FR64
**Dependencies:** Epic 1 (users, sessions), Epic 2 (credit system, credit_events table)

---

# Backend Stories

## Story 3.1: Payment Provider Integration & One-Time Credit Purchases

As a user,
I want to buy credit packages through a secure checkout,
So that I can verify more emails beyond my free allocation.

**FRs:** FR24, FR55, FR64 | **NFRs:** NFR34

**Acceptance Criteria:**

**Given** a POST to `/home/billing/checkout` with `{ type: "one_time", packageId }` and valid session
**When** the package ID maps to a valid credit tier (1K, 2K, 5K, 10K, 25K, 50K, 100K, 500K, 1M)
**Then** a checkout session is created via the payment provider's hosted checkout API
**And** the response returns 200 with `{ checkoutUrl }` for the frontend to redirect to

**Given** a successful payment
**When** the payment provider sends a webhook to `POST /home/billing/webhook` (checkout completed)
**Then** the webhook signature is verified (HMAC or provider-specific validation)
**And** credits are allocated atomically (Redis INCRBY + credit_events INSERT type='purchase')
**And** the idempotency_key is set to the provider's event ID (prevents duplicate processing)

**Given** a failed or cancelled payment
**When** the webhook indicates failure or the user returns without completing
**Then** no credits are allocated
**And** the checkout session is marked as expired/cancelled in the provider

**Edge Cases:**
- Webhook arrives before frontend redirect → credits available immediately when user returns
- Webhook arrives after frontend redirect → frontend polls `GET /home/billing/status/:sessionId` until confirmed
- Duplicate webhook (same event ID) → idempotent via credit_events.idempotency_key UNIQUE constraint
- Payment provider downtime → `POST /home/billing/checkout` returns 503 with retry guidance
- User has no provider customer ID yet → create customer on first checkout

**Technical Context:**
- Payment provider: TBD (Stripe or Razorpay) — architecture Section 10
- Abstraction layer: `PaymentProvider` interface with `createCheckout()`, `verifyWebhook()`, `getSession()` methods
- Customer mapping: provider customer ID stored on `users.payment_customer_id` (not `stripe_customer_id` — abstracted per Decision #5)
- Webhook endpoint: `POST /home/billing/webhook` — verify signature, process idempotently
- Credit packages: 9 tiers with progressive discount — exact pricing TBD
- Endpoints: `POST /home/billing/checkout`, `POST /home/billing/webhook`, `GET /home/billing/status/:sessionId`

---

## Story 3.2: Subscription Plans & Recurring Billing

As a user,
I want to subscribe to a monthly or annual plan,
So that I receive credits automatically each period without manual purchases.

**FRs:** FR25, FR56 | **NFRs:** NFR34

**Acceptance Criteria:**

**Given** a POST to `/home/billing/checkout` with `{ type: "subscription", planId, billingCycle: "monthly"|"annual" }` and valid session
**When** the plan maps to a valid tier (Starter through Titan)
**Then** a subscription checkout session is created
**And** the response returns 200 with `{ checkoutUrl }`

**Given** a successful subscription creation
**When** the provider sends checkout.completed + invoice.paid webhooks
**Then** a `subscriptions` record is created (plan_name, credits_per_period, billing_cycle, status='active', period dates)
**And** initial credit allocation is applied (Redis INCRBY + credit_events type='subscription')

**Given** a subscription renewal
**When** the provider sends an invoice.paid webhook for an existing subscription
**Then** credits for the new period are allocated
**And** `current_period_start` and `current_period_end` are updated
**And** expired credits from previous period are removed (credit_events type='expire')

**Given** a failed renewal payment
**When** the provider sends an invoice.payment_failed webhook
**Then** subscription status is set to 'past_due'
**And** the user is notified via Resend email
**And** existing credits remain usable during past_due

**Edge Cases:**
- User already has an active subscription → 409 with current plan details
- Annual billing at 50% discount — pricing handled by provider product/price config
- Webhook processing order: checkout.completed before invoice.paid → handle independently
- Free tier user subscribing → seamless upgrade, no conflict

**Technical Context:**
- Subscription tiers: Starter, Popular, Professional, Business, Enterprise, Premium, Ultimate, Mega, Titan
- Billing cycles: monthly, annual (annual at 50% discount)
- Architecture Section 10 — Subscription lifecycle
- Webhook events: checkout.session.completed, invoice.paid, invoice.payment_failed
- Table: `subscriptions` (architecture Section 12)

---

## Story 3.3: Subscription Management (Upgrade, Downgrade, Cancel)

As a subscriber,
I want to change or cancel my plan,
So that I can adjust my service level as my needs change.

**FRs:** FR26, FR27 | **NFRs:** NFR34

**Acceptance Criteria:**

**Given** a POST to `/home/billing/subscription/change` with `{ newPlanId }` and valid session
**When** the new plan is higher tier than current (upgrade)
**Then** the upgrade is applied immediately via the payment provider API
**And** the charge is prorated for the remaining period
**And** the difference in credits is added instantly (Redis INCRBY + credit_events type='subscription_upgrade')
**And** `subscriptions` record is updated with new plan_name and credits_per_period

**Given** the new plan is lower tier (downgrade)
**When** the request is processed
**Then** the downgrade is scheduled for the next billing cycle via the provider API
**And** current period credits remain unchanged
**And** response returns 200 with `{ effectiveDate: current_period_end }`

**Given** a POST to `/home/billing/subscription/cancel` with valid session
**When** the user confirms cancellation
**Then** the subscription is set to `cancel_at_period_end` via the provider API (not immediate)
**And** credits remain usable until `current_period_end`
**And** after period ends: status → 'expired', no new credits allocated

**Given** a POST to `/home/billing/subscription/reactivate` with valid session
**When** the subscription is in cancellation-pending state (period hasn't ended)
**Then** the cancellation is reversed via the provider API
**And** subscription continues normally

**Edge Cases:**
- Upgrade during cancellation period → reactivates at new tier
- Downgrade + cancel in same period → cancellation takes precedence
- Webhook: customer.subscription.updated → update subscription record in DB
- Subscription in past_due state → block plan changes, prompt payment update

**Technical Context:**
- Architecture Section 10 — Plan Changes (upgrade: immediate + prorate; downgrade: next cycle)
- Cancellation: cancel_at_period_end pattern
- Endpoints: `POST /home/billing/subscription/change`, `POST /home/billing/subscription/cancel`, `POST /home/billing/subscription/reactivate`

---

## Story 3.4: Credit Expiry & Transaction History

As a user,
I want a complete record of all credit transactions and understand expiry rules,
So that I can track spending and plan purchases.

**FRs:** FR30, FR50

**Acceptance Criteria:**

**Given** a subscription period ends
**When** the period-end job runs (triggered by webhook or cron)
**Then** unused subscription credits expire (credit_events INSERT type='expire', negative amount)
**And** Redis balance is decremented accordingly

**Given** one-time purchased credits exist
**When** any amount of time passes
**Then** one-time credits never expire — they remain indefinitely

**Given** a GET to `/home/billing` with valid session
**When** the request is processed
**Then** the response includes:
- Current plan info (name, status, period dates, credits_per_period) or null if no subscription
- Credit balance (from Redis)
- Transaction history: paginated list of credit_events

**Given** a GET to `/home/billing/transactions?page=1&limit=20`
**When** the request is processed
**Then** returns paginated credit_events sorted by `created_at DESC`
**And** each entry includes: id, date, type, amount, balance_after, description, reference

**Edge Cases:**
- Mixed credits (subscription + one-time) → subscription credits consumed first (FIFO by type)
- Credit expiry job runs at period end — slight delay acceptable
- Large transaction history (10K+) → server-side pagination with cursor
- Zero-balance expiry → no expiry event needed

**Technical Context:**
- Credit expiry: architecture Section 10 — subscription credits expire at current_period_end
- No rollover between periods
- credit_events types: 'purchase', 'subscription', 'deduct', 'refund', 'expire', 'signup_bonus', 'subscription_upgrade'
- Endpoints: `GET /home/billing`, `GET /home/billing/transactions`

---

# API Contract

## Billing Endpoints

### `GET /home/billing`

**Auth:** Session cookie

```json
// Response 200
{
  "subscription": {
    "id": "string",
    "planName": "string (e.g. 'Professional')",
    "creditsPerPeriod": "number",
    "billingCycle": "monthly | annual",
    "status": "active | past_due | cancelling | expired",
    "currentPeriodStart": "string (ISO 8601)",
    "currentPeriodEnd": "string (ISO 8601)",
    "cancelAtPeriodEnd": "boolean"
  } | null,
  "credits": "number (current balance)",
  "recentTransactions": [
    {
      "id": "string",
      "date": "string (ISO 8601)",
      "type": "purchase | subscription | deduct | refund | expire | signup_bonus",
      "amount": "number (positive = credit, negative = debit)",
      "balance": "number (balance after this transaction)",
      "description": "string (human-readable)",
      "reference": "string | null (job ID, invoice ID, etc.)"
    }
  ]
}
```

### `GET /home/billing/transactions`

**Auth:** Session cookie

```json
// Request query params: ?page=1&limit=20

// Response 200
{
  "transactions": [ /* same shape as recentTransactions above */ ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `POST /home/billing/checkout`

**Auth:** Session cookie

```json
// Request (one-time purchase)
{
  "type": "one_time",
  "packageId": "string (e.g. 'credits_10k')"
}

// Request (subscription)
{
  "type": "subscription",
  "planId": "string (e.g. 'professional')",
  "billingCycle": "monthly | annual"
}

// Response 200
{
  "checkoutUrl": "string (payment provider hosted checkout URL)",
  "sessionId": "string (for polling status)"
}

// Error 409
{ "error": "Active subscription already exists" }
```

### `GET /home/billing/status/:sessionId`

**Auth:** Session cookie

```json
// Response 200
{
  "status": "pending | completed | failed | expired",
  "credits": "number (current balance, if completed)"
}
```

### `POST /home/billing/subscription/change`

**Auth:** Session cookie

```json
// Request
{ "newPlanId": "string" }

// Response 200 (upgrade — immediate)
{
  "subscription": { /* updated subscription object */ },
  "creditsAdded": "number",
  "credits": "number (new balance)"
}

// Response 200 (downgrade — scheduled)
{
  "subscription": { /* current subscription with pending change */ },
  "effectiveDate": "string (ISO 8601)",
  "message": "Downgrade will take effect at the end of your current billing period"
}
```

### `POST /home/billing/subscription/cancel`

**Auth:** Session cookie

```json
// Response 200
{
  "subscription": { /* subscription with cancelAtPeriodEnd: true */ },
  "message": "Your subscription will end on {currentPeriodEnd}. Credits remain usable until then."
}
```

### `POST /home/billing/subscription/reactivate`

**Auth:** Session cookie

```json
// Response 200
{
  "subscription": { /* subscription with cancelAtPeriodEnd: false */ },
  "message": "Subscription reactivated"
}

// Error 400
{ "error": "Subscription is not in cancellation state" }
```

### `POST /home/billing/webhook`

**Auth:** Payment provider signature verification (not session cookie)

```json
// Request: raw body from payment provider
// Headers: provider-specific signature headers

// Response 200
{ "received": true }

// Response 400
{ "error": "Invalid signature" }
```

### `GET /home/billing/packages`

**Auth:** None (public — for landing page pricing)

```json
// Response 200
{
  "packages": [
    {
      "id": "string",
      "credits": "number",
      "price": "number (in cents)",
      "pricePerCredit": "number",
      "popular": "boolean"
    }
  ],
  "plans": [
    {
      "id": "string",
      "name": "string",
      "monthlyPrice": "number (in cents)",
      "annualPrice": "number (in cents)",
      "creditsPerMonth": "number",
      "features": ["string"],
      "popular": "boolean"
    }
  ]
}
```

## Frontend Type Mismatches

| Frontend Type | Current Value | Backend Value | Resolution |
|---------------|--------------|---------------|------------|
| `CreditTransaction.type` | `"purchase" \| "usage" \| "refund" \| "bonus"` | `"purchase" \| "subscription" \| "deduct" \| "refund" \| "expire" \| "signup_bonus" \| "subscription_upgrade"` | **Frontend must update** to match all backend types |
| `CreditTransaction.balance` | `number` | `balance_after` (same semantics) | Compatible (rename in mapping) |
| `PricingPlan.price` | `number (dollars)` | Separate `monthlyPrice` / `annualPrice` (in cents) | **Frontend must update** — split into two price fields, convert from cents to dollars for display |
| `PricingPlan.period` | `"monthly" \| "yearly"` | `"monthly" \| "annual"` (Decision #4) | **Frontend must update** — rename `yearly` → `annual`, toggle shows monthly vs annual from same plan object |
| `CreditHistoryEntry` | `{ reason, change }` | `{ description, amount, type, reference }` | **Frontend must rename** `reason` → `description`, `change` → `amount`; **add** `type` and `reference` fields |
| `CreditPackage` | Flat structure | Matches well | Compatible |
| `CreditHistoryEntry.reason` | `string` | `description` field | Compatible (rename in mapping) |
| `CreditHistoryEntry.change` | `number` | `amount` (positive/negative) | Compatible (rename in mapping) |

> **Architecture gap:** `users.stripe_customer_id` in `docs/architecture.md` must be renamed to `payment_customer_id` to reflect the payment provider abstraction (Decision #5). Similarly, any `stripe_session_id` references should become `payment_session_id`. Update architecture Section 12.
>
> **Frontend Reality Notes (verified against source):**
> - `PriceSummary` component (`billing/price-summary.tsx`) is **entirely static** — all prices are hardcoded, not driven by props or API data
> - `PaymentSuccessModal` (`modals/payment-success-modal.tsx`) exists but is **never rendered** on any billing page
> - `PaymentFailedModal` retry button has **no onClick handler** — purely visual
> - `PackageGrid` (`billing/package-grid.tsx`) has 9 hardcoded entries all showing `5000` — not real package data
> - Two **conflicting pricing plan sets** exist: `mock.ts` has 3 plans (Starter $9, Growth $29, Business $79) while `billing/plans/page.tsx` has 3 different inline plans. Backend expects 9 tiers. Both must be replaced with API data.

---

# Frontend Integration Stories

## Story 3.5: Billing & Subscription Management Integration

As a frontend developer,
I want to wire the billing page to the backend payment APIs,
So that users can purchase credits, manage subscriptions, and see their current plan.

**Depends on:** Story 1.8 (auth provider), Backend Stories 3.1–3.3 deployed

**Acceptance Criteria:**

**Given** the billing page at `/home/billing`
**When** it loads
**Then** `GET /home/billing` is called via TanStack Query
**And** current plan info (or "Free tier") is displayed
**And** credit balance is displayed
**And** recent transactions are shown

**Given** the user navigates to `/home/billing/buy-credits`
**When** they select a credit package
**Then** `POST /home/billing/checkout` is called with `{ type: "one_time", packageId }`
**And** the user is redirected to `checkoutUrl` (payment provider page)
**And** on return to `/home/billing?success=true`, a success modal is shown
**And** on return with `?cancelled=true`, show cancelled message

**Given** the user navigates to `/home/billing/plans`
**When** they select a plan and billing cycle (monthly/annual toggle)
**Then** `POST /home/billing/checkout` is called with `{ type: "subscription", planId, billingCycle }`
**And** the same checkout redirect flow applies

**Given** the user wants to change their plan
**When** they select a new plan from the billing page
**Then** `POST /home/billing/subscription/change` is called
**And** for upgrades: show immediate confirmation with credits added
**And** for downgrades: show scheduled change date

**Given** the user wants to cancel
**When** they click cancel and confirm in the modal
**Then** `POST /home/billing/subscription/cancel` is called
**And** the cancel-subscription-modal shows period end date
**And** billing page updates to show "Cancelling at {date}"

**Given** the user wants to reactivate
**When** they click "Keep subscription"
**Then** `POST /home/billing/subscription/reactivate` is called
**And** billing page updates to show active subscription

**Edge Cases:**
- Payment redirect returns without webhook processed yet → poll `GET /home/billing/status/:sessionId` every 2s for up to 30s
- User navigates away during checkout → session expires at provider, no credits allocated
- Plan comparison: highlight current plan, disable if same tier

**Technical Context:**
- Existing components: `src/components/billing/credits-card.tsx`, `package-grid.tsx`, `payment-toggle.tsx`, `price-summary.tsx`, `pricing-plan-card.tsx`
- Existing modals: `src/components/modals/payment-success-modal.tsx`, `payment-failed-modal.tsx`, `cancel-subscription-modal.tsx`, `plan-cancelled-modal.tsx`
- Existing pages: `src/app/(dashboard)/home/billing/page.tsx`, `buy-credits/page.tsx`, `plans/page.tsx`
- Replace mock data with real API calls
- TanStack Query: `useQuery(['billing'], fetchBilling)`, mutations for checkout/change/cancel

---

## Story 3.6: Credit History Page Integration

As a frontend developer,
I want to wire the credit history display to the backend transactions API,
So that users can browse their full credit transaction history.

**Depends on:** Story 1.8 (auth provider), Backend Story 3.4 deployed

**Acceptance Criteria:**

**Given** the billing page shows recent transactions
**When** the user wants to see full history
**Then** `GET /home/billing/transactions?page=1&limit=20` is called
**And** transactions are displayed in a table: date, type (with badge), amount (+ green / - red), balance, description

**Given** the transaction list has multiple pages
**When** the user scrolls or clicks "Load More"
**Then** the next page is fetched and appended
**And** TanStack Query infinite query manages pagination

**Edge Cases:**
- Empty history (new user) → "No transactions yet" empty state
- Loading state → skeleton rows
- Type badges: color-coded by type (purchase=green, deduct=orange, refund=blue, expire=red)

**Technical Context:**
- Existing components: `src/components/credit-history/credit-history-table.tsx`, `transaction-row.tsx`, `change-badge.tsx`
- Map backend `CreditTransaction` to frontend `CreditHistoryEntry` type
- TanStack Query: `useInfiniteQuery(['transactions'], fetchTransactions)`
