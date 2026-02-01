# Data Model: Email Verification Engine

**Feature**: 002-verification-engine
**Created**: 2026-02-01
**Status**: Design Phase

## Overview

This document defines the data entities, relationships, and storage strategies for the email verification engine. The system uses a hybrid storage approach: PostgreSQL for durable storage and Redis for performance-critical operations.

---

## Storage Strategy

### PostgreSQL (Durable Storage)
- User data and relationships
- Verification results history
- Credit transaction ledger
- Audit trail

### Redis (Performance Cache)
- Credit balances (with atomic Lua operations)
- Circuit breaker state (cross-worker coordination)
- Job queue data (BullMQ Pro)
- Idempotency keys (1-hour TTL)

---

## Entities

### 1. Verification Result

**Purpose**: Store the outcome of a single email verification

**Storage**: PostgreSQL table `verification_results`

**Schema**:
```typescript
interface VerificationResult {
  id: string;                    // BIGSERIAL primary key
  userId: string;                 // UUID, FK to users.id (cascade delete)
  email: string;                  // Email address verified
  status: VerificationStatus;     // Enumerated status
  score: number;                  // Risk/reputation score (0-100)
  deliverable: boolean;           // Deliverability flag
  reason: string;                 // Human-readable explanation
  domain: string;                 // Email domain
  attributes: EmailAttribute[];   // JSONB array
  serverInfo: ServerInfo;         // JSONB object
  verifiedAt: Date;               // ISO 8601 timestamp
  createdAt: Date;                // Auto-generated timestamp
}

type VerificationStatus =
  | 'valid'
  | 'invalid'
  | 'unknown'
  | 'risky'
  | 'disposable'
  | 'catch_all'
  | 'role';
```

**Validation Rules**:
- `userId` must exist in `users` table (enforced by FK constraint)
- `email` must be valid RFC 5322 format (validated before storage)
- `status` must be one of 7 allowed enum values
- `score` must be in range 0-100 (inclusive)
- Auto-deletion triggered when `createdAt < NOW() - user.dataRetentionDays`

**Indexes**:
- `verification_result_user_id_created_at_idx`: Composite index on `(userId, createdAt DESC)` for recent results queries
- `verification_result_created_at_idx`: Index on `createdAt` for retention cleanup job

**Relationships**:
- Belongs to `user` (many-to-one, cascade delete when user deleted)

**State Transitions**: None (immutable after creation)

**Data Retention**:
- Automatically deleted by daily cleanup job
- Deletion criteria: `createdAt < NOW() - INTERVAL users.dataRetentionDays`
- Default retention: 30 days (configurable per user)

---

### 2. Email Attribute

**Purpose**: Detailed attribute information about verified email

**Storage**: JSONB array within `VerificationResult.attributes`

**Schema**:
```typescript
interface EmailAttribute {
  name: AttributeName;   // Attribute identifier
  value: string;         // 'true' or 'false'
  score: RiskLevel;      // Risk assessment
  checked: boolean;      // Whether attribute was checked
}

type AttributeName =
  | 'is_role'
  | 'is_free'
  | 'is_disposable'
  | 'is_catchall';

type RiskLevel = 'high' | 'medium' | 'low';
```

**Validation Rules**:
- `name` must be one of 4 allowed attribute types
- `value` must be 'true' or 'false' (string, not boolean)
- `score` must be one of 3 risk levels
- `checked` indicates if attribute was successfully evaluated

**Relationships**: Embedded within `VerificationResult` (composition)

---

### 3. Server Info

**Purpose**: Email server metadata

**Storage**: JSONB object within `VerificationResult.serverInfo`

**Schema**:
```typescript
interface ServerInfo {
  smtpProvider: string;   // E.g., "Google", "Microsoft"
  mxRecords: string;      // Comma-separated MX hostnames
}
```

**Validation Rules**:
- `smtpProvider` can be empty string if unknown
- `mxRecords` can be empty string if DNS lookup failed

**Relationships**: Embedded within `VerificationResult` (composition)

---

### 4. Dashboard Summary (Computed)

**Purpose**: Aggregated metrics for dashboard overview

**Storage**: Computed on-demand (not stored)

**Schema**:
```typescript
interface DashboardSummary {
  credits: number;              // From Redis: user:{userId}:credits
  totalVerifications: number;   // COUNT(*) FROM verification_results WHERE user_id = ?
  totalApiCalls: number;        // Placeholder (0 for this epic, future implementation)
  periodVerifications: number;  // COUNT(*) with date range filter
}
```

**Computation Logic**:
```sql
-- Total verifications (all-time)
SELECT COUNT(*) FROM verification_results WHERE user_id = $1;

-- Period verifications (last N days)
SELECT COUNT(*) FROM verification_results
WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '$2 days';
```

**Redis Query**:
```redis
GET user:{userId}:credits
```

---

### 5. Distribution Data (Computed)

**Purpose**: Verification count breakdown by status

**Storage**: Computed on-demand via SQL GROUP BY

**Schema**:
```typescript
interface DistributionData {
  valid: number;
  invalid: number;
  unknown: number;
  risky: number;
  disposable: number;
  catchAll: number;
  role: number;
}
```

**Computation Logic**:
```sql
SELECT
  status,
  COUNT(*) as count
FROM verification_results
WHERE user_id = $1
  AND created_at >= NOW() - INTERVAL '$2 days'
GROUP BY status;
```

**Post-processing**: Map SQL results to DistributionData object, default to 0 for missing statuses

---

### 6. Trend Data (Computed)

**Purpose**: Daily verification counts over time range

**Storage**: Computed on-demand via SQL GROUP BY with date truncation

**Schema**:
```typescript
interface TrendDataPoint {
  date: string;      // YYYY-MM-DD format
  count: number;     // Total verifications on this date
  valid: number;     // Valid verifications
  invalid: number;   // Invalid verifications
  unknown: number;   // Unknown verifications
  risky: number;     // Risky verifications
}

type TrendData = TrendDataPoint[];
```

**Computation Logic**:
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as count,
  SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END) as valid,
  SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) as invalid,
  SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END) as unknown,
  SUM(CASE WHEN status = 'risky' THEN 1 ELSE 0 END) as risky
FROM verification_results
WHERE user_id = $1
  AND created_at >= NOW() - INTERVAL '$2 days'
GROUP BY DATE(created_at)
ORDER BY date ASC;
```

**Performance**: Indexed by `created_at` for efficient date range queries

---

### 7. Circuit Breaker State (Redis)

**Purpose**: Distributed circuit breaker state for upstream API

**Storage**: Redis key `cb:upstream:state`

**Schema**:
```typescript
interface CircuitBreakerState {
  state: CBState;           // Current state
  failureCount: number;     // Failures in current window
  lastTransition: Date;     // ISO 8601 timestamp
}

type CBState = 'OPEN' | 'HALF_OPEN' | 'CLOSED';
```

**Redis Structure**:
```json
{
  "state": "CLOSED",
  "failureCount": 0,
  "lastTransition": "2026-02-01T12:00:00Z"
}
```

**State Transitions**:
1. `CLOSED` → `OPEN`: When failure rate exceeds 50% over last 100 calls
2. `OPEN` → `HALF_OPEN`: After 30-second wait period
3. `HALF_OPEN` → `CLOSED`: When 5 test calls all succeed
4. `HALF_OPEN` → `OPEN`: When any test call fails

**Coordination**: All workers read/write this Redis key to coordinate CB state

---

### 8. Verification Job (BullMQ)

**Purpose**: Queue job data for verification processing

**Storage**: Redis (managed by BullMQ Pro)

**Schema**:
```typescript
interface VerificationJob {
  jobId: string;          // BullMQ generated UUID
  tenantId: string;       // User ID for tenant grouping
  email: string;          // Email to verify
  priority: number;       // 1 for single verify (high priority)
  retryAttempts: number;  // 0-3 (exponential backoff)
  status: JobStatus;      // BullMQ managed
  createdAt: Date;        // Job creation timestamp
  processedAt?: Date;     // Job completion timestamp
}

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
```

**Job Data Example**:
```json
{
  "tenantId": "user-123-uuid",
  "email": "test@example.com",
  "priority": 1
}
```

**BullMQ Configuration**:
- Group ID: `tenantId` (for fair round-robin)
- Priority: 1 (higher priority = processed first)
- Retry: 3 attempts with exponential backoff (0-1s, 0-4s, 0-16s)
- Remove on complete: `true`
- Remove on fail: Keep last 1000 in DLQ

---

### 9. Credit Balance (Redis)

**Purpose**: Fast credit balance lookup and atomic deduction

**Storage**: Redis key `user:{userId}:credits`

**Schema**:
```typescript
interface CreditBalance {
  value: number;  // Integer credit count
}
```

**Redis Structure**:
```
Key: user:01234567-89ab-cdef-0123-456789abcdef:credits
Value: 1500  (integer)
```

**Atomic Operations** (Lua script):
```lua
-- Check and deduct atomically
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', key) or '0')
if current >= amount then
  return redis.call('DECRBY', key, amount)
else
  return -1  -- Insufficient credits
end
```

**Reconciliation**: Compared against PostgreSQL ledger every 5 minutes

---

### 10. Credit Event (PostgreSQL)

**Purpose**: Immutable audit trail of all credit transactions

**Storage**: PostgreSQL table `credit_events` (already exists from Epic 1)

**Schema**:
```typescript
interface CreditEvent {
  id: string;               // BIGSERIAL
  userId: string;           // UUID, FK to users.id
  type: CreditEventType;    // Transaction type
  amount: number;           // Credits added/removed (signed)
  balanceAfter: number;     // Balance after transaction
  referenceType?: string;   // E.g., 'verification', 'refund'
  referenceId?: string;     // E.g., verification_result.id
  idempotencyKey?: string;  // Unique constraint for deduplication
  createdAt: Date;          // Transaction timestamp
}

type CreditEventType = 'purchase' | 'subscription' | 'deduct' | 'refund';
```

**Validation Rules**:
- `idempotencyKey` must be unique (enforced by unique constraint)
- `balanceAfter` must be >= 0 (no negative balances)

**Reconciliation Query**:
```sql
-- Calculate balance from ledger
SELECT
  user_id,
  SUM(amount) as calculated_balance
FROM credit_events
WHERE user_id = ANY($1)  -- Batch of user IDs
GROUP BY user_id;
```

---

## Drizzle ORM Schema

Add to `backend/src/db/schema.ts`:

```typescript
import { pgTable, serial, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { user } from './schema.js'; // Import from Epic 1

export const verificationResult = pgTable(
  'verification_results',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: text('status').notNull(), // 'valid' | 'invalid' | 'unknown' | 'risky' | 'disposable' | 'catch_all' | 'role'
    score: integer('score').notNull(), // 0-100
    deliverable: boolean('deliverable').notNull(),
    reason: text('reason').notNull(),
    domain: text('domain').notNull(),
    attributes: jsonb('attributes').$type<EmailAttribute[]>().notNull(),
    serverInfo: jsonb('server_info').$type<ServerInfo>().notNull(),
    verifiedAt: timestamp('verified_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index('verification_result_user_id_created_at_idx').on(
      table.userId,
      table.createdAt.desc()
    ),
    createdAtIdx: index('verification_result_created_at_idx').on(table.createdAt),
  })
);

// TypeScript types (for $type assertions above)
export interface EmailAttribute {
  name: 'is_role' | 'is_free' | 'is_disposable' | 'is_catchall';
  value: 'true' | 'false';
  score: 'high' | 'medium' | 'low';
  checked: boolean;
}

export interface ServerInfo {
  smtpProvider: string;
  mxRecords: string;
}
```

---

## Migration Strategy

### New Tables

1. **verification_results**: Core table for this epic
   - Run `npx drizzle-kit push` to create table
   - Indexes created automatically via Drizzle schema

### Existing Tables (No Changes)

- `users`: No changes (FK target)
- `sessions`: No changes
- `credit_events`: No changes (used by reconciliation)

### Redis Keys (No Migration)

- `user:{userId}:credits`: Already exists from Epic 1
- `cb:upstream:state`: Created on first circuit breaker initialization

---

## Query Patterns

### Frequent Queries

1. **Get Recent Results** (P1, very frequent):
```sql
SELECT * FROM verification_results
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 10;
```
Optimization: Uses composite index `(user_id, created_at DESC)`

2. **Dashboard Distribution** (P2, frequent):
```sql
SELECT status, COUNT(*) as count
FROM verification_results
WHERE user_id = $1
  AND created_at >= $2
GROUP BY status;
```
Optimization: Index on `user_id` supports WHERE clause

3. **Dashboard Trend** (P2, frequent):
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as count,
  SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END) as valid,
  ...
FROM verification_results
WHERE user_id = $1
  AND created_at >= $2
GROUP BY DATE(created_at)
ORDER BY date ASC;
```
Optimization: Index on `created_at` supports date range filtering

### Infrequent Queries

4. **Retention Cleanup** (daily cron):
```sql
DELETE FROM verification_results vr
USING users u
WHERE vr.user_id = u.id
  AND vr.created_at < NOW() - (u.data_retention_days || ' days')::INTERVAL;
```
Optimization: Batched deletion (1000 rows at a time) to avoid long locks

---

## Data Lifecycle

### Verification Result Lifecycle

1. **Creation**: On successful verification
   - Inserted into `verification_results` table
   - Credit deducted from Redis (atomic Lua)
   - Credit event recorded in `credit_events`

2. **Read**: Multiple access patterns
   - Recent results: ORDER BY created_at DESC LIMIT 10
   - Dashboard metrics: GROUP BY aggregations
   - Individual lookup: WHERE id = $1

3. **Deletion**: Automatic retention cleanup
   - Daily job at 2 AM UTC
   - WHERE created_at < NOW() - user.dataRetentionDays
   - Batched deletion (1000 rows per transaction)

### Credit Balance Lifecycle

1. **Deduction**: On verification request
   - Redis Lua atomic check-and-deduct
   - PostgreSQL credit_event insert (type='deduct')

2. **Refund**: On verification failure
   - Redis INCRBY (add credits back)
   - PostgreSQL credit_event insert (type='refund')

3. **Reconciliation**: Every 5 minutes
   - Compare Redis vs PostgreSQL SUM(amount)
   - Auto-correct drift > threshold
   - Alert if drift > 100 credits

---

## Performance Considerations

### PostgreSQL

- **Index selectivity**: `(user_id, created_at)` highly selective for recent queries
- **JSONB overhead**: Minimal for small arrays (4-5 attributes per result)
- **Retention cleanup**: Batched to avoid blocking production queries

### Redis

- **Memory usage**: Credit balances ~100 bytes per user (1000 users = 100KB)
- **Circuit breaker state**: Single key, <1KB
- **Atomic operations**: Lua scripts execute in <1ms

### Query Performance Targets

- Recent results: <100ms (P1 requirement: <500ms)
- Dashboard metrics: <1s (P2 requirement: <2s)
- Retention cleanup: <5 minutes (daily job, off-peak)

---

## Data Privacy & Security

### User Isolation

- All queries scoped by `user_id` (strict per-user isolation)
- No cross-tenant data access via application layer
- PostgreSQL row-level security not used (application enforces)

### Sensitive Data

- Email addresses stored in plaintext (required for verification)
- No PII beyond email address in verification_results
- User PII in `users` table (Epic 1 scope)

### Retention Compliance

- Automatic deletion after user-configured retention period
- Default 30 days aligns with GDPR "right to erasure"
- Manual deletion triggered by user account deletion (cascade)

---

## Future Considerations (Out of Scope)

- Partitioning `verification_results` by created_at (monthly partitions for >10M rows)
- Read replicas for dashboard queries (when read load exceeds single instance)
- Time-series database (TimescaleDB) for trend analytics at scale
- Encryption at rest for verification_results (not required for email addresses)

---

**Document Version**: 1.0
**Last Updated**: 2026-02-01
**Next Review**: After Phase 0 research completion
