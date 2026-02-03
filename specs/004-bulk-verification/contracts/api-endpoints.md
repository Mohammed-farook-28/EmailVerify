# API Contracts: Bulk Email Verification

**Feature**: 004-bulk-verification
**Date**: 2026-02-02
**Base URL**: `http://localhost:3000/api/bulk`
**Authentication**: Session cookie (all endpoints require authentication)

---

## Table of Contents

1. [Create Bulk Job (File Upload)](#1-create-bulk-job-file-upload)
2. [Create Bulk Job (Paste)](#2-create-bulk-job-paste)
3. [Get Job Status](#3-get-job-status)
4. [Stream Job Progress (SSE)](#4-stream-job-progress-sse)
5. [Download Results](#5-download-results)
6. [Get Job History](#6-get-job-history)
7. [Get Job Details](#7-get-job-details)

---

## 1. Create Bulk Job (File Upload)

**Endpoint**: `POST /api/bulk/upload`

**Purpose**: Upload CSV/Excel file and create bulk verification job

**Request**:
- Content-Type: `multipart/form-data`
- Body:
  - `file`: CSV or Excel file (required, max 10MB)
  - `emailColumn`: Column index or name for emails (optional for auto-detection)

**Response Success** (201 Created):
```json
{
  "jobId": "01HN8X9V3Z5Q6P2R4S7T8W9Y0A",
  "totalCount": 5000,
  "creditsDeducted": 5000,
  "status": "pending",
  "message": "Job created successfully. Processing will begin shortly."
}
```

**Response Errors**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `FILE_REQUIRED` | No file uploaded | Missing file in request |
| 400 | `INVALID_FILE_TYPE` | Only CSV and Excel files are supported | Unsupported file format |
| 413 | `FILE_TOO_LARGE` | File size exceeds 10MB limit | File too large |
| 422 | `NO_EMAILS_FOUND` | No valid emails found in file | Empty file or no email column |
| 422 | `COLUMN_VALIDATION_FAILED` | Selected column has <50% valid emails | Column mapping issue |
| 402 | `INSUFFICIENT_CREDITS` | Insufficient credits. Required: 5000, Available: 1000 | Not enough credits |
| 409 | `ACTIVE_JOB_EXISTS` | You already have a bulk job in progress | User has active job |
| 500 | `PROCESSING_ERROR` | Failed to process file | Internal error |

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=..." \
  -F "file=@contacts.csv" \
  -F "emailColumn=email"
```

---

## 2. Create Bulk Job (Paste)

**Endpoint**: `POST /api/bulk/paste`

**Purpose**: Submit emails via text paste and create bulk verification job

**Request**:
- Content-Type: `application/json`
- Body:
```json
{
  "emails": "john@example.com\njane@test.com, bob@company.org; alice@domain.io"
}
```

**Response Success** (201 Created):
```json
{
  "jobId": "01HN8X9V3Z5Q6P2R4S7T8W9Y0B",
  "totalCount": 4,
  "creditsDeducted": 4,
  "status": "pending",
  "message": "Job created successfully. Processing will begin shortly."
}
```

**Response Errors**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `EMAILS_REQUIRED` | Email text is required | Missing emails field |
| 422 | `NO_EMAILS_FOUND` | No valid emails found in text | Invalid input |
| 422 | `TOO_MANY_EMAILS` | Maximum 100,000 emails allowed | Exceeds limit |
| 402 | `INSUFFICIENT_CREDITS` | Insufficient credits | Not enough credits |
| 409 | `ACTIVE_JOB_EXISTS` | You already have a bulk job in progress | User has active job |
| 500 | `PROCESSING_ERROR` | Failed to process emails | Internal error |

**Email Extraction Logic**:
- Split by newlines, commas, semicolons, spaces
- Extract using regex: `/[^\s@]+@[^\s@]+\.[^\s@]+/g`
- Deduplicate (preserve first occurrence)
- Validate minimum 1 email found

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/bulk/paste \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{"emails": "john@example.com\njane@test.com"}'
```

---

## 3. Get Job Status

**Endpoint**: `GET /api/bulk/jobs/:jobId`

**Purpose**: Get current status and progress of a bulk job

**Request**: No body

**Response Success** (200 OK):
```json
{
  "jobId": "01HN8X9V3Z5Q6P2R4S7T8W9Y0A",
  "status": "processing",
  "sourceType": "file",
  "filename": "contacts.csv",
  "totalCount": 5000,
  "processedCount": 2500,
  "validCount": 2000,
  "invalidCount": 400,
  "riskyCount": 80,
  "unknownCount": 20,
  "percentage": 50,
  "createdAt": "2026-02-02T10:00:00Z",
  "startedAt": "2026-02-02T10:00:05Z",
  "completedAt": null,
  "resultAvailable": false,
  "errorReason": null
}
```

**Response Success (Completed)**:
```json
{
  "jobId": "01HN8X9V3Z5Q6P2R4S7T8W9Y0A",
  "status": "completed",
  "sourceType": "file",
  "filename": "contacts.csv",
  "totalCount": 5000,
  "processedCount": 5000,
  "validCount": 4000,
  "invalidCount": 800,
  "riskyCount": 150,
  "unknownCount": 50,
  "percentage": 100,
  "createdAt": "2026-02-02T10:00:00Z",
  "startedAt": "2026-02-02T10:00:05Z",
  "completedAt": "2026-02-02T10:02:00Z",
  "resultAvailable": true,
  "resultExpiresAt": "2026-02-16T10:02:00Z",
  "errorReason": null
}
```

**Response Errors**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 404 | `JOB_NOT_FOUND` | Job not found | Invalid jobId or unauthorized |
| 500 | `FETCH_ERROR` | Failed to fetch job status | Internal error |

**Example Request**:
```bash
curl http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A \
  -H "Cookie: session=..."
```

---

## 4. Stream Job Progress (SSE)

**Endpoint**: `GET /api/bulk/jobs/:jobId/progress`

**Purpose**: Receive real-time progress updates via Server-Sent Events

**Request**: No body

**Response**: Event stream (text/event-stream)

**Event Format**:
```
event: progress
data: {"jobId":"01HN8X9V3Z5Q6P2R4S7T8W9Y0A","processedCount":2500,"totalCount":5000,"percentage":50,"validCount":2000,"invalidCount":400,"riskyCount":80,"unknownCount":20,"processingRate":45.5,"estimatedSecondsRemaining":55}

event: progress
data: {"jobId":"01HN8X9V3Z5Q6P2R4S7T8W9Y0A","processedCount":3000,"totalCount":5000,"percentage":60,"validCount":2400,"invalidCount":480,"riskyCount":96,"unknownCount":24,"processingRate":48.2,"estimatedSecondsRemaining":41}

event: complete
data: {"jobId":"01HN8X9V3Z5Q6P2R4S7T8W9Y0A","status":"completed","totalCount":5000,"validCount":4000,"invalidCount":800,"riskyCount":150,"unknownCount":50}

event: error
data: {"jobId":"01HN8X9V3Z5Q6P2R4S7T8W9Y0A","status":"failed","errorReason":"Upstream API unavailable"}
```

**Progress Event Fields**:
- `jobId`: Job identifier
- `processedCount`: Emails verified so far
- `totalCount`: Total emails in job
- `percentage`: Completion percentage (0-100)
- `validCount`, `invalidCount`, `riskyCount`, `unknownCount`: Result counts
- `processingRate`: Emails per second (trailing average)
- `estimatedSecondsRemaining`: ETA for completion

**Event Types**:
- `progress`: Emitted every 1% or 5 seconds (whichever first)
- `complete`: Final event when job finishes successfully
- `error`: Emitted if job fails
- Connection auto-closes after `complete` or `error` event

**Client Usage**:
```typescript
const eventSource = new EventSource('/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/progress');

eventSource.addEventListener('progress', (event) => {
  const data = JSON.parse(event.data);
  updateProgressBar(data.percentage);
});

eventSource.addEventListener('complete', (event) => {
  const data = JSON.parse(event.data);
  showCompletionMessage(data);
  eventSource.close();
});

eventSource.addEventListener('error', () => {
  // Auto-reconnects on connection drops
  // Handle error state
});
```

**Response Errors**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 404 | `JOB_NOT_FOUND` | Job not found | Invalid jobId or unauthorized |
| 410 | `JOB_ALREADY_COMPLETED` | Job has already completed | No active progress |

---

## 5. Download Results

**Endpoint**: `GET /api/bulk/jobs/:jobId/results`

**Purpose**: Download verification results as CSV

**Query Parameters**:
- `filter` (optional): `all` (default), `valid`, or `invalid`

**Request**: No body

**Response Success** (200 OK):
- Content-Type: `text/csv` or `text/csv; charset=utf-8`
- Content-Encoding: `gzip` (if file >1MB)
- Content-Disposition: `attachment; filename="results-01HN8X9V3Z5Q6P2R4S7T8W9Y0A.csv"`

**CSV Format**:
```csv
email,status,deliverable,risky,unknown,risk_score,failure_reason,mx_records,smtp_provider,is_free_email,is_role_based,is_disposable,is_catch_all
john@example.com,deliverable,true,false,false,0,,,Gmail,false,false,false,false
bad@invalid.test,undeliverable,false,false,true,100,no_mx_records,,,false,false,false,false
risky@suspicious.org,risky,false,true,false,75,disposable_domain,,,false,false,true,false
```

**Response Errors**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 404 | `JOB_NOT_FOUND` | Job not found | Invalid jobId or unauthorized |
| 409 | `JOB_NOT_COMPLETED` | Job is still processing | Results not ready |
| 410 | `RESULTS_EXPIRED` | Results have expired (14-day limit) | Past retention period |
| 400 | `INVALID_FILTER` | Filter must be 'all', 'valid', or 'invalid' | Invalid query param |
| 500 | `DOWNLOAD_ERROR` | Failed to generate results | Internal error |

**Example Requests**:
```bash
# Download all results
curl http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/results \
  -H "Cookie: session=..." \
  -o results.csv

# Download only valid emails
curl "http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/results?filter=valid" \
  -H "Cookie: session=..." \
  -o valid-results.csv

# Download only invalid emails
curl "http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/results?filter=invalid" \
  -H "Cookie: session=..." \
  -o invalid-results.csv
```

---

## 6. Get Job History

**Endpoint**: `GET /api/bulk/jobs`

**Purpose**: List user's past bulk verification jobs (file uploads only, excludes paste jobs)

**Query Parameters**:
- `limit` (optional): Results per page (default: 10, max: 100)
- `offset` (optional): Skip N results (default: 0)
- `status` (optional): Filter by status (`pending`, `processing`, `completed`, `failed`, or omit for all)
- `search` (optional): Search by filename (case-insensitive substring match)

**Request**: No body

**Response Success** (200 OK):
```json
{
  "jobs": [
    {
      "id": "01HN8X9V3Z5Q6P2R4S7T8W9Y0A",
      "filename": "contacts.csv",
      "totalCount": 5000,
      "status": "completed",
      "validCount": 4000,
      "invalidCount": 800,
      "riskyCount": 150,
      "unknownCount": 50,
      "createdAt": "2026-02-02T10:00:00Z",
      "completedAt": "2026-02-02T10:02:00Z",
      "resultAvailable": true,
      "resultExpiresAt": "2026-02-16T10:02:00Z"
    },
    {
      "id": "01HN8X9V3Z5Q6P2R4S7T8W9Y0B",
      "filename": "leads.xlsx",
      "totalCount": 10000,
      "status": "processing",
      "validCount": 5000,
      "invalidCount": 800,
      "riskyCount": 120,
      "unknownCount": 30,
      "createdAt": "2026-02-02T11:00:00Z",
      "completedAt": null,
      "resultAvailable": false,
      "resultExpiresAt": null
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

**Response Errors**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `INVALID_PARAMS` | Invalid query parameters | Bad limit/offset/status |
| 500 | `FETCH_ERROR` | Failed to fetch history | Internal error |

**Example Requests**:
```bash
# Get first 10 jobs
curl http://localhost:3000/api/bulk/jobs \
  -H "Cookie: session=..."

# Get next 10 jobs (pagination)
curl "http://localhost:3000/api/bulk/jobs?limit=10&offset=10" \
  -H "Cookie: session=..."

# Filter by status
curl "http://localhost:3000/api/bulk/jobs?status=completed" \
  -H "Cookie: session=..."

# Search by filename
curl "http://localhost:3000/api/bulk/jobs?search=contacts" \
  -H "Cookie: session=..."
```

---

## 7. Get Job Details

**Endpoint**: `GET /api/bulk/jobs/:jobId/details`

**Purpose**: Get detailed information about a specific job including sample results

**Request**: No body

**Response Success** (200 OK):
```json
{
  "job": {
    "id": "01HN8X9V3Z5Q6P2R4S7T8W9Y0A",
    "filename": "contacts.csv",
    "sourceType": "file",
    "totalCount": 5000,
    "processedCount": 5000,
    "status": "completed",
    "validCount": 4000,
    "invalidCount": 800,
    "riskyCount": 150,
    "unknownCount": 50,
    "createdAt": "2026-02-02T10:00:00Z",
    "startedAt": "2026-02-02T10:00:05Z",
    "completedAt": "2026-02-02T10:02:00Z",
    "resultAvailable": true,
    "resultExpiresAt": "2026-02-16T10:02:00Z"
  },
  "sampleResults": [
    {
      "email": "john@example.com",
      "status": "deliverable",
      "riskScore": 0,
      "smtpProvider": "Gmail"
    },
    {
      "email": "bad@invalid.test",
      "status": "undeliverable",
      "riskScore": 100,
      "failureReason": "no_mx_records"
    }
  ]
}
```

**Response Errors**:

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 404 | `JOB_NOT_FOUND` | Job not found | Invalid jobId or unauthorized |
| 500 | `FETCH_ERROR` | Failed to fetch job details | Internal error |

**Example Request**:
```bash
curl http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/details \
  -H "Cookie: session=..."
```

---

## Error Response Format

All errors follow this structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": { /* optional additional context */ }
}
```

**Common HTTP Status Codes**:
- `200 OK`: Success
- `201 Created`: Resource created
- `400 Bad Request`: Invalid input
- `402 Payment Required`: Insufficient credits
- `404 Not Found`: Resource not found
- `409 Conflict`: Active job exists
- `410 Gone`: Results expired
- `413 Payload Too Large`: File too large
- `422 Unprocessable Entity`: Validation failed
- `500 Internal Server Error`: Server error

---

## Rate Limits

All bulk verification endpoints share the same rate limits as single verification (by tier):

| Tier | Requests/sec | Requests/hour |
|------|-------------|---------------|
| Free/Starter | 10 | 1,000 |
| Popular | 15 | 5,000 |
| Professional | 25 | 10,000 |
| Business | 50 | 20,000 |
| Enterprise | 100 | 50,000 |
| Premium | 200 | 100,000 |
| Ultimate | 300 | 500,000 |
| Mega | 400 | 750,000 |
| Titan | 500 | 1,000,000 |

**Note**: Bulk job creation counts as 1 request (not N requests for N emails). The job itself runs in background workers outside the rate limit.

---

## Authentication

All endpoints require session cookie authentication. Unauthenticated requests return:

```json
{
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

**HTTP Status**: 401 Unauthorized

---

## Idempotency

Job creation endpoints (`POST /upload`, `POST /paste`) are **not idempotent**. Each request creates a new job. Use the `jobId` from the response to track the job.

The one-active-job-per-user constraint prevents duplicate concurrent jobs but does not deduplicate completed jobs.

---

## Pagination

History endpoint uses offset-based pagination:

```
GET /api/bulk/jobs?limit=10&offset=20
```

**Response includes**:
```json
{
  "jobs": [...],
  "pagination": {
    "total": 100,
    "limit": 10,
    "offset": 20,
    "hasMore": true
  }
}
```

**Frontend Calculation**:
- Current page: `Math.floor(offset / limit) + 1`
- Total pages: `Math.ceil(total / limit)`
- Has previous: `offset > 0`
- Has next: `offset + limit < total`

---

## CORS

All bulk verification endpoints support CORS for frontend requests from the dashboard domain. Credentials (cookies) are included via `credentials: 'include'`.

---

## Content Types

**Requests**:
- File upload: `multipart/form-data`
- Paste: `application/json`
- Others: No body

**Responses**:
- JSON: `application/json`
- CSV: `text/csv` with optional `gzip` encoding
- SSE: `text/event-stream`

---

## Example Frontend Integration

### Create Job (File Upload)
```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('emailColumn', selectedColumn);

const response = await fetch('/api/bulk/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include'
});

const data = await response.json();
if (response.ok) {
  router.push(`/home/bulk-verify/${data.jobId}`);
}
```

### Stream Progress
```typescript
const eventSource = new EventSource(`/api/bulk/jobs/${jobId}/progress`);

eventSource.addEventListener('progress', (event) => {
  const progress = JSON.parse(event.data);
  setProgress(progress);
});

eventSource.addEventListener('complete', () => {
  setCompleted(true);
  eventSource.close();
});
```

### Download Results
```typescript
const response = await fetch(`/api/bulk/jobs/${jobId}/results?filter=valid`, {
  credentials: 'include'
});

const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `results-${jobId}.csv`;
a.click();
URL.revokeObjectURL(url);
```

---

## Summary

- **7 endpoints**: Upload, paste, status, progress stream, download, history, details
- **Session-based auth**: Cookies included via `credentials: 'include'`
- **SSE for real-time**: EventSource API with auto-reconnect
- **Pagination**: Offset-based for history
- **Filtering**: Status and filename search for history, valid/invalid for downloads
- **Error handling**: Consistent error response format with codes and messages
- **Rate limiting**: Shared with single verification endpoints by tier
- **14-day retention**: Results auto-expire, metadata retained in history
