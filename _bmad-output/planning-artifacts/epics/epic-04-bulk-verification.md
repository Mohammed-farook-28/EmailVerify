# Epic 4: Bulk Email Verification

## Epic Goal

Users can upload CSV/Excel files (up to 100K rows) or paste email lists for batch verification. Column mapping during upload. Real-time SSE progress updates (percentage, processed count, ETA). Downloadable results as CSV (full or filtered by status). Bulk job history with search and status filtering. File uploads create history records; paste verifications do not.

**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21, FR48, FR49
**Dependencies:** Epic 2 (verification engine, BullMQ queue, workers, credit system)

---

# Backend Stories

## Story 4.1: Bulk File Upload & Processing

As a user,
I want to upload a CSV or Excel file of emails for batch verification,
So that I can verify thousands of emails efficiently.

**FRs:** FR16, FR20, FR21 | **NFRs:** NFR3, NFR15

**Acceptance Criteria:**

**Given** a POST to `/home/bulk-verify` with multipart file upload (CSV/Excel, max 10MB) and valid session
**When** the file is parsed
**Then** column headers are detected and returned for mapping
**And** the response returns 200 with `{ columns, rowCount, previewRows }`

**Given** a POST to `/home/bulk-verify/confirm` with `{ jobId, emailColumn }` (column mapping confirmed)
**When** the email column is validated
**Then** credits are deducted atomically for the total email count (Redis Lua DECRBY)
**And** the file is split into batches of 100 emails
**And** all batches are enqueued to BullMQ (priority 10 — bulk, tenant group)
**And** a `bulk_jobs` record is created (status='pending', total_emails=N, source_type='file_upload', file_name)
**And** response returns 202 with `{ jobId, totalEmails, status: "processing" }`

**Edge Cases:**
- File too large (>10MB) → 413 before processing
- No recognizable email column → return columns for manual mapping
- Duplicate emails in file → verify each (no server-side dedup)
- Insufficient credits → 402 before processing starts
- Invalid file format → 415 Unsupported Media Type
- Empty file or zero valid rows → 422 with message

**Technical Context:**
- File parsing: csv-parse or xlsx library for Excel support
- Batch size: 100 emails per BullMQ job (architecture Section 3)
- Credit deduction: full amount upfront (Redis Lua DECRBY total)
- Table: `bulk_jobs` (architecture Section 12)
- Bulk failure semantics: architecture Section 3
- Endpoints: `POST /home/bulk-verify` (upload + parse), `POST /home/bulk-verify/confirm` (start processing)

---

## Story 4.2: Bulk Paste Input Processing

As a user,
I want to paste a list of emails for bulk verification without uploading a file,
So that I can quickly verify a batch from any source.

**FRs:** FR17, FR21 | **NFRs:** NFR15

**Acceptance Criteria:**

**Given** a POST to `/home/bulk-verify/paste` with `{ emails: "string (raw text)" }` and valid session
**When** the text is parsed (supports newlines, commas, semicolons as separators)
**Then** valid emails are extracted and counted
**And** credits are deducted atomically for the total valid email count
**And** emails are batched (100 per job) and enqueued to BullMQ (priority 10, tenant group)
**And** a `bulk_jobs` record is created with `source_type='paste'` (no file_name)
**And** response returns 202 with `{ jobId, totalEmails, status: "processing" }`

**Edge Cases:**
- Mixed separators → parse all formats
- No valid emails found → 422 with message
- Exceeds 100K emails → 413 with limit message
- Duplicate emails → include all

**Technical Context:**
- Same BullMQ pipeline as file upload
- `bulk_jobs.source_type = 'paste'` — excluded from history page (FR21)
- Endpoint: `POST /home/bulk-verify/paste`

---

## Story 4.3: SSE Progress Endpoint for Bulk Jobs

As a platform,
I want to stream real-time progress updates for bulk verification jobs,
So that clients can display live progress without polling.

**FRs:** FR18 | **NFRs:** NFR4

**Acceptance Criteria:**

**Given** a GET to `/home/bulk-verify/:jobId/stream` with valid session
**When** the SSE connection is established
**Then** the server streams events as the job progresses:
- `progress`: every 1% or 5 seconds (whichever first) — `{ jobId, processed, total, percent, rate, etaSeconds }`
- `status_change`: `{ jobId, previous, current, completedAt? }`
- `error`: `{ jobId, message, severity: "warning" }`
- `results_summary`: `{ jobId, valid, invalid, unknown, risky, downloadUrl }`

**Given** the client reconnects with `Last-Event-ID` header
**When** the server receives the reconnection
**Then** it resumes from the last acknowledged event
**And** if the job completed during disconnection, sends `results_summary` immediately

**Given** no events to send
**When** 15 seconds elapse
**Then** a comment heartbeat (`:heartbeat\n\n`) is sent to keep the connection alive

**Edge Cases:**
- Job already completed when stream opens → send `results_summary` immediately, close
- Backpressure: buffer up to 100 events; drop oldest `progress` events (never drop `status_change` or `results_summary`)
- Multiple tabs → one SSE connection per job per user
- Connection timeout (30min+) → client auto-reconnects via EventSource

**Technical Context:**
- SSE spec: architecture Section 9
- Event ID format: `{unix_timestamp}-{sequence}`
- Retry directive: `retry: 3000` (3 seconds)
- Job progress source: BullMQ job progress callbacks or Redis pub/sub
- Endpoint: `GET /home/bulk-verify/:jobId/stream`

---

## Story 4.4: Bulk Results CSV Generation & Download

As a user,
I want to download bulk verification results as CSV,
So that I can use the verified list in my email marketing tools.

**FRs:** FR19 | **NFRs:** NFR3

**Acceptance Criteria:**

**Given** a GET to `/home/bulk-verify/:jobId/download` with valid session
**When** the job is completed and results are within 14-day retention
**Then** a pre-signed DO Spaces URL is generated (valid 1 hour)
**And** response returns 302 redirect to the pre-signed URL

**Given** a GET to `/home/bulk-verify/:jobId/download?filter=valid|invalid`
**When** the filter parameter is provided
**Then** a filtered CSV is served (valid-only or invalid-only)

**Given** the CSV file
**When** downloaded
**Then** columns include: email, status, deliverable, risk_score, reason, mx_records, smtp_provider, is_free, is_role, is_disposable, is_catchall, verified_at

**Edge Cases:**
- Results older than 14 days → 410 Gone with "Results expired"
- Job still processing → 409 with "Job still in progress"
- Large files (>10MB) → gzip compressed (.csv.gz), Content-Encoding header
- Pre-signed URL expires → generate new on next request

**Technical Context:**
- Storage: DigitalOcean Spaces — `ev-results/{userId}/{jobId}/results.csv`
- CSV generation: streaming writes during job processing (not buffered in memory)
- Pre-signed URLs: S3-compatible SDK, 1-hour validity
- Retention: 14-day lifecycle rule on DO Spaces
- Compression: gzip for files > 10MB
- Endpoint: `GET /home/bulk-verify/:jobId/download`

---

## Story 4.5: Bulk Job History API

As a user,
I want to retrieve my past bulk verification jobs,
So that I can track what I've verified and re-download results.

**FRs:** FR48, FR49

**Acceptance Criteria:**

**Given** a GET to `/home/history` with valid session
**When** the request is processed
**Then** only `source_type='file_upload'` jobs are returned (paste excluded per FR21)
**And** each entry includes: id, fileName, uploadDate, totalEmails, processed, status, resultsSummary (if completed)

**Given** a GET to `/home/history?search=filename&status=completed&page=1&limit=20`
**When** filters are applied
**Then** results are filtered by file name (ILIKE) and/or status
**And** pagination is applied

**Edge Cases:**
- Jobs older than 14 days → `resultsExpired: true`, download disabled
- Failed jobs → include error reason and partial results count
- Empty history → empty array
- Large history → server-side pagination

**Technical Context:**
- Table: `bulk_jobs` filtered by `source_type != 'paste'` and `user_id`
- Retention: bulk_jobs metadata retained; result files expire at 14 days
- Endpoint: `GET /home/history`

---

# API Contract

## Bulk Verification Endpoints

### `POST /home/bulk-verify`

**Auth:** Session cookie
**Content-Type:** multipart/form-data

```json
// Request: file field "file" (CSV/Excel, max 10MB)

// Response 200 (parsing complete, awaiting column mapping)
{
  "jobId": "string (uuid, temporary)",
  "columns": ["string (detected column headers)"],
  "rowCount": "number",
  "previewRows": [ ["string (first 5 rows)"] ]
}

// Error 413
{ "error": "File too large. Maximum: 10MB" }

// Error 415
{ "error": "Unsupported file type. Allowed: CSV, XLSX" }
```

### `POST /home/bulk-verify/confirm`

**Auth:** Session cookie

```json
// Request
{
  "jobId": "string",
  "emailColumn": "string (column name or index)"
}

// Response 202
{
  "jobId": "string (uuid)",
  "totalEmails": "number",
  "status": "processing"
}

// Error 402
{ "error": "Insufficient credits", "required": 5000, "available": 200 }
```

### `POST /home/bulk-verify/paste`

**Auth:** Session cookie

```json
// Request
{
  "emails": "string (raw text, newline/comma/semicolon separated)",
  "name": "string (optional, list name)"
}

// Response 202
{
  "jobId": "string (uuid)",
  "totalEmails": "number",
  "status": "processing"
}

// Error 402
{ "error": "Insufficient credits", "required": 500, "available": 200 }

// Error 413
{ "error": "Too many emails. Maximum: 100,000" }
```

### `GET /home/bulk-verify/:jobId/stream`

**Auth:** Session cookie
**Response:** text/event-stream

```
// SSE Events

event: progress
id: 1706745600-001
data: {"jobId":"uuid","processed":500,"total":5000,"percent":10,"rate":45.2,"etaSeconds":100}

event: status_change
id: 1706745700-002
data: {"jobId":"uuid","previous":"processing","current":"completed","completedAt":"2026-01-31T10:00:00Z"}

event: error
id: 1706745650-003
data: {"jobId":"uuid","message":"Some emails had timeout errors","severity":"warning"}

event: results_summary
id: 1706745700-004
data: {"jobId":"uuid","valid":3500,"invalid":800,"unknown":400,"risky":300,"downloadUrl":"/home/bulk-verify/uuid/download"}

retry: 3000
```

### `GET /home/bulk-verify/:jobId/download`

**Auth:** Session cookie

```json
// Query params: ?filter=all|valid|invalid (default: all)

// Response 302 → redirect to pre-signed DO Spaces URL

// Error 410
{ "error": "Results expired. Files are retained for 14 days." }

// Error 409
{ "error": "Job still processing", "progress": 65 }
```

### `GET /home/history`

**Auth:** Session cookie

```json
// Query params: ?search=filename&status=completed|processing|failed&page=1&limit=20

// Response 200
{
  "jobs": [
    {
      "id": "string",
      "fileName": "string",
      "uploadDate": "string (ISO 8601)",
      "totalEmails": "number",
      "processed": "number",
      "status": "pending | processing | completed | failed",
      "progress": "number (0-100)",
      "results": {
        "valid": "number",
        "invalid": "number",
        "risky": "number",
        "unknown": "number",
        "total": "number"
      } | null,
      "resultsExpired": "boolean",
      "errorReason": "string | null"
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

## Frontend Type Mismatches

| Frontend Type | Current Value | Backend Value | Resolution |
|---------------|--------------|---------------|------------|
| `BulkList.name` | `string` | `fileName` (from upload) or auto-generated name | Compatible |
| `BulkList.status` | `"processing" \| "completed" \| "failed"` | Adds `"pending"` status | **Frontend must update** to include `"pending"` |
| `BulkList.name` | `name: string` | `fileName` (from upload) | **Frontend must rename** field from `name` to `fileName` |
| `BulkList.status` missing value | `"processing" \| "completed" \| "failed"` | Adds `"pending"` status | **Frontend must add** `"pending"` to status union |
| `BulkList` missing fields | N/A | `resultsExpired: boolean`, `errorReason: string \| null` | **Frontend must add** these 2 fields |
| `BulkList.results` | `BulkResults` (deliverable/undeliverable/risky/unknown/total) | `valid/invalid/risky/unknown/total` (Decision #1) | **Frontend must rename** `deliverable` → `valid`, `undeliverable` → `invalid` |
| `BulkList.createdAt` | `string` | `uploadDate` | Compatible (rename in mapping) |
| Route param `[listId]` | Dynamic segment in `src/app/(dashboard)/home/bulk-verify/[listId]/page.tsx` | Backend uses `jobId` | **Frontend must rename** `[listId]` to `[jobId]` or map in route handler |

> **Unreferenced frontend components:** The following components exist in `src/components/bulk-verify/` but need stories added below: `add-emails-modal.tsx`, `csv-validation-results.tsx`, `name-list-modal.tsx`, `rename-list-modal.tsx`, `no-search-results.tsx`, `results-settings-tab.tsx`. Additionally, `src/components/export/` has 3 components for export-to-integration flow: `export-where-to-modal.tsx`, `export-add-to-modal.tsx`, `exports-empty-state.tsx`.

> **Architecture gap:** The `bulk_jobs` table in `docs/architecture.md` is missing `source_type` and `file_name` columns required by FR21 (paste vs file upload distinction). Architecture doc needs updating.

> **Frontend Reality Notes (verified against source):**
> - Frontend has a **6-step modal flow** (AddEmails → CsvUpload → CsvMapping → CsvValidation → NameList → close), not the 2-step API flow the epic describes. The extra steps (AddEmails chooser, CsvValidation pre-check, NameList naming) need stories.
> - `CsvUploadModal.onFileUploaded` receives **filename string only** (`csv-upload-modal.tsx:27`) — discards actual `File` object. Must capture the File.
> - `CsvColumnMapping` dropdown is **purely decorative** (`csv-column-mapping.tsx:103-108`) — no column selection state is tracked.
> - `CreditsWarningBanner` is **always rendered unconditionally** (`bulk-verify/page.tsx:139`) — should only show on 402 error.
> - History page search input has **no onChange handler** — non-functional.
> - History page uses **inline mock data** with a different shape than the `BulkList` type — two conflicting data shapes.

---

# Frontend Integration Stories

## Story 4.6: Bulk Upload & Paste Integration

As a frontend developer,
I want to wire the bulk verification upload and paste forms to the backend API,
So that users can submit email lists for verification.

**Depends on:** Story 1.8 (auth provider), Backend Stories 4.1–4.2 deployed

**Acceptance Criteria:**

**Given** the bulk verify page at `/home/bulk-verify`
**When** the user uploads a CSV/Excel file via drag-and-drop or file picker
**Then** `POST /home/bulk-verify` is called with the file
**And** on success, the column mapping modal shows detected columns with preview rows
**And** the user selects the email column and confirms

**Given** column mapping is confirmed
**When** the user clicks "Start Verification"
**Then** `POST /home/bulk-verify/confirm` is called
**And** on success (202), navigate to the job detail page `/home/bulk-verify/:jobId`
**And** SSE connection established (Story 4.7)

**Given** the paste tab is active
**When** the user pastes emails and clicks "Verify"
**Then** `POST /home/bulk-verify/paste` is called
**And** on success (202), navigate to job detail page with SSE

**Edge Cases:**
- 402 (insufficient credits) → show credits warning banner with link to billing
- 413 (file too large) → show size limit error
- 415 (wrong format) → show format error
- Client-side email count preview before submit

**Technical Context:**
- Existing components: `src/components/bulk-verify/csv-upload-modal.tsx`, `csv-column-mapping.tsx`, `csv-validation-results.tsx`, `enter-manually-modal.tsx`, `name-list-modal.tsx`, `credits-warning-banner.tsx`
- File upload: FormData with multipart
- Replace mock data with real API calls

---

## Story 4.7: SSE Progress Client Integration

As a frontend developer,
I want to implement an SSE client that displays real-time bulk job progress,
So that users see live updates during verification.

**Depends on:** Backend Story 4.3 deployed

**Acceptance Criteria:**

**Given** a bulk job in progress at `/home/bulk-verify/:jobId`
**When** the page loads
**Then** an EventSource connection is opened to `/home/bulk-verify/:jobId/stream`
**And** progress events update the progress bar, processed count, rate, and ETA

**Given** a `status_change` event with `current: "completed"`
**When** received
**Then** the progress bar shows 100%
**And** the `results_summary` data is displayed (donut chart, counts)
**And** the "Download Results" button becomes active

**Given** the SSE connection drops
**When** EventSource auto-reconnects
**Then** `Last-Event-ID` is sent and the server resumes from last position

**Edge Cases:**
- Page navigation during processing → close EventSource on unmount
- Job already complete when page loads → server sends summary immediately
- Error events → show warning toast, don't interrupt progress display
- Multiple tabs → each gets its own SSE connection (acceptable)

**Technical Context:**
- Native EventSource API (built into browsers)
- TanStack Query for job metadata: `useQuery(['bulk-job', jobId], fetchJobStatus)` as fallback
- Existing components: `src/components/bulk-verify/donut-chart.tsx`, `results-overview.tsx`
- Progress bar: `src/components/shared/progress-bar.tsx`
- EventSource credentials: `withCredentials: true` (sends session cookie)

---

## Story 4.8: Bulk Results & History Page Integration

As a frontend developer,
I want to wire the bulk results display and history page to backend APIs,
So that users can view results, download CSVs, and browse job history.

**Depends on:** Stories 4.6–4.7, Backend Stories 4.4–4.5 deployed

**Acceptance Criteria:**

**Given** a completed bulk job at `/home/bulk-verify/:jobId`
**When** the user clicks "Download Results"
**Then** the browser navigates to `/home/bulk-verify/:jobId/download` (302 redirect to pre-signed URL)
**And** the CSV file downloads automatically

**Given** filter options (All, Valid only, Invalid only)
**When** the user selects a filter
**Then** the download URL includes `?filter=valid|invalid`

**Given** the history page at `/home/history`
**When** it loads
**Then** `GET /home/history` is called via TanStack Query
**And** jobs are displayed in a table: file name, date, total, processed, status badge

**Given** search and filter controls
**When** the user types a filename or selects a status
**Then** the query refetches with updated params
**And** results update in real time

**Edge Cases:**
- Expired results (>14 days) → "Results expired" badge, download button disabled
- Failed jobs → show error reason, offer partial download if available
- Empty history → empty state component

**Technical Context:**
- Existing components: `src/components/bulk-verify/bulk-list-card.tsx`, `results-email-tab.tsx`, `results-exports-tab.tsx`, `results-overview.tsx`, `results-settings-tab.tsx`
- History page: `src/app/(dashboard)/home/history/page.tsx`
- TanStack Query: `useQuery(['history', { search, status, page }], fetchHistory)`
- Download: `window.location.href` for 302 redirect handling

---

## Story 4.9: Add Emails Modal (Upload/Paste Chooser)

As a frontend developer,
I want to wire the Add Emails modal that lets users choose between CSV upload and manual paste,
So that users have a clear entry point for both bulk verification methods.

**Acceptance Criteria:**

**Given** the bulk verify page
**When** the user clicks "Add Emails" or "New Verification"
**Then** the `AddEmailsModal` opens with two options: "Upload CSV" and "Enter Manually"
**And** selecting "Upload CSV" opens the CSV upload flow (Story 4.6)
**And** selecting "Enter Manually" opens the paste modal (Story 4.6)

**Technical Context:**
- Existing component: `src/components/bulk-verify/add-emails-modal.tsx`
- Routes to either `CsvUploadModal` or `EnterManuallyModal`

---

## Story 4.10: CSV Validation Results Step

As a frontend developer,
I want to display pre-verification email validation results after CSV parsing,
So that users can review email quality before starting verification and consuming credits.

**Acceptance Criteria:**

**Given** the CSV has been parsed and column mapped
**When** client-side email format validation completes
**Then** `CsvValidationResults` shows: total rows, valid emails, invalid format, duplicates
**And** the user can proceed to verify valid emails or cancel

**Technical Context:**
- Existing component: `src/components/bulk-verify/csv-validation-results.tsx`
- Client-side validation only (format check, not deliverability)
- Displayed between column mapping and name/confirm step

---

## Story 4.11: Name List Modal

As a frontend developer,
I want to let users name their bulk verification list before starting,
So that lists are identifiable in the history page.

**Acceptance Criteria:**

**Given** the CSV has been validated
**When** the Name List modal opens
**Then** the user enters a list name (optional — defaults to file name)
**And** clicking "Start Verification" calls `POST /home/bulk-verify/confirm` with the list name
**And** the name is stored as the `bulk_jobs.file_name` in the backend

**Technical Context:**
- Existing component: `src/components/bulk-verify/name-list-modal.tsx`
- Name passed to confirm endpoint or stored client-side with the job

---

## Story 4.12: Results Settings Tab (Rename & Delete)

As a frontend developer,
I want to wire the Settings tab on bulk verification results to allow renaming and deleting lists,
So that users can manage their verification jobs.

**Acceptance Criteria:**

**Given** a completed bulk job at `/home/bulk-verify/:jobId`
**When** the user clicks the Settings tab
**Then** "Rename" allows updating the list name (calls appropriate API)
**And** "Delete" removes the job record after confirmation

**Edge Cases:**
- Delete confirmation dialog required
- Cannot rename/delete a job that's still processing

**Technical Context:**
- Existing components: `src/components/bulk-verify/results-settings-tab.tsx`, `rename-list-modal.tsx`
- May need backend endpoints: `PUT /home/bulk-verify/:jobId/rename`, `DELETE /home/bulk-verify/:jobId`

---

## Story 4.13: Rename List Modal

As a frontend developer,
I want to wire the Rename List modal to the backend,
So that users can change the name of a bulk verification list.

**Technical Context:**
- Existing component: `src/components/bulk-verify/rename-list-modal.tsx`
- Calls backend rename endpoint when wired

---

## Story 4.14: No Search Results Empty State

As a frontend developer,
I want to display a proper empty state when search/filter returns no results,
So that users know their search found nothing and can adjust filters.

**Technical Context:**
- Existing component: `src/components/bulk-verify/no-search-results.tsx`
- Used by history page and email tab when search/filter yields zero matches

---

## Story 4.15: Export-to-Integration Flow (Bulk Results)

As a frontend developer,
I want to wire the export-to-integration flow on bulk verification results,
So that users can export verified emails to external tools (Instantly, Reply, Smartlead).

**Acceptance Criteria:**

**Given** the Exports tab on a completed bulk job
**When** the user initiates an export
**Then** the `ExportWhereToModal` opens with destination options (List or Campaign)
**And** selecting a destination opens `ExportAddToModal` for the chosen type
**And** the export is submitted to the integration

**Edge Cases:**
- Integration not connected → prompt to connect first
- Export to non-existent destination → show error

**Technical Context:**
- Existing components: `src/components/export/export-where-to-modal.tsx`, `export-add-to-modal.tsx`, `exports-empty-state.tsx`
- Currently rendered on `[listId]/page.tsx` (to be renamed `[jobId]`)
- Integration backends needed — post-MVP unless integration providers are implemented
- For MVP: CSV download is the primary export; integration export is UI-ready but non-functional
