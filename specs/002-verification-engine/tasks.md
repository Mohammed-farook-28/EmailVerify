# Tasks: Email Verification Engine & Dashboard

**Input**: Design documents from `/specs/002-verification-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests will be added in a separate testing phase at the end (per user request)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `- [ ] [ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

This is a web application with:
- Backend: `backend/src/`
- Frontend: `/Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency installation, and mock API setup

- [ ] T001 Install BullMQ (free version) in backend: `cd backend && npm install bullmq`
- [ ] T002 [P] Install opossum circuit breaker in backend: `npm install opossum`
- [ ] T003 [P] Install undici HTTP client in backend: `npm install undici`
- [ ] T004 [P] Install pino logger in backend: `npm install pino pino-pretty`
- [ ] T005 [P] Install prom-client for Prometheus metrics in backend: `npm install prom-client`
- [ ] T006 [P] Install @opentelemetry packages in backend: `npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http`
- [ ] T007 Create mock upstream API server in backend/src/mock-upstream-api.ts
- [ ] T008 Add npm script for mock API in backend/package.json: `"mock:upstream": "tsx src/mock-upstream-api.ts"`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [ ] T009 Add verification_results table to backend/src/db/schema.ts with Drizzle schema
- [ ] T010 Create database migration for verification_results table in backend/drizzle/ using drizzle-kit generate
- [ ] T011 Run database migration: `npm run db:push`

### Core Services & Infrastructure

- [ ] T012 [P] Create Pino logger configuration in backend/src/config/logger.ts with structured JSON format
- [ ] T013 [P] Create Prometheus metrics registry in backend/src/lib/metrics.ts with queue_depth, upstream_error_rate, circuit_breaker_state gauges/counters
- [ ] T014 [P] Create OpenTelemetry instrumentation setup in backend/src/instrumentation.ts with 100% sampling for development
- [ ] T015 Create undici connection pool in backend/src/services/upstream-client.ts with 200 max connections, 3s connect timeout, 10s headers timeout, and idempotency key generation using format {userId}:{SHA256(email)}:{timestamp} stored in Redis with 1hr TTL
- [ ] T016 Create opossum circuit breaker wrapper in backend/src/services/circuit-breaker.ts with 50% error threshold, 30s reset timeout, Redis state persistence
- [ ] T017 Create BullMQ queue setup in backend/src/services/queue.ts with priority-based fairness (free version, not Pro)
- [ ] T018 Create verification worker processor in backend/src/workers/verification-worker.ts with 50 concurrency
- [ ] T019 Add worker startup script in backend/package.json: `"workers": "tsx src/workers/verification-worker.ts"`

### Health & Metrics Endpoints

- [ ] T020 [P] Implement GET /health/live endpoint in backend/src/routes/health.ts (always returns 200 OK)
- [ ] T021 [P] Implement GET /health/ready endpoint in backend/src/routes/health.ts (checks PostgreSQL + Redis connectivity)
- [ ] T022 [P] Implement GET /health/startup endpoint in backend/src/routes/health.ts (checks worker queue connection)
- [ ] T023 [P] Implement GET /metrics endpoint in backend/src/routes/health.ts (Prometheus text format)
- [ ] T024 Register health routes in backend/src/app.ts (unauthenticated, before other middleware)
- [ ] T024b [P] Create Kubernetes NetworkPolicy manifest in k8s/network-policy.yaml to restrict /health/* and /metrics endpoints to internal network only (for production deployment)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Single Email Verification (Priority: P1) 🎯 MVP

**Goal**: Allow authenticated users to submit an email address and receive a detailed verification result with credit deduction

**Independent Test**: Authenticate, submit email to POST /home/quick-verify, verify result contains status/score/attributes and credit balance decreases by 1

### Backend Implementation

- [ ] T025 [US1] Create VerificationService in backend/src/services/verification.ts with verifyEmail() method
- [ ] T026 [US1] Implement POST /home/quick-verify endpoint in backend/src/routes/verification.ts with session auth, email validation, credit check
- [ ] T027 [US1] Implement credit deduction using existing Redis Lua script from Epic 1 in verification route
- [ ] T028 [US1] Implement job enqueue logic in POST /home/quick-verify with priority=1 for single verifications
- [ ] T029 [US1] Implement worker job processor in backend/src/workers/verification-worker.ts to call upstream API via circuit breaker
- [ ] T030 [US1] Store verification result in PostgreSQL verification_results table after successful upstream call
- [ ] T031 [US1] Implement error handling for insufficient credits (402 response), invalid email (422 response), upstream failures (503 with Retry-After)
- [ ] T032 [US1] Add circuit breaker state check before processing jobs and skip if open
- [ ] T033 [US1] Register verification routes in backend/src/app.ts

### Frontend Implementation

- [ ] T034 [P] [US1] Create TanStack Query client configuration in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/lib/query-client.ts with staleTime/gcTime settings
- [ ] T035 [P] [US1] Create verification API client in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/lib/api/verification.ts with POST /home/quick-verify function
- [ ] T036 [US1] Create useVerifyEmail mutation hook in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/hooks/useVerifyEmail.ts with optimistic credit updates
- [ ] T037 [US1] Update quick-verify page in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/app/(dashboard)/home/quick-verify/page.tsx to connect to real API
- [ ] T038 [US1] Implement verification result display component showing status, score, deliverability, attributes, server info
- [ ] T039 [US1] Implement credit balance display with real-time updates after verification
- [ ] T040 [US1] Add error handling UI for insufficient credits, invalid email, service unavailable errors

**Checkpoint**: User Story 1 should be fully functional - users can verify single emails with credit deduction and see results

---

## Phase 4: User Story 2 - Verification History & Recent Results (Priority: P1)

**Goal**: Allow users to view their last 10 verification results without re-running verifications

**Independent Test**: Perform 3-5 verifications, then call GET /home/quick-verify/recent and verify it returns last 10 results in reverse chronological order (newest first)

### Backend Implementation

- [ ] T041 [US2] Implement GET /home/quick-verify/recent endpoint in backend/src/routes/verification.ts with session auth
- [ ] T042 [US2] Create getRecentVerifications() method in backend/src/services/verification.ts querying PostgreSQL with userId filter, ORDER BY createdAt DESC LIMIT 10
- [ ] T043 [US2] Ensure query uses (userId, createdAt DESC) index for fast retrieval
- [ ] T044 [US2] Add data privacy check ensuring users only see their own results (WHERE userId = session.user.id)

### Frontend Implementation

- [ ] T045 [P] [US2] Create useRecentVerifications query hook in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/hooks/useRecentVerifications.ts with 5min staleTime
- [ ] T046 [US2] Update quick-verify page to fetch and display recent results section below verification form
- [ ] T047 [US2] Implement recent results list component showing email, status badge, score, timestamp for each result
- [ ] T048 [US2] Add empty state component for users with no verification history
- [ ] T049 [US2] Implement automatic refresh of recent results after successful verification (via query invalidation)

**Checkpoint**: User Story 2 should be fully functional - users can view their recent verification history

---

## Phase 5: User Story 3 - Dashboard Metrics & Usage Analytics (Priority: P2)

**Goal**: Provide users with aggregated metrics showing credit balance, verification counts, status distribution, and trend data over selectable time ranges

**Independent Test**: Perform 10-15 verifications with varied statuses, then call GET /home?range=30 and verify summary metrics, distribution counts, and trend data are accurate

### Backend Implementation

- [ ] T050 [US3] Create DashboardService in backend/src/services/dashboard-metrics.ts with getSummary(), getDistribution(), getTrend() methods
- [ ] T051 [US3] Implement GET /home endpoint in backend/src/routes/dashboard.ts with session auth and range query parameter (7/30/90 days)
- [ ] T052 [US3] Implement summary metrics query: current credits (from Redis), total verifications (COUNT), total API calls (0 for now), period verifications (COUNT with date filter)
- [ ] T053 [US3] Implement distribution query: COUNT GROUP BY status for valid/invalid/unknown/risky/disposable/catch_all/role within date range
- [ ] T054 [US3] Implement trend query: COUNT GROUP BY DATE(createdAt) for daily verification counts over selected range
- [ ] T055 [US3] Optimize dashboard queries with composite indexes and ensure userId filter on all queries
- [ ] T056 [US3] Register dashboard routes in backend/src/app.ts

### Frontend Implementation

- [ ] T057 [P] [US3] Create useDashboardMetrics query hook in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/hooks/useDashboardMetrics.ts with 30s staleTime, auto-refetch
- [ ] T058 [US3] Update dashboard home page in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/app/(dashboard)/home/page.tsx to fetch real metrics
- [ ] T059 [US3] Implement summary metrics cards showing credits, total verifications, API calls, period verifications
- [ ] T060 [US3] Implement distribution chart using Recharts PieChart or BarChart showing counts per status
- [ ] T061 [US3] Implement trend line chart using Recharts LineChart showing daily verification counts
- [ ] T062 [US3] Add time range selector (7/30/90 days) with query parameter updates
- [ ] T063 [US3] Add empty state for users with no verification history

**Checkpoint**: User Story 3 should be fully functional - users can view comprehensive dashboard analytics

---

## Phase 6: User Story 4 - System Resilience During Upstream Failures (Priority: P2)

**Goal**: Gracefully handle upstream API failures with circuit breaker, automatic retries, credit refunds, and load shedding

**Independent Test**: Simulate upstream API failures (stop mock API or use feature flag), submit verifications, verify jobs are queued (not lost), circuit breaker opens after threshold, and credits are refunded on DLQ

### Backend Implementation

- [ ] T064 [US4] Implement circuit breaker event handlers in backend/src/services/circuit-breaker.ts for open/close/halfOpen events
- [ ] T065 [US4] Implement Redis Pub/Sub for circuit breaker state synchronization across workers
- [ ] T066 [US4] Implement recovery lock pattern in circuit breaker using Redis SET NX EX to prevent thundering herd
- [ ] T067 [US4] Configure BullMQ job retry strategy: 3 attempts with exponential backoff + jitter (attempt 1: 0-1s random, attempt 2: 0-4s random, attempt 3: 0-16s random)
- [ ] T068 [US4] Implement stalled job detection and requeue logic in worker
- [ ] T069 [US4] Create dead letter queue (DLQ) handler in backend/src/workers/dlq-handler.ts for failed jobs
- [ ] T070 [US4] Implement automatic credit refund on DLQ using PostgreSQL credit_events insert
- [ ] T071 [US4] Add circuit breaker state metrics to Prometheus (0=CLOSED, 1=HALF_OPEN, 2=OPEN)
- [ ] T072 [US4] Implement load shedding in POST /home/quick-verify when queue depth > 500K (return 503 with Retry-After header)

### Monitoring & Observability

- [ ] T073 [P] [US4] Add structured logging for circuit breaker state changes (logger.warn on open, logger.info on close)
- [ ] T074 [P] [US4] Add upstream error metrics counter (upstream_errors_total with error_type label)
- [ ] T075 [P] [US4] Add DLQ depth gauge metric (dlq_depth)
- [ ] T076 [P] [US4] Add queue depth gauge metric (queue_depth_total with status label: waiting/active/delayed/failed)

**Checkpoint**: User Story 4 should be fully functional - system handles upstream failures gracefully with no credit loss

---

## Phase 7: User Story 5 - Platform Health & Service Status (Priority: P3)

**Goal**: Expose health check endpoints for Kubernetes probes and Prometheus metrics for monitoring

**Independent Test**: Query /health/ready endpoint, simulate PostgreSQL disconnect, verify endpoint returns 503. Query /metrics endpoint and verify Prometheus format metrics are returned

### Implementation (Already Completed in Phase 2)

- ✅ T020-T024: Health endpoints and metrics already implemented in Foundational phase

### Additional Monitoring

- [ ] T077 [P] [US5] Add Redis memory usage percent gauge metric in backend/src/lib/metrics.ts
- [ ] T078 [P] [US5] Add worker concurrency utilization gauge metric (active_jobs / max_concurrency)
- [ ] T079 [P] [US5] Add HTTP 503 rate counter metric for load shedding events
- [ ] T080 [US5] Implement metrics collection cron job to update gauge metrics every 30 seconds

**Checkpoint**: User Story 5 should be fully functional - K8s probes and Prometheus scraping working

---

## Phase 8: User Story 6 - Credit Reconciliation & Accuracy (Priority: P2)

**Goal**: Ensure credit balance accuracy by reconciling Redis cache against PostgreSQL ledger every 5 minutes

**Independent Test**: Manually introduce drift between Redis and PostgreSQL, wait 5 minutes, verify reconciliation job corrects drift and logs the event

### Backend Implementation

- [ ] T081 [US6] Create ReconciliationService in backend/src/services/reconciliation.ts with reconcileCredits() method
- [ ] T082 [US6] Implement PostgreSQL query using CTE to sum credit_events grouped by userId (batch size: 1000 users)
- [ ] T083 [US6] Implement Redis MGET to fetch credit balances for batch of users
- [ ] T084 [US6] Implement drift detection logic comparing Redis vs PostgreSQL with tiered thresholds (1-5: info, 6-50: warning, 51-500: critical, 500+: incident)
- [ ] T085 [US6] Implement atomic Redis correction using Lua script (reconcile_balance.lua)
- [ ] T086 [US6] Create reconciliation worker in backend/src/workers/reconciliation-worker.ts running every 5 minutes
- [ ] T087 [US6] Add npm script for reconciliation worker in backend/package.json: `"reconcile": "tsx src/workers/reconciliation-worker.ts"`
- [ ] T088 [US6] Add credit_reconciliation_drift gauge metric to Prometheus
- [ ] T089 [US6] Add structured logging for drift events with userId, drift amount, and correction status
- [ ] T089b [US6] Configure Prometheus alert rule for credit drift > 100 credits or integrate with Grafana alerting (notify via Slack/PagerDuty when threshold exceeded)

**Checkpoint**: User Story 6 should be fully functional - credit reconciliation runs automatically every 5 minutes

---

## Phase 9: User Story 7 - Frontend Cookie Policy Compliance (Priority: P3)

**Goal**: Display cookie policy modal on first visit and record user consent

**Independent Test**: Clear browser storage, visit any page, verify modal appears with accept/decline options, choose one, verify modal doesn't appear again

### Frontend Implementation

- [ ] T090 [P] [US7] Create CookiePolicy component in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/components/CookiePolicy.tsx with modal UI
- [ ] T091 [US7] Implement localStorage check for cookie consent (key: 'cookie-consent')
- [ ] T092 [US7] Add CookiePolicy component to root layout in /Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/app/layout.tsx
- [ ] T093 [US7] Implement accept/decline handlers that set localStorage and close modal
- [ ] T094 [US7] Add cookie policy text explaining session cookies, analytics, and user rights

**Checkpoint**: User Story 7 should be fully functional - cookie policy modal works correctly

---

## Phase 10: Data Retention & Cleanup (Shared Feature)

**Purpose**: Automatically delete old verification results based on user retention settings

- [ ] T095 Create retention cleanup service in backend/src/services/retention-cleanup.ts with deleteExpiredResults() method
- [ ] T096 Implement batched DELETE query (10,000 rows per batch) joining verification_results with users table on dataRetentionDays
- [ ] T097 Create retention cleanup worker in backend/src/workers/retention-cleanup-worker.ts running daily at 2 AM UTC
- [ ] T098 Add partial index on verification_results(user_id, created_at) WHERE created_at < NOW() - INTERVAL '7 days'
- [ ] T099 Add npm script for retention cleanup in backend/package.json: `"cleanup:retention": "tsx src/workers/retention-cleanup-worker.ts"`
- [ ] T100 Add retention_cleanup_deleted_total gauge and retention_cleanup_duration_seconds histogram metrics

---

## Phase 11: Testing (Separate Phase)

**Purpose**: Comprehensive test coverage for all user stories

### Unit Tests

- [ ] T101 [P] Unit tests for VerificationService in backend/tests/unit/services/verification.test.ts
- [ ] T102 [P] Unit tests for CircuitBreakerService in backend/tests/unit/services/circuit-breaker.test.ts
- [ ] T103 [P] Unit tests for DashboardService in backend/tests/unit/services/dashboard-metrics.test.ts
- [ ] T104 [P] Unit tests for ReconciliationService in backend/tests/unit/services/reconciliation.test.ts
- [ ] T105 [P] Unit tests for UpstreamClient in backend/tests/unit/services/upstream-client.test.ts

### Integration Tests

- [ ] T106 [P] Integration test for POST /home/quick-verify in backend/tests/integration/routes/verification.test.ts
- [ ] T107 [P] Integration test for GET /home/quick-verify/recent in backend/tests/integration/routes/verification.test.ts
- [ ] T108 [P] Integration test for GET /home in backend/tests/integration/routes/dashboard.test.ts
- [ ] T109 [P] Integration test for GET /health/ready in backend/tests/integration/routes/health.test.ts
- [ ] T110 Integration test for worker job processing with upstream mock in backend/tests/integration/workers/verification-worker.test.ts
- [ ] T111 Integration test for circuit breaker state transitions in backend/tests/integration/services/circuit-breaker.test.ts
- [ ] T112 Integration test for credit reconciliation in backend/tests/integration/workers/reconciliation-worker.test.ts

### Contract Tests

- [ ] T113 [P] Contract test for verification-api.yaml endpoints in backend/tests/contract/verification-api.test.ts
- [ ] T114 [P] Contract test for dashboard-api.yaml endpoints in backend/tests/contract/dashboard-api.test.ts
- [ ] T115 [P] Contract test for health-api.yaml endpoints in backend/tests/contract/health-api.test.ts

### End-to-End Tests

- [ ] T116 E2E test for complete verification flow: sign in → verify email → see result → check history
- [ ] T117 E2E test for dashboard: sign in → perform verifications → view metrics → select time range
- [ ] T118 E2E test for insufficient credits: sign in with 0 credits → attempt verification → see 402 error

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [ ] T119 [P] Add OpenTelemetry span creation for all service methods (gateway.auth, gateway.credit_check, queue.enqueue, worker.process, upstream.verify)
- [ ] T120 [P] Update quickstart.md with actual setup steps for running mock upstream API
- [ ] T121 [P] Add environment variable validation for UPSTREAM_API_URL, UPSTREAM_API_KEY, LOKI_URL, OTEL_EXPORTER_URL
- [ ] T122 Code review and refactoring for consistency across services
- [ ] T123 Performance optimization: enable Redis pipelining for batch operations
- [ ] T124 Security hardening: validate all user inputs with Zod schemas
- [ ] T125 Add API response caching for GET /home/quick-verify/recent (5-minute cache)
- [ ] T126 Run quickstart.md validation on local environment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
  - US1 (Phase 3): Can start after Foundational ✅ MVP
  - US2 (Phase 4): Can start after Foundational (independent)
  - US3 (Phase 5): Can start after Foundational (independent)
  - US4 (Phase 6): Can start after US1 (needs verification flow working)
  - US5 (Phase 7): Already complete in Foundational phase
  - US6 (Phase 8): Can start after US1 (needs credit system working)
  - US7 (Phase 9): Can start after Foundational (frontend-only, independent)
- **Data Retention (Phase 10)**: Can start after Foundational (independent background job)
- **Testing (Phase 11)**: Depends on all user stories being complete
- **Polish (Phase 12)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation only - No dependencies on other stories ✅ MVP
- **User Story 2 (P1)**: Foundation only - Independent
- **User Story 3 (P2)**: Foundation only - Independent
- **User Story 4 (P2)**: Requires US1 (verification flow must exist)
- **User Story 5 (P3)**: Foundation only - Already implemented
- **User Story 6 (P2)**: Requires US1 (credit system must be in use)
- **User Story 7 (P3)**: Foundation only - Independent

### Within Each User Story

- Backend implementation before frontend integration
- API endpoints before frontend hooks
- Core logic before error handling
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)**: All tasks T001-T006 can run in parallel (different packages)

**Phase 2 (Foundational)**:
- T012-T014 can run in parallel (different config files)
- T020-T023 can run in parallel (different health endpoints)

**Phase 3 (US1)**:
- T034-T035 can run in parallel (frontend setup)

**Phase 4 (US2)**:
- T045 can run in parallel with T041-T044 (frontend/backend independent)

**Phase 5 (US3)**:
- T057 can run in parallel with T050-T056 (frontend/backend independent)

**Phase 6 (US4)**:
- T073-T076 can run in parallel (different metric files)

**Phase 11 (Testing)**:
- All unit tests (T101-T105) can run in parallel
- All integration tests (T106-T112) can run in parallel
- All contract tests (T113-T115) can run in parallel

**After Foundational Complete**:
- US1, US2, US3, US7 can all start in parallel (independent stories)

---

## Parallel Example: User Story 1 Backend

```bash
# Launch all foundational infrastructure together:
Task T012: "Create Pino logger configuration in backend/src/config/logger.ts"
Task T013: "Create Prometheus metrics registry in backend/src/lib/metrics.ts"
Task T014: "Create OpenTelemetry instrumentation in backend/src/instrumentation.ts"

# Launch frontend setup in parallel with backend:
Task T034: "Create TanStack Query client in frontend/src/lib/query-client.ts"
Task T035: "Create verification API client in frontend/src/lib/api/verification.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only) ✅ RECOMMENDED

1. Complete Phase 1: Setup (T001-T008)
2. Complete Phase 2: Foundational (T009-T024) - CRITICAL
3. Complete Phase 3: User Story 1 (T025-T040)
4. Complete Phase 4: User Story 2 (T041-T049)
5. **STOP and VALIDATE**: Test both stories independently
6. Deploy/demo MVP with single email verification + history

### Incremental Delivery

1. Foundation (P1+P2) → Deploy health endpoints
2. Add US1+US2 (P3+P4) → Deploy MVP ✅
3. Add US3 (P5) → Deploy dashboard analytics
4. Add US4+US6 (P6+P8) → Deploy resilience features
5. Add US7+US5+Retention (P7+P9+P10) → Deploy compliance features
6. Add Testing (P11) → Full test coverage
7. Add Polish (P12) → Production-ready

### Parallel Team Strategy

With multiple developers after Foundational phase complete:

1. **Developer A**: User Story 1 (T025-T040) - Verification flow
2. **Developer B**: User Story 2 (T041-T049) - History
3. **Developer C**: User Story 3 (T050-T063) - Dashboard
4. **Developer D**: User Story 7 (T090-T094) - Cookie policy

Then proceed to:
- **Developer A**: User Story 4 (resilience)
- **Developer B**: User Story 6 (reconciliation)
- **Developer C**: Data retention
- **All**: Testing phase together

---

## Task Summary

**Total Tasks**: 128

**By Phase**:
- Phase 1 (Setup): 8 tasks
- Phase 2 (Foundational): 17 tasks
- Phase 3 (US1): 16 tasks ✅ MVP
- Phase 4 (US2): 9 tasks ✅ MVP
- Phase 5 (US3): 14 tasks
- Phase 6 (US4): 13 tasks
- Phase 7 (US5): 4 tasks
- Phase 8 (US6): 10 tasks
- Phase 9 (US7): 5 tasks
- Phase 10 (Retention): 6 tasks
- Phase 11 (Testing): 18 tasks
- Phase 12 (Polish): 8 tasks

**By Priority**:
- P1 (US1+US2): 25 tasks (MVP)
- P2 (US3+US4+US6): 37 tasks
- P3 (US5+US7): 9 tasks
- Infrastructure (Setup+Foundation+Retention+Testing+Polish): 57 tasks

**Parallelizable Tasks**: 42 tasks marked with [P]

**MVP Scope** (recommended first delivery):
- Phase 1: Setup (8 tasks)
- Phase 2: Foundational (17 tasks)
- Phase 3: User Story 1 (16 tasks)
- Phase 4: User Story 2 (9 tasks)
- **Total MVP**: 50 tasks

**Estimated MVP Timeline**: 5-7 days (with 2 developers working in parallel after foundation)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [US#] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Stop at any checkpoint to validate story independently
- Commit after each task or logical group
- BullMQ FREE version used (not Pro) - upgrade path built in via queue abstraction
- Mock upstream API used for development/testing - swap with real API by changing environment variable
