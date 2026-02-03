# Data Model: Bulk Email Verification

**Feature**: 004-bulk-verification
**Date**: 2026-02-02
**Status**: Complete

## Overview

This document defines the database schema, entities, relationships, and state transitions for bulk email verification.

---

## Entity Relationship Diagram

```
┌─────────────────┐
│     users       │
│ (from Epic 001) │
└────────┬────────┘
         │
         │ 1:N
         │
    ┌────▼────────┐       1:N      ┌─────────────────────┐
    │  bulk_jobs  │◄────────────────│ verification_results│
    │             │                 │                     │
    └─────────────┘                 └─────────────────────┘
         │
         │ referenced by
         │
    ┌────▼────────────┐
    │  credit_events  │
    │ (from Epic 003) │
    └─────────────────┘
```

---

## Entities

### 1. BulkJob

**Purpose**: Represents a batch email verification request submitted by a user.

**Table**: `bulk_jobs`

**Fields**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | ULID identifier (sortable, timestamp-embedded) |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) | Owner of the job |
| `source_type` | TEXT | NOT NULL, CHECK IN ('file', 'paste') | How emails were submitted |
| `filename` | TEXT | NULL | Original filename (NULL for paste jobs) |
| `total_count` | INTEGER | NOT NULL, CHECK > 0 | Total emails in job |
| `processed_count` | INTEGER | NOT NULL, DEFAULT 0 | Emails processed so far |
| `status` | TEXT | NOT NULL, CHECK IN ('pending', 'processing', 'completed', 'failed') | Current job state |
| `valid_count` | INTEGER | NOT NULL, DEFAULT 0 | Count of deliverable emails |
| `invalid_count` | INTEGER | NOT NULL, DEFAULT 0 | Count of undeliverable emails |
| `risky_count` | INTEGER | NOT NULL, DEFAULT 0 | Count of risky emails |
| `unknown_count` | INTEGER | NOT NULL, DEFAULT 0 | Count of unknown status emails |
| `error_reason` | TEXT | NULL | Reason if status='failed' |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Job creation time |
| `started_at` | TIMESTAMPTZ | NULL | When processing started |
| `completed_at` | TIMESTAMPTZ | NULL | When processing finished |
| `result_url` | TEXT | NULL | S3 pre-signed URL for CSV download |
| `result_expires_at` | TIMESTAMPTZ | NULL | When results are deleted (created_at + 14 days) |

**Indexes**:
```sql
CREATE INDEX idx_bulk_jobs_user_status ON bulk_jobs(user_id, status);
CREATE INDEX idx_bulk_jobs_created ON bulk_jobs(created_at DESC);

-- Enforce one active job per user
CREATE UNIQUE INDEX idx_one_active_job_per_user
ON bulk_jobs(user_id)
WHERE status IN ('pending', 'processing');
```

**Validation Rules**:
- `total_count` must be between 1 and 100,000
- `processed_count` must be ≤ `total_count`
- Sum of `valid_count + invalid_count + risky_count + unknown_count` must equal `processed_count`
- `filename` is required when `source_type = 'file'`
- `filename` must be NULL when `source_type = 'paste'`
- `result_expires_at` must be `completed_at + 14 days`

**State Transitions**: See State Machine section below

---

### 2. VerificationResult

**Purpose**: Stores the verification outcome for a single email within a bulk job.

**Table**: `verification_results`

**Fields**:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | ULID identifier |
| `job_id` | TEXT | NOT NULL, REFERENCES bulk_jobs(id) ON DELETE CASCADE | Parent job |
| `email` | TEXT | NOT NULL | Email address verified |
| `status` | TEXT | NOT NULL, CHECK IN ('deliverable', 'undeliverable', 'risky', 'unknown') | Verification outcome |
| `deliverable` | BOOLEAN | NOT NULL | True if email is valid |
| `risky` | BOOLEAN | NOT NULL | True if email is suspicious |
| `unknown` | BOOLEAN | NOT NULL | True if verification inconclusive |
| `risk_score` | INTEGER | NOT NULL, CHECK >= 0 AND <= 100 | Risk score (0-100) |
| `failure_reason` | TEXT | NULL | Reason if status != 'deliverable' |
| `mx_records` | JSONB | NULL | MX records found |
| `smtp_provider` | TEXT | NULL | Email provider (e.g., 'Gmail', 'Outlook') |
| `is_free_email` | BOOLEAN | NOT NULL, DEFAULT false | True for Gmail, Yahoo, etc. |
| `is_role_based` | BOOLEAN | NOT NULL, DEFAULT false | True for info@, support@, etc. |
| `is_disposable` | BOOLEAN | NOT NULL, DEFAULT false | True for temp email services |
| `is_catch_all` | BOOLEAN | NOT NULL, DEFAULT false | True if domain accepts all emails |
| `verified_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Verification timestamp |

**Indexes**:
```sql
CREATE INDEX idx_results_job_id ON verification_results(job_id);
CREATE INDEX idx_results_job_deliverable ON verification_results(job_id, deliverable);
CREATE INDEX idx_results_job_status ON verification_results(job_id, status);
```

**Validation Rules**:
- `email` must match email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Exactly one of `deliverable`, `risky`, `unknown` must be true
- `status` must align with boolean flags:
  - `status='deliverable'` → `deliverable=true`
  - `status='undeliverable'` → `deliverable=false, risky=false, unknown=false`
  - `status='risky'` → `risky=true`
  - `status='unknown'` → `unknown=true`
- `mx_records` is JSON array of strings (e.g., `["mx1.example.com", "mx2.example.com"]`)

**Cascade Delete**: When a `bulk_job` is deleted, all associated `verification_results` are deleted (ON DELETE CASCADE)

---

## Relationships

### BulkJob ↔ User (Many-to-One)

- A user can have many bulk jobs
- Each bulk job belongs to exactly one user
- Foreign key: `bulk_jobs.user_id → users.id`

**Query Pattern**:
```typescript
// Get all jobs for a user
const jobs = await db
  .select()
  .from(bulkJobs)
  .where(eq(bulkJobs.userId, userId))
  .orderBy(desc(bulkJobs.createdAt));
```

### BulkJob ↔ VerificationResult (One-to-Many)

- A bulk job has many verification results (one per email)
- Each verification result belongs to exactly one bulk job
- Foreign key: `verification_results.job_id → bulk_jobs.id`
- Cascade delete: Deleting a job deletes all its results

**Query Pattern**:
```typescript
// Get all results for a job
const results = await db
  .select()
  .from(verificationResults)
  .where(eq(verificationResults.jobId, jobId));

// Get only valid results for a job
const validResults = await db
  .select()
  .from(verificationResults)
  .where(and(
    eq(verificationResults.jobId, jobId),
    eq(verificationResults.deliverable, true)
  ));
```

### BulkJob ↔ CreditEvent (One-to-One)

- Each bulk job creates exactly one credit deduction event
- Foreign key: `credit_events.reference_id = bulk_jobs.id`
- Relationship is implicit (no DB foreign key, but enforced in application logic)

**Credit Deduction Flow**:
1. User uploads file with 5,000 emails
2. System atomically deducts 5,000 credits via Redis Lua script (Epic 003)
3. System creates credit_event: `{ type: 'bulk_verification', amount: -5000, reference_id: job.id }`
4. System creates bulk_job with `total_count: 5000`

---

## State Machine: BulkJob

### States

| State | Description |
|-------|-------------|
| `pending` | Job created, waiting for worker to pick up |
| `processing` | Worker is actively verifying emails |
| `completed` | All emails verified successfully |
| `failed` | Job encountered fatal error and cannot continue |

### Transitions

```
┌─────────┐
│ pending │
└────┬────┘
     │
     │ Worker picks up job
     ▼
┌────────────┐
│ processing │
└─────┬──────┘
      │
      ├──────────────────┐
      │                  │
      │ Success          │ Fatal error
      │                  │
      ▼                  ▼
┌───────────┐       ┌────────┐
│ completed │       │ failed │
└───────────┘       └────────┘
```

### Transition Rules

| From | To | Trigger | Side Effects |
|------|-----|---------|--------------|
| `pending` | `processing` | Worker starts job | Set `started_at` |
| `processing` | `completed` | All emails processed | Set `completed_at`, `result_expires_at`, generate result CSV, upload to S3 |
| `processing` | `failed` | Fatal error (DB down, S3 unavailable) | Set `error_reason`, `completed_at` |
| `processing` | `processing` | Per-email errors | Increment `processed_count`, update result counts, emit progress |

**No Other Transitions Allowed**:
- No `pending → failed` (job must start processing first)
- No `completed → processing` (no retries)
- No `failed → processing` (no retries)
- No cancellation state (jobs cannot be cancelled)

### State Invariants

**In `pending` state**:
- `processed_count = 0`
- `started_at IS NULL`
- `completed_at IS NULL`
- `result_url IS NULL`

**In `processing` state**:
- `0 ≤ processed_count < total_count`
- `started_at IS NOT NULL`
- `completed_at IS NULL`

**In `completed` state**:
- `processed_count = total_count`
- `started_at IS NOT NULL`
- `completed_at IS NOT NULL`
- `result_url IS NOT NULL`
- `result_expires_at = completed_at + 14 days`

**In `failed` state**:
- `processed_count < total_count`
- `started_at IS NOT NULL`
- `completed_at IS NOT NULL`
- `error_reason IS NOT NULL`
- `result_url MAY BE NULL` (if failure before CSV generation)

---

## TypeScript Types

```typescript
// Enums
export enum BulkJobStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed'
}

export enum BulkJobSourceType {
  File = 'file',
  Paste = 'paste'
}

export enum VerificationStatus {
  Deliverable = 'deliverable',
  Undeliverable = 'undeliverable',
  Risky = 'risky',
  Unknown = 'unknown'
}

// BulkJob entity
export interface BulkJob {
  id: string;
  userId: string;
  sourceType: BulkJobSourceType;
  filename: string | null;
  totalCount: number;
  processedCount: number;
  status: BulkJobStatus;
  validCount: number;
  invalidCount: number;
  riskyCount: number;
  unknownCount: number;
  errorReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  resultUrl: string | null;
  resultExpiresAt: Date | null;
}

// VerificationResult entity
export interface VerificationResult {
  id: string;
  jobId: string;
  email: string;
  status: VerificationStatus;
  deliverable: boolean;
  risky: boolean;
  unknown: boolean;
  riskScore: number;
  failureReason: string | null;
  mxRecords: string[] | null;
  smtpProvider: string | null;
  isFreeEmail: boolean;
  isRoleBased: boolean;
  isDisposable: boolean;
  isCatchAll: boolean;
  verifiedAt: Date;
}

// Progress event (for SSE)
export interface ProgressEvent {
  jobId: string;
  processedCount: number;
  totalCount: number;
  percentage: number;
  validCount: number;
  invalidCount: number;
  riskyCount: number;
  unknownCount: number;
  processingRate: number; // emails/second
  estimatedSecondsRemaining: number;
}

// Job history item (for frontend)
export interface BulkJobHistoryItem {
  id: string;
  filename: string | null;
  totalCount: number;
  status: BulkJobStatus;
  validCount: number;
  invalidCount: number;
  createdAt: Date;
  completedAt: Date | null;
  resultAvailable: boolean; // false if expired or failed
}
```

---

## Drizzle Schema Definition

```typescript
import { pgTable, text, integer, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const bulkJobs = pgTable('bulk_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  sourceType: text('source_type').notNull().$type<'file' | 'paste'>(),
  filename: text('filename'),
  totalCount: integer('total_count').notNull(),
  processedCount: integer('processed_count').notNull().default(0),
  status: text('status').notNull().$type<'pending' | 'processing' | 'completed' | 'failed'>(),
  validCount: integer('valid_count').notNull().default(0),
  invalidCount: integer('invalid_count').notNull().default(0),
  riskyCount: integer('risky_count').notNull().default(0),
  unknownCount: integer('unknown_count').notNull().default(0),
  errorReason: text('error_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  resultUrl: text('result_url'),
  resultExpiresAt: timestamp('result_expires_at')
}, (table) => ({
  userStatusIdx: index('idx_bulk_jobs_user_status').on(table.userId, table.status),
  createdIdx: index('idx_bulk_jobs_created').on(table.createdAt),
  oneActiveJobPerUser: uniqueIndex('idx_one_active_job_per_user')
    .on(table.userId)
    .where(sql`status IN ('pending', 'processing')`)
}));

export const verificationResults = pgTable('verification_results', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => bulkJobs.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  status: text('status').notNull().$type<'deliverable' | 'undeliverable' | 'risky' | 'unknown'>(),
  deliverable: boolean('deliverable').notNull(),
  risky: boolean('risky').notNull(),
  unknown: boolean('unknown').notNull(),
  riskScore: integer('risk_score').notNull(),
  failureReason: text('failure_reason'),
  mxRecords: jsonb('mx_records').$type<string[]>(),
  smtpProvider: text('smtp_provider'),
  isFreeEmail: boolean('is_free_email').notNull().default(false),
  isRoleBased: boolean('is_role_based').notNull().default(false),
  isDisposable: boolean('is_disposable').notNull().default(false),
  isCatchAll: boolean('is_catch_all').notNull().default(false),
  verifiedAt: timestamp('verified_at').notNull().defaultNow()
}, (table) => ({
  jobIdIdx: index('idx_results_job_id').on(table.jobId),
  jobDeliverableIdx: index('idx_results_job_deliverable').on(table.jobId, table.deliverable),
  jobStatusIdx: index('idx_results_job_status').on(table.jobId, table.status)
}));
```

---

## Migration SQL

```sql
-- Migration: 0003_bulk_verification.sql
-- Date: 2026-02-02
-- Feature: 004-bulk-verification

-- Bulk jobs table
CREATE TABLE bulk_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('file', 'paste')),
  filename TEXT,
  total_count INTEGER NOT NULL CHECK(total_count > 0 AND total_count <= 100000),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK(processed_count >= 0 AND processed_count <= total_count),
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  valid_count INTEGER NOT NULL DEFAULT 0 CHECK(valid_count >= 0),
  invalid_count INTEGER NOT NULL DEFAULT 0 CHECK(invalid_count >= 0),
  risky_count INTEGER NOT NULL DEFAULT 0 CHECK(risky_count >= 0),
  unknown_count INTEGER NOT NULL DEFAULT 0 CHECK(unknown_count >= 0),
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_url TEXT,
  result_expires_at TIMESTAMPTZ,
  CONSTRAINT valid_counts CHECK(valid_count + invalid_count + risky_count + unknown_count = processed_count),
  CONSTRAINT filename_for_file_source CHECK(source_type = 'paste' OR filename IS NOT NULL)
);

CREATE INDEX idx_bulk_jobs_user_status ON bulk_jobs(user_id, status);
CREATE INDEX idx_bulk_jobs_created ON bulk_jobs(created_at DESC);

-- Enforce one active job per user
CREATE UNIQUE INDEX idx_one_active_job_per_user
ON bulk_jobs(user_id)
WHERE status IN ('pending', 'processing');

-- Verification results table
CREATE TABLE verification_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES bulk_jobs(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK(email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  status TEXT NOT NULL CHECK(status IN ('deliverable', 'undeliverable', 'risky', 'unknown')),
  deliverable BOOLEAN NOT NULL,
  risky BOOLEAN NOT NULL,
  unknown BOOLEAN NOT NULL,
  risk_score INTEGER NOT NULL CHECK(risk_score >= 0 AND risk_score <= 100),
  failure_reason TEXT,
  mx_records JSONB,
  smtp_provider TEXT,
  is_free_email BOOLEAN NOT NULL DEFAULT false,
  is_role_based BOOLEAN NOT NULL DEFAULT false,
  is_disposable BOOLEAN NOT NULL DEFAULT false,
  is_catch_all BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_flag_true CHECK(
    (deliverable::int + risky::int + unknown::int) = 1
  )
);

CREATE INDEX idx_results_job_id ON verification_results(job_id);
CREATE INDEX idx_results_job_deliverable ON verification_results(job_id, deliverable);
CREATE INDEX idx_results_job_status ON verification_results(job_id, status);
```

---

## Query Patterns

### Create bulk job
```typescript
const job = await db.insert(bulkJobs).values({
  id: ulid(),
  userId: user.id,
  sourceType: 'file',
  filename: 'contacts.csv',
  totalCount: 5000,
  status: 'pending'
}).returning();
```

### Check for active job (before creating new one)
```typescript
const activeJob = await db
  .select()
  .from(bulkJobs)
  .where(and(
    eq(bulkJobs.userId, userId),
    or(eq(bulkJobs.status, 'pending'), eq(bulkJobs.status, 'processing'))
  ))
  .limit(1);
```

### Get job history (file uploads only, exclude paste)
```typescript
const history = await db
  .select({
    id: bulkJobs.id,
    filename: bulkJobs.filename,
    totalCount: bulkJobs.totalCount,
    status: bulkJobs.status,
    validCount: bulkJobs.validCount,
    invalidCount: bulkJobs.invalidCount,
    createdAt: bulkJobs.createdAt,
    completedAt: bulkJobs.completedAt,
    resultAvailable: sql<boolean>`result_expires_at > NOW()`
  })
  .from(bulkJobs)
  .where(and(
    eq(bulkJobs.userId, userId),
    eq(bulkJobs.sourceType, 'file')
  ))
  .orderBy(desc(bulkJobs.createdAt))
  .limit(limit)
  .offset(offset);
```

### Update job progress (called by worker)
```typescript
await db
  .update(bulkJobs)
  .set({
    processedCount: processed,
    validCount: valid,
    invalidCount: invalid,
    riskyCount: risky,
    unknownCount: unknown
  })
  .where(eq(bulkJobs.id, jobId));
```

### Mark job complete
```typescript
await db
  .update(bulkJobs)
  .set({
    status: 'completed',
    completedAt: new Date(),
    resultExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
    resultUrl: preSignedUrl
  })
  .where(eq(bulkJobs.id, jobId));
```

### Stream results for CSV generation
```typescript
const results = await db
  .select()
  .from(verificationResults)
  .where(eq(verificationResults.jobId, jobId))
  .stream(); // Drizzle streaming query

for await (const result of results) {
  csvStream.write(transformToCSV(result));
}
```

### Get results by filter (for filtered downloads)
```typescript
// Valid only
const validResults = await db
  .select()
  .from(verificationResults)
  .where(and(
    eq(verificationResults.jobId, jobId),
    eq(verificationResults.deliverable, true)
  ));

// Invalid only
const invalidResults = await db
  .select()
  .from(verificationResults)
  .where(and(
    eq(verificationResults.jobId, jobId),
    eq(verificationResults.deliverable, false)
  ));
```

---

## Cleanup Jobs

### Expired results cleanup (background job)

Runs daily to delete S3 files for expired results:

```typescript
// Find jobs with expired results
const expiredJobs = await db
  .select()
  .from(bulkJobs)
  .where(lt(bulkJobs.resultExpiresAt, new Date()));

// Delete S3 files
for (const job of expiredJobs) {
  await s3.deleteObject({
    Bucket: 'emailkit-results',
    Key: `results/${job.id}.csv.gz`
  });
}

// Clear result_url (keep metadata for history)
await db
  .update(bulkJobs)
  .set({ resultUrl: null })
  .where(inArray(bulkJobs.id, expiredJobs.map(j => j.id)));
```

**Note**: DigitalOcean Spaces lifecycle policy also handles deletion automatically after 14 days as a backup.

---

## Constraints Summary

| Constraint | Enforcement | Purpose |
|------------|-------------|---------|
| Total count 1-100K | DB CHECK | Prevent abuse, ensure scalability |
| Processed ≤ Total | DB CHECK | Data integrity |
| Sum of counts = processed | DB CHECK | Ensure no lost emails |
| One active job per user | UNIQUE INDEX | Simplify coordination |
| Email format | DB CHECK | Prevent invalid data |
| One status flag true | DB CHECK | Ensure valid state |
| Risk score 0-100 | DB CHECK | Valid range |
| Filename required for file source | DB CHECK | Data completeness |
| Cascade delete results | FOREIGN KEY | Cleanup automation |
| Result expiration 14 days | Application logic | Storage management |

---

## Performance Considerations

### Indexing Strategy

- `(user_id, status)`: Fast lookup for active jobs, history queries
- `(created_at DESC)`: Efficient history pagination
- `(job_id)` on results: Fast result filtering for CSV generation
- `(job_id, deliverable)`: Optimizes filtered downloads
- Unique partial index on `(user_id)` where active: No overhead for completed jobs

### Expected Row Counts

- `bulk_jobs`: ~100K rows (1000 users × 100 jobs each over lifetime)
- `verification_results`: ~10M rows (100K jobs × 100 emails average)
  - This is manageable with proper indexing and archiving strategy

### Archival Strategy (Future)

When `verification_results` exceeds 50M rows:
- Move completed jobs older than 90 days to archive table
- Keep bulk_jobs metadata indefinitely (small rows)
- Archive results table partitioned by month

---

## Summary

- **2 tables**: `bulk_jobs` (job metadata) and `verification_results` (per-email results)
- **4 states**: pending → processing → completed/failed
- **1 constraint**: One active job per user (unique index)
- **3 relationships**: jobs ↔ user, jobs ↔ results, jobs ↔ credit_events
- **14-day retention**: Automated cleanup via lifecycle policy + background job
- **Normalized design**: No data duplication, efficient queries, clear ownership
