# Epic 2: Email Verification Engine & Dashboard

## Epic Goal

The full 5-layer defense architecture is operational: API gateway with auth and credit checks, BullMQ Pro fair queue with per-tenant round-robin, autoscaling worker pool, circuit breaker with Redis state persistence, and upstream proxy with connection pooling. Credit system is live with atomic Redis Lua deduction, PostgreSQL ledger, automatic refund on failure, and 5-minute reconciliation. Users can verify individual emails and see detailed results. Dashboard displays credit balance, total verifications, validity distribution donut chart, and trend line chart.

**FRs covered:** FR14, FR15, FR22, FR23, FR28, FR29, FR31, FR43, FR44, FR45, FR57, FR58, FR59, FR60, FR61
**Dependencies:** Epic 1 (authentication, sessions, users table, initial credit allocation)

---

# Backend Stories

## Story 2.1: Verification Engine (Gateway, Queue, Worker, Upstream Proxy)

As a user,
I want to submit an email for verification and receive an accurate result,
So that I can determine if the email is valid before sending to it.

**FRs:** FR14, FR22, FR28, FR29, FR57 | **NFRs:** NFR1, NFR18, NFR19, NFR20, NFR22, NFR32, NFR33

**Acceptance Criteria:**

**Given** a POST to `/home/quick-verify` with `{ email }` and valid session
**When** the request reaches the API gateway
**Then** the user is authenticated via session cookie
**And** the credit balance is checked atomically (Redis Lua: check >= 1, then DECRBY 1)
**And** if insufficient credits, return 402 `{ error: "Insufficient credits", credits: 0 }`

**Given** a valid request with available credits
**When** the job is enqueued to BullMQ Pro
**Then** it is placed in the tenant's group (fair round-robin across all tenants)
**And** assigned priority 1 (high priority — single verify)
**And** a worker picks the job and calls the upstream API via undici connection pool

**Given** the upstream API returns a result
**When** the worker processes the response
**Then** the result is stored in `verification_results` (status, risk_score, details JSONB)
**And** the response returns 200 with the full result object (see API Contract)

**Edge Cases:**
- Upstream timeout (>15s total) → job retried per retry policy (Story 2.2)
- Malformed email input → 422 validation error before credit deduction
- Queue depth > 1M → 503 with `Retry-After` header (load shedding)
- Queue depth > 500K → 503 for bulk only; single verify still accepted
- Concurrent credit deductions for same user → Redis Lua atomicity prevents race conditions

**Technical Context:**
- 5-layer architecture: architecture Sections 2–5 (gateway, queue, worker pool, circuit breaker, upstream proxy)
- Table created: `verification_results` (architecture Section 12)
- Redis Lua credit script: architecture Section 2, Layer 1
- BullMQ Pro queue config: tenant groups, per-group rate limiting, `removeOnComplete: true`, `removeOnFail: 1000`
- Redis config: `maxmemory-policy: noeviction`, `appendonly: yes`, dedicated instance
- Token bucket: 1,000 tokens/sec global upstream rate control
- Connection pool: undici max 200, timeouts 3s/10s/15s (connect/read/total)
- Idempotency keys: `{tenantId}:{emailHash}:{timestamp}` in Redis, 1hr TTL
- Endpoint: `POST /home/quick-verify`
- Worker pool: start with 10 workers × 50 concurrent jobs

---

## Story 2.2: Circuit Breaker, Retry Policy & DLQ

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

## Story 2.3: Credit Reconciliation

As a platform operator,
I want credits to always be accurate between cache and database,
So that users never lose credits and audit trails remain consistent.

**FRs:** FR23, FR60 | **NFRs:** NFR29

**Acceptance Criteria:**

**Given** the reconciliation job runs every 5 minutes
**When** it compares Redis credit balance against PostgreSQL `SUM(amount) FROM credit_events` for each active tenant
**Then** if mismatch > threshold: Redis is auto-corrected from PostgreSQL
**And** reconciliation results are logged to monitoring
**And** alert fires if drift exceeds 100 credits

**Given** a worker crashes with in-flight jobs
**When** BullMQ stalled job detection triggers (30-second intervals)
**Then** stalled jobs are requeued without additional credit deduction
**And** the reconciliation job corrects any drift within 10 minutes

**Edge Cases:**
- Redis goes down → credit operations fail closed (reject requests), reconciliation catches up on recovery
- PostgreSQL goes down → credits continue via Redis, events queued, reconciliation catches up
- Massive drift detected (>1000 credits) → alert + manual investigation required

**Technical Context:**
- Reconciliation job: architecture Section 3 — SUM(amount) from credit_events vs GET user:{tenantId}:credits
- In-flight credit refund: architecture Section 17 — stalled job detection + drift correction
- BullMQ stalled job config: stallInterval 30s
- Prometheus metric: `credit_reconciliation_drift`

---

## Story 2.4: Dashboard Metrics API

As a user,
I want to retrieve my verification activity metrics,
So that the dashboard can display usage summaries, distribution charts, and trend data.

**FRs:** FR43, FR44, FR45 | **NFRs:** NFR2

**Acceptance Criteria:**

**Given** a GET to `/home` with valid session
**When** the request is processed
**Then** the response includes:
- `summary`: credit balance, total verifications (all time + period), total API calls
- `distribution`: counts per status (valid, invalid, unknown, risky, disposable, catch-all, role) for the default period
- `trend`: daily verification counts over the requested time range

**Given** a GET to `/home?range=7|30|90`
**When** the range parameter is provided
**Then** the trend data covers the specified number of days
**And** the distribution data is scoped to the same range

**Edge Cases:**
- New user with no verification history → return zeroes for all metrics, empty trend array
- Large datasets (100K+ verifications) → aggregated server-side via SQL GROUP BY, not raw results
- Invalid range parameter → default to 30 days

**Technical Context:**
- Server-side aggregation: `SELECT status, COUNT(*) FROM verification_results WHERE user_id = ? AND created_at > ? GROUP BY status`
- Trend: `SELECT DATE(created_at), COUNT(*) FROM verification_results WHERE ... GROUP BY DATE(created_at)`
- Credit balance from Redis (fast path): `GET user:{userId}:credits`
- Endpoint: `GET /home`

---

## Story 2.5: Health Checks & Monitoring Foundation

As a platform operator,
I want health check endpoints and metrics collection,
So that I can monitor system health and detect issues before users are affected.

**FRs:** FR61 | **NFRs:** NFR24

**Acceptance Criteria:**

**Given** the application is running
**When** a liveness probe hits `GET /health/live`
**Then** it returns 200 if the process is running

**Given** the application has started
**When** a readiness probe hits `GET /health/ready`
**Then** it returns 200 only if both PostgreSQL and Redis are connected
**And** returns 503 if either dependency is unreachable

**Given** the application is initializing
**When** a startup probe hits `GET /health/startup`
**Then** it returns 200 only after workers are connected to the queue

**Given** Prometheus scrapes `GET /metrics`
**When** the response is returned
**Then** key metrics are available: `queue_depth_total`, `upstream_error_rate`, `circuit_breaker_state`, `redis_memory_usage_percent`, `credit_reconciliation_drift`, `dlq_depth`, `worker_concurrency_utilization`, `http_503_rate`

**Edge Cases:**
- Redis connection intermittent → readiness flaps, load balancer routes traffic away
- Metrics endpoint must not require authentication (Prometheus scrape)
- Health checks must respond within 1 second

**Technical Context:**
- Health endpoints: architecture Section 15
- Prometheus metrics: architecture Section 15 — all metrics with alert thresholds
- OpenTelemetry SDK: distributed tracing (architecture Section 15 — tracing subsection)
- Key spans: `gateway.auth`, `gateway.credit_check`, `queue.enqueue`, `worker.process`, `upstream.verify`
- Grafana dashboards for operational visibility

---

# API Contract

## Verification Endpoints

### `POST /home/quick-verify`

**Auth:** Session cookie
**Rate Limit:** Per-user tier (Starter: 10/sec → Titan: 500/sec)

```json
// Request
{
  "email": "string (required, valid email format)"
}

// Response 200
{
  "result": {
    "id": "string (uuid)",
    "email": "string",
    "status": "string (valid | invalid | unknown | risky | disposable | catch_all | role)",
    "score": "number (0-100, reputation/risk score)",
    "deliverable": "boolean",
    "reason": "string (human-readable explanation)",
    "domain": "string",
    "attributes": [
      {
        "name": "string (e.g. 'is_role', 'is_free', 'is_disposable', 'is_catchall')",
        "value": "string (e.g. 'true', 'false')",
        "score": "string (e.g. 'high', 'medium', 'low')",
        "checked": "boolean"
      }
    ],
    "serverInfo": {
      "smtpProvider": "string",
      "mxRecords": "string (comma-separated)"
    },
    "verifiedAt": "string (ISO 8601)"
  },
  "credits": "number (remaining balance)"
}

// Error 402
{ "error": "Insufficient credits", "credits": 0 }

// Error 422
{ "error": "Invalid email format" }

// Error 503
{ "error": "Service temporarily unavailable", "retryAfter": "number (seconds)" }
```

### `GET /home/quick-verify/recent`

**Auth:** Session cookie

```json
// Response 200
{
  "results": [
    { /* same result shape as above, last 10 verifications */ }
  ]
}
```

## Dashboard Endpoint

### `GET /home`

**Auth:** Session cookie

```json
// Request query params: ?range=7|30|90 (default 30)

// Response 200
{
  "summary": {
    "credits": "number",
    "totalVerifications": "number",
    "totalApiCalls": "number",
    "periodVerifications": "number"
  },
  "distribution": {
    "valid": "number",
    "invalid": "number",
    "unknown": "number",
    "risky": "number",
    "disposable": "number",
    "catchAll": "number",
    "role": "number"
  },
  "trend": [
    {
      "date": "string (YYYY-MM-DD)",
      "count": "number",
      "valid": "number",
      "invalid": "number",
      "unknown": "number",
      "risky": "number"
    }
  ]
}
```

## Health Endpoints

### `GET /health/live`
```json
// Response 200
{ "status": "ok" }
```

### `GET /health/ready`
```json
// Response 200
{ "status": "ok", "postgres": "connected", "redis": "connected" }

// Response 503
{ "status": "degraded", "postgres": "connected", "redis": "disconnected" }
```

### `GET /health/startup`
```json
// Response 200
{ "status": "ok", "workers": "connected", "queue": "ready" }
```

### `GET /metrics`
**Response:** Prometheus text format (not JSON)

## Frontend Type Mismatches

| Frontend Type | Current Value | Backend Value | Resolution |
|---------------|--------------|---------------|------------|
| `VerificationResult.status` | `VerificationStatus` enum | 7 statuses: valid, invalid, unknown, risky, disposable, catch_all, role | **Frontend must update** status-colors.ts to include `disposable`, `catch_all`, `role` statuses |
| `VerificationResult.score` | `number` | 0-100 risk/reputation score | Compatible |
| `VerificationResult.fullName` | `string?` | Not returned by upstream (email-only verification) | **Frontend must remove** — field does not exist in API |
| `VerificationResult.gender` | `string?` | Not returned by upstream | **Frontend must remove** — field does not exist in API |
| `VerificationResult.state` | `string?` | Not returned by upstream | **Frontend must remove** — field does not exist in API (`types/index.ts:20`) |
| `VerificationResult` missing fields | N/A | `deliverable: boolean`, `verifiedAt: string (ISO 8601)` | **Frontend must add** these 2 fields to type |
| `EmailAttribute` shape | `{ name: "Free", value: "Yes", score: ".95X", checked: true }` | `{ name: "is_free", value: "true", score: "high", checked: true }` | **Frontend must restructure** — attribute names use `is_*` prefix, values are `"true"/"false"`, scores are `"high"/"medium"/"low"` |

---

# Frontend Integration Stories

## Story 2.6: Single Verify Page Integration

As a frontend developer,
I want to wire the quick-verify page to the backend verification API,
So that users can submit emails and see real verification results.

**Depends on:** Story 1.8 (auth provider), Backend Story 2.1 deployed

**Acceptance Criteria:**

**Given** the quick-verify page at `/home/quick-verify`
**When** the user enters an email and submits
**Then** `POST /home/quick-verify` is called via TanStack Query mutation
**And** a loading state is shown (spinner/skeleton) during verification
**And** on success, the result card displays: status badge (color-coded), score gauge, deliverability, attributes, server info

**Given** a verification result is displayed
**When** the user views the result card
**Then** all fields from the API response are rendered:
- Status badge with color from `statusConfig` map
- Reputation score (0–100) as visual gauge/progress bar
- Attribute chips: is_role, is_free, is_disposable, is_catchall
- Domain info, MX records, SMTP provider in expandable section

**Given** the user navigates to quick-verify
**When** previous results exist
**Then** recent verifications are fetched via `GET /home/quick-verify/recent`
**And** displayed as a list below the input form

**Edge Cases:**
- 402 (no credits) → show "Insufficient credits" with link to billing
- 503 (service unavailable) → show retry message
- 422 (invalid email) → form validation error
- Network failure → toast error with retry option

**Technical Context:**
- Existing components: `src/components/dashboard/single-verify-input.tsx`, `email-detail-panel.tsx`, `verification-row.tsx`, `score-progress-bar.tsx`
- Replace mock data in `src/components/dashboard/recent-verifications.tsx`
- Use `useMutation` for verify action, `useQuery` for recent results
- Map API response to existing `VerificationResult` type (update type if needed)

---

## ~~Story 2.7: Dashboard Metrics & Charts Integration~~ — REMOVED

> **Decision #6:** There is no dedicated dashboard page. `/home` redirects to `/home/quick-verify`. The backend `GET /home` endpoint (Story 2.4) still provides metrics data, but it is consumed by the sidebar credit display and quick-verify page header — not a standalone dashboard page. Story 2.4 (backend) is retained; this frontend story is removed.

---

## Story 2.8: Cookie Policy Modal Integration

As a frontend developer,
I want to wire the cookie policy modal to display on appropriate page loads,
So that users are informed about cookie usage per legal requirements.

**Depends on:** Story 1.8 (auth provider)

**Acceptance Criteria:**

**Given** a user visits the quick-verify page (or any page) for the first time
**When** no cookie consent has been recorded
**Then** the `CookiePolicyModal` renders with accept/decline options

**Given** the user accepts or declines
**When** their choice is stored (localStorage or cookie)
**Then** the modal does not appear again on subsequent visits

**Technical Context:**
- Existing component: `src/components/modals/cookie-policy-modal.tsx` — renders on quick-verify page load
- Storage: `localStorage` key for consent status (no backend needed)
- Triggered on first visit only
