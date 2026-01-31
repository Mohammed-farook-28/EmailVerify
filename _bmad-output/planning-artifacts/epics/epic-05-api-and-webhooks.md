# Epic 5: Public API & Webhooks

## Epic Goal

Developers can integrate via the public REST API using `ek_`-prefixed API keys. Key management: create with configurable expiration, view masked list, delete with immediate revocation. API endpoints: single verify, bulk submit, bulk status/results, credit balance, webhooks CRUD. Webhook system delivers HMAC-SHA256 signed notifications for 4 event types with 4-attempt retry. Per-user rate limiting enforced by subscription tier. Usage history with filtering and export.

**FRs covered:** FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR46, FR47
**Dependencies:** Epic 2 (verification engine), Epic 3 (credits and subscriptions for tier-based rate limits)

---

# Backend Stories

## Story 5.1: API Key Management

As a developer,
I want to create and manage API keys,
So that I can authenticate my applications against the EmailKit API.

**FRs:** FR32, FR33, FR34, FR35 | **NFRs:** NFR5, NFR11

**Acceptance Criteria:**

**Given** a POST to `/home/api-keys` with `{ name, expiresIn }` and valid session + re-authentication
**When** the re-authentication is verified (password or Google OAuth within 10 minutes)
**Then** a key is generated: `ek_` prefix + 32 cryptographically random bytes (base64url)
**And** the full key is returned in the response ONCE
**And** only the bcrypt hash (cost 12) is stored in `api_keys` table
**And** the key becomes active within 30 seconds
**And** response returns 201 with `{ id, name, key, maskedKey, expiresAt, createdAt }`

**Given** a GET to `/home/api-keys` with valid session
**When** the request is processed
**Then** all keys are returned with: id, name, maskedKey (`ek_Ue7HpvL9...`), status, createdAt, lastUsedAt, expiresAt

**Given** a DELETE to `/home/api-keys/:id` with valid session
**When** the deletion is confirmed
**Then** the key is immediately revoked (returns 401 on next API use)
**And** any cached key-to-user mapping is invalidated within 30 seconds

**Edge Cases:**
- Expired key used for API call → 401 with `{ error: "API key expired" }`
- Maximum 10 keys per user → 409 if limit reached
- Re-authentication timeout (>10 min) → 403 requiring re-auth
- Key deleted while in-flight API call → call completes, next call fails

**Technical Context:**
- Table: `api_keys` — id, user_id, name, key_prefix, key_hash (bcrypt), expires_at, last_used_at, created_at
- Key format: `ek_` + 32 random bytes (base64url) = ~46 chars total
- Key authentication: iterate user's keys, bcrypt compare (or use prefix for lookup optimization)
- Cache: Redis `apikey:{prefix}` → `{ userId, keyHash, expiresAt }` with 30s TTL for fast auth
- Endpoints: `GET /home/api-keys`, `POST /home/api-keys`, `DELETE /home/api-keys/:id`

---

## Story 5.2: Public REST API — Single Verify & Credits

As a developer,
I want to verify emails and check my balance via the API,
So that I can integrate email verification into my application.

**FRs:** FR36, FR39 | **NFRs:** NFR1, NFR6

**Acceptance Criteria:**

**Given** a POST to `/api/v1/verify` with `{ email }` and valid Bearer token
**When** the API key is authenticated (Authorization: Bearer ek_...)
**Then** the same verification pipeline is used (gateway → queue → worker → upstream)
**And** response returns 200 with the verification result (same structure as web)
**And** `last_used_at` is updated on the API key

**Given** a GET to `/api/v1/credits` with valid Bearer token
**When** the request is processed
**Then** response returns 200 with `{ balance, lastUpdated }`

**Edge Cases:**
- Invalid API key → 401 `{ error: "Invalid API key" }`
- Expired API key → 401 `{ error: "API key expired" }`
- Insufficient credits → 402 `{ error: "Insufficient credits", balance: 0 }`
- Malformed email → 422 `{ error: "Invalid email format" }`
- Rate limit exceeded → 429 with `Retry-After` header

**Technical Context:**
- Bearer token auth: extract from `Authorization` header, lookup by prefix, bcrypt verify
- Same pipeline as web single verify (shared BullMQ queue and workers)
- Rate limiting: per-user tier limits (Story 5.5)
- Endpoints: `POST /api/v1/verify`, `GET /api/v1/credits`

---

## Story 5.3: Public REST API — Bulk Verify, Status, Results

As a developer,
I want to submit bulk jobs and retrieve results via the API,
So that I can verify email lists programmatically.

**FRs:** FR37, FR38 | **NFRs:** NFR3, NFR6

**Acceptance Criteria:**

**Given** a POST to `/api/v1/verify/bulk` with CSV file or JSON array and valid Bearer token
**When** the input is valid and credits are sufficient
**Then** credits are deducted, batches enqueued
**And** response returns 202 with `{ jobId, totalEmails, status: "processing" }`

**Given** a GET to `/api/v1/verify/bulk/:jobId` with valid Bearer token
**When** the job belongs to the authenticated user
**Then** response returns 200 with `{ jobId, status, totalEmails, processed, percentage, resultsSummary }`

**Given** a GET to `/api/v1/verify/bulk/:jobId/results` with valid Bearer token
**When** the job is completed and results are within retention
**Then** response returns 302 redirect to pre-signed DO Spaces URL

**Edge Cases:**
- Job not found → 404
- Job belongs to different user → 403
- Results expired (>14 days) → 410 Gone
- Upload exceeds 100K emails → 413
- JSON array input → same processing as CSV

**Technical Context:**
- Same pipeline as web bulk verify
- CSV download: pre-signed DO Spaces URL (same as web)
- Endpoints: `POST /api/v1/verify/bulk`, `GET /api/v1/verify/bulk/:jobId`, `GET /api/v1/verify/bulk/:jobId/results`

---

## Story 5.4: Webhook System

As a developer,
I want to receive webhook notifications for key events,
So that my application can react to verification completions and credit alerts.

**FRs:** FR40, FR41 | **NFRs:** NFR7, NFR13, NFR31

**Acceptance Criteria:**

**Given** a POST to `/api/v1/webhooks` with `{ url, events }` and valid Bearer token
**When** the request is processed
**Then** a signing secret is generated: `whsec_` + 32 random bytes (base64url)
**And** the secret is returned ONCE in the response
**And** the secret hash (bcrypt) is stored in `webhooks` table
**And** the webhook is active immediately

**Given** a triggering event occurs
**When** the webhook delivery system fires
**Then** the payload includes: `{ id: "evt_...", type, createdAt, data }`
**And** headers include: `X-EV-Signature-256` (HMAC-SHA256), `X-EV-Timestamp`
**And** signature computed: `HMAC-SHA256(${timestamp}.${raw_json_body}, secret)`

**Given** a delivery fails (non-2xx or timeout >10s)
**When** retry policy activates
**Then** retries: immediate → 1min → 5min → 30min (4 total attempts)
**And** after 4 failures: webhook status → 'failing', user emailed, webhook paused

**Given** a GET to `/api/v1/webhooks` with valid Bearer token
**When** the request is processed
**Then** all webhooks listed: id, url, events, status, failureCount, lastDelivery

**Given** a DELETE to `/api/v1/webhooks/:id` with valid Bearer token
**When** the deletion is confirmed
**Then** the webhook is immediately deactivated and future deliveries cancelled

**Edge Cases:**
- Duplicate delivery (retry) → same `evt_` ID, recipients should deduplicate
- `credits.low` threshold: balance < 10% of last purchase amount
- Replay protection: recipients should reject timestamps > 5 min old
- Max webhooks per user: 10

**Technical Context:**
- Architecture Section 8 — webhook signing, retry, idempotency
- Tables: `webhooks`, `webhook_deliveries`
- Event types: `verification.completed`, `bulk.completed`, `bulk.failed`, `credits.low`
- Delivery: BullMQ delayed jobs for retry scheduling
- Endpoints: `POST /api/v1/webhooks`, `GET /api/v1/webhooks`, `DELETE /api/v1/webhooks/:id`

---

## Story 5.5: Per-User Rate Limiting

As a platform,
I want to enforce rate limits per user based on their subscription tier,
So that fair usage is maintained and upstream resources are protected.

**FRs:** FR42 | **NFRs:** NFR18, NFR22

**Acceptance Criteria:**

**Given** a user making API requests
**When** they exceed their tier's rate limit
**Then** 429 is returned with `Retry-After` header
**And** the rate limit applies across ALL their API keys (per user, not per key)

**Given** different subscription tiers
**When** rate limits are checked via Redis Lua sliding window
**Then** the correct limits are applied:

| Tier | Requests/sec | Requests/hour | Concurrent |
|------|-------------|---------------|------------|
| Free/Starter | 10 | 1,000 | 5 |
| Popular | 15 | 5,000 | 10 |
| Professional | 25 | 10,000 | 15 |
| Business | 50 | 20,000 | 30 |
| Enterprise | 100 | 50,000 | 50 |
| Premium | 200 | 100,000 | 100 |
| Ultimate | 300 | 500,000 | 150 |
| Mega | 400 | 750,000 | 175 |
| Titan | 500 | 1,000,000 | 200 |

**Given** global traffic
**When** total requests across all users exceed 2,000 req/sec
**Then** the global rate limiter activates to protect upstream

**Edge Cases:**
- User upgrades tier → new limits apply immediately
- User downgrades → new limits apply at next billing cycle
- Progressive penalty: 10 consecutive 429s → cooldown doubles
- Rate limit by user ID (not IP)

**Technical Context:**
- Redis Lua sliding window: architecture Section 2, Layer 1
- Per-user limits from `subscriptions.plan_name`
- Global limit: 2,000 req/sec (architecture Section 2)
- Progressive penalties: architecture Section 14

---

## Story 5.6: Usage History & Export API

As a user,
I want to retrieve and export my verification history,
So that I can audit usage and integrate data into my systems.

**FRs:** FR46, FR47

**Acceptance Criteria:**

**Given** a GET to `/home/usage` with valid session
**When** the request is processed
**Then** verification history is returned: email_checked, status, method (web/api), date, bulk_job_id
**And** results are paginated (server-side, 50 per page)

**Given** a GET to `/home/usage?search=email&status=valid&method=api&page=2`
**When** filters are applied
**Then** results are filtered by email (ILIKE), status, and/or method

**Given** a GET to `/home/usage/export?dateFrom=X&dateTo=Y`
**When** the export is requested
**Then** a CSV file is generated with all matching records
**And** response is streamed as `Content-Type: text/csv` with `Content-Disposition: attachment`

**Edge Cases:**
- Large history (100K+) → server-side pagination with cursor
- Export all data → streaming response (not buffered)
- Records older than retention (90 days single / 30 days bulk) → pruned
- Empty history → empty array

**Technical Context:**
- Table: `verification_results` filtered by user_id
- Retention: 90 days single, 30 days bulk (architecture Section 11)
- Endpoints: `GET /home/usage`, `GET /home/usage/export`

---

# API Contract

## API Key Endpoints

### `GET /home/api-keys`

**Auth:** Session cookie

```json
// Response 200
{
  "keys": [
    {
      "id": "string",
      "name": "string",
      "maskedKey": "string (e.g. 'ek_Ue7HpvL9...')",
      "status": "active | expired",
      "createdAt": "string (ISO 8601)",
      "lastUsed": "string (ISO 8601) | null",
      "expiresAt": "string (ISO 8601) | null",
      "requestsToday": "number",
      "requestsTotal": "number"
    }
  ]
}
```

### `POST /home/api-keys`

**Auth:** Session cookie + re-authentication

```json
// Request
{
  "name": "string (required)",
  "expiresIn": "string (1mo | 3mo | 6mo | 1yr | never)"
}

// Response 201
{
  "id": "string",
  "name": "string",
  "key": "string (full key, shown ONCE: ek_...)",
  "maskedKey": "string",
  "expiresAt": "string | null",
  "createdAt": "string"
}

// Error 409
{ "error": "Maximum 10 API keys reached" }

// Error 403
{ "error": "Re-authentication required" }
```

### `DELETE /home/api-keys/:id`

**Auth:** Session cookie

```json
// Response 200
{ "message": "API key revoked" }

// Error 404
{ "error": "API key not found" }
```

## Public API Endpoints

### `POST /api/v1/verify`

**Auth:** Bearer token (API key)

```json
// Request
{ "email": "string (required)" }

// Response 200
{
  "result": {
    "id": "string",
    "email": "string",
    "status": "valid | invalid | unknown | risky | disposable | catch_all | role",
    "score": "number (0-100)",
    "deliverable": "boolean",
    "reason": "string",
    "domain": "string",
    "attributes": [ /* EmailAttribute[] */ ],
    "serverInfo": { "smtpProvider": "string", "mxRecords": "string" },
    "verifiedAt": "string (ISO 8601)"
  },
  "credits": "number"
}

// Error 401
{ "error": "Invalid API key" }

// Error 402
{ "error": "Insufficient credits", "balance": 0 }

// Error 422
{ "error": "Invalid email format" }

// Error 429
{ "error": "Rate limit exceeded", "retryAfter": "number (seconds)" }
```

### `GET /api/v1/credits`

**Auth:** Bearer token

```json
// Response 200
{
  "balance": "number",
  "lastUpdated": "string (ISO 8601)"
}
```

### `POST /api/v1/verify/bulk`

**Auth:** Bearer token
**Content-Type:** multipart/form-data or application/json

```json
// Request (JSON)
{ "emails": ["string"] }

// Request (multipart): file field "file" (CSV)

// Response 202
{
  "jobId": "string",
  "totalEmails": "number",
  "status": "processing"
}

// Error 402
{ "error": "Insufficient credits" }

// Error 413
{ "error": "Too many emails. Maximum: 100,000" }
```

### `GET /api/v1/verify/bulk/:jobId`

**Auth:** Bearer token

```json
// Response 200
{
  "jobId": "string",
  "status": "pending | processing | completed | failed",
  "totalEmails": "number",
  "processed": "number",
  "percentage": "number (0-100)",
  "resultsSummary": {
    "valid": "number",
    "invalid": "number",
    "unknown": "number",
    "risky": "number"
  } | null
}

// Error 404
{ "error": "Job not found" }

// Error 403
{ "error": "Access denied" }
```

### `GET /api/v1/verify/bulk/:jobId/results`

**Auth:** Bearer token

```json
// Response 302 → redirect to pre-signed DO Spaces URL

// Error 410
{ "error": "Results expired" }
```

### `POST /api/v1/webhooks`

**Auth:** Bearer token

```json
// Request
{
  "url": "string (HTTPS required)",
  "events": ["verification.completed", "bulk.completed", "bulk.failed", "credits.low"]
}

// Response 201
{
  "id": "string",
  "url": "string",
  "events": ["string"],
  "secret": "string (whsec_..., shown ONCE)",
  "status": "active",
  "createdAt": "string"
}
```

### `GET /api/v1/webhooks`

**Auth:** Bearer token

```json
// Response 200
{
  "webhooks": [
    {
      "id": "string",
      "url": "string",
      "events": ["string"],
      "status": "active | failing | paused",
      "failureCount": "number",
      "lastDelivery": "string (ISO 8601) | null",
      "createdAt": "string"
    }
  ]
}
```

### `DELETE /api/v1/webhooks/:id`

**Auth:** Bearer token

```json
// Response 200
{ "message": "Webhook deleted" }
```

## Usage Endpoints

### `GET /home/usage`

**Auth:** Session cookie

```json
// Query params: ?search=email&status=valid&method=web|api&page=1&limit=50

// Response 200
{
  "verifications": [
    {
      "id": "string",
      "email": "string",
      "status": "string",
      "method": "web | api",
      "date": "string (ISO 8601)",
      "bulkJobId": "string | null"
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

### `GET /home/usage/export`

**Auth:** Session cookie

```json
// Query params: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&status=valid&method=api

// Response 200
// Content-Type: text/csv
// Content-Disposition: attachment; filename="usage-export-2026-01-31.csv"
```

## Frontend Type Mismatches

| Frontend Type | Current Value | Backend Value | Resolution |
|---------------|--------------|---------------|------------|
| `ApiKey.type` | `"live" \| "test"` | No type field (all keys are live) | **Frontend must remove** `type` field or ignore |
| `ApiKey.security` | `"public" \| "private"` | No security field (all keys are private) | **Frontend must remove** `security` field or ignore |
| `ApiKey.key` | `string (raw, e.g. "3dwnjednejncdsc")` | Full key shown once on creation, then only `maskedKey` (with `ek_` prefix) | **Frontend must update** — show `key` on creation modal, `maskedKey` in list |
| `ApiKey` extra fields | `type: "live"\|"test"`, `security: "public"\|"private"` | No `type` or `security` field — all keys are live and private | **Frontend must remove** `type` and `security` fields |
| `ApiKey.status` | `"active" \| "inactive"` | `"active" \| "expired"` | **Frontend must change** `"inactive"` → `"expired"` |
| `ApiKey` missing fields | N/A | `expiresAt: string \| null` | **Frontend must add** `expiresAt` field |
| `ApiKey.requestsToday` | `number` | Available from rate limit counters | Compatible |
| `ApiKey.requestsTotal` | `number` | Aggregated from usage logs | Compatible |
| `ApiUsageDay` | Chart data type | Not directly in API — computed client-side from usage data | **Frontend derives** from usage endpoint |

> **Webhook management UI:** Backend has full webhook CRUD endpoints (`POST/GET/DELETE /api/v1/webhooks`) but **zero webhook UI components exist in the frontend**. Story 5.7 covers API key management only. Either add a webhook management frontend story or explicitly mark webhooks as API-only (no UI) for MVP.

> **Architecture gaps:**
> - Rate limit table in `docs/architecture.md` only lists 6 tiers (Starter, Professional, Business, Enterprise, Premium, Titan). Missing Free, Popular, Ultimate, Mega tiers. Update to match the full 9-tier + Free table in Story 5.5.
> - Architecture lists `GET /api/v1/usage` as a public API endpoint, but this is not in the PRD (FR46–FR47 only cover internal usage history at `/home/usage`). The public API does not expose a usage endpoint. Architecture should remove this endpoint.

---

# Frontend Integration Stories

## Story 5.7: API Key Management Integration

As a frontend developer,
I want to wire the API keys page to the backend API key endpoints,
So that users can create, view, and delete API keys.

**Depends on:** Story 1.8 (auth provider), Backend Story 5.1 deployed

**Acceptance Criteria:**

**Given** the API keys page at `/home/api-keys`
**When** it loads
**Then** `GET /home/api-keys` is called via TanStack Query
**And** keys are displayed in a table: name, masked key, status badge, created date, last used, expiration

**Given** the user clicks "Create API Key"
**When** they fill in name and expiration, then re-authenticate
**Then** `POST /home/api-keys` is called
**And** on success, the full key is shown in a modal with copy-to-clipboard button
**And** a warning: "This key will not be shown again"
**And** the keys list refreshes

**Given** the user deletes a key
**When** they confirm in a dialog
**Then** `DELETE /home/api-keys/:id` is called
**And** the key is removed from the list immediately (optimistic update)

**Edge Cases:**
- 409 (max keys) → show limit message
- 403 (re-auth needed) → trigger re-authentication modal
- Copy to clipboard failure → show key text as selectable
- Key overview stats (today/total requests) from API response

**Technical Context:**
**Frontend Reality Notes (verified against source):**
- API key table currently shows columns **Name, Key, Type, Security** (`api-keys-table.tsx:33-45`) — needs changing to Name, Masked Key, Status, Created, Last Used, Expires
- Keys display raw `apiKey.key` string (`api-keys-table.tsx:62-64`) — no masking, no `ek_` prefix. Must show `maskedKey`.
- "Manage" button has **no onClick handler** (`api-keys-table.tsx:88-92`) — purely visual
- New API Key form has fields **name, security, ipAddresses, keyType** (`new-api-key-form.tsx:12-15`) — needs changing to name + expiresIn only
- No "show full key once" modal exists — must be built for key creation flow
- `api-usage-chart.tsx:70` label says "Warmup emails sent" — needs appropriate label for EmailKit
- `api-usage-chart.tsx:29-58` filter dropdowns are non-functional — no state management
- `api-stats-row.tsx:9-15` has hardcoded `120` values — needs API data

- Existing components: `src/components/api/api-keys-table.tsx`, `new-api-key-form.tsx`, `api-overview.tsx`, `api-stats-row.tsx`, `api-usage-chart.tsx`
- Existing page: `src/app/(dashboard)/home/api-keys/page.tsx`
- TanStack Query: `useQuery(['api-keys'], fetchKeys)`, `useMutation` for create/delete

---

## Story 5.8: Credit History Page Integration

As a frontend developer,
I want to wire the credit history page to the backend transactions API,
So that users can view their full credit transaction history with search and filtering.

> **Decision #7:** The `/home/usage` page is credit history (not verification history). The page currently displays credit transactions: Transaction Date, Reason, Change, Balance.
> **Decision #13:** Route renamed from `/home/usage` to `/home/credit-history`.

**Depends on:** Story 1.8 (auth provider), Backend Story 3.4 deployed

**Acceptance Criteria:**

**Given** the credit history page at `/home/credit-history`
**When** it loads
**Then** `GET /home/billing/transactions` is called via TanStack Query
**And** transactions are displayed in a table: Transaction Date, Description (renamed from Reason), Amount (renamed from Change, + green / - red), Balance

**Given** the search input
**When** the user types a search query
**Then** transactions are filtered client-side by description (or server-side if API supports it)

**Given** the "Active Credits" display
**When** the page loads
**Then** the current credit balance is shown (from auth context or `GET /home/billing`)

**Given** the "Add More" button
**When** clicked
**Then** navigates to `/home/billing/buy-credits`

**Edge Cases:**
- Empty history (new user) → "No transactions yet" empty state
- Loading state → skeleton rows
- Large history → server-side pagination via `GET /home/billing/transactions?page=N&limit=20`

**Frontend Reality Notes (verified against source):**
- Current page at `src/app/(dashboard)/home/usage/page.tsx` is **credit history** (imports `CreditHistoryTable` + `mockCreditHistory`), NOT verification history
- Table header typo at line 59: "Transaction Dae" (missing "t" in Date) — must fix
- Search input works but filters `mockCreditHistory` client-side — needs API replacement
- Credit balance display is hardcoded "400 / 1,250" — needs API data
- Route must be renamed from `/home/usage/` to `/home/credit-history/`

**Technical Context:**
- Existing page: `src/app/(dashboard)/home/usage/page.tsx` (rename to `credit-history/`)
- Existing components: `src/components/credit-history/credit-history-table.tsx`, `transaction-row.tsx`, `change-badge.tsx`
- TanStack Query: `useQuery(['transactions', { search, page }], fetchTransactions)`
- Map backend `CreditTransaction` to frontend `CreditHistoryEntry` type (rename `description` → maps to current `reason`, `amount` → maps to current `change`)
