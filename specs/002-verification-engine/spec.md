# Feature Specification: Email Verification Engine & Dashboard

**Feature Branch**: `002-verification-engine`
**Created**: 2026-02-01
**Status**: Draft
**Input**: User description: "Email Verification Engine & Dashboard - Full 5-layer defense architecture with API gateway, BullMQ fair queue, autoscaling worker pool, circuit breaker, upstream proxy, credit system, and dashboard metrics"

## Clarifications

### Session 2026-02-01

- Q: Can verification results be shared across multiple users/accounts, or is each verification strictly private to the user who performed it? → A: Each verification is strictly private to the user who performed it (no sharing across accounts)
- Q: Should there be a maximum retention period for verification results (e.g., for GDPR/privacy compliance), or truly indefinite retention? → A: Retain for user's data retention period setting (from Epic 1 profile), default 30 days
- Q: Do different user tiers (Starter/Pro/Business/Titan) get different verification features, or only different rate limits? → A: no ratelimit now
- Q: What observability framework should be used for logging? → A: grafana framework
- Q: What log level should be used in production, and how long should logs be retained? → A: INFO level, 30-day retention
- Q: Should monitoring and health endpoints require authentication, or be publicly accessible (unauthenticated)? → A: Unauthenticated (allow Kubernetes probes and Prometheus to access without auth)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single Email Verification (Priority: P1)

As a user, I want to submit an email address for verification and receive an accurate result, so that I can determine if the email is valid before sending messages to it.

**Why this priority**: This is the core value proposition of the platform. Without single email verification, there is no MVP. This delivers immediate value and can be tested independently.

**Independent Test**: Can be fully tested by authenticating, entering an email address in the verification form, submitting it, and receiving a detailed result showing validity status, risk score, and attributes. Delivers immediate value for users needing to verify individual emails.

**Acceptance Scenarios**:

1. **Given** I am authenticated and have sufficient credits, **When** I submit a valid email address for verification, **Then** the system deducts 1 credit from my balance and returns a detailed result including status (valid/invalid/unknown/risky/disposable/catch_all/role), risk score (0-100), deliverability flag, reason, domain info, attributes list, server info (SMTP provider, MX records), and verification timestamp
2. **Given** I am authenticated but have 0 credits, **When** I attempt to submit an email for verification, **Then** the system returns an insufficient credits error without processing the verification
3. **Given** I am authenticated with credits, **When** I submit a malformed email address, **Then** the system returns a validation error without deducting credits
4. **Given** I am authenticated and submit an email, **When** the verification completes successfully, **Then** my updated credit balance is displayed and the result is stored in my verification history

---

### User Story 2 - Verification History & Recent Results (Priority: P1)

As a user, I want to view my recent verification results, so that I can reference past verifications without re-running them.

**Why this priority**: Essential for basic usability. Users need to access their verification history immediately after the verification feature exists. This prevents duplicate verifications and provides audit trail.

**Independent Test**: Can be fully tested by performing 2-3 verifications, then navigating to the verification page and confirming that the recent results (last 10) are displayed with all details intact. Delivers value by saving credits and time.

**Acceptance Scenarios**:

1. **Given** I have performed verifications in the past, **When** I navigate to the verification page, **Then** I see a list of my last 10 verification results with email, status, score, and timestamp (only my own verifications, no other users' results)
2. **Given** I am a new user with no verification history, **When** I access the verification page, **Then** I see an empty state message indicating no verifications yet
3. **Given** I have more than 10 past verifications, **When** I view my recent results, **Then** only the 10 most recent verifications are shown in reverse chronological order
4. **Given** another user has performed verifications, **When** I access my verification page, **Then** I see only my own verifications and cannot access or view other users' verification results

---

### User Story 3 - Dashboard Metrics & Usage Analytics (Priority: P2)

As a user, I want to view my verification activity metrics and trends over time, so that I can understand my usage patterns and plan my credit purchases.

**Why this priority**: Important for user engagement and informed decision-making, but not required for basic verification functionality. Users can perform verifications without seeing aggregated metrics.

**Independent Test**: Can be fully tested by performing 10-15 verifications over multiple days with various result statuses, then viewing the dashboard to confirm summary metrics (credit balance, total verifications, API calls), distribution chart (counts per status), and trend chart (daily verification counts) are accurate. Delivers value for usage planning and insights.

**Acceptance Scenarios**:

1. **Given** I am authenticated, **When** I access the dashboard, **Then** I see a summary section displaying my current credit balance, total lifetime verifications, total API calls, and verifications in the selected period
2. **Given** I have verification history with mixed results, **When** I view the dashboard, **Then** I see a distribution chart showing counts for each status category (valid, invalid, unknown, risky, disposable, catch-all, role)
3. **Given** I select a time range (7, 30, or 90 days), **When** the dashboard loads, **Then** I see a trend line chart showing daily verification counts over the selected period
4. **Given** I am a new user with no verification history, **When** I access the dashboard, **Then** all metrics show zero values and charts display empty states

---

### User Story 4 - System Resilience During Upstream Failures (Priority: P2)

As a user, I want the system to gracefully handle upstream API failures, so that my verification requests don't fail or result in lost credits when the upstream service has temporary issues.

**Why this priority**: Critical for user trust and credit integrity, but not required for initial MVP. Can be added once basic verification is proven. Prevents user frustration and credit disputes.

**Independent Test**: Can be tested independently by simulating upstream API failures (using feature flags or test mode) and confirming that verification jobs remain queued (not lost), credits are not deducted until successful verification, and users receive appropriate retry messages. Delivers value through reliability and fair credit handling.

**Acceptance Scenarios**:

1. **Given** the upstream API is experiencing failures, **When** I submit a verification request, **Then** my job is queued and my credits are held but not deducted until the job processes successfully
2. **Given** my verification job fails all retry attempts, **When** the job is moved to the dead letter queue, **Then** my credit is automatically refunded and I receive a notification
3. **Given** the circuit breaker has opened due to upstream failures, **When** I submit a verification request, **Then** I receive a temporary service unavailable message with an estimated retry time
4. **Given** the upstream API recovers after failures, **When** the circuit breaker closes, **Then** queued jobs are processed automatically without user intervention

---

### User Story 5 - Platform Health & Service Status (Priority: P3)

As a platform operator, I want health check endpoints and monitoring metrics exposed, so that I can monitor system health and detect issues before users are affected.

**Why this priority**: Important for operations but not user-facing. Can be implemented after core verification features are stable. Primarily benefits DevOps/SRE teams.

**Independent Test**: Can be tested independently by querying health endpoints (/health/live, /health/ready, /health/startup) and metrics endpoint (/metrics), then simulating database/Redis failures to verify readiness probes return correct status. Delivers value through operational visibility and incident prevention.

**Acceptance Scenarios**:

1. **Given** the application is running normally, **When** the liveness probe is checked, **Then** it returns a 200 OK status
2. **Given** the application has started but PostgreSQL is unreachable, **When** the readiness probe is checked, **Then** it returns a 503 status indicating degraded state
3. **Given** the application is initializing, **When** the startup probe is checked, **Then** it returns 200 only after workers are connected to the queue
4. **Given** Prometheus scrapes the metrics endpoint, **When** the response is returned, **Then** key metrics are available including queue depth, upstream error rate, circuit breaker state, Redis memory usage, credit reconciliation drift, DLQ depth, and worker utilization

---

### User Story 6 - Credit Reconciliation & Accuracy (Priority: P2)

As a user, I want my credit balance to always be accurate, so that I never lose credits due to system errors or crashes.

**Why this priority**: Essential for user trust and billing accuracy, but can be implemented shortly after credit deduction is working. Users won't notice reconciliation running in the background.

**Independent Test**: Can be tested independently by performing verifications, then comparing Redis credit balance against PostgreSQL credit events ledger, and verifying that any drift is auto-corrected within 10 minutes. Delivers value through credit accuracy and auditability.

**Acceptance Scenarios**:

1. **Given** the reconciliation job runs every 5 minutes, **When** it compares Redis credit balance against PostgreSQL ledger for my account, **Then** any mismatch is detected and Redis is corrected from the authoritative PostgreSQL source
2. **Given** a worker crashes with in-flight verification jobs, **When** stalled job detection triggers, **Then** stalled jobs are requeued without additional credit deduction and my balance remains accurate
3. **Given** there is a credit drift exceeding the threshold, **When** reconciliation detects the drift, **Then** an alert is fired and the drift is logged for investigation
4. **Given** Redis temporarily goes down, **When** it recovers, **Then** the reconciliation job restores all credit balances from PostgreSQL within 10 minutes

---

### User Story 7 - Frontend Cookie Policy Compliance (Priority: P3)

As a user visiting the platform for the first time, I want to be informed about cookie usage and provide consent, so that I understand how my data is used and the platform complies with legal requirements.

**Why this priority**: Required for legal compliance but not critical for core verification functionality. Can be implemented after authentication and verification features are working.

**Independent Test**: Can be tested independently by clearing browser storage, visiting any page, and confirming the cookie policy modal appears with accept/decline options. After choosing, confirm the modal doesn't appear on subsequent visits. Delivers value through legal compliance.

**Acceptance Scenarios**:

1. **Given** I visit the platform for the first time, **When** the page loads, **Then** a cookie policy modal is displayed with information about cookie usage and accept/decline options
2. **Given** I accept or decline the cookie policy, **When** my choice is recorded, **Then** the modal does not appear again on subsequent visits
3. **Given** I have previously accepted cookies, **When** I visit the platform again, **Then** the cookie policy modal does not appear

---

### Edge Cases

- What happens when the queue depth exceeds 1 million jobs? (System should reject new requests with 503 and Retry-After header)
- How does the system handle concurrent credit deductions for the same user? (Redis Lua atomicity prevents race conditions)
- What happens when an email format is invalid? (422 validation error before credit deduction)
- How does the system handle upstream API timeouts exceeding 15 seconds? (Job is retried per retry policy, circuit breaker may open)
- What happens when a user has exactly 1 credit and submits a verification? (Credit is deducted atomically, balance goes to 0)
- How does the system handle bulk verification when queue depth exceeds 500K? (Bulk requests rejected with 503, single verifications still accepted)
- What happens when the upstream API returns a non-retryable error (400, 401, 403, 422)? (Job moves to DLQ immediately, credit is refunded)
- How does the system handle Redis memory exhaustion? (maxmemory-policy: noeviction prevents data loss, alerts fire)
- What happens when a worker crashes during verification? (BullMQ stalled job detection requeues job, credit reconciliation corrects drift)
- How does the system prevent duplicate verifications? (Idempotency keys in Redis with 1hr TTL)
- What happens to verification results when they exceed the user's data retention period? (Automatically deleted via scheduled cleanup job, no longer accessible in history or dashboard metrics)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users via session cookies before allowing verification requests
- **FR-002**: System MUST check user credit balance atomically using Redis Lua script (check >= 1, then DECRBY 1) before processing verification
- **FR-003**: System MUST return 402 Insufficient Credits error when user balance is less than 1 credit
- **FR-004**: System MUST validate email format before deducting credits and return 422 for malformed emails
- **FR-005**: System MUST enqueue verification jobs to BullMQ with priority-based fair queuing to prevent tenant monopolization
- **FR-006**: System MUST assign priority 1 (high) to single email verification jobs
- **FR-007**: System MUST store verification results with status, risk score (0-100), deliverability flag, reason, domain, attributes array, server info (SMTP provider, MX records), and verification timestamp
- **FR-008**: System MUST return verification result with 200 status including full result object and remaining credit balance
- **FR-009**: System MUST retrieve last 10 verification results for authenticated user in reverse chronological order, scoped strictly to that user's own verifications (no cross-account access)
- **FR-010**: System MUST provide dashboard metrics including credit balance, total verifications (all-time and period), total API calls, distribution by status (7 categories), and daily trend data
- **FR-011**: System MUST support time range selection (7, 30, 90 days) for dashboard metrics
- **FR-012**: System MUST implement circuit breaker that opens at 50% failure rate over last 100 upstream calls
- **FR-013**: System MUST block upstream calls for 30 seconds when circuit breaker is in OPEN state
- **FR-014**: System MUST transition circuit breaker to HALF-OPEN after 30 seconds and permit 5 test calls
- **FR-015**: System MUST close circuit breaker if all 5 test calls succeed, or return to OPEN if any fail
- **FR-016**: System MUST refund credits automatically when verification job moves to Dead Letter Queue after exhausting retries
- **FR-017**: System MUST persist circuit breaker state to Redis for cross-worker coordination
- **FR-018**: System MUST retry failed verifications with exponential backoff and jitter (3 attempts: 0-1s, 0-4s, 0-16s)
- **FR-019**: System MUST NOT retry non-retryable errors (400, 401, 403, 422) and move to DLQ immediately
- **FR-020**: System MUST run credit reconciliation job every 5 minutes comparing Redis balance against PostgreSQL ledger
- **FR-021**: System MUST auto-correct Redis credit balance from PostgreSQL when drift is detected
- **FR-022**: System MUST alert when credit drift exceeds 100 credits
- **FR-023**: System MUST requeue stalled jobs without additional credit deduction when worker crashes detected
- **FR-024**: System MUST provide unauthenticated liveness probe endpoint (GET /health/live) returning 200 if process is running
- **FR-025**: System MUST provide unauthenticated readiness probe endpoint (GET /health/ready) returning 200 only when PostgreSQL and Redis are connected
- **FR-026**: System MUST provide unauthenticated startup probe endpoint (GET /health/startup) returning 200 only after workers are connected to queue
- **FR-027**: System MUST expose unauthenticated Prometheus metrics endpoint (GET /metrics) including queue_depth_total, upstream_error_rate, circuit_breaker_state, redis_memory_usage_percent, credit_reconciliation_drift, dlq_depth, worker_concurrency_utilization, http_503_rate
- **FR-028**: System MUST implement load shedding by rejecting requests with 503 when queue depth exceeds 1 million jobs
- **FR-029**: System MUST reject bulk verification requests (but accept single verifications) when queue depth exceeds 500K jobs
- **FR-030**: System MUST use idempotency keys format {tenantId}:{emailHash}:{timestamp} in Redis with 1hr TTL
- **FR-031**: System MUST display cookie policy modal on first visit for users without recorded consent
- **FR-032**: System MUST persist cookie consent choice (accept/decline) and not show modal again on subsequent visits
- **FR-033**: System MUST aggregate verification metrics server-side using SQL GROUP BY (not return raw results for large datasets)
- **FR-034**: System MUST return empty state message when user has no verification history
- **FR-035**: System MUST enforce strict data isolation - verification results are private to the user who performed the verification and MUST NOT be accessible to other users
- **FR-036**: System MUST automatically delete verification results older than the user's configured dataRetentionDays setting (default 30 days from Epic 1 user profile)
- **FR-037**: System MUST log application events at INFO level to Grafana Loki with structured logging format (JSON)
- **FR-038**: System MUST retain logs for 30 days in Grafana Loki
- **FR-039**: System MUST log ERROR level events for all verification failures, circuit breaker state changes, credit reconciliation drift, and DLQ additions
- **FR-040**: System MUST restrict monitoring and health endpoints (/health/*, /metrics) to internal network access only in production via Kubernetes NetworkPolicy or equivalent firewall rules

### Key Entities *(data involved)*

- **Verification Result**: Represents the outcome of a single email verification, including unique ID, owning user ID, email address, status (valid/invalid/unknown/risky/disposable/catch_all/role), risk/reputation score (0-100), deliverability boolean, human-readable reason, domain, attributes array (name/value/score/checked for is_role, is_free, is_disposable, is_catchall), server info (SMTP provider, MX records), verification timestamp. Each result is privately owned by the user who performed the verification.
- **Email Attribute**: Represents a specific attribute of a verified email, including attribute name (e.g., is_role, is_free), value (true/false), risk score level (high/medium/low), and checked status
- **Server Info**: Represents email server details, including SMTP provider name and comma-separated MX records
- **Dashboard Summary**: Aggregated metrics including current credit balance, total lifetime verifications, total API calls, period verifications count
- **Distribution Data**: Verification count breakdown by status category (valid, invalid, unknown, risky, disposable, catch_all, role)
- **Trend Data**: Daily verification counts over selected time range, including date (YYYY-MM-DD) and count per status category
- **Credit Event**: Represents a credit transaction, including event ID, user ID, type (deduct/refund/purchase), amount, balance after transaction, reference type/ID, idempotency key, timestamp
- **Circuit Breaker State**: Represents upstream health status, including current state (OPEN/HALF-OPEN/CLOSED), failure count, last transition timestamp
- **Verification Job**: Represents a queued verification task, including job ID, tenant ID, email, priority, retry attempts, status (queued/processing/completed/failed), timestamps

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can submit an email for verification and receive a result within 15 seconds under normal conditions (95th percentile)
- **SC-002**: System maintains 99.9% accuracy in credit accounting (reconciliation drift under 0.1% of total credits)
- **SC-003**: System handles 1000 concurrent verification requests without queue depth exceeding 100K jobs
- **SC-004**: Circuit breaker prevents 100% of upstream calls within 30 seconds when upstream failure rate exceeds 50%
- **SC-005**: Users receive automatic credit refunds within 10 minutes for 100% of failed verifications that exhaust retries
- **SC-006**: Dashboard metrics load in under 2 seconds for users with 100K verification history
- **SC-007**: System maintains 99.5% uptime as measured by readiness probe (excluding planned maintenance)
- **SC-008**: Zero credit loss occurs due to worker crashes or system failures (validated through reconciliation logs)
- **SC-009**: Users can view their last 10 verification results instantly (under 500ms response time)
- **SC-010**: System rejects 100% of verification requests with malformed emails before deducting credits
- **SC-011**: Fair queuing ensures no single tenant monopolizes more than 10% of processing capacity when 10+ tenants are active
- **SC-012**: Stalled jobs are detected and requeued within 60 seconds of worker crash
- **SC-013**: System successfully processes 95% of verification requests on first attempt (no retries needed)
- **SC-014**: Dead Letter Queue depth remains under 1000 jobs during normal operations
- **SC-015**: Cookie policy modal appears for 100% of first-time visitors and does not appear for returning users who have made a choice

## Assumptions

- **Upstream API**: The upstream email verification API is already contracted and API key is available
- **Rate Limits**: Upstream API supports at least 1000 requests/second (global token bucket limit)
- **Redis Instance**: A dedicated Redis 7+ instance with maxmemory-policy: noeviction and appendonly: yes is available
- **PostgreSQL**: PostgreSQL 16+ instance is available and already contains users and sessions tables from Epic 1
- **BullMQ**: Using free version with priority-based fair queuing (upgrade path to Pro available for future multi-tenant group features)
- **Email Format**: Standard email validation (RFC 5322) is sufficient for FR-004
- **Session Auth**: Session-based authentication from Epic 1 is fully functional
- **Initial Credits**: New users receive initial credit allocation (e.g., signup bonus) from Epic 1
- **Time Zones**: All timestamps are stored in UTC
- **Retention**: Verification results are retained according to the user's dataRetentionDays setting from Epic 1 (default 30 days), after which they are automatically deleted
- **Worker Scaling**: Kubernetes or similar orchestration platform is available for autoscaling workers (2-50 workers)
- **Monitoring Stack**: Prometheus and Grafana are available for metrics collection and visualization; Grafana Loki is available for log aggregation and querying
- **SSL/TLS**: All API communication uses HTTPS in production
- **Cookie Consent**: Cookie policy modal is sufficient for GDPR/CCPA compliance (legal review completed)

## Dependencies

- **Epic 1 (User Auth & Profile)**: Must be complete - provides authentication, session management, users table, initial credit allocation
- **PostgreSQL Database**: Must be provisioned and accessible
- **Redis Instance**: Must be provisioned with correct configuration (noeviction, appendonly)
- **BullMQ (Free Version)**: Will be installed as npm dependency; Pro license can be acquired later for enhanced multi-tenant features
- **Upstream API Contract**: Must be finalized with API key and rate limit details
- **Monitoring Infrastructure**: Prometheus and Grafana must be set up for health checks and metrics; Grafana Loki must be set up for log aggregation

## Out of Scope

- Bulk email verification (CSV/JSON upload) - covered in future epic
- Webhook notifications for verification completion - covered in future epic
- API key-based authentication for public API - covered in future epic
- Per-user rate limiting by tier - deferred to future epic
- Custom retry policies per user - all users use same exponential backoff
- Real-time verification progress updates via SSE - covered in future epic
- Verification result export (CSV/JSON download) - covered in future epic
- Credit purchase and billing integration - covered in future epic
- Multi-factor authentication for sensitive operations - covered in future epic
- Role-based access control (teams/organizations) - covered in future epic
- Custom verification attributes or upstream provider selection - single upstream API only
