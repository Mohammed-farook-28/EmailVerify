# Research: Bulk Email Verification

**Feature**: 004-bulk-verification
**Date**: 2026-02-02
**Status**: Complete

## Overview

This document consolidates research findings for implementing bulk email verification. Key areas: CSV/Excel parsing, SSE for progress streaming, BullMQ batch processing patterns, object storage integration, and result file generation.

---

## 1. CSV/Excel Parsing

### Decision: csv-parse + xlsx libraries

**Rationale**:
- `csv-parse` (part of node-csv ecosystem): Battle-tested, streaming API, handles large files efficiently
- `xlsx` (SheetJS): Industry standard for Excel parsing, supports .xlsx and .xls, memory-efficient streaming mode
- Both support TypeScript, actively maintained, well-documented

**Implementation Pattern**:
```typescript
// CSV parsing with streaming
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';

const parser = createReadStream(filePath).pipe(
  parse({ columns: true, skip_empty_lines: true })
);

// Excel parsing (first sheet only)
import * as XLSX from 'xlsx';

const workbook = XLSX.readFile(filePath, { sheetRows: 100000 });
const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(firstSheet);
```

**Column Detection Strategy**:
1. Parse first 100 rows
2. For each column, check if >80% of values match email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
3. If multiple columns match, prefer column with header containing "email", "e-mail", or "mail"
4. If no auto-detection, present all columns for manual mapping

**Validation**:
- When user selects column, validate that ≥50% of rows contain email-like strings
- If <50%, show warning but allow user to proceed

**Alternatives Considered**:
- `papaparse`: Client-side focused, less optimized for Node.js
- `fast-csv`: Good performance but less TypeScript support
- Manual parsing: Reinventing wheel, error-prone

---

## 2. Server-Sent Events (SSE) for Progress

### Decision: Express middleware with EventSource client

**Rationale**:
- SSE provides unidirectional server-to-client push (perfect for progress updates)
- Auto-reconnect built into EventSource API
- Simpler than WebSockets (no bidirectional complexity needed)
- Works through HTTP/HTTPS (no protocol upgrade issues with proxies)
- Browser support: all modern browsers

**Backend Implementation**:
```typescript
// SSE middleware
export function sseMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  req.on('close', () => {
    // Clean up connection
  });

  next();
}

// Progress emitter
export function sendProgress(res: Response, jobId: string, data: ProgressEvent) {
  res.write(`event: progress\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
```

**Frontend Implementation**:
```typescript
const eventSource = new EventSource(`/api/bulk/jobs/${jobId}/progress`);

eventSource.addEventListener('progress', (event) => {
  const data = JSON.parse(event.data);
  updateProgress(data);
});

eventSource.addEventListener('error', () => {
  // Auto-reconnects, but handle errors
});
```

**Progress Frequency**: Emit on 1% completion or 5 seconds (whichever first)
- Track last emit time and percentage
- Prevents flooding client with updates

**Alternatives Considered**:
- WebSockets: Overkill for unidirectional updates, adds complexity
- Polling: Higher latency, more server load, worse UX
- Long polling: Complex to implement, SSE is better

---

## 3. BullMQ Batch Processing

### Decision: BullMQ Pro Groups with dynamic batching

**Rationale**:
- BullMQ Pro Groups provide fair round-robin across users (existing pattern from Epic 002)
- Dynamic batch size (100 emails) balances throughput vs. granularity
- Priority system: single-verify jobs > bulk jobs (prevents starvation)
- Built-in retry, DLQ, and state persistence

**Job Creation Pattern**:
```typescript
// Create parent job
const job = await bulkQueue.add('bulk-verification', {
  jobId: ulid(),
  userId: user.id,
  emails: [], // Empty - will be processed in batches
  totalCount: 5000,
  batchSize: 100
}, {
  group: { id: `user:${user.id}` },
  priority: 5 // Lower than single-verify (priority 1)
});

// Worker processes in batches
async function processBulkJob(job: Job) {
  const { jobId, totalCount, batchSize } = job.data;

  for (let offset = 0; offset < totalCount; offset += batchSize) {
    const batch = await fetchBatchFromDB(jobId, offset, batchSize);
    await verifyBatch(batch); // Uses existing verification engine
    await updateProgress(jobId, offset + batch.length, totalCount);
  }
}
```

**Concurrency Control**:
- User can have only 1 active bulk job (enforced at API layer via DB query)
- Workers process 50 concurrent jobs (existing Epic 002 configuration)
- Each job processes emails in serial batches (simpler than parallel batching)

**Error Handling**:
- Per-email errors: Logged in verification_results table with failure reason
- Batch failures: Retry batch up to 3 times (BullMQ built-in)
- Job-level failures: Mark job as 'failed', save partial results

**Alternatives Considered**:
- Parallel batch processing: More complex, marginal gains (upstream API is bottleneck)
- Sub-jobs per batch: Over-engineering, adds queue overhead
- Custom queue implementation: Reinventing wheel, BullMQ is proven

---

## 4. Object Storage for Result Files

### Decision: DigitalOcean Spaces with aws-sdk

**Rationale**:
- Already using DO Spaces for avatars (Epic 001)
- S3-compatible API (use aws-sdk)
- Pre-signed URLs for secure, time-limited downloads
- Lifecycle policies for automatic 14-day deletion
- CDN integration for fast global downloads

**Implementation Pattern**:
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Upload result CSV
const key = `results/${jobId}.csv.gz`;
await s3.send(new PutObjectCommand({
  Bucket: 'emailkit-results',
  Key: key,
  Body: gzipStream,
  ContentType: 'text/csv',
  ContentEncoding: 'gzip'
}));

// Generate download URL (expires in 1 hour)
const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
  Bucket: 'emailkit-results',
  Key: key
}), { expiresIn: 3600 });
```

**Lifecycle Policy**:
```json
{
  "Rules": [{
    "Id": "DeleteOldResults",
    "Status": "Enabled",
    "Prefix": "results/",
    "Expiration": { "Days": 14 }
  }]
}
```

**Compression**:
- Gzip all result files >1MB
- Set `Content-Encoding: gzip` header
- Browser auto-decompresses transparently

**Alternatives Considered**:
- Local filesystem: No redundancy, harder to scale across multiple servers
- PostgreSQL BLOB: Poor performance for large files, expensive storage
- Database-only: Requires expensive large-instance storage

---

## 5. Result CSV Generation

### Decision: Streaming CSV generation with csv-stringify

**Rationale**:
- Memory-efficient streaming (handles 100K emails without OOM)
- Consistent format with input CSV
- Supports filtering (valid-only, invalid-only)

**Schema**:
```csv
email,status,deliverable,risky,unknown,risk_score,failure_reason,mx_records,smtp_provider,is_free_email,is_role_based,is_disposable,is_catch_all
john@example.com,deliverable,true,false,false,0,,,Gmail,false,false,false,false
bad@invalid.test,undeliverable,false,false,true,100,no_mx_records,,,false,false,false,false
```

**Streaming Implementation**:
```typescript
import { stringify } from 'csv-stringify';
import { createGzip } from 'zlib';

const csvStream = stringify({ header: true, columns: RESULT_COLUMNS });
const gzipStream = csvStream.pipe(createGzip());

// Stream results from database
const results = await db
  .select()
  .from(verificationResults)
  .where(eq(verificationResults.jobId, jobId))
  .stream(); // Drizzle streaming query

for await (const row of results) {
  csvStream.write(transformToCSV(row));
}

csvStream.end();
```

**Filtering**:
- Valid-only: `WHERE deliverable = true`
- Invalid-only: `WHERE deliverable = false`
- All: No filter

**Alternatives Considered**:
- JSON results: Less convenient for users, most expect CSV
- In-memory generation: OOM risk with 100K emails
- Pre-generate all filters: 3x storage cost, premature optimization

---

## 6. Database Schema Design

### Decision: Two-table normalized design

**Rationale**:
- `bulk_jobs`: Job metadata, status, summary counts
- `verification_results`: Individual email results (foreign key to job)
- Normalized design prevents data duplication
- Allows efficient querying for history, status, and partial results

**Schema**:
```sql
-- bulk_jobs table
CREATE TABLE bulk_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('file', 'paste')),
  filename TEXT, -- NULL for paste jobs
  total_count INTEGER NOT NULL,
  processed_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  valid_count INTEGER DEFAULT 0,
  invalid_count INTEGER DEFAULT 0,
  risky_count INTEGER DEFAULT 0,
  unknown_count INTEGER DEFAULT 0,
  error_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_url TEXT, -- Pre-signed URL (regenerated on access)
  result_expires_at TIMESTAMPTZ -- 14 days from completion
);

CREATE INDEX idx_bulk_jobs_user_status ON bulk_jobs(user_id, status);
CREATE INDEX idx_bulk_jobs_created ON bulk_jobs(created_at DESC);

-- verification_results table
CREATE TABLE verification_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES bulk_jobs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  deliverable BOOLEAN,
  risky BOOLEAN,
  unknown BOOLEAN,
  risk_score INTEGER,
  failure_reason TEXT,
  mx_records JSONB,
  smtp_provider TEXT,
  is_free_email BOOLEAN,
  is_role_based BOOLEAN,
  is_disposable BOOLEAN,
  is_catch_all BOOLEAN,
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_results_job_id ON verification_results(job_id);
CREATE INDEX idx_results_deliverable ON verification_results(job_id, deliverable);
```

**Why Not Single Table?**:
- Denormalized approach duplicates metadata for every email (100K × overhead)
- Harder to query job status without aggregating all rows
- Update anomalies when job metadata changes

**Why Not Three Tables?** (jobs, emails_to_verify, verification_results):
- Over-engineering: emails are verified immediately, no need for staging table
- Extra complexity for no benefit

---

## 7. Paste Verification Pattern

### Decision: Ephemeral jobs (no history persistence)

**Rationale**:
- Paste jobs are transient (user didn't save input file)
- No filename, no meaningful history entry
- Reduces clutter in history UI
- Same backend processing logic as file upload
- Results still generated for immediate download

**Implementation**:
```typescript
// Create job with source_type='paste'
const job = await db.insert(bulkJobs).values({
  id: ulid(),
  userId: user.id,
  sourceType: 'paste',
  filename: null, // No filename
  totalCount: emails.length,
  status: 'pending'
});

// History query excludes paste jobs
const history = await db
  .select()
  .from(bulkJobs)
  .where(and(
    eq(bulkJobs.userId, userId),
    eq(bulkJobs.sourceType, 'file') // Only file uploads in history
  ))
  .orderBy(desc(bulkJobs.createdAt));
```

**Email Extraction**:
- Split by newlines, commas, semicolons, spaces
- Apply email regex to each token
- Deduplicate (preserve first occurrence)
- Reject if <1 valid email found

**Alternatives Considered**:
- Show paste jobs in history: Clutters UI, no filename to identify
- Don't create job record: Loses progress tracking and result generation

---

## 8. Progress Update Strategy

### Decision: Dual-trigger emission (1% or 5 seconds)

**Rationale**:
- **1% threshold**: Ensures smooth progress bar updates (100 updates for 100% completion)
- **5-second timeout**: Guarantees activity even for slow jobs (prevents "frozen" appearance)
- **Whichever comes first**: Handles both fast jobs (many updates) and slow jobs (periodic heartbeat)

**Implementation**:
```typescript
let lastEmitTime = Date.now();
let lastEmitPercentage = 0;

function shouldEmitProgress(currentCount: number, totalCount: number): boolean {
  const currentPercentage = Math.floor((currentCount / totalCount) * 100);
  const timeSinceLastEmit = Date.now() - lastEmitTime;

  const percentageThreshold = currentPercentage >= lastEmitPercentage + 1;
  const timeThreshold = timeSinceLastEmit >= 5000;

  if (percentageThreshold || timeThreshold) {
    lastEmitTime = Date.now();
    lastEmitPercentage = currentPercentage;
    return true;
  }

  return false;
}
```

**Edge Cases**:
- Very fast jobs (<5s): Still get 1% updates, smooth progress
- Very slow jobs (>5s per 1%): Get 5-second heartbeat, user sees activity
- Job completion: Always emit 100% final update

**Alternatives Considered**:
- Fixed interval (e.g., every 2s): Can be too frequent for fast jobs, too slow for large jobs
- Percentage-only: Slow jobs appear frozen between updates
- Time-only: Fast jobs get flooded with updates

---

## 9. Single Concurrent Job Enforcement

### Decision: Database-level constraint + API check

**Rationale**:
- Simplifies queue coordination (no need to track active jobs in Redis)
- Prevents race conditions with unique constraint
- Clear error message when user attempts second job

**Implementation**:
```sql
-- Add unique constraint (one active job per user)
CREATE UNIQUE INDEX idx_one_active_job_per_user
ON bulk_jobs(user_id)
WHERE status IN ('pending', 'processing');
```

**API Check**:
```typescript
// Before creating job
const activeJob = await db
  .select()
  .from(bulkJobs)
  .where(and(
    eq(bulkJobs.userId, userId),
    or(
      eq(bulkJobs.status, 'pending'),
      eq(bulkJobs.status, 'processing')
    )
  ))
  .limit(1);

if (activeJob.length > 0) {
  return res.status(409).json({
    error: 'ACTIVE_JOB_EXISTS',
    message: 'You already have a bulk verification job in progress. Please wait for it to complete.',
    activeJobId: activeJob[0].id
  });
}
```

**Why Not Redis Lock?**:
- Database is source of truth for job state
- No need to sync Redis and DB
- Simpler architecture

**Alternatives Considered**:
- Queue-level limiting: BullMQ can limit, but doesn't prevent job creation
- Frontend-only check: Race conditions if user opens multiple tabs

---

## 10. No Cancellation Design

### Decision: Remove all cancellation mechanisms

**Rationale**:
- Simplifies state machine (no 'cancelling' or 'cancelled' states)
- Cleaner error handling (no partial cleanup logic)
- Users can close browser, job continues in background
- If truly needed, user can wait for completion (max ~30 minutes for 100K emails at 50/sec)

**State Machine**:
```
pending → processing → completed
                    → failed
```

**UI Implications**:
- No "Cancel" button on job page
- Show message: "Jobs cannot be cancelled once started. You can close this page; the job will continue in the background."
- Progress page remains accessible via history

**What Happens if User Closes Browser?**:
- Job continues processing in worker
- User can return to progress page later
- SSE reconnects automatically (EventSource built-in)

**Alternatives Considered**:
- Graceful cancellation: Complex state management, partial result handling
- Force stop: Risk of leaving system in inconsistent state (credits deducted but no results)

---

## 11. No Retry Mechanism Design

### Decision: No automatic retry for failed emails in same job

**Rationale**:
- Simpler job lifecycle (no retry state tracking)
- Failed emails usually fail for persistent reasons (no MX record, invalid domain)
- User can download failed emails and re-upload in new job if needed
- Reduces complexity in result aggregation

**Error Handling**:
```typescript
// Save all results, including failures
await db.insert(verificationResults).values({
  id: ulid(),
  jobId: job.id,
  email: email,
  status: 'failed',
  failureReason: error.message,
  deliverable: false,
  risky: false,
  unknown: true
});
```

**Result CSV Includes Failures**:
- Column `failure_reason` shows why email failed
- User can filter CSV to find failures and re-upload

**UI Messaging**:
- Job summary shows: "3,000 successful, 2,000 failed"
- Download includes all results with failure reasons
- No "Retry Failed Emails" button

**Alternatives Considered**:
- Auto-retry 3x: Most failures are permanent (domain doesn't exist), wastes credits
- Retry queue: Over-engineering, adds DLQ complexity

---

## 12. No Input File Storage Design

### Decision: Discard files immediately after parsing

**Rationale**:
- **Privacy**: Less user data stored, reduced GDPR/compliance burden
- **Cost**: Significant storage savings (10MB × 1000 users × 100 jobs = 1TB+)
- **Simplicity**: No file cleanup jobs, no lifecycle policies for input files
- **Security**: No risk of exposing input files (pre-signed URL leaks, etc.)

**Implementation**:
```typescript
// Parse file to extract emails
const emails = await parseCSV(uploadedFile);

// Create job with emails in database
await db.insert(bulkJobs).values({ /* ... */ });
await db.insert(verificationResults).values(
  emails.map(email => ({ jobId, email, status: 'pending' }))
);

// Delete temp file immediately
await fs.unlink(uploadedFile.path);
```

**User Implications**:
- User must keep original file if they want to re-verify
- History shows filename but not downloadable input
- Clear messaging: "Original files are not stored for privacy"

**What About Re-verification?**:
- User downloads results CSV (includes original emails)
- User can use results CSV as input for new job if needed

**Alternatives Considered**:
- Store for 7 days: Still incurs cost and compliance burden
- Store with encryption: Complexity for marginal benefit (user already has original)

---

## Summary Table

| Area | Technology/Pattern | Key Rationale |
|------|-------------------|---------------|
| CSV Parsing | csv-parse + xlsx | Streaming, TypeScript support, industry standard |
| Progress Updates | Server-Sent Events | Auto-reconnect, simpler than WebSockets, HTTP-friendly |
| Job Queue | BullMQ Pro Groups | Fair queuing, existing pattern, built-in features |
| Result Storage | DO Spaces (S3 API) | Already using for avatars, lifecycle policies, CDN |
| CSV Generation | csv-stringify streaming | Memory-efficient for 100K emails |
| Database | PostgreSQL (2 tables) | Normalized, efficient queries, foreign keys |
| Paste Jobs | Ephemeral (no history) | Reduces clutter, same processing logic |
| Progress Frequency | 1% or 5s (whichever first) | Smooth for fast jobs, heartbeat for slow jobs |
| Concurrency | DB unique constraint | Prevents races, simpler than Redis lock |
| Cancellation | Not supported | Simplifies state machine and error handling |
| Retry | Not supported | Failures usually permanent, user can re-upload |
| Input Storage | Not stored | Privacy, cost, simplicity |

---

## Open Questions

None remaining. All clarifications from spec have been incorporated into research decisions.

---

## References

- [csv-parse documentation](https://csv.js.org/parse/)
- [SheetJS (xlsx) documentation](https://docs.sheetjs.com/)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [BullMQ Pro Groups](https://docs.bullmq.io/bullmq-pro/groups)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [DigitalOcean Spaces](https://docs.digitalocean.com/products/spaces/)
- [csv-stringify streaming](https://csv.js.org/stringify/api/stream/)
