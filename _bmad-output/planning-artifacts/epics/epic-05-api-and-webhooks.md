# Epic 5: Public API & Webhooks

## Epic Goal

Developers can integrate via the public REST API using ev_-prefixed API keys. Key management: create with configurable expiration, view masked list, delete with immediate revocation. API endpoints: single verify, bulk submit, bulk status/results, credit balance, webhooks CRUD. Webhook system delivers HMAC-SHA256 signed notifications for 4 event types with 4-attempt retry. Per-user rate limiting enforced by subscription tier. Usage history with filtering and export.

**FRs covered:** FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR46, FR47
**Dependencies:** Epic 2 (verification engine), Epic 3 (credits and subscriptions for tier-based rate limits)

---

## Story 5.1: API Key Management

As a developer,
I want to create and manage API keys,
So that I can authenticate my applications against the EmailKit API.

**FRs:** FR32, FR33, FR34, FR35 | **NFRs:** NFR5, NFR11

**Acceptance Criteria:**

**Given** a signed-in user on /home/api-keys
**When** they create a new API key with a name and expiration (1mo, 3mo, 6mo, 1yr, never)
**Then** re-authentication is required (password or Google OAuth within 10 minutes)
**And** a key is generated: `ev_` prefix + 32 cryptographically random bytes (base64url)
**And** the full key is displayed ONCE in a copy-to-clipboard UI
**And** only the bcrypt hash is stored in `api_keys` table (plaintext never saved)
**And** the key becomes active within 30 seconds

**Given** a user on the API keys page
**When** they view their key list
**Then** each key shows: name, masked display (`ev_Ue7HpvL9...`), status, created date, last used date, expiration date

**Given** a user deleting an API key
**When** they confirm deletion
**Then** the key is immediately revoked (returns 401 on next use)
**And** any key cache is invalidated within 30 seconds

**Edge Cases:**
- Expired key used for API call → 401 with "Key expired" message
- Maximum keys per user → enforce reasonable limit (e.g., 10)
- Re-authentication timeout (>10 min since last auth) → re-prompt

**Technical Context:**
- Table: `api_keys` (architecture Section 12) — key_prefix, key_hash (bcrypt), expires_at, last_used_at
- Key format: architecture Section 14 — `ev_` + 32 random bytes, base64url
- Re-authentication: architecture Section 7 — sensitive action re-auth
- UI screens: `docs/figma/api/spec.md` — API keys page
- Page spec: `docs/pages/04-api-keys.md`
- Endpoints: `GET /home/api-keys`, `POST /home/api-keys`, `DELETE /home/api-keys/:id`

---

## Story 5.2: Public REST API (Single Verify, Credits)

As a developer,
I want to verify emails and check my balance via the API,
So that I can integrate email verification into my application.

**FRs:** FR36, FR39 | **NFRs:** NFR1, NFR6

**Acceptance Criteria:**

**Given** a developer with a valid API key
**When** they send `POST /api/v1/verify` with `{"email": "test@example.com"}`
**Then** the email is authenticated via Bearer token in Authorization header
**And** the same verification pipeline is used (gateway → queue → worker → upstream)
**And** the result is returned with: status, deliverable, risk_score, details (same as web UI)

**Given** a developer
**When** they send `GET /api/v1/credits`
**Then** the current credit balance is returned
**And** response includes: balance, last_updated timestamp

**Edge Cases:**
- Invalid API key → 401 Unauthorized
- Expired API key → 401 with "Key expired" message
- Insufficient credits → 402 Payment Required
- Malformed email → 422 Validation Error
- Rate limit exceeded → 429 Too Many Requests with Retry-After header

**Technical Context:**
- API authentication: Bearer token in Authorization header, bcrypt hash comparison
- API spec: architecture Section 13 — Public API endpoints
- Rate limiting: per-user sliding window (architecture Section 2, Layer 1)
- last_used_at updated on each API call (api_keys table)
- Response format: JSON, same verification result structure as web UI
- Endpoints: `POST /api/v1/verify`, `GET /api/v1/credits`

---

## Story 5.3: Public REST API (Bulk Verify, Job Status, Results)

As a developer,
I want to submit bulk jobs and retrieve results via the API,
So that I can verify email lists programmatically.

**FRs:** FR37, FR38 | **NFRs:** NFR3, NFR6

**Acceptance Criteria:**

**Given** a developer with a valid API key
**When** they send `POST /api/v1/bulk` with a CSV file or JSON array of emails
**Then** credits are deducted for the total count
**And** the job is created and batches enqueued
**And** a 202 response returns: job_id, total_emails, status='processing'

**Given** a developer
**When** they send `GET /api/v1/bulk/:jobId`
**Then** the response includes: job_id, status, total_emails, processed, percentage, results_summary (if complete)

**Given** a completed bulk job
**When** a developer sends `GET /api/v1/bulk/:jobId/results`
**Then** they receive a redirect (302) to a pre-signed download URL for the CSV
**And** the CSV format matches the web UI export

**Edge Cases:**
- Job not found → 404
- Job belongs to different user → 403
- Results expired (>14 days) → 410 Gone
- Upload exceeds 100K emails → 413 Payload Too Large
- JSON array input (alternative to CSV) → parse and process same as file

**Technical Context:**
- Same pipeline as web bulk verify (shared BullMQ queue and workers)
- API spec: architecture Section 13 — POST /api/v1/bulk, GET /api/v1/bulk/:jobId, GET /api/v1/bulk/:jobId/results
- CSV download: pre-signed DO Spaces URL (same as web UI download)
- Endpoints: `POST /api/v1/bulk`, `GET /api/v1/bulk/:jobId`, `GET /api/v1/bulk/:jobId/results`

---

## Story 5.4: Webhook System

As a developer,
I want to receive webhook notifications for key events,
So that my application can react to verification completions and credit alerts.

**FRs:** FR40, FR41 | **NFRs:** NFR7, NFR13, NFR31

**Acceptance Criteria:**

**Given** a developer
**When** they create a webhook via `POST /api/v1/webhooks` with URL and subscribed events
**Then** a signing secret is generated (`whsec_` + 32 random bytes, base64url)
**And** the secret is displayed once and stored as bcrypt hash
**And** the webhook is active immediately

**Given** a triggering event occurs (verification.completed, bulk.completed, bulk.failed, credits.low)
**When** the webhook delivers
**Then** the payload includes: id (`evt_` prefix), type, created_at, data
**And** headers include: X-EV-Signature-256 (HMAC-SHA256), X-EV-Timestamp
**And** the signature is computed over `${timestamp}.${raw_json_body}` using the webhook secret

**Given** a webhook delivery fails
**When** retry policy activates
**Then** retries: immediate → 1 min → 5 min → 30 min (4 total attempts)
**And** after 4 failures: webhook status → 'failing', user notified via email, webhook paused

**Given** a developer managing webhooks
**When** they call `GET /api/v1/webhooks`
**Then** all webhooks are listed with: URL, subscribed events, status, failure_count
**When** they call `DELETE /api/v1/webhooks/:id`
**Then** the webhook is immediately deactivated

**Edge Cases:**
- Recipient returns non-2xx → considered failure, retry scheduled
- Recipient doesn't respond within 10 seconds → timeout, retry scheduled
- Duplicate delivery (retry) → same event ID, recipient should deduplicate (architecture Section 8 — Webhook Idempotency)
- credits.low threshold: balance drops below 10% of last purchase amount
- Replay protection: recipients should reject timestamps older than 5 minutes

**Technical Context:**
- Webhook system: architecture Section 8 — full signing, retry, idempotency spec
- Tables: `webhooks`, `webhook_deliveries` (architecture Section 8)
- Signing: HMAC-SHA256 using per-webhook secret (architecture Section 8 — Security)
- Event types: verification.completed, bulk.completed, bulk.failed, credits.low
- Idempotency: event ID is unique and immutable across retries
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
**Then** a 429 Too Many Requests response is returned
**And** the Retry-After header indicates when they can retry
**And** the rate limit applies across all their API keys

**Given** different subscription tiers
**When** rate limits are checked
**Then** the correct limits are applied:
| Tier | Requests/sec | Requests/hour | Concurrent |
|------|-------------|---------------|------------|
| Starter | 10 | 1,000 | 5 |
| Professional | 25 | 10,000 | 15 |
| Business | 50 | 20,000 | 30 |
| Enterprise | 100 | 50,000 | 50 |
| Premium | 200 | 100,000 | 100 |
| Titan | 500 | 1,000,000 | 200 |

**Given** global rate limiting
**When** total traffic across all users exceeds 2,000 req/sec
**Then** the global rate limiter activates to protect the upstream API

**Edge Cases:**
- User upgrades tier → new limits apply immediately
- User downgrades → new limits apply at next billing cycle
- Progressive penalty: 10 consecutive rate limit hits → cooldown period doubles
- Rate limit by user ID (not IP) → prevents circumvention via IP rotation

**Technical Context:**
- Rate limiting: Redis Lua sliding window scripts (architecture Section 2, Layer 1)
- Per-user limits: tied to subscription tier from `subscriptions` table
- Global limit: 2,000 req/sec total (architecture Section 2)
- Rate evasion prevention: architecture Section 14 — by user ID, not IP; progressive penalties

---

## Story 5.6: Usage History & Export

As a user,
I want to view and export my verification history,
So that I can audit my usage and integrate data into my own systems.

**FRs:** FR46, FR47

**Acceptance Criteria:**

**Given** a signed-in user on /home/usage
**When** the page loads
**Then** verification history is displayed in a table: email checked, status, method (web/api), date, bulk_job_id (if applicable)

**Given** the user wants to find specific records
**When** they search by email address, filter by status, or filter by method (web/api)
**Then** the list is filtered accordingly in real time

**Given** the user wants to export data
**When** they select export option (current page, all data, or custom date range)
**Then** a CSV file is generated and downloaded
**And** the export includes all columns from the usage table

**Edge Cases:**
- Large history (100K+ records) → server-side pagination with cursor-based navigation
- Export all data → background generation, download link when ready (for very large exports)
- Records older than 90 days (single verify) or 30 days (bulk) → pruned, not available
- Empty usage history → show "No verifications yet" empty state

**Technical Context:**
- Table: `verification_results` (architecture Section 12) — filtered by user_id
- Retention: 90 days for single verify, 30 days for bulk (architecture Section 11)
- UI screens: `docs/figma/dashboard/spec.md` or usage-specific Figma screen
- Page spec: `docs/pages/05-usage.md` — usage history page
- Endpoints: `GET /home/usage`, `GET /home/usage/export`
