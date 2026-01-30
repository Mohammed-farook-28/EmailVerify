# Epic 2: Email Verification Engine & Dashboard

## Epic Goal

Users can verify individual emails via the web dashboard and see detailed results. The full 5-layer defense architecture is operational: API gateway with auth and credit checks, BullMQ Pro fair queue with per-tenant round-robin, autoscaling worker pool, circuit breaker with Redis state persistence, and upstream proxy with connection pooling. Credit system is live with atomic Redis Lua deduction, PostgreSQL ledger, automatic refund on failure, and 5-minute reconciliation. Dashboard displays credit balance, total verifications, validity distribution donut chart, and trend line chart.

**FRs covered:** FR14, FR15, FR22, FR23, FR28, FR29, FR31, FR43, FR44, FR45, FR57, FR58, FR59, FR60, FR61
**Dependencies:** Epic 1 (authentication, sessions, users table, initial credit allocation)

---

## Story 2.1: Verification Engine (Gateway, Queue, Worker, Upstream Proxy)

As a user,
I want to submit an email for verification and receive an accurate result,
So that I can determine if the email is valid before sending to it.

**FRs:** FR14, FR22, FR28, FR29, FR57 | **NFRs:** NFR1, NFR18, NFR19, NFR20, NFR22, NFR32, NFR33

**Acceptance Criteria:**

**Given** a signed-in user submitting an email for verification
**When** the request reaches the API gateway
**Then** the user is authenticated via session cookie
**And** the credit balance is checked atomically (Redis Lua: check >= 1, then DECRBY 1)
**And** if insufficient credits, return 402 "Insufficient credits"

**Given** a valid request with available credits
**When** the job is enqueued to BullMQ Pro
**Then** it is placed in the tenant's group (fair round-robin across all tenants)
**And** assigned priority 1 (high priority — single verify)
**And** a worker picks the job and calls the upstream API via undici connection pool

**Given** the upstream API returns a result
**When** the worker processes the response
**Then** the result is stored in verification_results (status, risk_score, details JSONB)
**And** the result is returned to the user
**And** the result includes one of: valid, invalid, unknown, risky, disposable, catch-all, role

**Edge Cases:**
- Upstream timeout (>15s total) → job retried per retry policy (Story 2.3)
- Malformed email input → 422 validation error before credit deduction
- Queue depth > 1M → 503 with Retry-After header (load shedding)
- Concurrent credit deductions for same user → Redis Lua atomicity prevents race conditions

**Technical Context:**
- 5-layer architecture: architecture Sections 2–5 (gateway, queue, worker pool, circuit breaker, upstream proxy)
- Tables created: `verification_results` (architecture Section 12)
- Redis Lua credit script: architecture Section 2, Layer 1
- BullMQ Pro queue config: tenant groups, per-group rate limiting, `removeOnComplete: true`, `removeOnFail: 1000`
- Redis config: `maxmemory-policy: noeviction`, `appendonly: yes`, dedicated instance
- Token bucket: 1,000 tokens/sec global upstream rate control
- Connection pool: undici max 200, timeouts 3s/10s/15s (connect/read/total)
- Idempotency keys: `{tenantId}:{emailHash}:{timestamp}` in Redis, 1hr TTL
- Endpoint: `POST /home/quick-verify`
- Worker pool: start with 10 workers × 50 concurrent jobs

---

## Story 2.2: Single Verify UI & Results Display

As a user,
I want to see detailed verification results in a clear UI,
So that I can make informed decisions about email validity.

**FRs:** FR15 | **NFRs:** NFR2

**Acceptance Criteria:**

**Given** a signed-in user on /home/quick-verify
**When** they enter an email address and submit
**Then** a loading state is shown while verification is in progress
**And** the result is displayed with all detail fields

**Given** verification results are returned
**When** displayed on the quick-verify page
**Then** the following fields are shown:
- Status badge (valid/invalid/unknown/risky/disposable/catch-all/role) with color coding
- Deliverability indicator (true/false)
- Reputation score (0–100, visual gauge or bar)
- Classification tags: is_role, is_free, is_disposable, is_catchall
- Technical details: domain, MX records, SMTP provider, SMTP status

**Edge Cases:**
- Verification takes longer than expected → show loading with message
- Upstream returns unknown status → display "Unknown" with explanation
- User submits same email twice → show cached result if recent, or re-verify

**Technical Context:**
- UI screens: `docs/figma/dashboard/spec.md` — Single Verify result layout
- Page spec: `docs/pages/02-quick-verify.md` — result card with reputation score
- API: `POST /home/quick-verify` returns full result JSON
- Result card design: status badge with tier colors, expandable technical details section

---

## Story 2.3: Circuit Breaker, Retry Policy & DLQ

As a platform,
I want to survive upstream API failures without losing jobs or credits,
So that users experience graceful degradation rather than errors.

**FRs:** FR31, FR58, FR59 | **NFRs:** NFR27, NFR28

**Acceptance Criteria:**

**Given** the upstream API starts failing (>50% failure rate over last 100 calls)
**When** the circuit breaker trips to OPEN state
**Then** all upstream calls are blocked for 30 seconds
**And** jobs remain in the queue (NOT lost or failed)
**And** workers wait rather than dropping jobs

**Given** the circuit breaker is in OPEN state
**When** 30 seconds elapse
**Then** the breaker transitions to HALF-OPEN
**And** 5 test calls are permitted
**And** if all 5 succeed → breaker closes (resume normal)
**And** if any fail → breaker returns to OPEN (wait another 30s)

**Given** a job that fails all 3 retry attempts
**When** it moves to the Dead Letter Queue
**Then** the credit is refunded atomically (Redis INCRBY + PostgreSQL credit_event type='refund')
**And** DLQ depth is monitored — alert fires when > 1,000 jobs

**Given** the circuit breaker state changes
**When** any worker detects the transition
**Then** the new state is written to Redis (`cb:upstream:state`)
**And** all workers read CB state from Redis before making upstream calls

**Edge Cases:**
- Non-retryable errors (400, 401, 403, 422) → immediate DLQ, no retry
- Retryable errors (429, 500, 502, 503, 504, timeout) → exponential backoff with jitter
- Retry budget: total retries capped at 10% of normal traffic volume
- Thundering herd on recovery → backoff + jitter + retry budget prevents stampede

**Technical Context:**
- Circuit breaker: `opossum` library (architecture Section 2, Layer 4)
- CB config: slidingWindowSize=100, failureRateThreshold=50%, waitDuration=30s, permittedCallsInHalfOpen=5
- Retry: 3 attempts, exponential with full jitter (0–1s, 0–4s, 0–16s)
- State persistence: Redis key `cb:upstream:state` (architecture Layer 4 gap fix)
- DLQ: BullMQ built-in dead letter, monitored via Prometheus metric `dlq_depth`

---

## Story 2.4: Credit Reconciliation & Balance Display

As a platform operator,
I want credits to always be accurate between cache and database,
So that users never see incorrect balances and no credits are lost.

**FRs:** FR23, FR60 | **NFRs:** NFR29

**Acceptance Criteria:**

**Given** the reconciliation job runs every 5 minutes
**When** it compares Redis credit balance against PostgreSQL credit_events SUM for each tenant
**Then** if mismatch > threshold: Redis is auto-corrected from PostgreSQL
**And** reconciliation results are logged to monitoring
**And** alert fires if drift exceeds 100 credits

**Given** a user viewing the dashboard
**When** the page loads
**Then** the current credit balance is displayed prominently
**And** the balance reflects the Redis value (fast path) for real-time accuracy

**Given** a worker crashes with in-flight jobs
**When** BullMQ stalled job detection triggers (30-second intervals)
**Then** stalled jobs are requeued without additional credit deduction
**And** the reconciliation job corrects any drift within 10 minutes

**Edge Cases:**
- Redis goes down → credit operations fail closed (reject requests), reconciliation catches up on recovery
- PostgreSQL goes down → credits continue via Redis, events queued, reconciliation catches up
- Massive drift detected (>1000 credits) → alert + manual investigation required

**Technical Context:**
- Reconciliation job: architecture Section 3 — runs every 5 min, SUM(amount) from credit_events vs GET user:{tenantId}:credits
- In-flight credit refund: architecture Section 17 — stalled job detection + reconciliation drift correction
- Dashboard credit display: architecture Section 3, credit_events table
- BullMQ stalled job config: stallInterval 30s

---

## Story 2.5: Dashboard Metrics & Charts

As a user,
I want to see my verification activity summarized on the dashboard,
So that I can monitor my usage patterns and credit consumption.

**FRs:** FR43, FR44, FR45 | **NFRs:** NFR2

**Acceptance Criteria:**

**Given** a signed-in user on /home (dashboard)
**When** the page loads
**Then** summary metric cards are displayed: credit balance, total verifications, total API calls

**Given** the dashboard is loaded
**When** verification history data is available
**Then** a donut chart shows email validity distribution (valid, invalid, unknown, risky, disposable, catch-all, role)
**And** each segment shows count and percentage
**And** colors match the design system status colors

**Given** the dashboard trend section is visible
**When** the user selects a time range (7, 30, or 90 days)
**Then** a line chart shows verification volume over the selected period
**And** the chart updates without full page reload

**Edge Cases:**
- New user with no verification history → empty state with "Start verifying" prompt
- Large datasets (100K+ verifications) → aggregated server-side, not sent raw to client
- Time range change → TanStack Query cache with background refetch

**Technical Context:**
- Charts: Recharts (React-native, declarative)
- State: TanStack Query for server state caching, background refetch
- UI screens: `docs/figma/dashboard/spec.md` — Dashboard layout, metric cards, donut chart, trend chart
- Page spec: `docs/pages/01-dashboard.md` — metric definitions, chart behavior
- API: `GET /home` returns dashboard aggregate data (metrics, distribution, trend)

---

## Story 2.6: Health Checks & Monitoring Foundation

As a platform operator,
I want health check endpoints and metrics collection,
So that I can monitor system health and detect issues before users are affected.

**FRs:** FR61 | **NFRs:** NFR24

**Acceptance Criteria:**

**Given** the application is running
**When** Kubernetes sends a liveness probe to /health/live
**Then** it returns 200 if the process is running

**Given** the application has started
**When** Kubernetes sends a readiness probe to /health/ready
**Then** it returns 200 only if both PostgreSQL and Redis are connected
**And** returns 503 if either dependency is unreachable

**Given** the application is initializing
**When** Kubernetes sends a startup probe to /health/startup
**Then** it returns 200 only after workers are connected to the queue

**Given** the monitoring system is running
**When** Prometheus scrapes the /metrics endpoint
**Then** key metrics are available: queue_depth_total, upstream_error_rate, circuit_breaker_state, redis_memory_usage_percent, credit_reconciliation_drift, dlq_depth, worker_concurrency_utilization, http_503_rate

**Edge Cases:**
- Redis connection intermittent → readiness flaps, Kubernetes routes traffic away
- Metrics endpoint must not require authentication (Prometheus scrape)
- Health checks must respond within 1 second

**Technical Context:**
- Health endpoints: architecture Section 15 — /health/live, /health/ready, /health/startup
- Prometheus metrics: architecture Section 15 — all key metrics with alert thresholds
- Distributed tracing: OpenTelemetry SDK setup (architecture Section 15 — tracing subsection)
- Key spans: gateway.auth, gateway.credit_check, queue.enqueue, worker.process, upstream.verify
- Grafana: dashboard configuration for operational visibility
