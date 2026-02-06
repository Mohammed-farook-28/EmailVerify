# Feature Specification: Deliverability (Active Verification)

**Feature Branch**: `006-active-verification`
**Created**: 2026-02-05
**Status**: Draft
**Input**: Epic 6: Deliverability - Users can connect external email tool integrations for continuous email list monitoring with scheduled re-verification, aggregated results, and email filtering/search capabilities.
**MVP Scope**: UI shell only — all frontend pages, empty states, modals, and tab navigation are built per Figma designs. All integrations are marked "Coming Soon." No backend integration logic, provider connections, scheduling, or verification cycles are implemented. Backend functionality will be added in a future iteration when a real provider integration is ready.

## Clarifications

### Session 2026-02-06

- Q: What does the Cleanup tab do (shown in Figma but absent from spec)? → A: Cleanup tab lets users select invalid/risky emails and remove them from the source integration (push changes back to the provider).
- Q: Should status terms use spec terms (valid/invalid) or Figma terms (deliverable/undeliverable), and should Score/Reason fields be added? → A: Use Figma terms (deliverable/undeliverable/risky/unknown) for UI display, mapped from internal verification engine terms. Add Score (0-100) and Reason fields to the data model.
- Q: How should ReachInbox credentials be handled (OAuth token vs stored password)? → A: Defer all provider integrations (including ReachInbox) — mark all as "Coming Soon." MVP scope is UI shell only (frontend pages, empty states, modals, tab navigation) with no backend integration logic. Backend integration will be a separate future feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Active Verification Empty State Page (Priority: P1)

As a user navigating to Active Verification for the first time, I want to see an inviting empty state that explains the feature and prompts me to connect an integration so that I understand the value and know how to get started.

**Why this priority**: The empty state is the entry point for all users. It must be built first as it's the default view when no integrations are connected (which is always the case in the UI-shell MVP).

**Independent Test**: Can be tested by navigating to `/home/active-verification` and verifying the empty state renders correctly with the correct icon, copy, and CTA button per Figma design.

**Acceptance Scenarios**:

1. **Given** I am an authenticated user, **When** I navigate to `/home/active-verification`, **Then** I see the empty state page with the refresh-sparkle icon, "Get Started with Active Verification" heading, description text, and a "Verify" CTA button.

2. **Given** I am on the empty state page, **When** I click the "Verify" CTA button, **Then** the "Connect with your data source" modal opens.

3. **Given** the sidebar is visible, **When** I look at the navigation, **Then** "Active Verification" appears as a distinct sidebar item (separate from Bulk Verify and Single Verify).

---

### User Story 2 - Connect Data Source Modal (Priority: P1)

As a user who clicked the "Verify" button or "+ New Active Verification," I want to see a modal displaying available integrations so that I can understand which email tools are supported and that more are coming soon.

**Why this priority**: The modal is the primary discovery interface for integrations. Even though all integrations are "Coming Soon" at MVP, the modal must render correctly to set user expectations.

**Independent Test**: Can be tested by opening the modal, verifying all 8 integration cards render with correct names/categories/logos, verifying all cards show "Coming Soon" badge, and verifying the search input and Connect button are present but disabled.

**Acceptance Scenarios**:

1. **Given** I click "Verify" from the empty state or "+ New Active Verification" from the dashboard, **When** the modal opens, **Then** I see "Connect with your data source" title, subtitle, a search input, and a grid of integration cards.

2. **Given** the modal is open, **When** I view the integration cards, **Then** I see all 8 integrations (Reachinbox, Smartlead, Instantly, Reply, Mailchimp, Make, Mixmax, Outreach) each showing their logo, name, category, and a "Coming Soon" badge.

3. **Given** all integrations are Coming Soon, **When** I view the modal, **Then** all integration cards appear with reduced opacity and the "Connect" button is disabled.

4. **Given** the modal is open, **When** I type in the search input, **Then** the integration cards filter to show only those matching the search term by name or category.

5. **Given** the modal is open, **When** I click the close button or click outside the modal, **Then** the modal closes and I return to the previous view.

---

### User Story 3 - Active Verification Sidebar Navigation (Priority: P1)

As a user, I want Active Verification to appear in the dashboard sidebar so that I can navigate to the feature from anywhere in the application.

**Why this priority**: Navigation is required for users to discover and access the feature.

**Independent Test**: Can be tested by verifying the sidebar item appears, is clickable, highlights when active, and navigates to `/home/active-verification`.

**Acceptance Scenarios**:

1. **Given** I am on any dashboard page, **When** I view the sidebar, **Then** I see "Active Verification" (or the equivalent label per Figma) as a navigation item with the correct icon.

2. **Given** I click "Active Verification" in the sidebar, **When** the page loads, **Then** I am navigated to `/home/active-verification` and the sidebar item is highlighted as active.

---

### Edge Cases

- **Modal search with no matches**: If the user searches for an integration not in the list, show an empty state within the modal (no cards visible)
- **Browser resize**: Integration card grid should reflow responsively within the modal
- **Rapid modal open/close**: No visual glitches or stale state when quickly toggling the modal

## Requirements *(mandatory)*

### Functional Requirements (MVP — UI Shell)

- **FR-001**: System MUST render an Active Verification empty state page at `/home/active-verification` matching the Figma design (refresh-sparkle icon, heading, description, "Verify" CTA)
- **FR-002**: System MUST display a "Connect with your data source" modal when the user clicks "Verify" or "+ New Active Verification"
- **FR-003**: System MUST display all 8 integration cards (Reachinbox, Smartlead, Instantly, Reply, Mailchimp, Make, Mixmax, Outreach) in the connect modal, all marked "Coming Soon"
- **FR-004**: System MUST support filtering integration cards by name/category via a search input in the modal
- **FR-005**: System MUST disable the "Connect" button in the modal when no selectable (non-Coming-Soon) integration exists
- **FR-006**: System MUST add "Active Verification" as a sidebar navigation item linking to `/home/active-verification`
- **FR-007**: System MUST apply the Active Verification color palette, typography, and component styles per Figma design system

### Functional Requirements (Deferred — Future Provider Integration)

The following requirements are documented for future implementation when a real provider integration is built:

- **FR-D01**: System MUST allow users to connect one external email tool integration by providing credentials
- **FR-D02**: System MUST validate integration credentials against the provider before establishing connection
- **FR-D03**: System MUST encrypt stored integration credentials at rest
- **FR-D04**: System MUST sync email lists from the connected integration and store them locally
- **FR-D05**: System MUST allow users to disconnect their integration, removing credentials while retaining historical verification data
- **FR-D06**: System MUST limit users to one integration connection
- **FR-D07**: System MUST allow users to configure verification schedules at 1-hour, 6-hour, 12-hour, or 24-hour intervals
- **FR-D08**: System MUST execute the first verification cycle immediately when a schedule is activated
- **FR-D09**: System MUST deduct 1 credit per email verified during scheduled cycles
- **FR-D10**: System MUST pause verification and notify users via email when credits are insufficient
- **FR-D11**: System MUST resume verification automatically when credits are added after a pause
- **FR-D12**: System MUST display aggregated verification results using display terms (deliverable/undeliverable/risky/unknown) mapped from internal engine terms. Include score (0-100) and reason codes.
- **FR-D13**: System MUST show status changes since the last verification cycle
- **FR-D14**: System MUST display per-list breakdown when multiple lists exist
- **FR-D15**: System MUST support filtering emails by display status and sub-category reason codes
- **FR-D16**: System MUST support searching emails by partial email address match
- **FR-D17**: System MUST use cursor-based pagination for email lists
- **FR-D18**: System MUST allow exporting filtered email results as CSV
- **FR-D19**: System MUST display connection status, last sync time, and next scheduled run time
- **FR-D20**: System MUST handle provider unavailability gracefully
- **FR-D21**: System MUST record verification cycle logs
- **FR-D22**: System MUST provide a Cleanup tab for selecting and removing invalid/risky emails from the source integration
- **FR-D23**: System MUST report cleanup results with success/failure counts and retry capability

### Key Entities (Deferred — No DB tables created at MVP)

These entities are documented for future implementation:

- **Integration**: Connection to an external email tool (id, user reference, source identifier, encrypted credentials, status, last sync timestamp)
- **IntegrationEmail**: Synced email (id, integration reference, email address, verification status, last verified timestamp, source list name, score 0-100, reason code). Display terms: deliverable/undeliverable/risky/unknown.
- **VerificationSchedule**: Re-verification schedule (interval, active status, next run time)
- **VerificationCycle**: Completed verification run (cycle id, integration reference, start/end time, total emails, status counts, credits consumed)
- **CleanupOperation**: Batch removal action (id, integration reference, emails selected/succeeded/failed, timestamp, status)

## Success Criteria *(mandatory)*

### Measurable Outcomes (MVP — UI Shell)

- **SC-001**: Empty state page renders correctly and matches Figma design on desktop viewports (1280px+)
- **SC-002**: Connect modal opens within 200ms of clicking the CTA button
- **SC-003**: Integration card search filters results as the user types (no perceptible delay)
- **SC-004**: Sidebar navigation item is visible and functional from all dashboard pages
- **SC-005**: All UI components use the correct Active Verification color palette and typography per Figma specs

### Measurable Outcomes (Deferred — Future)

- Users can connect an integration and see synced emails within 60 seconds for lists under 10,000
- Scheduled verification cycles complete within 30 minutes for 10,000-email lists
- Users can filter a 100,000-email list within 2 seconds
- CSV export of 50,000 emails completes within 30 seconds
- Dashboard reflects results with no more than 5-minute staleness
- Zero credential exposure in logs, responses, or error messages

## Assumptions

- MVP delivers frontend UI shell only; no backend API endpoints, database tables, or provider integration logic is created
- The Figma designs for Active Verification are the source of truth for UI implementation
- Shared components from Bulk Verify (progress bars, donut charts, email tables) can be reused when backend functionality is added later
- The sidebar navigation structure supports adding new items without architectural changes
- When a real provider integration is added in the future, it will use display terms (deliverable/undeliverable/risky/unknown) mapped from internal engine terms, with score (0-100) and reason code fields
