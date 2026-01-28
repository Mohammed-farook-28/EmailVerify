# EmailVerify Platform Architecture

**Version**: 1.0.0 | **Date**: 2026-01-27
**Context**: Multi-tenant email verification SaaS proxying a single upstream API key to 1000+ users

---

## 1. System Overview

EmailVerify is a multi-tenant email verification platform. All email verification work flows through a **single upstream API key** from the EmailVerify provider. The platform's job is to:

- Manage 1000+ user accounts, each with their own API keys and credit balances
- Queue, schedule, and fairly distribute verification requests across all users
- Prevent any single user from starving others (noisy neighbor problem)
- Survive upstream API degradation without data loss or system collapse
- Track credit consumption atomically without race conditions or double-charging

```
┌────────────────────────────────────────────────────────────────────────┐
│                         YOUR PLATFORM                                  │
│                                                                        │
│  Users (1000+)        API Gateway        Fair Queue        Workers     │
│  ┌──────────┐       ┌───────────┐      ┌──────────┐     ┌─────────┐    │
│  │ User API │──────>│ Auth +    │─────>│ BullMQ   │────>│ Worker  │    │
│  │ Keys     │       │ Rate Limit│      │ Pro      │     │ Pool    │    │
│  │ Credits  │       │ Credit Chk│      │ Groups   │     │ (N=10+) │    │
│  └──────────┘       │ Load Shed │      │ Priority │     │         │    │
│                     └───────────┘      │ DLQ      │     └────┬────┘    │
│                                        └──────────┘          │        │
│                                                              │        │
│  Circuit Breaker ◄───────────────────────────────────────────┘        │
│       │                                                               │
│       ▼                                                               │
│  Connection Pool (max 200)                                            │
│       │                                                               │
└───────┼───────────────────────────────────────────────────────────────┘
        │
        ▼  ONE API KEY (no rate limit)
   ┌─────────────────────────┐
   │  Upstream EmailVerify   │
   │  Verification API       │
   └─────────────────────────┘
```

---

## 2. Five-Layer Defense Architecture

Every layer knows when to stop accepting work. An overloaded system that rejects gracefully is better than one that accepts everything and crashes.

### Layer 1: API Gateway (Gatekeeper)

**Purpose**: Stop bad traffic early. Authenticate, rate limit, check credits, shed load.

**Technology**: Node.js/Express + Redis Lua scripts (sliding window rate limiter)

**Responsibilities**:
- Authenticate user API keys against database
- Check and atomically deduct user credits (Redis Lua script)
- Enforce per-user rate limits (sliding window in Redis)
- Enforce global rate limit (protect upstream)
- Load shed when queue depth exceeds threshold (HTTP 503 + Retry-After)
- Request validation (reject malformed input before it hits the queue)

**Per-User Rate Limits by Tier**:

| Tier | Requests/sec | Requests/hour | Concurrent |
|------|-------------|---------------|------------|
| Starter | 10 | 1,000 | 5 |
| Professional | 25 | 10,000 | 15 |
| Business | 50 | 20,000 | 30 |
| Enterprise | 100 | 50,000 | 50 |
| Premium | 200 | 100,000 | 100 |
| Titan | 500 | 1,000,000 | 200 |

**Global Rate Limit**: 2,000 requests/sec total across all users (protects upstream API)

**Load Shedding Triggers**:
- Queue depth > 500,000 pending jobs → reject new **bulk** requests (HTTP 503)
- Queue depth > 800,000 → reject all **non-critical** requests
- Single verify requests continue unless queue > 1,000,000
- Always return `Retry-After` header with estimated wait time

**Credit Check (Atomic Redis Lua Script)**:
```
-- Atomically check and deduct credits
local key = KEYS[1]            -- user:{userId}:credits
local amount = tonumber(ARGV[1]) -- credits to deduct
local current = tonumber(redis.call('GET', key) or '0')
if current >= amount then
  return redis.call('DECRBY', key, amount)
else
  return -1  -- insufficient credits
end
```

---

### Layer 2: Fair Queue (Traffic Controller)

**Purpose**: Ensure no tenant starves. Prioritize real-time requests over bulk. Bound queue size.

**Technology**: BullMQ Pro with Groups ($495/year) + dedicated Redis instance

**Queue Structure**:
```
email-verify queue
  ├── Group: tenant-abc (round-robin with all other groups)
  │   ├── Priority 1: single verify jobs (real-time)
  │   └── Priority 10: bulk batch chunks (async)
  ├── Group: tenant-def
  │   ├── Priority 1: single verify jobs
  │   └── Priority 10: bulk batch chunks
  └── Group: tenant-ghi
      └── ...
```

**Fair Scheduling**: BullMQ Pro Groups processes jobs in **round-robin** across all tenant groups. Within each group, jobs are FIFO with priority ordering. One tenant submitting 50,000 emails cannot block another tenant's single verification.

**Per-Group Rate Limiting**:
```typescript
// Default: 10 jobs/sec per tenant
const worker = new WorkerPro('email-verify', processFn, {
  group: { limit: { max: 10, duration: 1000 } },
  connection: redisConnection,
});

// Override for premium tenants
await queue.setGroupRateLimit('tenant-premium-abc', 100, 1000); // 100/sec
```

**Critical Redis Configuration**:
- `maxmemory-policy: noeviction` — BullMQ breaks if Redis evicts keys
- `appendonly: yes` with `appendfsync: everysec` — AOF persistence
- `removeOnComplete: true` on all jobs — prevents memory bloat (4.5M jobs = 10GB+ without this)
- `removeOnFail: 1000` — keep last 1000 failures for debugging
- Dedicated Redis instance — never share with cache or sessions

**Bounded Queue**: Maximum 1,000,000 total pending jobs. Beyond this, the gateway receives a backpressure signal and starts rejecting new bulk submissions.

**Dead Letter Queue**: After 3 failed attempts, jobs move to DLQ. DLQ is monitored — alerts fire when DLQ depth exceeds 1000. Failed job credits are refunded atomically.

---

### Layer 3: Worker Pool (Executor)

**Purpose**: Process verification jobs by calling the upstream API at a controlled rate.

**Technology**: BullMQ Pro Workers + Global Token Bucket (Redis)

**Configuration**:
- Start with **10 worker processes**
- Each worker handles **50 concurrent jobs** = 500 max concurrent upstream calls
- Workers run as separate Node.js processes (PM2 cluster or Kubernetes pods)

**Global Token Bucket** (controls upstream API call rate):
```
Bucket capacity:    1,000 tokens
Refill rate:        1,000 tokens/sec
Cost per API call:  1 token
When empty:         Worker waits (job stays in queue, NOT dropped)
```

**Autoscaling Rules**:

| Signal | Action | Threshold |
|--------|--------|-----------|
| Queue wait time > 5s | Scale UP (add workers) | Check every 30s |
| Workers idle > 5 min | Scale DOWN (remove workers) | Cooldown 300s |
| Queue depth > 100,000 | Scale UP aggressively | Max 50 workers |
| Worker CPU > 80% | Scale UP | Per-process check |

**Hard Cap**: 50 workers maximum. Beyond this, load shedding activates at the gateway rather than scaling further. This prevents upstream API abuse and cloud cost explosion.

**Graceful Shutdown**: Workers finish all in-flight jobs before stopping. No job is ever lost during scale-down or deployment.

---

### Layer 4: Circuit Breaker (Safety Valve)

**Purpose**: Survive upstream API failures without losing jobs or cascading.

**Technology**: `opossum` (Node.js circuit breaker library) or custom implementation

**Configuration**:
```javascript
const circuitBreaker = {
  slidingWindowSize: 100,         // track last 100 calls
  failureRateThreshold: 50,       // open at 50% failure rate
  waitDurationInOpenState: 30000, // block calls for 30 seconds
  permittedCallsInHalfOpen: 5,    // allow 5 test calls
  timeout: 10000,                 // 10s per upstream call
};
```

**State Transitions**:
```
CLOSED (normal operation)
    │
    │ failure rate > 50% of last 100 calls
    ▼
OPEN (all upstream calls blocked for 30s)
    │ jobs stay in queue — NOT lost
    │
    │ after 30 seconds
    ▼
HALF-OPEN (allow 5 test calls)
    │
    ├── 5/5 succeed → CLOSED (resume normal)
    └── any fail    → OPEN (wait another 30s)
```

**Retry Policy** (per individual job):
- Maximum **3 attempts**
- Backoff: **exponential with full jitter**
  - Attempt 1: random(0, 1s)
  - Attempt 2: random(0, 4s)
  - Attempt 3: random(0, 16s)
- After 3 failures → Dead Letter Queue
- **Never retry** non-retryable errors: 400, 401, 403, 422
- **Always retry** transient errors: 429, 500, 502, 503, 504, timeout

**Retry Budget**: Total retries capped at 10% of normal traffic volume. When normal traffic drops to zero, retries naturally stop (prevents thundering herd on recovery).

---

### Layer 5: Upstream Proxy (Single Pipe)

**Purpose**: Manage the single connection to the upstream EmailVerify API.

**Technology**: `undici` HTTP client (Node.js) with connection pooling

**Connection Pool**:
```javascript
const upstreamPool = {
  connections: 200,          // max concurrent HTTP connections
  pipelining: 1,             // no pipelining (one request per connection)
  keepAliveTimeout: 30000,   // 30s keep-alive
  keepAliveMaxTimeout: 600000, // 10 min max
};
```

 if put cluade it shou;d show but not orking 
L**Timeouts**:
- Connect timeout: **3 seconds** (fail fast if upstream unreachable)
- Read timeout: **10 seconds** (kill slow requests)
- Total timeout: **15 seconds** (absolute max per verification)

 if put cluade it shou;d show but not orking 
L**Idempotency**: Every verification request includes a unique idempotency key:
```
Key format: {tenantId}:{emailHash}:{timestamp}
```
If a retry hits the upstream with the same key, the cached result is returned instead of double-processing. Idempotency keys stored in Redis with 1-hour TTL.

---

## 3. Credit System Architecture

**Problem**: 1000 concurrent users deducting credits simultaneously. No race conditions. No double-charging. Full audit trail.

**Solution**: Dual-layer — Redis for speed, PostgreSQL for durability.

### Flow: Single Email Verification
```
1. User sends POST /api/verify { email: "test@example.com" }
2. Gateway authenticates API key → identifies tenant
3. Redis Lua: DECRBY tenant credits by 1
   - If result < 0: INCRBY to restore, return 402 "Insufficient credits"
   - If result >= 0: proceed
4. Enqueue job to BullMQ (high priority, tenant group)
5. Return 200 with job ID (or inline result if fast enough)
6. Worker processes job → calls upstream API
7. If upstream fails permanently (DLQ):
   - Redis INCRBY: credits += 1 (refund)
   - PostgreSQL: INSERT credit_event (type: 'refund', amount: 1, reason: 'verification_failed')
```

### Flow: Bulk Verification (50,000 emails)
```
1. User uploads CSV with 50,000 emails
2. Gateway validates file, counts emails
3. Redis Lua: DECRBY tenant credits by 50,000
   - If insufficient: return 402
4. Split into 500 batches of 100 emails
5. Enqueue all 500 jobs (low priority, tenant group)
6. Return 202 { jobId: "bulk-xyz", status: "processing" }
7. Workers process batches over time (round-robin with other tenants)
8. Progress updates via SSE to dashboard
9. On completion: notify via webhook + SSE
10. Failed individual emails: refund 1 credit each
```

### Credit Ledger (PostgreSQL)

```sql
CREATE TABLE credit_events (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    type            VARCHAR(20) NOT NULL,  -- 'purchase', 'deduct', 'refund', 'expire'
    amount          INTEGER NOT NULL,       -- positive for additions, negative for deductions
    balance_after   INTEGER NOT NULL,       -- running balance after this event
    reference_type  VARCHAR(50),            -- 'verification', 'bulk_job', 'subscription', 'manual'
    reference_id    VARCHAR(255),           -- job ID, invoice ID, etc.
    idempotency_key VARCHAR(255) UNIQUE,   -- prevent double-processing
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_events_tenant ON credit_events(tenant_id, created_at);
CREATE INDEX idx_credit_events_idempotency ON credit_events(idempotency_key);
```

### Reconciliation Job (every 5 minutes)
```
1. For each tenant:
   - SUM(amount) from credit_events WHERE tenant_id = X → PostgreSQL balance
   - GET user:{tenantId}:credits → Redis balance
   - If mismatch > threshold: alert + auto-correct Redis from PostgreSQL
2. Log reconciliation results to monitoring
```

---

## 4. Request Flow Diagrams

### Single Email Verification (Real-Time, < 500ms)
```
Client                Gateway              Redis           BullMQ          Worker         Upstream
  │                     │                    │               │               │               │
  │─── POST /verify ──>│                    │               │               │               │
  │                     │── auth key ───────>│               │               │               │
  │                     │<── tenant info ───│               │               │               │
  │                     │── deduct credit ─>│               │               │               │
  │                     │<── balance ok ────│               │               │               │
  │                     │── enqueue ────────────────────────>│               │               │
  │                     │                    │               │── pick job ──>│               │
  │                     │                    │               │               │── verify ────>│
  │                     │                    │               │               │<── result ───│
  │                     │                    │               │<── complete ──│               │
  │<── 200 result ─────│                    │               │               │               │
```

### Bulk Verification (Async, minutes to hours)
```
Client                Gateway              Redis           BullMQ          Worker         Upstream
  │                     │                    │               │               │               │
  │─── POST /bulk ────>│                    │               │               │               │
  │                     │── deduct 50K ────>│               │               │               │
  │                     │<── balance ok ────│               │               │               │
  │                     │── enqueue 500 ───────────────────>│               │               │
  │<── 202 jobId ──────│                    │               │               │               │
  │                     │                    │               │               │               │
  │  [SSE connection for progress]          │               │── batch 1 ──>│               │
  │                     │                    │               │               │── verify ────>│
  │<── progress 1/500 ─│                    │               │               │<── result ───│
  │                     │                    │               │── batch 2 ──>│               │
  │                     │                    │               │  ... (round-robin with other tenants)
  │<── progress 500/500│                    │               │               │               │
  │                     │                    │               │               │               │
  │─── GET /bulk/jobId/results ──>│         │               │               │               │
  │<── 200 CSV download│                    │               │               │               │
```

---

## 5. Failure Scenarios & Defenses

| # | Scenario | What Happens | Defense |
|---|----------|-------------|---------|
| 1 | One user floods system with 1M emails | Per-user rate limit blocks excess; accepted jobs queued at low priority | Layer 1 rate limiting + Layer 2 fair round-robin |
| 2 | Queue grows faster than workers drain | Gateway receives backpressure signal, starts returning 503 for bulk jobs | Bounded queue (1M max) + load shedding |
| 3 | Upstream API goes down completely | Circuit breaker opens; jobs stay in queue; retries after 30s | Layer 4 circuit breaker + queue persistence |
| 4 | Upstream API degrades (slow responses) | 10s timeout triggers; circuit breaker monitors failure rate | Timeouts + circuit breaker half-open probing |
| 5 | Redis runs out of memory | Never happens: `removeOnComplete`, bounded queue, `noeviction` policy | Layer 2 config + monitoring alerts at 80% |
| 6 | Worker crashes mid-job | BullMQ stalled job detection auto-requeues the job | Built-in BullMQ reliability |
| 7 | Retry storm after upstream recovery | Exponential backoff + jitter + 10% retry budget cap | Layer 4 retry policy |
| 8 | Permanent failures pile up | Dead Letter Queue with alerting; credits refunded per failed email | DLQ + atomic credit refund |
| 9 | Double-charging on retries | Idempotency key per verification prevents duplicate processing | Layer 5 idempotency |
| 10 | Credit race condition (concurrent deductions) | Redis Lua script is atomic — no race possible | Layer 1 Lua script |
| 11 | Redis goes down | Rate limiter fails OPEN (traffic passes); credit ops fail closed (reject) | Fail-open for non-critical, fail-closed for financial |
| 12 | PostgreSQL goes down | Credits still work via Redis; event logging queued; reconciliation catches up | Dual-layer credit system |
| 13 | Network partition between services | Circuit breakers on all inter-service calls; graceful degradation | Defense in depth |
| 14 | Deployment during high load | Rolling deployment with graceful shutdown; workers drain before stopping | Zero-downtime deploys |

---

## 6. Technology Stack

### Core Services

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **API Server** | Node.js + TypeScript + Express/Fastify | Matches frontend stack (Next.js); async I/O ideal for proxy workload |
| **Job Queue** | BullMQ Pro | Multi-tenant groups, per-group rate limiting, TypeScript-native, battle-tested |
| **Queue Storage** | Redis 7+ (dedicated instance) | Required by BullMQ; AOF persistence; sub-ms latency |
| **Rate Limiting** | Redis Lua scripts (sliding window) | Atomic, distributed, sub-ms; no race conditions |
| **Circuit Breaker** | `opossum` (Node.js) | Lightweight, promise-based, fits Node.js event loop |
| **HTTP Client** | `undici` | Connection pooling, fastest Node.js HTTP client |
| **Primary Database** | PostgreSQL 16+ | ACID for credits, advisory locks, JSONB for flexible schemas |
| **Credit Cache** | Redis (same or separate instance) | Atomic DECRBY for real-time credit checks |
| **Auth** | Google OAuth 2.0 + session cookies | Matches current EmailVerify auth flow |
| **Frontend** | Next.js (from Bolt) | SSR, API routes, matches existing UI |
| **Real-Time Updates** | Server-Sent Events (SSE) | Simpler than WebSockets; auto-reconnect; sufficient for progress updates |
| **Webhooks** | Custom webhook service | Notify tenant servers of bulk job completion |
| **Monitoring** | Prometheus + Grafana | Queue depth, error rates, credit balances, upstream latency |
| **Deployment** | Docker + Kubernetes (or PM2 for simpler setup) | Horizontal scaling of workers; health checks; rolling deploys |

### Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Kubernetes Cluster / PM2 Process Manager               │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │ API Gateway  │  │ API Gateway  │  │ API Gateway    │  │
│  │ (replica 1)  │  │ (replica 2)  │  │ (replica 3)    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬─────────┘  │
│         │                 │                 │             │
│         └─────────────────┼─────────────────┘             │
│                           │                               │
│                    ┌──────▼──────┐                        │
│                    │   Redis     │ (Sentinel/Cluster HA)  │
│                    │  - Queue    │                        │
│                    │  - Credits  │                        │
│                    │  - Rate Lim │                        │
│                    └──────┬──────┘                        │
│                           │                               │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐              │
│  │ Worker 1  │ │ Worker 2  │ │ Worker N  │  (autoscale)  │
│  │ (50 conc) │ │ (50 conc) │ │ (50 conc) │              │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘              │
│        │              │              │                    │
│        └──────────────┼──────────────┘                    │
│                       │                                   │
│                ┌──────▼──────┐                            │
│                │ Circuit     │                            │
│                │ Breaker     │                            │
│                └──────┬──────┘                            │
│                       │                                   │
│                ┌──────▼──────┐                            │
│                │ Connection  │  (max 200 HTTP conns)      │
│                │ Pool        │                            │
│                └──────┬──────┘                            │
│                       │                                   │
│  ┌─────────────┐      │                                   │
│  │ PostgreSQL  │      │                                   │
│  │ - Users     │      │                                   │
│  │ - Credits   │      │                                   │
│  │ - Audit Log │      │                                   │
│  └─────────────┘      │                                   │
└───────────────────────┼───────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Upstream       │
              │  EmailVerify    │
              │  API (1 key)    │
              └─────────────────┘
```

---

## 7. Database Schema (Core Tables)

### Users & Authentication

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(255),
    avatar_url      TEXT,
    google_id       VARCHAR(255) UNIQUE,
    password_hash   VARCHAR(255),          -- optional (for email/password login)
    language        VARCHAR(10) DEFAULT 'en',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### API Keys

```sql
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    key_prefix      VARCHAR(20) NOT NULL,  -- 'ev_live_' first 8 chars for display
    key_hash        VARCHAR(255) NOT NULL,  -- bcrypt hash of full key
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Credits & Billing

```sql
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_name       VARCHAR(50) NOT NULL,
    credits_per_period INTEGER NOT NULL,
    billing_cycle   VARCHAR(20) NOT NULL,  -- 'monthly', 'yearly'
    stripe_sub_id   VARCHAR(255),
    status          VARCHAR(20) DEFAULT 'active',
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE credit_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(20) NOT NULL,  -- 'purchase', 'subscription', 'deduct', 'refund'
    amount          INTEGER NOT NULL,
    balance_after   INTEGER NOT NULL,
    reference_type  VARCHAR(50),
    reference_id    VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Verification History

```sql
CREATE TABLE verification_results (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    email_checked   VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL,   -- 'valid','invalid','unknown','risky','disposable','catch_all','role'
    method          VARCHAR(10) NOT NULL,    -- 'web', 'api'
    bulk_job_id     UUID,                    -- NULL for single verify
    risk_score      SMALLINT,
    details         JSONB,                   -- full verification response
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bulk_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    total_emails    INTEGER NOT NULL,
    processed       INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'pending', -- 'pending','processing','completed','failed'
    results_url     TEXT,                           -- S3/storage URL for CSV download
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
```

---

## 8. API Design

### Public API (for user API keys)

```
Authentication: Bearer ev_live_xxxxxxxx (API key in Authorization header)

POST   /api/v1/verify              Single email verification
POST   /api/v1/bulk                Bulk verification (upload CSV or JSON array)
GET    /api/v1/bulk/:jobId         Get bulk job status and progress
GET    /api/v1/bulk/:jobId/results Download bulk results (CSV)
GET    /api/v1/credits             Get current credit balance
GET    /api/v1/usage               Get usage history (paginated)
```

### Internal API (for web dashboard, session auth)

```
Authentication: Session cookie

POST   /auth/callback/google       Google OAuth callback
POST   /auth/sign-out              Sign out (destroy session)

GET    /home                        Dashboard data
POST   /home/quick-verify          Single verify via web UI
POST   /home/bulk-verify           Bulk verify via web UI (file upload)
GET    /home/bulk-verify/:id       Bulk job progress (SSE endpoint)

GET    /home/api-keys              List API keys
POST   /home/api-keys              Create API key
DELETE /home/api-keys/:id          Delete API key

GET    /home/usage                 Usage history (with filters)
GET    /home/usage/export          Export usage data (CSV)

GET    /home/billing               Billing info and plans
POST   /home/billing/checkout      Create Stripe checkout session
POST   /home/billing/webhook       Stripe webhook handler

GET    /home/profile               Profile info
PUT    /home/profile/name          Update name
PUT    /home/profile/email         Update email
PUT    /home/profile/password      Update password
PUT    /home/profile/language      Update language
POST   /home/profile/avatar        Upload avatar
DELETE /home/profile               Delete account
```

---

## 9. Monitoring & Observability

### Key Metrics (Prometheus)

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| `queue_depth_total` | > 500,000 | Activate bulk load shedding |
| `queue_depth_total` | > 800,000 | Activate full load shedding |
| `queue_oldest_job_age_seconds` | > 300 (5 min) | Scale up workers |
| `upstream_error_rate` | > 10% | Warning; investigate |
| `upstream_error_rate` | > 50% | Circuit breaker should be OPEN |
| `circuit_breaker_state` | OPEN | Page on-call |
| `redis_memory_usage_percent` | > 80% | Investigate; potential OOM |
| `credit_reconciliation_drift` | > 100 credits | Alert; auto-correct |
| `dlq_depth` | > 1000 | Investigate systematic failures |
| `worker_concurrency_utilization` | > 90% for 5 min | Scale up workers |
| `http_503_rate` | > 5% | Load shedding active; scale or investigate |

### Health Check Endpoints

```
GET /health/live     → Process is running (liveness)
GET /health/ready    → Can accept traffic (DB + Redis connected)
GET /health/startup  → Initialization complete (workers connected to queue)
```

---

## 10. Scaling Projections

| Users | Emails/day | Peak req/sec | Workers Needed | Redis Memory | PostgreSQL Size/month |
|-------|-----------|-------------|----------------|-------------|----------------------|
| 100 | 500K | 50 | 2 | 500MB | 1GB |
| 500 | 5M | 200 | 5 | 1GB | 5GB |
| 1,000 | 25M | 500 | 10 | 2GB | 15GB |
| 5,000 | 100M | 2,000 | 40 | 5GB | 50GB |
| 10,000 | 500M | 5,000 | 50 (+ upstream negotiation) | 10GB | 200GB |

**Note**: At 5,000+ users, the single upstream API key becomes the true bottleneck. At that scale, negotiate multiple upstream API keys and implement key rotation/load balancing across them.

---

## 11. Key Design Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Queue technology | BullMQ Pro | SQS, RabbitMQ, Kafka | TypeScript-native; built-in multi-tenant groups; no external infra beyond Redis |
| Rate limiting | Redis Lua (sliding window) | Token bucket, leaky bucket | Sliding window gives accurate, smooth limiting for per-user fairness |
| Credit storage | Redis + PostgreSQL hybrid | PostgreSQL only, Redis only | Redis for speed (hot path), PostgreSQL for durability (audit trail) |
| Upstream call control | Leaky bucket (global) | Token bucket | Smooth constant-rate outflow protects upstream API |
| Real-time updates | SSE | WebSockets, polling | Simpler than WS; auto-reconnect; sufficient for progress bars |
| Circuit breaker | `opossum` | Custom, Resilience4j | Lightweight Node.js library; promise-based |
| Auth | Google OAuth | Email/password only, Magic links | Matches existing EmailVerify flow; lowest friction signup |
| Payments | Stripe | Paddle, LemonSqueezy | Industry standard; existing EmailVerify integration |

---

## 12. References (from deep research)

### Production Case Studies
- Slack Engineering: Scaling Job Queue — 1.4B jobs/day, Redis OOM outage, migration to Kafka
- Netflix: Prioritized Load Shedding — served 99.4% critical requests during 12x spike
- Cloudflare Nov 2025: Cascading failure from oversized internal file
- Stripe: 4-tier rate limiting with fail-open Redis

### Queue & Fairness
- AWS SQS Fair Queues (July 2025): Native multi-tenant fairness via MessageGroupId
- BullMQ Pro Groups: Per-tenant round-robin with rate limiting
- Inngest: Virtual queues via concurrency key expressions
- 2DFQ (Brown University): Two-dimensional fair queuing for cloud services

### Resilience Patterns
- AWS Builders Library: Load shedding, backpressure, queue management
- Resilience4j: Circuit breaker + bulkhead + rate limiter composition
- "Queues Don't Fix Overload" (ferd.ca): Bounded buffers are essential

### Credit & Idempotency
- Stripe/Brandur Leach: Idempotency keys in PostgreSQL at SERIALIZABLE isolation
- Airbnb: Avoiding double payments with idempotency
- Redis Lua scripts: Atomic check-and-deduct pattern
