# Epic 6: Active Verification (ReachInbox Integration)

## Epic Goal

Users can connect their ReachInbox account for continuous email list monitoring. Configure scheduled re-verification at 1h, 6h, 12h, or 24h intervals. View aggregated verification results across all connected data sources. Filter and search emails within active verification lists by status.

**FRs covered:** FR51, FR52, FR53, FR54
**Dependencies:** Epic 2 (verification engine, credit system), Epic 3 (credits for ongoing verification)

---

## Story 6.1: ReachInbox Account Connection

As a user,
I want to connect my ReachInbox account to EmailKit,
So that my email lists are synced for continuous verification.

**FRs:** FR51 | **NFRs:** NFR35

**Acceptance Criteria:**

**Given** a signed-in user on /home/active-verification
**When** they click "Connect ReachInbox"
**Then** an authentication flow is initiated (OAuth or credential-based login modal)
**And** upon successful authentication, the connection is established
**And** ReachInbox email lists are pulled into EmailKit

**Given** a successfully connected ReachInbox account
**When** the active verification dashboard loads
**Then** it shows: connected data source (ReachInbox), connection status, total emails synced, last sync time

**Given** a connected account
**When** the user wants to disconnect
**Then** they can remove the connection from the settings
**And** synced data is cleared (or retained based on policy — clarify)

**Edge Cases:**
- ReachInbox credentials invalid or expired → clear error message, prompt to reconnect
- ReachInbox API unavailable → show connection error, retry on next sync interval
- Credential storage → encrypted at rest, never displayed after initial connection
- Multiple ReachInbox accounts → one connection per user (MVP)

**Technical Context:**
- Integration: ReachInbox API (specific auth flow depends on ReachInbox's API documentation)
- Credential security: NFR35 — securely stored, graceful failure handling
- UI screens: `docs/figma/active-verification/spec.md` — Connection flow, data source overview
- Page spec: `docs/pages/03-bulk-verify.md` (active verification section, if combined) or dedicated page
- Endpoint: `POST /home/active-verification/connect`, `DELETE /home/active-verification/disconnect`

---

## Story 6.2: Scheduled Re-Verification

As a user with connected email lists,
I want to schedule automatic re-verification at regular intervals,
So that my lists stay clean without manual effort.

**FRs:** FR52 | **NFRs:** NFR3, NFR35

**Acceptance Criteria:**

**Given** a user with a connected ReachInbox account
**When** they configure a verification schedule
**Then** they can select from: 1h, 6h, 12h, or 24h intervals
**And** the schedule is saved and active immediately

**Given** a scheduled verification cycle triggers
**When** the system processes all emails in connected lists
**Then** every email is re-verified through the standard verification pipeline
**And** credits are deducted for each email verified (1 credit per email)
**And** updated status is recorded for every email
**And** a completion log is generated for the cycle

**Given** a completed verification cycle
**When** results are available
**Then** each email has an updated status (valid/invalid/unknown/risky/etc.)
**And** the completion log shows: total emails, results breakdown, credits consumed, duration

**Edge Cases:**
- Insufficient credits mid-cycle → pause verification, notify user, resume when credits added
- ReachInbox API down during sync → skip cycle, retry at next interval, log the failure
- Very large lists (100K+ emails) → same batching and fair queuing as bulk verify
- Schedule change while cycle is in progress → new schedule applies to next cycle
- Overlapping cycles (1h interval, job takes >1h) → skip next cycle, don't stack

**Technical Context:**
- Scheduler: cron-like job scheduling (BullMQ repeatable jobs or separate cron service)
- Same verification pipeline: BullMQ Pro queue with tenant groups (priority 10 — bulk)
- Credit deduction: same atomic Redis Lua as all other verifications
- UI screens: `docs/figma/active-verification/spec.md` — Schedule configuration
- Endpoint: `PUT /home/active-verification/schedule`

---

## Story 6.3: Aggregated Results Dashboard

As a user,
I want to see a summary of verification results across all connected lists,
So that I can assess the health of my email data at a glance.

**FRs:** FR53

**Acceptance Criteria:**

**Given** a signed-in user on /home/active-verification (overview tab)
**When** the dashboard loads
**Then** aggregated results are displayed across all connected data sources:
- Total emails monitored
- Donut chart: deliverable, risky, undeliverable breakdown
- Per-list breakdown showing list name, total emails, last verified, status distribution
- Trend: how many emails have changed status since last verification cycle

**Edge Cases:**
- No verification cycles completed yet → show "Awaiting first verification" state
- Single connected source → still show aggregated view (ready for future multi-source)
- Data freshness indicator → "Last verified: X hours ago"

**Technical Context:**
- Data: aggregated from verification_results filtered by active verification source
- UI screens: `docs/figma/active-verification/spec.md` — Overview tab with donut charts
- Charts: Recharts (consistent with dashboard in Epic 2)
- Endpoint: `GET /home/active-verification` (overview data)

---

## Story 6.4: Email Status Filtering & Search

As a user,
I want to filter and search verified emails within my active verification lists,
So that I can find specific contacts and take action on invalid emails.

**FRs:** FR54

**Acceptance Criteria:**

**Given** a signed-in user on /home/active-verification (emails tab)
**When** they view the email list
**Then** all synced emails are displayed with: email address, current status, last verified date, list source

**Given** the user wants to filter
**When** they select a status filter (valid, invalid, unknown, risky, disposable, catch-all, role)
**Then** only emails matching that status are shown

**Given** the user wants to search
**When** they type in the search box
**Then** emails are filtered by partial match on the email address

**Edge Cases:**
- Large email lists (100K+) → server-side pagination with cursor navigation
- Multiple statuses selected → OR filter (show any matching status)
- Status changed since last view → real-time or refresh-on-load
- Export filtered results → CSV download of current filter view

**Technical Context:**
- Table: verification_results filtered by active verification source and user_id
- UI screens: `docs/figma/active-verification/spec.md` — Email tab with filters
- Search: server-side LIKE/ILIKE query on email_checked
- Pagination: cursor-based for performance on large datasets
- Endpoint: `GET /home/active-verification/emails?status=invalid&search=example.com&cursor=X`
