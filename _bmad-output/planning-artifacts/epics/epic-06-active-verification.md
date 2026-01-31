# Epic 6: Deliverability (Active Verification)

## Epic Goal

Users can connect an external email tool integration (generic/pluggable — no vendor-specific implementation at MVP) for continuous email list monitoring. Configure scheduled re-verification at 1h, 6h, 12h, or 24h intervals. View aggregated verification results across all connected data sources. Filter and search emails within active verification lists by status. The navigation label for this feature is **"Deliverability"**.

> **Decision #11:** ReachInbox integration is skipped. The integration architecture is generic/pluggable — implemented via an `IntegrationProvider` interface so any email tool can be added later without core logic changes.
> **Decision #12:** The navigation label is "Deliverability", not "Active Verification".

**FRs covered:** FR51, FR52, FR53, FR54
**Dependencies:** Epic 2 (verification engine, credit system), Epic 3 (credits for ongoing verification)

---

# Backend Stories

## Story 6.1: Integration Account Connection (Generic/Pluggable)

As a user,
I want to connect an external email tool to EmailKit,
So that my email lists are synced for continuous verification.

**FRs:** FR51 | **NFRs:** NFR35

**Acceptance Criteria:**

**Given** a POST to `/home/active-verification/connect` with `{ source, credentials }` and valid session
**When** the credentials are validated against the integration provider's API (via `IntegrationProvider` interface)
**Then** the connection is established and credentials are encrypted at rest (AES-256)
**And** email lists are pulled from the provider and stored locally
**And** response returns 200 with `{ connectionId, source, status: "connected", emailsSynced, lastSync }`

**Given** a GET to `/home/active-verification` with valid session
**When** a connection exists
**Then** response includes: connected source, connection status, total emails synced, last sync time

**Given** a DELETE to `/home/active-verification/disconnect` with valid session
**When** the user confirms disconnection
**Then** the connection is removed, credentials are deleted
**And** synced email data is retained (for historical verification results)

**Edge Cases:**
- Invalid or expired credentials → 401 with clear error, prompt to reconnect
- Integration provider API unavailable → 503 with "Service temporarily unavailable"
- Credential security → encrypted at rest (AES-256), never returned after initial connection
- One connection per user (MVP) → 409 if already connected
- Large email lists (100K+) → paginated sync from provider API

**Technical Context:**
- Integration architecture: `IntegrationProvider` interface with `validateCredentials()`, `syncEmails()`, `getEmailLists()` methods. Concrete implementations added per provider.
- Auth method per provider: may be OAuth, API key, or other — determined by the `IntegrationProvider` implementation. No hardcoded auth flow.
- Table: `integrations` (id, user_id, source, credentials_encrypted, status, last_sync_at, created_at)
- Table: `integration_emails` (id, integration_id, email, current_status, last_verified_at)
- Credential encryption: AES-256 with key from environment variable
- Endpoints: `POST /home/active-verification/connect`, `DELETE /home/active-verification/disconnect`

---

## Story 6.2: Scheduled Re-Verification

As a user with connected email lists,
I want to schedule automatic re-verification at regular intervals,
So that my lists stay clean without manual effort.

**FRs:** FR52 | **NFRs:** NFR3, NFR35

**Acceptance Criteria:**

**Given** a PUT to `/home/active-verification/schedule` with `{ interval: "1h"|"6h"|"12h"|"24h" }` and valid session
**When** the user has an active connection
**Then** the schedule is saved and a repeatable BullMQ job is created
**And** the first verification cycle starts immediately
**And** response returns 200 with `{ schedule: { interval, nextRun, active: true } }`

**Given** a scheduled verification cycle triggers
**When** the system processes all emails in connected lists
**Then** every email is re-verified through the standard BullMQ pipeline (priority 10 — bulk)
**And** credits are deducted per email (1 credit each, atomic Redis Lua)
**And** `integration_emails.current_status` and `last_verified_at` are updated
**And** a cycle log is recorded: total emails, results breakdown, credits consumed, duration

**Given** a PUT to `/home/active-verification/schedule` with `{ active: false }`
**When** the user pauses the schedule
**Then** the repeatable job is removed from BullMQ
**And** no further cycles run until reactivated

**Edge Cases:**
- Insufficient credits mid-cycle → pause, notify user via email, resume when credits added
- Integration provider API down during sync → skip cycle, retry at next interval, log failure
- Very large lists (100K+) → same batching as bulk verify
- Schedule change during active cycle → applies to next cycle
- Overlapping cycles (1h interval, job > 1h) → skip next, don't stack

**Technical Context:**
- Scheduler: BullMQ repeatable jobs with cron patterns
- Same verification pipeline: BullMQ Pro queue, tenant groups, priority 10
- Credit deduction: same atomic Redis Lua
- Endpoint: `PUT /home/active-verification/schedule`

---

## Story 6.3: Aggregated Results API

As a user,
I want to retrieve aggregated verification results across all connected lists,
So that the dashboard can display email health summaries.

**FRs:** FR53

**Acceptance Criteria:**

**Given** a GET to `/home/active-verification` with valid session
**When** the user has connected sources with completed verification cycles
**Then** the response includes:
- `connection`: source name, status, total emails, last sync
- `schedule`: interval, nextRun, active
- `overview`: total monitored, deliverable count, risky count, undeliverable count
- `distribution`: donut chart data (deliverable/risky/undeliverable breakdown)
- `changedSinceLastCycle`: count of emails that changed status
- `perList`: breakdown per source list (name, total, last verified, status counts)

**Edge Cases:**
- No verification cycles completed → `{ overview: null, message: "Awaiting first verification" }`
- Single source → still return aggregated format (future multi-source ready)
- Data freshness: include `lastVerifiedAt` timestamp

**Technical Context:**
- Aggregation queries on `integration_emails` table grouped by status
- Per-list breakdown from `integration_emails` grouped by list/source
- Endpoint: `GET /home/active-verification`

---

## Story 6.4: Email Status Filtering & Search API

As a user,
I want to filter and search emails within my active verification lists,
So that I can find specific contacts and act on invalid emails.

**FRs:** FR54

**Acceptance Criteria:**

**Given** a GET to `/home/active-verification/emails` with valid session
**When** no filters are applied
**Then** all synced emails are returned: email, currentStatus, lastVerifiedAt, listSource
**And** results are paginated (cursor-based for performance)

**Given** a GET to `/home/active-verification/emails?status=invalid,risky&search=example.com&cursor=X`
**When** filters are applied
**Then** emails matching ANY of the selected statuses AND matching the search term are returned

**Given** a GET to `/home/active-verification/emails/export?status=invalid`
**When** the export is requested
**Then** a CSV file is streamed with the filtered results

**Edge Cases:**
- Large lists (100K+) → cursor-based pagination, not offset
- Multiple statuses → OR filter
- Empty results → empty array
- Export filtered results → same filters as list view

**Technical Context:**
- Table: `integration_emails` filtered by user's integration
- Search: `ILIKE '%search%'` on email column
- Cursor pagination: ordered by email or id, using `WHERE id > cursor`
- Endpoints: `GET /home/active-verification/emails`, `GET /home/active-verification/emails/export`

---

# API Contract

## Active Verification Endpoints

### `GET /home/active-verification`

**Auth:** Session cookie

```json
// Response 200 (connected, with data)
{
  "connection": {
    "id": "string",
    "source": "string (integration provider identifier)",
    "status": "connected | disconnected | error",
    "totalEmails": "number",
    "lastSync": "string (ISO 8601)"
  } | null,
  "schedule": {
    "interval": "1h | 6h | 12h | 24h",
    "nextRun": "string (ISO 8601)",
    "active": "boolean"
  } | null,
  "overview": {
    "totalMonitored": "number",
    "deliverable": "number",
    "risky": "number",
    "undeliverable": "number",
    "unknown": "number",
    "changedSinceLastCycle": "number",
    "lastVerifiedAt": "string (ISO 8601) | null"
  } | null,
  "perList": [
    {
      "name": "string",
      "totalEmails": "number",
      "lastVerified": "string (ISO 8601)",
      "distribution": {
        "deliverable": "number",
        "risky": "number",
        "undeliverable": "number",
        "unknown": "number"
      }
    }
  ]
}
```

### `POST /home/active-verification/connect`

**Auth:** Session cookie

```json
// Request (auth method depends on integration source — generic)
{
  "source": "string (integration provider identifier)",
  "credentials": "object (provider-specific, e.g. { apiKey } or { oauthToken })"
}

// Response 200
{
  "connectionId": "string",
  "source": "string",
  "status": "connected",
  "emailsSynced": "number",
  "lastSync": "string (ISO 8601)"
}

// Error 401
{ "error": "Invalid credentials for {source}" }

// Error 409
{ "error": "Already connected. Disconnect first to reconnect." }

// Error 503
{ "error": "Integration service unavailable" }
```

### `DELETE /home/active-verification/disconnect`

**Auth:** Session cookie

```json
// Response 200
{ "message": "Disconnected from integration. Verification data retained." }
```

### `PUT /home/active-verification/schedule`

**Auth:** Session cookie

```json
// Request
{
  "interval": "1h | 6h | 12h | 24h",
  "active": "boolean"
}

// Response 200
{
  "schedule": {
    "interval": "string",
    "nextRun": "string (ISO 8601)",
    "active": "boolean"
  }
}

// Error 400
{ "error": "No active connection. Connect a source first." }
```

### `GET /home/active-verification/emails`

**Auth:** Session cookie

```json
// Query params: ?status=invalid,risky&search=example.com&cursor=abc123&limit=50

// Response 200
{
  "emails": [
    {
      "id": "string",
      "email": "string",
      "status": "valid | invalid | unknown | risky | disposable | catch_all | role",
      "lastVerified": "string (ISO 8601)",
      "listSource": "string"
    }
  ],
  "nextCursor": "string | null",
  "total": "number"
}
```

### `GET /home/active-verification/emails/export`

**Auth:** Session cookie

```json
// Query params: ?status=invalid,risky&search=example.com

// Response 200
// Content-Type: text/csv
// Content-Disposition: attachment; filename="active-verification-export.csv"
```

## Frontend Type Mismatches

| Frontend Type | Current Value | Backend Value | Resolution |
|---------------|--------------|---------------|------------|
| `Integration.status` | `"active" \| "paused" \| "disconnected"` | `"connected" \| "disconnected" \| "error"` | **Frontend must update** to match backend statuses |
| `Integration.emailsVerified` | `number` | `totalEmails` (synced count) | **Frontend must rename** to `totalEmails` |
| `Integration.lastSync` | `string` | Same | Compatible |
| `ActiveVerificationItem.segments` | `{ color, value }[]` (CSS gradient colors) | Distribution object `{ deliverable, risky, undeliverable, unknown }` → **updated:** `{ valid, invalid, risky, unknown }` (Decision #1) | **Frontend must restructure** — map distribution object to chart segments |
| `ActiveVerificationItem.status` | `"completed" \| "in_progress"` | Aggregated from verification cycle state | **Frontend must align** with API model |
| `IntegrationSource` | Lists 8 available sources (`mockIntegrationSources`) | Generic/pluggable — no hardcoded sources (Decision #11) | **Frontend must update** — show only sources with implementations |

> **Architecture gap:** Tables `integrations` and `integration_emails` (defined in Story 6.1) are not listed in `docs/architecture.md` Section 12 which only covers the 9 core tables. Add these 2 tables to the architecture.

> **Unreferenced frontend components:** `src/components/export/` contains 5 components (`export-add-to-modal.tsx`, `export-emails-page.tsx`, `export-reachinbox-login.tsx`, `export-where-to-modal.tsx`, `exports-empty-state.tsx`) for "export TO integration" functionality. These are not covered by any FR and appear to be post-MVP features. Stories added below for the relevant ones.

> **Status values update (Decision #1):** All `deliverable/undeliverable` references in the API contract overview section above should be read as `valid/invalid`. The full status enum is: `valid | invalid | unknown | risky | disposable | catch_all | role`.

---

# Frontend Integration Stories

## Story 6.5: Integration Connection UI (Generic)

As a frontend developer,
I want to wire the active verification connection UI to the backend API,
So that users can connect and disconnect an integration source.

**Depends on:** Story 1.8 (auth provider), Backend Story 6.1 deployed

**Acceptance Criteria:**

**Given** the deliverability page at `/home/active-verification`
**When** no connection exists
**Then** show "Connect Integration" button and empty state

**Given** the user clicks "Connect"
**When** the connection modal opens
**Then** the user selects a source and enters provider-specific credentials
**And** `POST /home/active-verification/connect` is called with `{ source, credentials }`
**And** on success, the page refreshes to show connection status and synced email count

**Given** the user clicks "Disconnect"
**When** they confirm in a dialog
**Then** `DELETE /home/active-verification/disconnect` is called
**And** the page resets to the unconnected state

**Given** the user configures a schedule
**When** they select an interval and toggle active
**Then** `PUT /home/active-verification/schedule` is called
**And** the schedule section updates to show next run time

**Edge Cases:**
- 401 (invalid credentials) → show error in modal, allow retry
- 503 (provider down) → show service error message
- 409 (already connected) → show current connection, offer disconnect first
- Schedule without connection → 400, prompt to connect first

**Frontend Reality Notes (verified against source):**
- `reachinbox-login-modal.tsx` collects email + password with **hardcoded defaults** (`"aman@outbox.vc"`, `"password123456"` at lines 17-18) — must be replaced with generic provider-specific credential form
- `connect-source-modal.tsx` shows **8 hardcoded integration sources** — should show only sources with `IntegrationProvider` implementations, or be generic
- Frontend assumes **multiple integrations** (3 mock items, "New Active Verification" button) but epic says single connection (MVP) — frontend needs to reflect single-connection model
- Detail page lives on **sub-route `[integrationId]`** with 5 tabs (Overview, Email, Cleanup, Settings, Schedule) — epic doesn't describe this route structure
- Schedule tab is a **"coming soon" placeholder** — no UI built
- Overview uses a **custom SVG donut chart**, not Recharts
- Email tab columns are **Email, Reason, Score, State** — need changing to email, status, lastVerified, listSource
- Filter buttons exist but `activeFilter` state doesn't actually filter the email list

**Technical Context:**
- Existing components: `src/components/active-verification/connect-source-modal.tsx`, `reachinbox-login-modal.tsx` (rename/refactor to generic), `integration-card.tsx`
- Existing page: `src/app/(dashboard)/home/active-verification/page.tsx`
- Existing detail page: `src/app/(dashboard)/home/active-verification/[integrationId]/page.tsx`
- TanStack Query: `useQuery(['active-verification'], fetchOverview)`, mutations for connect/disconnect/schedule

---

## Story 6.6: Active Verification Dashboard & Email List Integration

As a frontend developer,
I want to wire the active verification dashboard and email list to backend APIs,
So that users see aggregated results and can search/filter emails.

**Depends on:** Story 6.5, Backend Stories 6.2–6.4 deployed

**Acceptance Criteria:**

**Given** the active verification overview tab
**When** verification data exists
**Then** `GET /home/active-verification` data drives:
- Total monitored count
- Donut chart (Recharts) with deliverable/risky/undeliverable segments
- Per-list breakdown table
- "Last verified X hours ago" freshness indicator
- Status changes since last cycle

**Given** the emails tab at `/home/active-verification` (or sub-route)
**When** it loads
**Then** `GET /home/active-verification/emails` is called with cursor pagination
**And** emails are displayed in a table: email, status badge, last verified, source

**Given** filter and search controls
**When** the user selects statuses or types a search query
**Then** the query refetches with updated params
**And** results update in the table

**Given** the export button
**When** the user clicks it
**Then** `GET /home/active-verification/emails/export` is called with current filters
**And** the CSV downloads

**Edge Cases:**
- No cycles completed → "Awaiting first verification" empty state
- Large email lists → infinite scroll with cursor pagination
- Status filter pills → multi-select OR logic

**Technical Context:**
- Existing components: `src/components/active-verification/integration-row.tsx`
- Overview uses custom SVG donut chart (not Recharts) — keep or replace with Recharts for consistency
- TanStack Query: `useInfiniteQuery(['av-emails', filters], fetchEmails)` for cursor pagination
- Export: similar pattern to credit history export (Story 5.8)

---

## Story 6.7: Export-to-Integration Flow

As a frontend developer,
I want to wire the export-to-integration components to backend APIs,
So that users can export verified email lists to external tools.

**Depends on:** Story 6.5, Backend Story 6.4 deployed

**Acceptance Criteria:**

**Given** the bulk verify results or active verification email list
**When** the user clicks "Export"
**Then** the export flow offers: Download CSV or Export to Integration
**And** "Download CSV" calls the appropriate export API endpoint
**And** "Export to Integration" opens the integration destination chooser

**Given** the integration destination chooser
**When** the user selects a destination (e.g., list or campaign)
**Then** the appropriate modal guides them through the export

**Edge Cases:**
- No integrations connected → show "Connect first" prompt
- Large exports → show progress indicator
- Export failures → toast error with retry option

**Technical Context:**
- Existing components: `src/components/export/export-where-to-modal.tsx`, `export-add-to-modal.tsx`, `exports-empty-state.tsx`, `export-emails-page.tsx`, `export-reachinbox-login.tsx`
- These components are post-MVP but already exist in the UI — wire them when integration backends are available
- For MVP: CSV download is the primary export path

---

## Story 6.8: Category Breakdown Cards

As a frontend developer,
I want to display sub-category breakdown cards on the active verification detail page,
So that users see granular distribution of Invalid/Risky/Unknown sub-categories.

**Depends on:** Story 6.6, Backend Story 6.3 deployed

**Acceptance Criteria:**

**Given** the active verification detail page overview tab
**When** verification data exists
**Then** category cards display sub-breakdowns (e.g., Invalid → bounce, mailbox full, etc.)

**Edge Cases:**
- Categories with zero count → still show card with "0"
- No API equivalent for sub-categories → derive from `attributes` or mark as post-MVP

**Technical Context:**
- Components exist in the frontend active verification detail page
- Sub-category data may need to be computed from individual email verification attributes
- If backend doesn't provide sub-category aggregation, this is post-MVP
