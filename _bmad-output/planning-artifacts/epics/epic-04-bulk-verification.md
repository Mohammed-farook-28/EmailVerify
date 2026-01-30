# Epic 4: Bulk Email Verification

## Epic Goal

Users can upload CSV/Excel files (up to 100K rows) or paste email lists for batch verification. Column mapping during upload. Real-time SSE progress updates (percentage, processed count, ETA). Downloadable results as CSV (full or filtered by status). Bulk job history with search and status filtering. File uploads create history records; paste verifications do not.

**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21, FR48, FR49
**Dependencies:** Epic 2 (verification engine, BullMQ queue, workers, credit system)

---

## Story 4.1: Bulk File Upload with Column Mapping

As a user,
I want to upload a CSV or Excel file of emails for batch verification,
So that I can verify thousands of emails efficiently.

**FRs:** FR16, FR20, FR21 | **NFRs:** NFR3, NFR15

**Acceptance Criteria:**

**Given** a signed-in user on /home/bulk-verify
**When** they upload a CSV or Excel file (max 10MB, up to 100,000 rows)
**Then** the file is parsed and column headers are displayed
**And** the user is prompted to select which column contains email addresses

**Given** the user confirms column mapping
**When** they submit the bulk job
**Then** credits are deducted atomically for the total email count (Redis Lua)
**And** the file is split into batches of 100 emails
**And** all batches are enqueued to BullMQ (priority 10 — bulk, tenant group)
**And** a bulk_jobs record is created (status='pending', total_emails=N)
**And** the job history records the file name and upload time
**And** a 202 response is returned with the job ID

**Edge Cases:**
- File too large (>10MB) → reject before processing
- File has no recognizable email column → show mapping UI, let user select
- Duplicate emails in file → verify each occurrence (or deduplicate — clarify with user)
- Insufficient credits for total count → 402 before processing starts
- Invalid file format (not CSV/Excel) → reject with error message
- Empty file → reject with message

**Technical Context:**
- File validation: content-type verification, CSV parsing, row count validation
- Batch size: 100 emails per BullMQ job (architecture Section 3)
- Credit deduction: full amount upfront (Redis Lua DECRBY total)
- Tables: `bulk_jobs` (architecture Section 12)
- Bulk job failure semantics: architecture Section 3 — per-email, full-batch, full-job failure definitions
- UI screens: `docs/figma/bulk-verify/spec.md` — Upload zone, column mapping
- Page spec: `docs/pages/03-bulk-verify.md` — upload flow
- Endpoint: `POST /home/bulk-verify`

---

## Story 4.2: Bulk Paste Input

As a user,
I want to paste a list of emails for bulk verification without uploading a file,
So that I can quickly verify a batch of emails from any source.

**FRs:** FR17, FR21 | **NFRs:** NFR15

**Acceptance Criteria:**

**Given** a signed-in user on /home/bulk-verify
**When** they paste a list of emails into the text area (one per line or comma-separated)
**Then** emails are parsed and validated
**And** the total count is displayed for confirmation

**Given** the user confirms the pasted list
**When** they submit
**Then** credits are deducted for the total email count
**And** emails are batched and enqueued (same pipeline as file upload)
**And** a bulk_jobs record is created but with NO file name (paste source)
**And** paste verifications do NOT create history records in bulk job history

**Edge Cases:**
- Mixed separators (newlines, commas, semicolons) → parse all formats
- Duplicate emails in paste → include all (or deduplicate)
- Empty paste or no valid emails → reject with message
- Paste exceeding 100K emails → reject with limit message

**Technical Context:**
- Same BullMQ pipeline as file upload (shared batching and worker processing)
- Differentiation: bulk_jobs.source_type = 'paste' vs 'file_upload'
- History exclusion: paste jobs excluded from /home/history page queries (FR21)
- UI screens: `docs/figma/bulk-verify/spec.md` — Paste tab
- Page spec: `docs/pages/03-bulk-verify.md` — paste flow

---

## Story 4.3: Real-Time SSE Progress for Bulk Jobs

As a user watching a bulk verification job,
I want to see real-time progress updates,
So that I know how far along the job is and when it will complete.

**FRs:** FR18 | **NFRs:** NFR4

**Acceptance Criteria:**

**Given** a user with an active bulk job
**When** they are on the bulk verify page
**Then** an SSE connection is established to `/home/bulk-verify/:jobId/stream`
**And** progress events are received every 1% or every 5 seconds (whichever comes first)

**Given** SSE progress events are received
**When** the UI updates
**Then** it shows: percentage complete, emails processed / total, estimated time remaining (ETA), processing rate (emails/sec)

**Given** the bulk job completes
**When** the final events are sent
**Then** a status_change event transitions to 'completed'
**And** a results_summary event provides: valid/invalid/unknown/risky counts + download URL

**Given** the SSE connection drops
**When** the browser reconnects (automatic with Last-Event-ID)
**Then** the server resumes from the last acknowledged event
**And** if the job completed while disconnected, results_summary is sent immediately

**Edge Cases:**
- Job takes longer than 30 minutes → SSE connection times out, reconnect resumes
- Multiple browser tabs → one SSE connection per job per user (deduplicated)
- Recoverable errors during job → 'error' event with warning severity, job continues
- Heartbeat: server sends comment line every 15 seconds to keep connection alive

**Technical Context:**
- SSE implementation: architecture Section 9 — all 4 event types (progress, status_change, error, results_summary)
- Event ID format: `{unix_timestamp}-{sequence}` for Last-Event-ID reconnection
- Backpressure: buffer up to 100 events; drop oldest progress events if client falls behind (never drop status_change or results_summary)
- Retry interval: `retry: 3000` (3 seconds)
- UI screens: `docs/figma/bulk-verify/spec.md` — Progress bar, live stats

---

## Story 4.4: Bulk Results CSV Export

As a user,
I want to download my bulk verification results as CSV,
So that I can use the verified list in my email marketing tools.

**FRs:** FR19 | **NFRs:** NFR3

**Acceptance Criteria:**

**Given** a completed bulk verification job
**When** the user clicks "Download Results" on the bulk verify page or history page
**Then** a pre-signed URL is generated (valid for 1 hour)
**And** the browser downloads the CSV file directly from object storage

**Given** the results CSV
**When** downloaded
**Then** it contains columns: email, status, deliverable, risk_score, reason, mx_records, smtp_provider, is_free, is_role, is_disposable, is_catchall, verified_at
**And** results can be filtered by status (full results, valid-only, invalid-only)

**Given** a large results file (>10MB)
**When** generated
**Then** the file is gzip-compressed (.csv.gz)
**And** Content-Encoding header is set for auto-decompression

**Edge Cases:**
- Results older than 14 days → "Results expired" message (DO Spaces lifecycle rule)
- Download while job still processing → partial results or "Still processing" message
- Pre-signed URL expires (1 hour) → generate new URL on next click

**Technical Context:**
- Storage: DigitalOcean Spaces — architecture Section 11
- Bucket structure: `ev-results/{user_id}/{job_id}/results.csv`, `results-valid.csv`, `results-invalid.csv`
- CSV generation: streaming writes (not buffered in memory)
- Pre-signed URLs: S3-compatible SDK, 1-hour validity
- Retention: 14-day lifecycle rule, results_url set to NULL after expiry
- Compression: gzip for files > 10MB
- Endpoint: `GET /api/v1/bulk/:jobId/results` or `GET /home/bulk-verify/:jobId/download`
- UI screens: `docs/figma/bulk-verify/spec.md` — Results download section

---

## Story 4.5: Bulk Job History

As a user,
I want to see my past bulk verification jobs,
So that I can track what I've verified and re-download results.

**FRs:** FR48, FR49

**Acceptance Criteria:**

**Given** a signed-in user on /home/history
**When** the page loads
**Then** a list of file-upload bulk jobs is displayed (paste jobs excluded per FR21)
**And** each entry shows: file name, upload date, total emails, processed count, status (pending/processing/completed/failed)

**Given** the user wants to find a specific job
**When** they search by file name or filter by status
**Then** the list is filtered accordingly

**Given** a completed job in the history
**When** the user clicks on it
**Then** they can view the results summary (valid/invalid/unknown/risky counts)
**And** download the results CSV if still within 14-day retention

**Edge Cases:**
- Jobs older than 14 days → show "Results expired" badge, disable download
- Jobs older than 30 days → verification_results rows pruned, only bulk_jobs summary remains
- Failed jobs → show status 'failed' with error reason, partial results available if any
- Pagination for users with many jobs

**Technical Context:**
- Table: `bulk_jobs` (architecture Section 12) — filtered by source_type != 'paste'
- Verification results pruning: 30 days for bulk, 90 days for single (architecture Section 11)
- UI screens: `docs/figma/bulk-verify/spec.md` — Job history table
- Page spec: `docs/pages/08-history.md` — history page layout
- Endpoint: `GET /home/history`
