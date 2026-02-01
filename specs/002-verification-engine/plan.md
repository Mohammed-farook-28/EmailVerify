# Implementation Plan: Email Verification Engine & Dashboard

**Branch**: `002-verification-engine` | **Date**: 2026-02-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-verification-engine/spec.md`

## Summary

Build the core email verification engine with 5-layer defense architecture: API gateway for auth/credit checks, BullMQ fair queue with priority-based scheduling, autoscaling worker pool with circuit breaker, upstream proxy with connection pooling, and dual-layer credit system (Redis for speed, PostgreSQL for durability). Includes dashboard metrics, health endpoints, Grafana Loki logging, and frontend integration for single email verification with recent results.

**Primary Requirements**:
- Single email verification with detailed results (status, risk score, attributes)
- Recent verification history (last 10 results)
- Dashboard metrics (credit balance, distribution charts, trend data)
- System resilience (circuit breaker, automatic retries, credit refunds)
- Credit reconciliation (Redis ↔ PostgreSQL sync every 5 minutes)
- Health checks and Prometheus metrics
- Grafana Loki structured logging (INFO level, 30-day retention)
- Data privacy (strict per-user isolation, auto-delete after retention period)

**Technical Approach** (from architecture):
- TypeScript full-stack with Node.js/Express backend
- BullMQ (free version) for priority-based fair queuing (upgrade path to Pro for multi-tenant groups)
- Redis Lua scripts for atomic credit operations
- opossum circuit breaker for upstream failures
- undici HTTP client with connection pooling
- Drizzle ORM for PostgreSQL
- Next.js frontend with TanStack Query

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ backend, Next.js 15+ frontend)
**Primary Dependencies**:
- Backend: Express 4.x, BullMQ (free version), ioredis, Drizzle ORM, opossum (circuit breaker), undici (HTTP client), Zod (validation)
- Frontend: Next.js 15+, React, TanStack Query, Tailwind CSS, shadcn/ui, Recharts (dashboard charts)

**Storage**:
- PostgreSQL 16+ (verification_results, credit_events tables with Drizzle ORM)
- Redis 7+ (job queue, credit cache, circuit breaker state)
- Configuration: Redis maxmemory-policy: noeviction, appendonly: yes

**Testing**: Vitest (unit, integration, contract tests)

**Target Platform**:
- Backend: DigitalOcean Kubernetes (DOKS) - autoscaling worker pods (2-50)
- Frontend: Next.js SSR deployed to Vercel/DOKS

**Project Type**: Web application (backend + frontend)

**Performance Goals**:
- P95 verification response time: <15 seconds
- Dashboard metrics load time: <2 seconds (100K history)
- Recent results query: <500ms
- Queue throughput: 1000 concurrent verification requests
- Worker pool: Start with 10 workers × 50 concurrent jobs each

**Constraints**:
- 99.5% uptime (measured by readiness probe)
- 99.9% credit accounting accuracy (drift <0.1%)
- Zero credit loss on system failures
- 95% first-attempt success (no retries)
- DLQ depth <1000 jobs during normal operations
- Fair queuing: no single tenant >10% capacity when 10+ tenants active

**Scale/Scope**:
- Expected users: 1000+ tenants
- Queue capacity: 1M max jobs (load shedding at 500K bulk, 1M total)
- Dashboard history: Up to 100K verification results per user
- Log retention: 30 days (Grafana Loki)
- Verification result retention: Per-user dataRetentionDays setting (default 30 days)
- Upstream API: Single API key, 1000 requests/second token bucket

**Observability**:
- Metrics: Prometheus (queue_depth_total, upstream_error_rate, circuit_breaker_state, redis_memory_usage_percent, credit_reconciliation_drift, dlq_depth, worker_concurrency_utilization, http_503_rate)
- Logging: Grafana Loki with structured JSON logs, INFO level in production, 30-day retention
- Tracing: OpenTelemetry spans (gateway.auth, gateway.credit_check, queue.enqueue, worker.process, upstream.verify)
- Health: /health/live, /health/ready, /health/startup (all unauthenticated for K8s probes)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Quality Gates (from CLAUDE.md)

**Before merge**:
- ✅ All unit tests pass
- ✅ Integration tests cover API endpoints
- ✅ No accuracy regression in verification results
- ✅ No critical/high security vulnerabilities
- ✅ Performance benchmarks within 10% of targets

**Before release**:
- ✅ Load test at 10x peak (10,000 concurrent requests)
- ✅ Staging verification with real emails
- ✅ Rollback plan documented

### Key Design Decisions Alignment

✅ **BullMQ (free)** over SQS/RabbitMQ/Kafka: TypeScript-native, priority-based fair queuing, no extra infra beyond Redis (upgrade path to Pro for advanced multi-tenant groups)
✅ **Redis Lua** for atomic credit operations: atomic, distributed, prevents race conditions
✅ **Redis + PostgreSQL hybrid** for credits: speed on hot path (Redis), ACID durability (PostgreSQL)
✅ **Drizzle ORM**: SQL-like TypeScript ORM, stays close to SQL for credit atomics
✅ **Redis config**: maxmemory-policy: noeviction, appendonly: yes (BullMQ requirement)

### New Technical Choices (require validation)

1. **opossum circuit breaker**: Lightweight, promise-based, fits Node.js event loop ✅ Validated in architecture.md
2. **undici HTTP client**: Connection pooling (max 200), fastest Node.js client ✅ Validated in architecture.md
3. **Grafana Loki**: Log aggregation with 30-day retention ✅ User-specified in clarifications
4. **OpenTelemetry**: Distributed tracing for verification flow ✅ Mentioned in architecture.md Section 15

**Gate Status**: ✅ PASS - All choices align with constitution and architecture

## Project Structure

### Documentation (this feature)

```text
specs/002-verification-engine/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output (technology validation)
├── data-model.md        # Phase 1 output (database schema, entities)
├── quickstart.md        # Phase 1 output (setup guide for developers)
├── contracts/           # Phase 1 output (API contracts)
│   ├── verification-api.yaml   # OpenAPI spec for verification endpoints
│   ├── dashboard-api.yaml      # OpenAPI spec for dashboard endpoints
│   └── health-api.yaml         # OpenAPI spec for health/metrics endpoints
├── checklists/          # Created by /speckit.specify
│   └── requirements.md  # Spec quality checklist (already complete)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created yet)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── db/
│   │   ├── schema.ts                    # Drizzle schema (verification_results, etc.)
│   │   └── index.ts                     # Drizzle client initialization
│   ├── services/
│   │   ├── verification.ts              # Verification business logic
│   │   ├── credit.ts                    # Credit operations (already exists from Epic 1)
│   │   ├── circuit-breaker.ts           # opossum wrapper with Redis state persistence
│   │   ├── queue.ts                     # BullMQ (free) queue setup with priority-based fairness
│   │   ├── upstream-client.ts           # undici connection pool + idempotency
│   │   ├── reconciliation.ts            # Credit reconciliation job (every 5 min)
│   │   └── dashboard-metrics.ts         # Dashboard aggregation queries
│   ├── workers/
│   │   ├── verification-worker.ts       # BullMQ worker (processes verification jobs)
│   │   └── reconciliation-worker.ts     # Cron-style reconciliation worker
│   ├── middleware/
│   │   ├── auth.ts                      # Session auth middleware (already exists from Epic 1)
│   │   ├── credit-check.ts              # Atomic credit deduction middleware
│   │   └── load-shedding.ts             # Queue depth check, 503 on overload
│   ├── routes/
│   │   ├── verification.ts              # POST /home/quick-verify, GET /home/quick-verify/recent
│   │   ├── dashboard.ts                 # GET /home (metrics endpoint)
│   │   └── health.ts                    # /health/live, /health/ready, /health/startup, /metrics
│   ├── lib/
│   │   ├── redis.ts                     # Redis client (ioredis) + Lua scripts
│   │   ├── logger.ts                    # Structured logging to Grafana Loki
│   │   └── metrics.ts                   # Prometheus metrics registration
│   ├── app.ts                           # Express app setup (already exists from Epic 1)
│   └── server.ts                        # Server entry point (already exists from Epic 1)
└── tests/
    ├── unit/
    │   ├── services/verification.test.ts
    │   ├── services/circuit-breaker.test.ts
    │   └── middleware/credit-check.test.ts
    ├── integration/
    │   ├── verification-flow.test.ts    # End-to-end verification test
    │   ├── credit-reconciliation.test.ts
    │   └── circuit-breaker-recovery.test.ts
    └── contract/
        ├── verification-api.test.ts     # Validate against contracts/verification-api.yaml
        └── dashboard-api.test.ts

frontend/ (EmailVerify-Frontend)
├── src/
│   ├── components/
│   │   └── dashboard/
│   │       ├── single-verify-input.tsx      # Already exists (wire to API)
│   │       ├── email-detail-panel.tsx       # Already exists (update types)
│   │       ├── verification-row.tsx         # Already exists (update types)
│   │       ├── recent-verifications.tsx     # Already exists (replace mock data)
│   │       ├── score-progress-bar.tsx       # Already exists
│   │       └── dashboard-metrics.tsx        # New: summary, distribution, trend charts
│   ├── app/
│   │   └── (dashboard)/
│   │       └── home/
│   │           ├── quick-verify/
│   │           │   └── page.tsx             # Already exists (integrate API calls)
│   │           └── page.tsx                 # Redirect to /home/quick-verify (update)
│   ├── lib/
│   │   ├── api.ts                           # API client (TanStack Query hooks)
│   │   └── types/
│   │       └── verification.ts              # Update types for new API response
│   └── hooks/
│       ├── use-verification.ts              # TanStack Query hook for verification
│       ├── use-recent-results.ts            # TanStack Query hook for recent results
│       └── use-dashboard-metrics.ts         # TanStack Query hook for dashboard metrics
└── tests/
    ├── components/
    │   └── dashboard/single-verify-input.test.tsx
    └── integration/
        └── verification-flow.test.tsx       # E2E test with MSW mocking

shared/ (if needed for type sharing)
└── schemas/
    └── verification.zod.ts                  # Shared Zod schemas (backend + frontend)
```

**Structure Decision**: Web application structure (backend + frontend monorepo). Backend uses layered architecture (routes → services → workers). Frontend follows Next.js App Router conventions with colocation of components and pages. Shared Zod schemas ensure type safety across API boundary.

## Complexity Tracking

> No constitution violations - all technical choices align with architecture.md

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

---

## Phase 0: Research & Technology Validation

**Goal**: Validate all technical unknowns identified in Technical Context and resolve integration patterns.

### Research Tasks

1. **BullMQ Priority-Based Fair Queuing (Free Version)**
   - **Unknown**: How to implement fair queuing without BullMQ Pro tenant groups
   - **Research**: BullMQ priority configuration, job scheduling patterns, fairness with priority levels
   - **Output**: Configuration pattern for priority-based fair queuing preventing tenant monopolization

2. **opossum Circuit Breaker with Redis State**
   - **Unknown**: How to persist circuit breaker state to Redis for cross-worker coordination
   - **Research**: opossum custom fallback + Redis integration pattern
   - **Output**: Implementation pattern for saving/loading CB state (OPEN/HALF-OPEN/CLOSED) from Redis

3. **undici Connection Pooling**
   - **Unknown**: Optimal connection pool size, timeout configurations, retry backoff
   - **Research**: undici Agent configuration, pool sizing best practices for 10+ workers
   - **Output**: Connection pool config (max connections, idle timeout, keep-alive settings)

4. **Credit Reconciliation Strategy**
   - **Unknown**: SQL query pattern for comparing Redis vs PostgreSQL credit balances at scale (1000+ users)
   - **Research**: Efficient bulk comparison patterns, drift detection thresholds
   - **Output**: Reconciliation SQL query + Redis batch GET pattern + drift correction logic

5. **Grafana Loki Integration**
   - **Unknown**: Pino vs Winston for Loki, log format (JSON), Loki push API or promtail
   - **Research**: Node.js logging libraries with Loki support, structured logging best practices
   - **Output**: Logger setup with Grafana Loki transport, log level configuration

6. **OpenTelemetry Tracing Setup**
   - **Unknown**: @opentelemetry/sdk-node setup, span naming conventions, sampling strategy
   - **Research**: OpenTelemetry Node.js instrumentation, auto-instrumentation for Express/Redis
   - **Output**: OTel SDK configuration, span creation pattern for verification flow

7. **Prometheus Metrics Registration**
   - **Unknown**: prom-client metric types (Gauge, Counter, Histogram), label strategies
   - **Research**: Prometheus metric naming conventions, cardinality best practices
   - **Output**: Metric registration patterns for all 8 required metrics

8. **TanStack Query Configuration**
   - **Unknown**: Optimal staleTime, cacheTime for dashboard metrics and verification results
   - **Research**: TanStack Query caching strategies for real-time vs historical data
   - **Output**: Query client config with cache policies per data type

9. **Data Retention Cleanup Job**
   - **Unknown**: Efficient bulk deletion pattern for old verification_results (per-user dataRetentionDays)
   - **Research**: PostgreSQL bulk DELETE with user-specific WHERE clauses, index strategies
   - **Output**: Cleanup SQL query + cron schedule (daily at 2 AM UTC)

10. **Health Check Implementation**
    - **Unknown**: How to verify Redis + PostgreSQL connectivity without blocking K8s probes
    - **Research**: Health check patterns with timeout limits, connection pool health
    - **Output**: Health check logic with 1-second timeout per dependency

### Best Practices Tasks

1. **BullMQ Best Practices (Free Version)**
   - Job naming conventions, job data shape, error handling, priority-based fairness
   - Research: BullMQ documentation on job lifecycle, retry strategies, priority queuing
   - Output: Job processing pattern + error categorization (retryable vs non-retryable)

2. **Circuit Breaker Tuning**
   - Threshold selection (50% failure rate), window size (100 calls), wait duration (30s)
   - Research: Circuit breaker pattern guidelines, production tuning case studies
   - Output: Configuration justification + monitoring alert thresholds

3. **Credit Accounting Patterns**
   - Idempotency key format, duplicate detection, refund logic
   - Research: Financial transaction patterns, double-spend prevention
   - Output: Idempotency implementation + refund workflow

4. **Load Shedding Strategy**
   - Queue depth thresholds (500K bulk, 1M total), Retry-After header calculation
   - Research: Load shedding patterns, graceful degradation
   - Output: Load shedding middleware + client retry guidance

**Output**: `research.md` with all unknowns resolved and best practices documented

---

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete

### 1. Data Model Design (`data-model.md`)

**Entities** (from spec Key Entities section):

#### Verification Result
```typescript
{
  id: string (BIGSERIAL)
  userId: string (UUID, FK to users.id)
  email: string (email address verified)
  status: 'valid' | 'invalid' | 'unknown' | 'risky' | 'disposable' | 'catch_all' | 'role'
  score: number (0-100, risk/reputation score)
  deliverable: boolean
  reason: string (human-readable explanation)
  domain: string
  attributes: EmailAttribute[] (JSONB array)
  serverInfo: ServerInfo (JSONB object)
  verifiedAt: Date (ISO 8601 timestamp)
  createdAt: Date (auto-generated)
}
```

**Validation Rules**:
- userId must exist in users table (FK constraint)
- email must be valid RFC 5322 format (checked before storage)
- status must be one of 7 allowed values
- score must be 0-100 range
- Auto-delete when `createdAt < NOW() - INTERVAL dataRetentionDays` (per user setting)

**State Transitions**: N/A (immutable after creation)

#### Email Attribute
```typescript
{
  name: string ('is_role' | 'is_free' | 'is_disposable' | 'is_catchall')
  value: string ('true' | 'false')
  score: string ('high' | 'medium' | 'low')
  checked: boolean
}
```

**Stored as JSONB array within VerificationResult**

#### Server Info
```typescript
{
  smtpProvider: string
  mxRecords: string (comma-separated list)
}
```

**Stored as JSONB object within VerificationResult**

#### Dashboard Summary (computed, not stored)
```typescript
{
  credits: number (from Redis user:{userId}:credits)
  totalVerifications: number (COUNT from verification_results)
  totalApiCalls: number (placeholder - future epic)
  periodVerifications: number (COUNT with date range filter)
}
```

#### Distribution Data (computed, not stored)
```typescript
{
  valid: number (COUNT where status='valid')
  invalid: number
  unknown: number
  risky: number
  disposable: number
  catchAll: number
  role: number
}
```

#### Trend Data (computed, not stored)
```typescript
[
  {
    date: string (YYYY-MM-DD)
    count: number
    valid: number
    invalid: number
    unknown: number
    risky: number
  }
]
```

#### Circuit Breaker State (Redis only)
```typescript
{
  state: 'OPEN' | 'HALF_OPEN' | 'CLOSED'
  failureCount: number
  lastTransition: Date (ISO 8601)
}
```

**Stored in Redis key**: `cb:upstream:state`

#### Verification Job (BullMQ job data)
```typescript
{
  jobId: string (BullMQ generated)
  tenantId: string (userId)
  email: string
  priority: number (1 for single verify)
  retryAttempts: number (0-3)
  status: 'queued' | 'processing' | 'completed' | 'failed' (BullMQ managed)
  createdAt: Date
  processedAt: Date
}
```

**Drizzle Schema** (add to `backend/src/db/schema.ts`):
```typescript
export const verificationResult = pgTable('verification_results', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  status: text('status').notNull(), // enum: valid, invalid, unknown, risky, disposable, catch_all, role
  score: integer('score').notNull(), // 0-100
  deliverable: boolean('deliverable').notNull(),
  reason: text('reason').notNull(),
  domain: text('domain').notNull(),
  attributes: jsonb('attributes').notNull(), // EmailAttribute[]
  serverInfo: jsonb('server_info').notNull(), // ServerInfo
  verifiedAt: timestamp('verified_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Index for user queries (recent results, dashboard metrics)
export const verificationResultUserIdCreatedAtIdx = index('verification_result_user_id_created_at_idx')
  .on(verificationResult.userId, verificationResult.createdAt.desc());

// Index for retention cleanup job
export const verificationResultCreatedAtIdx = index('verification_result_created_at_idx')
  .on(verificationResult.createdAt);
```

### 2. API Contracts (`contracts/`)

#### `verification-api.yaml` (OpenAPI 3.0)

```yaml
openapi: 3.0.0
info:
  title: EmailKit Verification API
  version: 1.0.0
  description: Internal verification endpoints for web dashboard

paths:
  /home/quick-verify:
    post:
      summary: Verify single email address
      security:
        - sessionCookie: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
              properties:
                email:
                  type: string
                  format: email
                  example: "user@example.com"
      responses:
        '200':
          description: Verification successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VerificationResponse'
        '402':
          description: Insufficient credits
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                    example: "Insufficient credits"
                  credits:
                    type: integer
                    example: 0
        '422':
          description: Invalid email format
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                    example: "Invalid email format"
        '503':
          description: Service temporarily unavailable
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                  retryAfter:
                    type: integer
                    description: Retry after seconds

  /home/quick-verify/recent:
    get:
      summary: Get last 10 verification results
      security:
        - sessionCookie: []
      responses:
        '200':
          description: Recent results retrieved
          content:
            application/json:
              schema:
                type: object
                properties:
                  results:
                    type: array
                    items:
                      $ref: '#/components/schemas/VerificationResult'
                    maxItems: 10

components:
  securitySchemes:
    sessionCookie:
      type: apiKey
      in: cookie
      name: ev.session_token

  schemas:
    VerificationResponse:
      type: object
      properties:
        result:
          $ref: '#/components/schemas/VerificationResult'
        credits:
          type: integer
          description: Remaining credit balance
          example: 99

    VerificationResult:
      type: object
      required:
        - id
        - email
        - status
        - score
        - deliverable
        - reason
        - domain
        - attributes
        - serverInfo
        - verifiedAt
      properties:
        id:
          type: string
          example: "12345"
        email:
          type: string
          format: email
        status:
          type: string
          enum: [valid, invalid, unknown, risky, disposable, catch_all, role]
        score:
          type: integer
          minimum: 0
          maximum: 100
          description: Risk/reputation score
        deliverable:
          type: boolean
        reason:
          type: string
          description: Human-readable explanation
        domain:
          type: string
        attributes:
          type: array
          items:
            $ref: '#/components/schemas/EmailAttribute'
        serverInfo:
          $ref: '#/components/schemas/ServerInfo'
        verifiedAt:
          type: string
          format: date-time

    EmailAttribute:
      type: object
      required:
        - name
        - value
        - score
        - checked
      properties:
        name:
          type: string
          enum: [is_role, is_free, is_disposable, is_catchall]
        value:
          type: string
          enum: ['true', 'false']
        score:
          type: string
          enum: [high, medium, low]
        checked:
          type: boolean

    ServerInfo:
      type: object
      required:
        - smtpProvider
        - mxRecords
      properties:
        smtpProvider:
          type: string
          example: "Google"
        mxRecords:
          type: string
          description: Comma-separated MX records
          example: "mx1.google.com, mx2.google.com"
```

#### `dashboard-api.yaml` (OpenAPI 3.0)

```yaml
openapi: 3.0.0
info:
  title: EmailKit Dashboard API
  version: 1.0.0

paths:
  /home:
    get:
      summary: Get dashboard metrics
      security:
        - sessionCookie: []
      parameters:
        - name: range
          in: query
          schema:
            type: integer
            enum: [7, 30, 90]
            default: 30
          description: Time range in days
      responses:
        '200':
          description: Dashboard metrics retrieved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DashboardMetrics'

components:
  securitySchemes:
    sessionCookie:
      type: apiKey
      in: cookie
      name: ev.session_token

  schemas:
    DashboardMetrics:
      type: object
      required:
        - summary
        - distribution
        - trend
      properties:
        summary:
          $ref: '#/components/schemas/Summary'
        distribution:
          $ref: '#/components/schemas/Distribution'
        trend:
          type: array
          items:
            $ref: '#/components/schemas/TrendDataPoint'

    Summary:
      type: object
      properties:
        credits:
          type: integer
        totalVerifications:
          type: integer
        totalApiCalls:
          type: integer
        periodVerifications:
          type: integer

    Distribution:
      type: object
      properties:
        valid:
          type: integer
        invalid:
          type: integer
        unknown:
          type: integer
        risky:
          type: integer
        disposable:
          type: integer
        catchAll:
          type: integer
        role:
          type: integer

    TrendDataPoint:
      type: object
      properties:
        date:
          type: string
          format: date
        count:
          type: integer
        valid:
          type: integer
        invalid:
          type: integer
        unknown:
          type: integer
        risky:
          type: integer
```

#### `health-api.yaml` (OpenAPI 3.0)

```yaml
openapi: 3.0.0
info:
  title: EmailKit Health & Metrics API
  version: 1.0.0

paths:
  /health/live:
    get:
      summary: Liveness probe
      security: []
      responses:
        '200':
          description: Process is running
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: "ok"

  /health/ready:
    get:
      summary: Readiness probe
      security: []
      responses:
        '200':
          description: Ready to serve traffic
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  postgres:
                    type: string
                  redis:
                    type: string
        '503':
          description: Not ready
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  postgres:
                    type: string
                  redis:
                    type: string

  /health/startup:
    get:
      summary: Startup probe
      security: []
      responses:
        '200':
          description: Application started
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  workers:
                    type: string
                  queue:
                    type: string

  /metrics:
    get:
      summary: Prometheus metrics
      security: []
      responses:
        '200':
          description: Metrics in Prometheus text format
          content:
            text/plain:
              schema:
                type: string
                example: |
                  # HELP queue_depth_total Total queue depth
                  # TYPE queue_depth_total gauge
                  queue_depth_total 1234
```

### 3. Developer Quickstart (`quickstart.md`)

**Content**: Setup instructions for local development, environment variables, running workers, testing verification flow.

### 4. Agent Context Update

**Script**: `.specify/scripts/bash/update-agent-context.sh claude`

**New Technologies to Add**:
- BullMQ (free version - job queue)
- opossum (circuit breaker)
- undici (HTTP client)
- Grafana Loki (logging)
- Prometheus (metrics)
- OpenTelemetry (tracing)

---

## Next Steps (Post-Plan)

1. **Phase 2**: Run `/speckit.tasks` to generate tasks.md from user stories
2. **Phase 3**: Implement P1 stories first (Single Verification, Recent Results)
3. **Phase 4**: Implement P2 stories (Dashboard Metrics, Resilience, Reconciliation)
4. **Phase 5**: Implement P3 stories (Health Checks, Cookie Policy)
5. **Testing**: Run integration tests, load tests (10x peak)
6. **Deployment**: K8s manifests, worker autoscaling config

**Estimated Complexity**: High (5-layer architecture, distributed system concerns)
**Estimated Duration**: 3-4 weeks (10 workers × complexity)
**Risk Areas**: Circuit breaker tuning, credit reconciliation correctness, queue performance under load
