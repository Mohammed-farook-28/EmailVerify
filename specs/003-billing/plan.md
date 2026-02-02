# Implementation Plan: Billing & Credit Purchases

**Branch**: `003-billing` | **Date**: 2026-02-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-billing/spec.md`

## Summary

Implement billing and credit purchase system allowing users to buy one-time credit packages (9 tiers: 1K-1M) and subscribe to monthly/annual plans (9 tiers: Starter-Titan). Integration with Stripe payment provider using abstracted PaymentProvider interface for future multi-provider support. Subscription credits expire at period end with no rollover; one-time credits never expire. Full transaction history with 7-year retention (90-day live query window, CSV export for older records). Payment success/failure communicated via modals. Upgrades charge full new tier price with immediate credit allocation (no proration).

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ backend, Next.js 15+ frontend)
**Primary Dependencies**:
- Backend: Stripe SDK, Drizzle ORM, Redis (ioredis), Express, Zod
- Frontend: TanStack Query, Radix UI, React Hook Form
**Storage**: PostgreSQL 16+ (credit_events, subscriptions, checkout_sessions tables), Redis 7+ (credit balance cache)
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web application (Linux server backend, browser frontend)
**Project Type**: Web (separate backend/frontend directories)
**Performance Goals**:
- Checkout session creation: <2s p95
- Transaction history: <500ms for 90-day window queries
- CSV export: <30s for 50K transactions
- Webhook processing: <5min from receipt to credit allocation
**Constraints**:
- Payment provider: Stripe only (phase 1), abstracted for future Razorpay support
- No proration on upgrades (full tier charge)
- 7-year transaction retention for compliance
- 90-day query window for performance
**Scale/Scope**:
- 9 credit packages (1K-1M credits)
- 9 subscription tiers (Starter-Titan)
- Expected 1000+ users, 10K+ transactions/month
- Transaction history up to 50K records per user over 7 years

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Constitution template is not yet populated. Using project principles from CLAUDE.md and architecture.md:

### Core Principles from Architecture

1. **Atomic Credit Operations** ✅
   - All credit allocations use Redis Lua scripts + PostgreSQL inserts
   - Idempotency via payment provider event IDs prevents duplicates
   - **Compliance**: FR-006, FR-007 enforce atomic operations

2. **Dual-Layer Credit System** ✅
   - Redis for speed (cache), PostgreSQL for durability (audit trail)
   - 5-minute reconciliation job syncs drift
   - **Compliance**: Existing pattern from Epic 2, extending for purchases

3. **Security-First** ✅
   - Webhook signature verification (FR-005)
   - Session-based auth for billing pages
   - Payment provider handles PCI compliance
   - **Compliance**: NFR-006, NFR-007 specify security measures

4. **Observability** ✅
   - Structured logging at INFO level for successful operations
   - ERROR level alerts for failures and delayed webhooks (>5min)
   - **Compliance**: NFR-001 through NFR-005 define logging strategy

5. **Simplicity Over Complexity** ✅
   - No proration (simpler pricing logic)
   - Stripe-only first (avoid multi-provider complexity upfront)
   - Provider-managed retries (no custom retry queue)
   - **Compliance**: Clarifications #6, #7, #8 chose simplest viable approaches

### Quality Gates

- ✅ **No implementation before tests**: Will follow TDD workflow in Phase 3+
- ✅ **Integration tests required**: Payment webhooks, checkout flow, CSV export
- ✅ **Performance benchmarks**: NFR-008, NFR-009, NFR-010 define targets
- ✅ **Security review**: Webhook signature verification, no PCI data storage

**Status**: All principles aligned. No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/003-billing/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output (to be generated)
├── data-model.md        # Phase 1 output (to be generated)
├── quickstart.md        # Phase 1 output (to be generated)
├── contracts/           # Phase 1 output (to be generated)
│   ├── billing-api.yaml
│   ├── checkout-api.yaml
│   └── webhook-api.yaml
├── checklists/
│   └── requirements.md  # Specification quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Backend
backend/
├── src/
│   ├── db/
│   │   └── schema.ts                    # Add: subscriptions, checkout_sessions tables
│   ├── services/
│   │   ├── credit.ts                    # Extend: addPurchaseCredits(), addSubscriptionCredits()
│   │   ├── billing.ts                   # NEW: getBillingInfo(), getTransactionHistory(), exportTransactionsCSV()
│   │   ├── stripe-client.ts             # NEW: Stripe SDK wrapper
│   │   └── payment-provider.ts          # NEW: PaymentProvider interface abstraction
│   ├── routes/
│   │   ├── billing.ts                   # NEW: /home/billing endpoints
│   │   └── webhooks.ts                  # NEW: POST /home/billing/webhook
│   ├── workers/
│   │   └── subscription-renewal.ts      # NEW: Handle subscription period expiry (cron job)
│   └── middleware/
│       └── stripe-signature.ts          # NEW: Webhook signature verification
├── drizzle/
│   └── 0003_billing.sql                 # NEW: Migration for subscriptions, checkout_sessions
└── tests/
    ├── unit/
    │   ├── stripe-client.test.ts
    │   └── billing-service.test.ts
    └── integration/
        ├── checkout-flow.test.ts
        ├── webhook-processing.test.ts
        └── subscription-lifecycle.test.ts

# Frontend
frontend/
├── src/
│   ├── lib/api/
│   │   └── billing.ts                   # NEW: Billing API client functions
│   ├── hooks/
│   │   ├── useBilling.ts                # NEW: TanStack Query hooks for billing
│   │   ├── useCheckout.ts               # NEW: Checkout mutation hook
│   │   └── useTransactionHistory.ts     # NEW: Transaction history query with pagination
│   ├── components/
│   │   ├── billing/
│   │   │   ├── credits-card.tsx         # MODIFY: Wire to real API
│   │   │   ├── package-grid.tsx         # MODIFY: Wire to real API
│   │   │   ├── pricing-plan-card.tsx    # MODIFY: Wire to real API
│   │   │   └── price-summary.tsx        # MODIFY: Wire to real API
│   │   ├── modals/
│   │   │   ├── payment-success-modal.tsx   # MODIFY: Wire to checkout flow
│   │   │   ├── payment-failed-modal.tsx    # MODIFY: Add retry logic
│   │   │   └── cancel-subscription-modal.tsx # MODIFY: Wire to API
│   │   └── credit-history/
│   │       ├── credit-history-table.tsx # MODIFY: Wire to real API
│   │       └── transaction-row.tsx      # MODIFY: Update type mapping
│   └── app/(dashboard)/home/
│       └── billing/
│           ├── page.tsx                 # MODIFY: Wire to real API
│           ├── buy-credits/page.tsx     # MODIFY: Wire to checkout
│           └── plans/page.tsx           # MODIFY: Wire to checkout
└── tests/
    └── e2e/
        ├── one-time-purchase.spec.ts
        ├── subscription-flow.spec.ts
        └── transaction-history.spec.ts
```

**Structure Decision**: Web application structure with separate backend/ and frontend/ directories. Backend handles payment provider integration, webhook processing, and database operations. Frontend handles UI, form validation, and checkout redirect flow. Follows existing Epic 1 and Epic 2 patterns.

## Complexity Tracking

> **Status**: No constitutional violations requiring justification.

All design decisions align with project principles:
- Atomic operations via Redis Lua + PostgreSQL transactions
- Simplicity over complexity (no proration, Stripe-only, provider retries)
- Security-first (signature verification, no PCI data)
- Observable (structured logging, error alerts)

## Phase 0: Research

**Prerequisites**: Constitution Check passed ✅

### Research Tasks

1. **Stripe SDK Integration Best Practices**
   - Research: Stripe TypeScript SDK usage patterns for checkout sessions, subscriptions, webhooks
   - Research: Stripe webhook signature verification implementation
   - Research: Stripe test mode vs production mode configuration
   - Research: Stripe pricing model setup (one-time products, recurring subscriptions)

2. **Subscription Lifecycle Management**
   - Research: Stripe subscription status states (active, past_due, canceled, incomplete)
   - Research: Handling failed renewal payments and dunning
   - Research: Proration alternatives (none chosen, but document reasoning)
   - Research: Subscription upgrade/downgrade patterns in Stripe

3. **Payment Security**
   - Research: Webhook endpoint security best practices (signature verification, idempotency)
   - Research: PCI DSS compliance requirements (using hosted checkout = minimal scope)
   - Research: Secure customer ID storage and reference

4. **Transaction History & Compliance**
   - Research: Financial records retention requirements (7-year standard)
   - Research: Efficient pagination strategies for large datasets
   - Research: CSV export generation for audit trails
   - Research: Transaction type taxonomy for credit events

5. **Testing Payment Flows**
   - Research: Stripe test cards and webhook event simulation
   - Research: Integration testing patterns for payment flows
   - Research: Mocking Stripe SDK in unit tests

**Output**: `research.md` with consolidated findings, decisions, and rationale

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete

### Data Model

**New Tables** (PostgreSQL via Drizzle ORM):

1. **subscriptions**
   - `id` (uuid, PK)
   - `userId` (uuid, FK → users.id)
   - `stripeSubscriptionId` (text, unique, indexed)
   - `stripeCustomerId` (text, indexed)
   - `planName` (text) - Starter, Popular, Professional, etc.
   - `creditsPerPeriod` (integer)
   - `billingCycle` (text) - "monthly" | "annual"
   - `status` (text) - "active" | "past_due" | "cancelling" | "expired"
   - `currentPeriodStart` (timestamp)
   - `currentPeriodEnd` (timestamp)
   - `cancelAtPeriodEnd` (boolean, default false)
   - `createdAt` (timestamp)
   - `updatedAt` (timestamp)
   - Indexes: (userId), (stripeSubscriptionId), (status)
   - Constraint: One active subscription per user (unique partial index on userId WHERE status IN ('active', 'past_due', 'cancelling'))

2. **checkout_sessions**
   - `id` (uuid, PK)
   - `userId` (uuid, FK → users.id)
   - `stripeSessionId` (text, unique, indexed)
   - `type` (text) - "one_time" | "subscription"
   - `packageId` (text, nullable) - For one-time purchases
   - `planId` (text, nullable) - For subscriptions
   - `status` (text) - "pending" | "completed" | "failed" | "expired"
   - `createdAt` (timestamp)
   - `completedAt` (timestamp, nullable)
   - Indexes: (userId, createdAt DESC), (stripeSessionId), (status)
   - TTL: Auto-delete after 7 days if status != 'completed'

**Modified Tables**:

1. **users**
   - Add: `stripeCustomerId` (text, nullable, unique) - Stripe customer ID for payment profile

2. **credit_events** (extend existing types)
   - Existing types: 'signup_bonus', 'deduct', 'refund'
   - Add types: 'purchase', 'subscription', 'subscription_upgrade', 'expire'

### API Contracts

**Endpoint Design Principles**:
- RESTful pattern following existing Epic 1/2 routes
- Session-based auth for billing pages
- Webhook uses signature verification (no session)
- Standard HTTP status codes (200, 400, 401, 402, 409, 503)

**Contracts Location**: `specs/003-billing/contracts/`
- `billing-api.yaml` - GET /home/billing, GET /home/billing/transactions
- `checkout-api.yaml` - POST /home/billing/checkout, GET /home/billing/status/:sessionId
- `subscription-api.yaml` - POST /home/billing/subscription/change, POST /home/billing/subscription/cancel, POST /home/billing/subscription/reactivate
- `webhook-api.yaml` - POST /home/billing/webhook, GET /home/billing/packages (public)

### Quickstart Guide

Document developer workflow:
1. Stripe account setup (test mode)
2. Create products and prices in Stripe Dashboard
3. Configure webhook endpoint and signature secret
4. Environment variables required
5. Database migration commands
6. Testing with Stripe CLI
7. Test card numbers for different scenarios

**Output**:
- `data-model.md` with full schema documentation
- `contracts/*.yaml` with OpenAPI 3.0 specs
- `quickstart.md` with developer setup guide
- Updated CLAUDE.md with Stripe technology addition

## Agent Context Update

**Script**: `.specify/scripts/bash/update-agent-context.sh claude`

**Technology Additions**:
- Stripe SDK (payment provider integration)
- Stripe webhook handling
- TypeScript 5.x (already listed, confirmed)

**Purpose**: Update Claude Code context file with new Stripe-specific technology for future interactions.

## Phase 2: Task Breakdown

**Command**: `/speckit.tasks` (separate command, not part of `/speckit.plan`)

**Approach**: Break down 5 user stories (P1, P2, P3 prioritization) into:
- Database migrations
- Backend services and routes
- Frontend components and hooks
- Integration tests
- E2E tests

**Estimated Task Count**: ~60-80 tasks across all user stories

---

## Risk Mitigation

### Risk 1: Stripe Webhook Delivery Delays

**Issue**: Webhooks may arrive seconds to minutes after user returns from checkout.
**Mitigation**:
- FR-025: Polling mechanism for checkout status
- 5-minute alert threshold (NFR-004) catches delays
- User sees success modal even if webhook pending

### Risk 2: Duplicate Webhook Processing

**Issue**: Stripe can send duplicate webhooks for same event.
**Mitigation**:
- FR-007: Idempotency via stripe event ID in credit_events.idempotencyKey
- Unique constraint prevents double credit allocation
- Already proven pattern from Epic 2 DLQ refunds

### Risk 3: Failed Subscription Renewals

**Issue**: User's card expires, renewal fails, service disruption.
**Mitigation**:
- FR-021: Email notification via Resend
- Subscription status → 'past_due', credits remain usable during grace
- Stripe automatic retry (3 attempts over 3 weeks) gives user time to update payment

### Risk 4: Large Transaction History Queries

**Issue**: Users with 50K+ transactions over 7 years could cause slow queries.
**Mitigation**:
- NFR-008: 90-day query window for live pagination
- NFR-010: CSV export with streaming for older data
- Database indexes on (userId, createdAt DESC) for efficient pagination

### Risk 5: Price/Plan Configuration Drift

**Issue**: Stripe product/price IDs must match code configuration.
**Mitigation**:
- Environment variables for all Stripe price IDs
- Validation on startup (check Stripe API for expected products)
- Quickstart documentation with exact Stripe setup steps

---

## Dependencies

### Epic 1 (User Auth) - Required ✅

- Better Auth session management
- PostgreSQL users table
- Redis cache infrastructure
- Frontend authentication state

### Epic 2 (Verification Engine) - Required ✅

- credit_events table structure
- Credit service with Redis Lua atomic operations
- 5-minute reconciliation pattern
- Resend email service for notifications

### External Services - New

- **Stripe Account** (test mode for development, production for deployment)
- **Stripe Products/Prices** (9 packages + 9 plans × 2 billing cycles = 27 total)
- **Stripe Webhook Endpoint** (requires public URL for webhook delivery)

---

## Testing Strategy

### Unit Tests (~20 tests)

- Stripe client wrapper functions
- Billing service credit allocation logic
- Transaction history pagination
- CSV export generation
- Subscription status state machine

### Integration Tests (~15 tests)

- Checkout session creation → webhook processing → credit allocation
- Subscription lifecycle (create → renew → upgrade → cancel)
- Failed payment handling and refund
- Transaction history queries with various filters
- Webhook signature verification (valid, invalid, replay)

### E2E Tests (~10 tests)

- Complete one-time purchase flow (UI → checkout → return → credits)
- Complete subscription flow (select plan → checkout → return → active)
- Subscription upgrade (immediate charge, credit allocation)
- Subscription cancellation and reactivation
- Transaction history browsing and CSV export

### Manual Testing Checklist

- Stripe test mode checkout (various test cards)
- Webhook local testing with Stripe CLI
- Payment success/failure modal behavior
- Concurrent checkout session handling
- 90-day vs CSV export boundary behavior

---

## Rollback Plan

**Database**:
- Migrations are additive (new tables: subscriptions, checkout_sessions)
- No changes to existing credit_events structure
- Rollback: Drop new tables, restore schema to Epic 2 state

**Stripe Configuration**:
- Products/prices created in Stripe remain (no destructive changes)
- Webhook endpoint can be disabled in Stripe Dashboard
- Rollback: Disable webhook, no code changes needed

**Code**:
- All changes on 003-billing branch
- Rollback: Revert git commits, redeploy Epic 2 main branch
- Estimated rollback time: <10 minutes

---

## Success Criteria (from spec.md)

- **SC-001**: One-time purchase completes in <3 minutes ✅
- **SC-002**: Subscription activation in <2 minutes ✅
- **SC-003**: 95% checkout success rate when payment succeeds ✅
- **SC-004**: Zero duplicate credit allocations ✅
- **SC-005**: Upgrades apply in <30 seconds ✅
- **SC-006**: Downgrades schedule correctly 100% of time ✅
- **SC-007**: Subscription credits expire at period end ✅
- **SC-008**: One-time credits never expire ✅
- **SC-009**: Transaction history loads in <1s for 10K transactions ✅
- **SC-010**: Payment failure notifications in <5min ✅
- **SC-011**: Architecture supports future Razorpay addition ✅
- **SC-012**: Cancel/reactivate works correctly ✅
- **SC-013**: 90% user success rate on first attempt ✅
- **SC-014**: 60% reduction in billing support tickets ✅

---

## Next Steps

1. **Execute Phase 0**: Generate `research.md` with Stripe SDK, subscription patterns, security best practices
2. **Execute Phase 1**: Generate `data-model.md`, API contracts (`contracts/*.yaml`), `quickstart.md`
3. **Run agent context update**: `.specify/scripts/bash/update-agent-context.sh claude`
4. **User review**: Confirm design before proceeding to `/speckit.tasks`
5. **Phase 2**: Generate `tasks.md` with ~60-80 implementation tasks
6. **Phase 3+**: Implement user stories in priority order (P1 → P2 → P3)

**Estimated Timeline**:
- Phase 0 (Research): 1 hour
- Phase 1 (Design): 2 hours
- Phase 2 (Tasks): 1 hour
- Phase 3+ (Implementation): 10-15 days (P1: 5-7 days, P2: 3-4 days, P3: 2-3 days)

**Total Epic Duration**: ~2-3 weeks from specification to production-ready implementation
