# EmailVerify Platform Architecture

**Version**: 2.0.0 | **Date**: 2026-01-30
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
- Workers run as separate Node.js processes (Kubernetes pods on DOKS)

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
**Timeouts**:
- Connect timeout: **3 seconds** (fail fast if upstream unreachable)
- Read timeout: **10 seconds** (kill slow requests)
- Total timeout: **15 seconds** (absolute max per verification)

**Idempotency**: Every verification request includes a unique idempotency key:
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
| **Language** | TypeScript (full stack) | Type safety across frontend and backend; shared Zod schemas |
| **API Server** | Node.js + Express | Battle-tested, massive ecosystem, familiar patterns |
| **Frontend** | Next.js (App Router) + React | Server Components for data-heavy dashboard; streaming SSR |
| **UI Framework** | Tailwind CSS + shadcn/ui | Full control over dark theme styling; copy-paste components; no vendor lock-in |
| **Charts** | Recharts | React-native, declarative, supports donut/line/bar charts for dashboard |
| **State Management** | TanStack Query | Server state caching, background refetch, optimistic updates for dashboard data |
| **Forms** | React Hook Form + Zod | Performant uncontrolled forms; Zod schemas shared with backend validation |
| **ORM** | Drizzle ORM | SQL-like TypeScript ORM; lightweight; stays close to SQL for credit system atomics |
| **Primary Database** | PostgreSQL 16+ (DO Managed) | ACID for credits, advisory locks, JSONB; managed backups and failover |
| **Job Queue** | BullMQ Pro | Multi-tenant groups, per-group rate limiting, TypeScript-native |
| **Queue/Cache** | Redis 7+ (DO Managed) + ioredis | Required by BullMQ; atomic Lua scripts for credits/rate-limiting; single client library |
| **Rate Limiting** | Redis Lua scripts (sliding window) | Atomic, distributed, sub-ms; no race conditions |
| **Circuit Breaker** | `opossum` | Lightweight, promise-based, fits Node.js event loop |
| **HTTP Client** | `undici` | Connection pooling, fastest Node.js HTTP client for upstream proxy |
| **Auth** | Google OAuth 2.0 + email/password | Both methods; server-side PostgreSQL sessions; httpOnly cookies |
| **Payments** | Stripe | One-time purchases + recurring subscriptions; webhooks for lifecycle |
| **Email** | Resend | Transactional emails (verification, password reset, alerts); React Email templates |
| **Real-Time** | Server-Sent Events (SSE) | Simpler than WebSockets; auto-reconnect; Last-Event-ID for resumption |
| **File Storage** | DigitalOcean Spaces | S3-compatible; bulk result CSVs; pre-signed URLs; 14-day retention |
| **Webhooks** | Custom webhook service | HMAC-SHA256 signed; 4 event types; 4-attempt retry with backoff |
| **Testing** | Vitest | Fast, Vite-powered; Jest-compatible API; native ESM + TypeScript |
| **Edge/CDN** | Cloudflare | DDoS protection, WAF, bot management, CDN for static assets |
| **Monitoring** | Prometheus + Grafana | Queue depth, error rates, credit balances, upstream latency |
| **Deployment** | DigitalOcean Kubernetes (DOKS) | Horizontal worker scaling, rolling deploys, health checks |
| **Package Manager** | npm | Default, zero setup |

### Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────┐
│  DigitalOcean Kubernetes (DOKS) Cluster                  │
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

## 7. Authentication & Session Management

### Authentication Methods

The platform supports two authentication methods:

1. **Google OAuth 2.0** (Authorization Code Flow)
2. **Email/Password** (with mandatory email verification)

Google OAuth users have `email_verified` set to `true` automatically (Google guarantees verified emails). Email/password users must verify via a one-time code sent to their email before accessing the dashboard.

### Google OAuth Flow
```
1. User clicks "Sign in with Google"
2. Redirect to Google authorization endpoint with scopes: openid, email, profile
3. Google redirects back to /auth/callback/google with authorization code
4. Server exchanges code for tokens (access_token + id_token)
5. Extract email, name, avatar from id_token
6. Find or create user by google_id
7. Create session → set cookie → redirect to /home
```

**Account Linking**: If a user signs up with email/password and later signs in with Google using the same email, the accounts are linked (google_id is populated on the existing user record).

### Email/Password Flow
```
1. User submits email + password on /auth/sign-up
2. Validate email format, password strength (min 8 chars)
3. Hash password with bcrypt (cost factor 12)
4. Create user with email_verified = false
5. Send verification email with 6-digit code (expires in 15 minutes)
6. User enters code on /auth/verify-email
7. Set email_verified = true → create session → redirect to /home
```

**Password Reset**: User requests reset → receive email with 6-digit code (15 min expiry) → enter code + new password → password updated, all existing sessions invalidated.

### Session Management

**Strategy**: Server-side sessions stored in PostgreSQL.

**Session Token**:
- 256-bit cryptographically random value (32 bytes, base64url encoded)
- Stored as SHA-256 hash in `sessions.token_hash` (never store plaintext)
- Delivered via `httpOnly`, `Secure`, `SameSite=Strict` cookie
- Cookie name: `ev_session`

**Session Lifecycle**:
```
Creation:    On successful login (OAuth or email/password)
Expiry:      30 days from creation
Rotation:    New token generated on sensitive actions (password change, email change)
Revocation:  DELETE FROM sessions WHERE user_id = X (instant, all devices)
Cleanup:     Cron job deletes expired sessions every hour
Multi-device: Multiple concurrent sessions allowed (one per device/browser)
```

**Sensitive Action Re-authentication**: Password changes, email changes, account deletion, and API key creation require re-entering the current password (or re-authenticating via Google OAuth) within the last 10 minutes.

### CSRF Protection

All state-changing requests from the web dashboard include a CSRF token. The token is generated per-session, stored server-side, and validated on every POST/PUT/DELETE request. API key-authenticated requests (public API) are exempt since they use Bearer tokens, not cookies.

---

## 8. Webhook System

### Event Types

| Event | Trigger | Payload Contains |
|-------|---------|-----------------|
| `verification.completed` | Single email verification finishes | email, status, risk_score, details |
| `bulk.completed` | All emails in a bulk job are processed | job_id, total_emails, results_summary, download_url |
| `bulk.failed` | Bulk job fails permanently | job_id, error_reason, processed_count, refunded_credits |
| `credits.low` | Credit balance drops below 10% of last purchase | current_balance, threshold, user_id |

### Payload Format

```json
{
  "id": "evt_a1b2c3d4e5f6",
  "type": "bulk.completed",
  "created_at": "2026-01-30T12:00:00Z",
  "data": {
    "job_id": "bulk-xyz-123",
    "total_emails": 50000,
    "results": {
      "valid": 42000,
      "invalid": 5000,
      "unknown": 2000,
      "risky": 1000
    },
    "download_url": "/api/v1/bulk/bulk-xyz-123/results"
  }
}
```

### Security (HMAC-SHA256 Signing)

Every webhook delivery includes two headers for verification:

```
X-EV-Signature-256: sha256=<HMAC-SHA256 hex digest>
X-EV-Timestamp: <Unix timestamp of delivery attempt>
```

**Signing Process**:
1. Generate per-webhook signing secret on creation (`whsec_` + 32 random bytes, base64url)
2. Construct signed payload: `${timestamp}.${raw_json_body}`
3. Compute HMAC-SHA256 of signed payload using the webhook secret
4. Include hex digest in `X-EV-Signature-256` header

**Recipient Verification**:
1. Extract timestamp and signature from headers
2. Reject if timestamp is older than 5 minutes (replay protection)
3. Compute HMAC-SHA256 of `${timestamp}.${raw_body}` using their copy of the secret
4. Compare computed signature with received signature (constant-time comparison)

### Retry Policy

```
Attempt 1: Immediate
Attempt 2: 1 minute after failure
Attempt 3: 5 minutes after failure
Attempt 4: 30 minutes after failure (final)
```

- **Timeout**: 10 seconds per delivery attempt
- **Success**: Any HTTP 2xx response
- **Failure**: Non-2xx response, timeout, or connection error
- **After 4 failures**: Webhook marked as `failing`. User notified via email. Webhook paused until user re-enables from dashboard.
- **Logging**: All delivery attempts logged with status code, latency, and error details

### Webhook Database Schema

```sql
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    secret_hash     VARCHAR(255) NOT NULL,     -- bcrypt hash of whsec_ secret
    events          TEXT[] NOT NULL,            -- array of subscribed event types
    status          VARCHAR(20) DEFAULT 'active', -- 'active', 'failing', 'paused'
    failure_count   INTEGER DEFAULT 0,
    last_delivery   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
    id              BIGSERIAL PRIMARY KEY,
    webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type      VARCHAR(50) NOT NULL,
    payload         JSONB NOT NULL,
    status_code     SMALLINT,
    response_time   INTEGER,                   -- ms
    attempt         SMALLINT NOT NULL,
    error           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at);
```

---

## 9. Server-Sent Events (SSE)

### Purpose

SSE provides real-time progress updates for bulk verification jobs to the web dashboard. Users open an SSE connection after submitting a bulk job and receive progress events until completion.

### Connection

```
GET /home/bulk-verify/:jobId/stream
Accept: text/event-stream
Cookie: ev_session=<session_token>
```

Connection is authenticated via session cookie (same as all internal API endpoints).

### Event Types

**progress** — Emitted every 1% or every 5 seconds (whichever comes first):
```
id: 1706616000-42
event: progress
data: {"job_id":"bulk-xyz","processed":21000,"total":50000,"percent":42,"rate":850,"eta_seconds":34}
```

**status_change** — Emitted when job status transitions:
```
id: 1706616120-status
event: status_change
data: {"job_id":"bulk-xyz","previous":"processing","current":"completed","completed_at":"2026-01-30T12:02:00Z"}
```

**error** — Emitted on recoverable errors (job continues):
```
id: 1706616060-err
event: error
data: {"job_id":"bulk-xyz","message":"Upstream API temporarily unavailable, retrying...","severity":"warning"}
```

**results_summary** — Emitted once on completion:
```
id: 1706616120-results
event: results_summary
data: {"job_id":"bulk-xyz","valid":42000,"invalid":5000,"unknown":2000,"risky":1000,"download_url":"/api/v1/bulk/bulk-xyz/results"}
```

### Reconnection

- Every event includes an `id` field (format: `{unix_timestamp}-{sequence}`)
- On reconnect, the browser sends `Last-Event-ID` header automatically
- Server resumes from the last acknowledged event, replaying any missed events
- If the job completed while disconnected, server sends `results_summary` immediately
- **Reconnection interval**: Client default (browser handles), server sends `retry: 3000` (3 seconds) on initial connection

### Server-Side Implementation

- One SSE connection per bulk job per user (deduplicated by job_id + user_id)
- Connection timeout: 30 minutes (bulk jobs exceeding this will require reconnection)
- Heartbeat: Server sends a comment line (`: heartbeat`) every 15 seconds to keep the connection alive and detect dead clients
- Backpressure: If the client can't keep up, events are buffered up to 100. Beyond that, oldest progress events are dropped (status_change and results_summary are never dropped)

---

## 10. Stripe Integration

### Payment Models

The platform supports two Stripe payment flows:

1. **One-Time Credit Purchases** — via Stripe Checkout Sessions (payment mode)
2. **Recurring Subscriptions** — via Stripe Checkout Sessions (subscription mode) with monthly/yearly billing

### One-Time Purchase Flow
```
1. User selects credit package (1K-1M) on /home/billing
2. POST /home/billing/checkout { type: "one_time", package: "10k" }
3. Server creates Stripe Checkout Session (mode: "payment")
4. Redirect user to Stripe hosted checkout page
5. On success: Stripe sends checkout.session.completed webhook
6. Server verifies webhook signature (Stripe signing secret)
7. Credit user's balance atomically:
   - Redis INCRBY for immediate availability
   - PostgreSQL INSERT credit_event (type: 'purchase')
8. Redirect user back to /home/billing?success=true
```

### Subscription Flow
```
1. User selects plan + billing cycle on /home/billing
2. POST /home/billing/checkout { type: "subscription", plan: "professional", cycle: "yearly" }
3. Server creates Stripe Checkout Session (mode: "subscription")
4. Redirect user to Stripe hosted checkout page
5. On success: Stripe sends checkout.session.completed + invoice.paid webhooks
6. Server creates/updates subscription record
7. Credit user's balance with plan's monthly/yearly allocation
8. Redirect user back to /home/billing?success=true
```

### Subscription Lifecycle Events (Stripe Webhooks)

| Stripe Event | Server Action |
|-------------|--------------|
| `checkout.session.completed` | Create subscription record, credit initial balance |
| `invoice.paid` | Renew credits for next period, update current_period_start/end |
| `invoice.payment_failed` | Mark subscription as `past_due`, notify user via email |
| `customer.subscription.updated` | Handle plan changes (upgrade/downgrade) |
| `customer.subscription.deleted` | Mark subscription as `cancelled`, credits remain until period_end |

### Cancellation Policy

- User cancels from dashboard → Stripe subscription set to `cancel_at_period_end`
- Credits remain usable until `current_period_end`
- After period ends: subscription status → `expired`, no new credits allocated
- User can reactivate before period ends (Stripe reactivation)

### Plan Changes (Upgrade/Downgrade)

- **Upgrade**: Applied immediately. Stripe prorates the charge. Difference in credits added instantly.
- **Downgrade**: Applied at next billing cycle. Current period credits unchanged.

### Stripe Configuration

```
Webhook endpoint:      POST /home/billing/webhook
Webhook signing secret: whsec_xxxxx (stored in environment variable)
Idempotency:           Stripe event ID used as idempotency_key in credit_events
Customer mapping:      Stripe customer ID stored on users table (stripe_customer_id)
```

### Credit Expiry

- **One-time purchases**: Credits never expire
- **Subscription credits**: Expire at `current_period_end` if unused (configurable)
- **Rollover**: No rollover of unused subscription credits between periods

---

## 11. CSV Export & File Storage

### Storage: DigitalOcean Spaces

Bulk verification results are stored in DigitalOcean Spaces (S3-compatible object storage) for download.

**Bucket structure**:
```
ev-results/
  {user_id}/
    {job_id}/
      results.csv          -- full results
      results-valid.csv    -- filtered: valid only
      results-invalid.csv  -- filtered: invalid only
```

### Export Generation Flow
```
1. Bulk job completes (all batches processed)
2. Worker aggregates results from verification_results table
3. Generate CSV(s) in memory using streaming writes (not buffered)
4. Upload to DO Spaces via S3-compatible SDK
5. Store signed URL in bulk_jobs.results_url
6. Notify user via SSE (results_summary event) + webhook (bulk.completed)
```

### Download Flow
```
1. User clicks "Download Results" on dashboard or API: GET /api/v1/bulk/:jobId/results
2. Server generates a pre-signed DO Spaces URL (valid for 1 hour)
3. Redirect user to pre-signed URL (302)
4. DigitalOcean serves the file directly — no server memory/bandwidth used
```

### CSV Format

```csv
email,status,deliverable,risk_score,reason,mx_records,smtp_provider,is_free,is_role,is_disposable,is_catchall,verified_at
test@example.com,valid,true,92,accepted_email,"mx1.example.com,mx2.example.com",Google,false,false,false,false,2026-01-30T12:00:00Z
```

### Compression

- Files > 10MB are gzip-compressed before upload (`.csv.gz`)
- Content-Encoding header set so browsers auto-decompress on download

### Retention Policy

- **14-day retention**: DO Spaces lifecycle rule auto-deletes objects after 14 days
- `bulk_jobs.results_url` set to NULL after expiry (cleanup cron job)
- Users see "Results expired" message on dashboard for jobs older than 14 days
- **No re-generation**: Once expired, results cannot be recovered (verification_results rows may have been pruned)

### Verification Results Pruning

- Individual `verification_results` rows for bulk jobs are retained for 30 days (for usage history/audit)
- After 30 days: bulk job results rows are pruned, only the `bulk_jobs` summary record remains
- Single verification results are retained for 90 days

---

## 12. Database Schema (Core Tables)

### Users & Authentication

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(255),
    avatar_url      TEXT,
    google_id       VARCHAR(255) UNIQUE,
    password_hash   VARCHAR(255),          -- optional (for email/password login)
    email_verified  BOOLEAN DEFAULT FALSE, -- must verify email before dashboard access
    stripe_customer_id VARCHAR(255) UNIQUE, -- Stripe customer ID for billing
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
    key_prefix      VARCHAR(20) NOT NULL,  -- 'ev_' first 3 chars for display
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

## 13. API Design

### Public API (for user API keys)

```
Authentication: Bearer ev_xxxxxxxx (API key in Authorization header)

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

## 14. Security

### Encryption

**In Transit**: All traffic served over TLS 1.2+ (enforced by Cloudflare and DigitalOcean load balancers). HTTP → HTTPS redirect at the edge. HSTS header with 1-year max-age.

**At Rest**: DigitalOcean Managed Database encryption at rest (AES-256). No additional application-level field encryption. API keys are stored as bcrypt hashes (cost factor 12) — not encrypted, hashed. Passwords are bcrypt-hashed (cost factor 12).

### DDoS & Edge Protection

**Cloudflare Proxy**: All traffic routes through Cloudflare for:
- DDoS mitigation (L3/L4/L7)
- Web Application Firewall (WAF) with OWASP Core Ruleset
- Bot management (challenge suspicious automated traffic)
- CDN for static frontend assets (Next.js)
- Rate limiting at the edge (first line of defense before our application rate limits)

**Origin Protection**: Origin server IP is never exposed. Cloudflare DNS proxy (orange cloud) on all records. DigitalOcean firewall allows inbound HTTP/HTTPS only from Cloudflare IP ranges.

### API Key Security

- **Format**: `ev_` prefix + 32 cryptographically random bytes (base64url encoded)
- **Storage**: Only the bcrypt hash is stored in PostgreSQL. Plaintext key shown once at creation, never retrievable again.
- **Transport**: Bearer token in `Authorization` header over TLS only
- **Rotation**: Users create a new key and delete the old one. No in-place rotation.
- **Expiration**: Configurable at creation (1 month, 3 months, 6 months, 1 year, never). Expired keys return 401.
- **Revocation**: DELETE API key → immediate invalidation. API key cache (if any) invalidated within 30 seconds.
- **Display**: Only the prefix + first 8 characters shown in the dashboard (e.g., `ev_Ue7HpvL9...`)

### Input Validation

All user input is validated at the API gateway before reaching business logic:

- **Email format**: RFC 5322 compliant validation (library-based, not regex)
- **File uploads**: Max 10MB for CSV files. Content-type verified. CSV parsed and validated before processing.
- **Bulk limits**: Maximum 100,000 emails per bulk job
- **String inputs**: Max length enforced on all text fields. No raw SQL or HTML injection possible (parameterized queries + React auto-escaping).
- **API request body**: JSON schema validation with strict mode (reject unknown fields)

### Rate Limiting Evasion Prevention

- Per-user rate limits are enforced by authenticated user ID, not by IP address — prevents circumvention via IP rotation
- API key rate limits tied to the key's associated user tier
- Unauthenticated endpoints (auth, landing page) are rate limited by IP + fingerprint
- Progressive penalties: After 10 consecutive rate limit hits, the cooldown period doubles

### GDPR & Account Deletion

**Deletion model**: Soft delete with anonymization.

```
1. User requests account deletion from /home/profile
2. Re-authentication required (password or Google OAuth within last 10 minutes)
3. Email verification code sent to confirm intent
4. 30-day grace period begins (user can cancel deletion by logging in)
5. After 30 days, anonymization job runs:
   - users: email → 'deleted_{uuid}@anonymized.local', name → NULL, avatar_url → NULL, google_id → NULL, password_hash → NULL
   - verification_results: email_checked → SHA-256 hash (non-reversible)
   - api_keys: deleted (CASCADE)
   - sessions: deleted (CASCADE)
   - webhooks: deleted (CASCADE)
   - credit_events: user_id retained for financial audit (anonymized user record)
   - subscriptions: stripe_sub_id retained for billing records
   - bulk_jobs: results files deleted from DO Spaces
6. User record marked with deleted_at timestamp, email_verified = false
7. Anonymized user record retained indefinitely for financial audit compliance
```

**Data Export**: Users can request a full data export (GDPR Article 20 — Right to Data Portability) from the profile page. Export includes: profile data, verification history, credit history, API key metadata (not secrets), webhook configurations.

### Secrets Management

| Secret | Storage |
|--------|---------|
| Upstream API key | Kubernetes Secret (DOKS) |
| Stripe secret key | Environment variable |
| Stripe webhook signing secret | Environment variable |
| Google OAuth client secret | Environment variable |
| Database connection string | Environment variable |
| Redis connection string | Environment variable |
| Session signing key | Environment variable |
| DO Spaces access keys | Environment variable |

No secrets in code, config files, or version control. All injected via Kubernetes Secrets on DOKS with encryption at rest.

---

## 15. Monitoring & Observability

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

## 16. Scaling Projections

| Users | Emails/day | Peak req/sec | Workers Needed | Redis Memory | PostgreSQL Size/month |
|-------|-----------|-------------|----------------|-------------|----------------------|
| 100 | 500K | 50 | 2 | 500MB | 1GB |
| 500 | 5M | 200 | 5 | 1GB | 5GB |
| 1,000 | 25M | 500 | 10 | 2GB | 15GB |
| 5,000 | 100M | 2,000 | 40 | 5GB | 50GB |
| 10,000 | 500M | 5,000 | 50 (+ upstream negotiation) | 10GB | 200GB |

**Note**: At 5,000+ users, the single upstream API key becomes the true bottleneck. At that scale, negotiate multiple upstream API keys and implement key rotation/load balancing across them.

---

## 17. Disaster Recovery & Backups

### Infrastructure: DigitalOcean Managed Services

Both PostgreSQL and Redis run on DigitalOcean Managed Databases, which provide automated backups, failover, and maintenance.

### Recovery Objectives

| Metric | Target |
|--------|--------|
| **RPO** (Recovery Point Objective) | < 1 hour — at most 1 hour of data loss |
| **RTO** (Recovery Time Objective) | < 30 minutes — service restored within 30 minutes |

### PostgreSQL Backup Strategy

- **Automatic daily backups**: DO Managed PostgreSQL takes daily full backups (retained for 7 days)
- **WAL archiving**: Write-Ahead Log streaming enables point-in-time recovery (PITR) to any point within the retention window
- **Standby node**: DO Managed PostgreSQL High Availability option provides an automatic standby with failover in < 30 seconds
- **Manual backups**: On-demand backup before major migrations or schema changes via `pg_dump`

### Redis Backup Strategy

- **AOF persistence**: `appendonly yes` with `appendfsync everysec` — at most 1 second of data loss for queue state
- **DO Managed Redis**: Automatic daily snapshots retained for 7 days
- **Eviction policy**: `maxmemory-policy noeviction` — BullMQ requires this; Redis never drops data
- **Recovery**: On Redis failure, BullMQ jobs are recovered from AOF. In-flight jobs are re-queued via BullMQ's stalled job detection.

### Application Recovery

**Stateless workers**: All API gateway and worker processes are stateless. Recovery = restart the process. No data stored in-process.

**Queue recovery**: If Redis is lost entirely:
1. In-flight jobs: Lost (workers were mid-processing). Credits already deducted — reconciliation job detects drift and corrects.
2. Pending jobs: Lost from Redis. Users must re-submit bulk jobs. Credit refund triggered by reconciliation.
3. Completed jobs: Results already in PostgreSQL and DO Spaces. No loss.

**Credit reconciliation**: The 5-minute reconciliation job (Redis ↔ PostgreSQL) ensures that any Redis data loss is detected and corrected within 10 minutes.

### DigitalOcean Spaces (File Storage)

- DO Spaces has built-in redundancy (3x replication within the datacenter)
- No additional backup needed for CSV result files (14-day retention with auto-delete)

### Failure Runbook Summary

| Component | Failure Mode | Recovery Action | Estimated Downtime |
|-----------|-------------|----------------|-------------------|
| PostgreSQL | Primary down | Auto-failover to standby (DO managed) | < 30 seconds |
| PostgreSQL | Data corruption | PITR to last known good state | 15-30 minutes |
| Redis | Primary down | Auto-failover to standby (DO managed) | < 30 seconds |
| Redis | Complete data loss | Restore from AOF/snapshot + reconciliation | 5-15 minutes |
| API Gateway | Process crash | Auto-restart (Kubernetes pod restart) | < 5 seconds |
| Workers | Process crash | Auto-restart + stalled job re-queue | < 30 seconds |
| DO Spaces | Region outage | No fallback (accept downtime for downloads) | Variable |
| Cloudflare | Edge outage | Bypass to origin (if configured) | Variable |
| Upstream API | Prolonged outage | Circuit breaker open; jobs queue; alert team | 0 (graceful degradation) |

### Deployment Strategy

- **Zero-downtime deploys**: Rolling deployment via Kubernetes on DOKS
- **Worker drain**: Workers finish in-flight jobs before shutdown (graceful shutdown signal)
- **Database migrations**: Run as separate step before deploy. Backward-compatible migrations only (no dropping columns in the same deploy that removes code using them).
- **Rollback**: Previous container image tagged and ready. Rollback = redeploy previous image.
- **Canary deploys**: For critical changes, route 5% of traffic to new version first. Monitor error rates for 10 minutes before full rollout.

---

## 18. Key Design Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Backend framework | Express | Fastify, Next.js API routes | Battle-tested, massive ecosystem, familiar patterns |
| Frontend framework | Next.js App Router | Pages Router, Remix, Vite SPA | Server Components for dashboard data loading; modern React patterns |
| UI framework | Tailwind + shadcn/ui | MUI, Chakra UI, custom CSS | Full dark theme control; copy-paste components; no vendor lock-in |
| ORM | Drizzle ORM | Prisma, Knex.js, raw pg | SQL-like, lightweight; stays close to SQL for credit system atomics |
| Redis client | ioredis | node-redis | Single client library (BullMQ uses ioredis internally); Lua scripting |
| Queue technology | BullMQ Pro | SQS, RabbitMQ, Kafka | TypeScript-native; built-in multi-tenant groups; no external infra beyond Redis |
| Rate limiting | Redis Lua (sliding window) | Token bucket, leaky bucket | Sliding window gives accurate, smooth limiting for per-user fairness |
| Credit storage | Redis + PostgreSQL hybrid | PostgreSQL only, Redis only | Redis for speed (hot path), PostgreSQL for durability (audit trail) |
| Upstream call control | Leaky bucket (global) | Token bucket | Smooth constant-rate outflow protects upstream API |
| Real-time updates | SSE | WebSockets, polling | Simpler than WS; auto-reconnect; Last-Event-ID for reconnection |
| Circuit breaker | `opossum` | Custom, Resilience4j | Lightweight Node.js library; promise-based |
| Auth | Google OAuth + email/password | OAuth only, Magic links | Both methods for maximum user flexibility; email verification required |
| Payments | Stripe | Paddle, LemonSqueezy | Industry standard; one-time purchases + recurring subscriptions |
| Email service | Resend | SendGrid, Nodemailer + SMTP | Modern API, React Email templates, great DX |
| File storage | DigitalOcean Spaces | Local filesystem, PostgreSQL LOB | S3-compatible; pre-signed URLs; lifecycle rules for auto-cleanup |
| Edge/CDN | Cloudflare | DO Load Balancer only | DDoS protection, WAF, bot management, CDN for static assets |
| Testing | Vitest | Jest, Node.js test runner | Fast, Vite-powered, native ESM + TypeScript, Jest-compatible |
| Deployment | DigitalOcean Kubernetes | DO App Platform, Droplets + PM2 | Horizontal worker scaling, full control over scheduling and networking |
| State management | TanStack Query | Zustand, Redux, React Context | Server state caching, background refetch, optimistic updates |
| Forms | React Hook Form + Zod | Formik + Yup, native forms | Performant uncontrolled forms; shared Zod schemas with backend |
| Charts | Recharts | Chart.js, Tremor | React-native, declarative, supports all chart types needed |
| Package manager | npm | pnpm, yarn | Default, zero setup, universal compatibility |

---

## 19. References (from deep research)

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
