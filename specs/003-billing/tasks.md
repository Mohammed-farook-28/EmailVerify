# Tasks: Billing & Credit Purchases

**Input**: Design documents from `/specs/003-billing/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and Stripe SDK integration

- [ ] T001 Install Stripe SDK in backend (`npm install stripe` in backend/)
- [ ] T002 [P] Create Stripe configuration module in backend/src/config/stripe.ts
- [ ] T003 [P] Add environment variables to backend/.env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
- [ ] T004 [P] Create PaymentProvider interface in backend/src/services/payment-provider.ts
- [ ] T005 Create Stripe client implementation in backend/src/services/stripe-client.ts (implements PaymentProvider)
- [ ] T006 [P] Add stripeCustomerId column to users table via migration in backend/drizzle/0003_billing_001_add_stripe_customer.sql

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core database schema and shared services that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Create subscriptions table migration in backend/drizzle/0003_billing_002_create_subscriptions.sql
- [ ] T008 [P] Create checkout_sessions table migration in backend/drizzle/0003_billing_003_create_checkout_sessions.sql
- [ ] T009 [P] Create processed_webhook_events table migration in backend/drizzle/0003_billing_004_create_processed_events.sql
- [ ] T010 [P] Extend credit_events types in backend/src/db/schema.ts (add: 'purchase', 'subscription', 'subscription_upgrade', 'expire')
- [ ] T011 Run database migrations (`npm run db:migrate` in backend/)
- [ ] T012 [P] Create subscriptions schema in backend/src/db/schema.ts
- [ ] T013 [P] Create checkout_sessions schema in backend/src/db/schema.ts
- [ ] T014 [P] Create processed_webhook_events schema in backend/src/db/schema.ts
- [ ] T015 Create webhook signature verification middleware in backend/src/middleware/stripe-signature.ts
- [ ] T016 Extend credit service with addPurchaseCredits() in backend/src/services/credit.ts
- [ ] T017 [P] Extend credit service with addSubscriptionCredits() in backend/src/services/credit.ts
- [ ] T018 [P] Extend credit service with expireSubscriptionCredits() in backend/src/services/credit.ts
- [ ] T019 Create billing service in backend/src/services/billing.ts (getBillingInfo, getTransactionHistory, exportTransactionsCSV)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - One-Time Credit Purchase (Priority: P1) 🎯 MVP

**Goal**: Users can buy credit packages (9 tiers: 1K-1M) via Stripe hosted checkout, credits allocated after webhook

**Independent Test**: Select package → checkout → complete payment → return to platform → verify credits in balance and success modal displayed

### Implementation for User Story 1

- [ ] T020 [P] [US1] Implement createOneTimeCheckout() in backend/src/services/stripe-client.ts
- [ ] T021 [P] [US1] Implement pollCheckoutStatus() in backend/src/services/billing.ts (2s interval, 30s timeout)
- [ ] T022 [US1] Create POST /api/billing/checkout/one-time endpoint in backend/src/routes/billing.ts
- [ ] T023 [US1] Create GET /api/billing/checkout/status/:sessionId endpoint in backend/src/routes/billing.ts
- [ ] T024 [US1] Implement webhook handler for checkout.session.completed (one-time) in backend/src/routes/webhooks.ts
- [ ] T025 [US1] Implement webhook handler for payment_intent.succeeded in backend/src/routes/webhooks.ts
- [ ] T026 [US1] Implement webhook handler for payment_intent.payment_failed in backend/src/routes/webhooks.ts
- [ ] T027 [US1] Implement idempotency check in webhook handler using processed_webhook_events table
- [ ] T028 [US1] Implement customer creation logic (create Stripe customer on first purchase)
- [ ] T029 [P] [US1] Create billing API client in frontend/src/lib/api/billing.ts (createCheckout, pollStatus functions)
- [ ] T030 [P] [US1] Create useCheckout hook in frontend/src/hooks/useCheckout.ts
- [ ] T031 [US1] Wire package-grid.tsx to createCheckout API in frontend/src/components/billing/package-grid.tsx
- [ ] T032 [US1] Implement checkout return page with polling logic in frontend/src/app/(dashboard)/home/billing/checkout-return/page.tsx
- [ ] T033 [US1] Wire payment-success-modal.tsx to checkout flow in frontend/src/components/modals/payment-success-modal.tsx
- [ ] T034 [US1] Wire payment-failed-modal.tsx with retry logic in frontend/src/components/modals/payment-failed-modal.tsx
- [ ] T035 [US1] Update credits-card.tsx to fetch real balance in frontend/src/components/billing/credits-card.tsx

**Checkpoint**: One-time credit purchase flow complete and independently testable

---

## Phase 4: User Story 2 - Subscription Plan Purchase (Priority: P1)

**Goal**: Users can subscribe to monthly/annual plans (9 tiers), credits allocated after checkout, auto-renew handled

**Independent Test**: Select plan → choose billing cycle → checkout → complete payment → verify subscription active with credits allocated

### Implementation for User Story 2

- [ ] T036 [P] [US2] Implement createSubscriptionCheckout() in backend/src/services/stripe-client.ts
- [ ] T037 [US2] Create POST /api/billing/checkout/subscription endpoint in backend/src/routes/billing.ts
- [ ] T038 [US2] Implement webhook handler for checkout.session.completed (subscription) in backend/src/routes/webhooks.ts
- [ ] T039 [US2] Implement webhook handler for invoice.paid in backend/src/routes/webhooks.ts
- [ ] T040 [US2] Implement webhook handler for invoice.payment_failed in backend/src/routes/webhooks.ts
- [ ] T041 [US2] Implement webhook handler for customer.subscription.created in backend/src/routes/webhooks.ts
- [ ] T042 [US2] Implement webhook handler for customer.subscription.updated in backend/src/routes/webhooks.ts
- [ ] T043 [US2] Implement subscription renewal logic (allocate new credits, expire old credits)
- [ ] T044 [US2] Implement duplicate subscription check (return 409 if active subscription exists)
- [ ] T045 [US2] Send payment failure email via Resend when invoice.payment_failed webhook received
- [ ] T046 [P] [US2] Wire pricing-plan-card.tsx to createSubscriptionCheckout in frontend/src/components/billing/pricing-plan-card.tsx
- [ ] T047 [P] [US2] Implement billing cycle toggle (monthly/annual) in frontend/src/app/(dashboard)/home/billing/plans/page.tsx
- [ ] T048 [US2] Display subscription status and period dates on billing page in frontend/src/app/(dashboard)/home/billing/page.tsx

**Checkpoint**: Subscription purchase and renewal flow complete and independently testable

---

## Phase 5: User Story 3 - Subscription Management (Priority: P2)

**Goal**: Users can upgrade (immediate, full charge), downgrade (scheduled), cancel (at period end), and reactivate subscriptions

**Independent Test**: Create subscription → upgrade to higher tier → verify immediate charge and credit allocation → downgrade → verify scheduled for next period → cancel → verify shows "cancelling" → reactivate → verify active

### Implementation for User Story 3

- [ ] T049 [P] [US3] Implement upgradeSubscription() in backend/src/services/stripe-client.ts (no proration, full tier charge)
- [ ] T050 [P] [US3] Implement downgradeSubscription() in backend/src/services/stripe-client.ts (scheduled for next billing cycle)
- [ ] T051 [P] [US3] Implement cancelSubscription() in backend/src/services/stripe-client.ts (at period end)
- [ ] T052 [P] [US3] Implement reactivateSubscription() in backend/src/services/stripe-client.ts
- [ ] T053 [US3] Create POST /api/billing/subscription/change endpoint in backend/src/routes/billing.ts
- [ ] T054 [US3] Create POST /api/billing/subscription/cancel endpoint in backend/src/routes/billing.ts
- [ ] T055 [US3] Create POST /api/billing/subscription/reactivate endpoint in backend/src/routes/billing.ts
- [ ] T056 [US3] Implement past_due status check to block plan changes in backend/src/routes/billing.ts
- [ ] T057 [US3] Implement webhook handler for customer.subscription.deleted in backend/src/routes/webhooks.ts (revoke access)
- [ ] T058 [P] [US3] Create useSubscriptionManagement hook in frontend/src/hooks/useSubscriptionManagement.ts
- [ ] T059 [US3] Wire cancel-subscription-modal.tsx to API in frontend/src/components/modals/cancel-subscription-modal.tsx
- [ ] T060 [US3] Implement upgrade/downgrade UI in frontend/src/app/(dashboard)/home/billing/page.tsx
- [ ] T061 [US3] Implement reactivate button for cancelling subscriptions in frontend/src/app/(dashboard)/home/billing/page.tsx
- [ ] T062 [US3] Display subscription status badges (active, past_due, cancelling) in frontend/src/components/billing/subscription-status-badge.tsx

**Checkpoint**: Subscription management (upgrade, downgrade, cancel, reactivate) complete and independently testable

---

## Phase 6: User Story 4 - Credit Transaction History (Priority: P2)

**Goal**: Users can view transaction history with 90-day live query window and CSV export for older data

**Independent Test**: Perform credit transactions → view billing page → verify last 10 transactions displayed → paginate → verify all transactions shown → export CSV → verify older data accessible

### Implementation for User Story 4

- [ ] T063 [P] [US4] Implement getTransactionHistory() with 90-day window in backend/src/services/billing.ts
- [ ] T064 [P] [US4] Implement exportTransactionsCSV() with streaming for 7-year data in backend/src/services/billing.ts
- [ ] T065 [US4] Create GET /api/billing/transactions endpoint with pagination in backend/src/routes/billing.ts
- [ ] T066 [US4] Create GET /api/billing/transactions/export endpoint for CSV in backend/src/routes/billing.ts
- [ ] T067 [P] [US4] Create useTransactionHistory hook with pagination in frontend/src/hooks/useTransactionHistory.ts
- [ ] T068 [US4] Wire credit-history-table.tsx to API with pagination in frontend/src/components/credit-history/credit-history-table.tsx
- [ ] T069 [US4] Update transaction-row.tsx with type badge styling in frontend/src/components/credit-history/transaction-row.tsx
- [ ] T070 [US4] Implement CSV export button in frontend/src/app/(dashboard)/home/billing/page.tsx
- [ ] T071 [US4] Display "last 10 transactions" section on billing page in frontend/src/components/billing/recent-transactions.tsx

**Checkpoint**: Transaction history with pagination and CSV export complete and independently testable

---

## Phase 7: User Story 5 - Pricing Display & Package Selection (Priority: P3)

**Goal**: Public pricing display showing all packages and plans with clear pricing, discounts, and highlights

**Independent Test**: View landing page → verify 9 packages displayed with prices → view plans → toggle monthly/annual → verify 50% discount shown → verify popular packages highlighted

### Implementation for User Story 5

- [ ] T072 [P] [US5] Create GET /api/billing/packages endpoint (public, no auth) in backend/src/routes/billing.ts
- [ ] T073 [P] [US5] Create GET /api/billing/plans endpoint (public, no auth) in backend/src/routes/billing.ts
- [ ] T074 [US5] Wire price-summary.tsx to packages/plans API in frontend/src/components/billing/price-summary.tsx
- [ ] T075 [US5] Implement package grid layout with progressive discount display in frontend/src/components/billing/package-grid.tsx
- [ ] T076 [US5] Implement popular package highlighting logic in frontend/src/components/billing/package-card.tsx
- [ ] T077 [US5] Implement current plan highlighting for subscribed users in frontend/src/app/(dashboard)/home/billing/plans/page.tsx
- [ ] T078 [US5] Disable same-tier selection for subscribed users in frontend/src/components/billing/pricing-plan-card.tsx

**Checkpoint**: Pricing display complete with all packages, plans, discounts, and highlights

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Production readiness and cross-story improvements

- [ ] T079 [P] Implement subscription renewal worker in backend/src/workers/subscription-renewal.ts (daily cron to handle period expiry)
- [ ] T080 [P] Configure Stripe products in Stripe Dashboard (9 packages + 18 subscription prices = 27 total)
- [ ] T081 [P] Add all 27 Stripe price IDs to environment variables
- [ ] T082 [P] Implement startup validation for Stripe price IDs in backend/src/config/stripe.ts
- [ ] T083 [P] Add structured logging for all payment events (INFO level) per NFR-001, NFR-002, NFR-003
- [ ] T084 [P] Add ERROR level alerts for webhook failures (>5min delay) per NFR-004
- [ ] T085 [P] Add ERROR level alerts for checkout failures per NFR-005
- [ ] T086 [P] Update CLAUDE.md with Stripe SDK technology addition
- [ ] T087 [P] Create data-model.md documenting database schema (subscriptions, checkout_sessions, credit_events extensions) in specs/003-billing/data-model.md
- [ ] T088 [P] Create API contracts in OpenAPI 3.0 format in specs/003-billing/contracts/ (billing-api.yaml, checkout-api.yaml, subscription-api.yaml, webhook-api.yaml)
- [ ] T089 Create quickstart.md with Stripe setup instructions in specs/003-billing/quickstart.md
- [ ] T090 Document Stripe test cards and CLI usage in quickstart.md
- [ ] T091 [P] Run code cleanup and linting (ESLint/Prettier)
- [ ] T092 [P] Performance validation: Verify NFR-009 (transaction history pagination <500ms for 90-day queries at 20 items/page) and NFR-010 (CSV export <30s for 50K transactions)
- [ ] T093 [P] Performance validation: Verify checkout session creation <2s p95 per plan.md technical goals

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User Story 1 (P1): Independent - can start after Foundational
  - User Story 2 (P1): Independent - can start after Foundational
  - User Story 3 (P2): Depends on User Story 2 (requires subscription to exist)
  - User Story 4 (P2): Independent - can start after Foundational
  - User Story 5 (P3): Independent - can start after Foundational
- **Polish (Phase 8)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (One-Time Purchase)**: Foundation only - NO dependencies on other stories
- **User Story 2 (Subscription Purchase)**: Foundation only - NO dependencies on other stories
- **User Story 3 (Subscription Management)**: Requires US2 complete (need subscription to manage)
- **User Story 4 (Transaction History)**: Foundation only - NO dependencies on other stories
- **User Story 5 (Pricing Display)**: Foundation only - NO dependencies on other stories

### Within Each User Story

- Backend services before routes
- Routes before frontend API clients
- API clients before hooks
- Hooks before components
- Components before page integration

### Parallel Opportunities

**Within Setup (Phase 1)**:
- T002, T003, T004, T006 can all run in parallel

**Within Foundational (Phase 2)**:
- T008, T009, T010 can run in parallel (different migrations)
- T012, T013, T014 can run in parallel (different schema files)
- T016, T017, T018 can run in parallel (extending same service with different functions)

**User Stories After Foundation Complete**:
- US1 and US2 can start in parallel (independent P1 stories)
- US4 and US5 can start in parallel with US1/US2 (all independent)
- US3 must wait for US2 to complete

---

## Parallel Example: User Story 1

```bash
# These tasks can run together after Foundation complete:
Task: T020 - Implement createOneTimeCheckout() in backend/src/services/stripe-client.ts
Task: T021 - Implement pollCheckoutStatus() in backend/src/services/billing.ts
Task: T029 - Create billing API client in frontend/src/lib/api/billing.ts
Task: T030 - Create useCheckout hook in frontend/src/hooks/useCheckout.ts
```

---

## Parallel Example: User Story 2

```bash
# These tasks can run together after Foundation complete:
Task: T036 - Implement createSubscriptionCheckout() in backend/src/services/stripe-client.ts
Task: T046 - Wire pricing-plan-card.tsx in frontend/
Task: T047 - Implement billing cycle toggle in frontend/
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only - Core Revenue Generation)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T019) - CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 - One-Time Purchase (T020-T035)
4. **VALIDATE**: Test US1 independently with Stripe test cards
5. Complete Phase 4: User Story 2 - Subscription Purchase (T036-T048)
6. **VALIDATE**: Test US2 independently with test subscriptions
7. **MVP COMPLETE** - Deploy/demo with both payment flows working

### Incremental Delivery

1. Foundation (Phase 1-2) → Foundation ready (CHECKPOINT)
2. Add US1 → Test independently → Deploy/Demo (users can buy credits!)
3. Add US2 → Test independently → Deploy/Demo (users can subscribe!)
4. Add US3 → Test independently → Deploy/Demo (users can manage subscriptions!)
5. Add US4 → Test independently → Deploy/Demo (users can view history!)
6. Add US5 → Test independently → Deploy/Demo (public pricing visible!)
7. Polish (Phase 8) → Production-ready

### Parallel Team Strategy

With multiple developers:

1. **Team completes Setup + Foundational together** (Phase 1-2)
2. **Once Foundational done, split work**:
   - Developer A: User Story 1 (T020-T035)
   - Developer B: User Story 2 (T036-T048)
   - Developer C: User Story 4 (T063-T071) or User Story 5 (T072-T078)
3. **Sequential dependency**:
   - User Story 3 waits for US2 to complete (T049-T062)
4. **Final phase**:
   - Entire team on Polish (T079-T093)

---

## Task Summary

**Total Tasks**: 93
**Setup**: 6 tasks (T001-T006)
**Foundational**: 13 tasks (T007-T019) - BLOCKING
**User Story 1 (P1)**: 16 tasks (T020-T035) - MVP
**User Story 2 (P1)**: 13 tasks (T036-T048) - MVP
**User Story 3 (P2)**: 14 tasks (T049-T062)
**User Story 4 (P2)**: 9 tasks (T063-T071)
**User Story 5 (P3)**: 7 tasks (T072-T078)
**Polish**: 15 tasks (T079-T093)

**Parallel Opportunities**: 38 tasks marked [P] (40% can run in parallel)

**MVP Scope**: Phase 1-4 (T001-T048) = 48 tasks for core revenue generation

**Independent Stories**: US1, US2, US4, US5 have no dependencies on each other
**Dependent Story**: US3 depends on US2 completion

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Stripe test mode for all development and testing
- Production deployment requires live Stripe configuration (Phase 8, T080-T082)
