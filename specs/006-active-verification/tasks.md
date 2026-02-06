# Tasks: Active Verification (UI Shell)

**Input**: Design documents from `/specs/006-active-verification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested in the feature specification. No test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `frontend/src/` for source, `frontend/public/` for static assets
- Assumes existing Next.js 15+ App Router project in `frontend/`
- Assumes shared dashboard layout exists at `frontend/src/app/home/layout.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Icon assets and static data needed by all user stories

- [ ] T001 Copy or create integration logo SVGs to `frontend/public/icons/integrations/` (reachinbox.svg, smartlead.svg, instantly.svg, reply.svg, mailchimp.svg, make.svg, mixmax.svg, outreach.svg). Source from `docs/figma/active-verification/icons/` if available, otherwise create placeholder SVGs.
- [ ] T002 Copy or create the refresh-sparkle icon SVG to `frontend/public/icons/refresh-sparkle.svg`. Source from `docs/figma/active-verification/icons/` if available.
- [ ] T003 [P] Create the static integrations data file with `Integration` type, `IntegrationStatus` type, `IntegrationCategory` type, and the `integrations` array containing all 8 entries (all `coming_soon`) in `frontend/src/data/integrations.ts` — per data-model.md specification.
- [ ] T003b [P] Register Active Verification design tokens in the Tailwind config (or project's CSS custom properties). Add the 8 AV-specific color tokens from plan.md "Design Tokens" section: `--av-modal-bg` (#343433), `--av-card-bg` (#262624), `--av-card-border` (#404034), `--av-card-selected-bg` (#583A2D), `--av-card-selected-border` (#1AFF4C), `--av-coming-soon-bg` (#313E45), `--av-coming-soon-text` (#2BA7E4), `--av-empty-icon-bg` (rgba(255,164,58,0.1)). Location: `frontend/tailwind.config.ts` (extend theme colors) or `frontend/src/app/globals.css` (CSS custom properties).

**Checkpoint**: All shared assets, data, and design tokens are ready. User story implementation can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational tasks needed — this feature has no backend, no DB, no auth changes. The existing Next.js project and shared dashboard layout serve as the foundation.

**⚠️ SKIPPED**: Proceed directly to user story phases after Phase 1.

---

## Phase 3: User Story 1 - Active Verification Empty State Page (Priority: P1) 🎯 MVP

**Goal**: Users navigating to `/home/active-verification` see an inviting empty state page with a refresh-sparkle icon, heading, description, and "Verify" CTA button that opens the connect modal.

**Independent Test**: Navigate to `/home/active-verification` → empty state renders with correct icon, "Get Started with Active Verification" heading, description text, and green "Verify" CTA button. Click "Verify" → modal opens. (Requires US2 modal for the click test, but the empty state itself is independently verifiable.)

### Implementation for User Story 1

- [ ] T004 [P] [US1] Create the `EmptyState` component in `frontend/src/components/active-verification/empty-state.tsx`. Must include: refresh-sparkle icon (64px with `rgba(255,164,58,0.1)` background), "Get Started with Active Verification" heading (Manrope Bold 24px, #FFFFFF), "Start Verifying Emails in Minutes!" subtitle (Manrope Bold 14px, #FFFFFF), description paragraph (Manrope Medium 12px, #B3B3B3, centered), and "Verify" CTA button (green gradient `#5ACE49` to `#229A3C`, Manrope SemiBold 11.8px, white text, 4px border-radius). The CTA button must accept an `onVerifyClick` callback prop.
- [ ] T005 [US1] Create the Active Verification page in `frontend/src/app/home/active-verification/page.tsx`. Must render the `EmptyState` component within the shared home layout. Manage `isModalOpen` state via `useState`. Pass `onVerifyClick` to `EmptyState` that sets `isModalOpen` to `true`. Render the `ConnectModal` (from US2) conditionally when `isModalOpen` is true, passing an `onClose` callback. Page should be a client component (`'use client'`).

**Checkpoint**: Empty state page renders at `/home/active-verification` with correct Figma styling. CTA button triggers modal open state (modal implementation follows in US2).

---

## Phase 4: User Story 2 - Connect Data Source Modal (Priority: P1)

**Goal**: Clicking "Verify" opens a modal displaying 8 integration cards (all "Coming Soon") with a search input for filtering. The "Connect" button is disabled. Users can close the modal via X button or backdrop click.

**Independent Test**: Open modal → see title "Connect with your data source", subtitle, search input, 8 integration cards with logos/names/categories/"Coming Soon" badges. All cards at 0.5 opacity. "Connect" button disabled. Type in search → cards filter. Click X or backdrop → modal closes.

### Implementation for User Story 2

- [ ] T006 [P] [US2] Create the `IntegrationCard` component in `frontend/src/components/active-verification/integration-card.tsx`. Accept an `Integration` object as prop. Render: integration logo (32px `<Image>`), name (Inter Medium 14px, #FFFFFF), category (Manrope Medium 12px, #B3B3B3). For `coming_soon` status: apply `#262624` background, `#404034` 1px border, 12px border-radius, 13px 16px padding, 180px width, 0.5 opacity, and absolute-positioned "Coming Soon" badge (Manrope SemiBold 11px, `#2BA7E4` text on `#313E45` background, 16px border-radius pill, positioned top: -11px). For `available` status (future): apply `#583A2D` background, `#1AFF4C` 1px border, full opacity, green checkmark instead of badge.
- [ ] T007 [P] [US2] Create the `IntegrationSearch` component in `frontend/src/components/active-verification/integration-search.tsx`. Render a text input with search icon (magnifying glass). Styling: transparent background, `#404034` 1px border, 8px border-radius, 34px height, 8px padding. Placeholder: "Search" (#A1A1A1, 10.185px). Accept `value` and `onChange` props for controlled input.
- [ ] T008 [US2] Create the `ConnectModal` component in `frontend/src/components/active-verification/connect-modal.tsx`. Use Radix Dialog (or project's modal primitive) for accessibility. Must include: modal overlay (dark backdrop), modal container (`#343433` background, 12px border-radius, 683px width, 32px padding, multi-layer box shadow per Figma), close X button (top-right), title "Connect with your data source" (Inter Semi Bold 24px, #CACACA), subtitle "Connect Verify Inbox to other tools that you use for Outreach." with "Learn more about integrations" link (Manrope Medium 14px, #98999C, link in `#1AFF4C`), divider line, "Discover integrations" section header (Manrope SemiBold 16px, #B6B6B6), `IntegrationSearch` component, 3-column grid of `IntegrationCard` components rendered from the filtered integrations list, and a "Connect" button (green gradient, disabled state with reduced opacity when no integration is selectable). Manage `searchQuery` state internally. Filter the `integrations` array by case-insensitive match on `name` or `category`. Accept `isOpen` and `onClose` props. Ensure rapid open/close toggling produces no visual glitches or stale search state — reset `searchQuery` to empty string on modal close.

**Checkpoint**: Modal opens with all 8 integration cards, search works, close works, rapid toggling is clean. Connect button is disabled. All styling matches Figma.

---

## Phase 5: User Story 3 - Active Verification Sidebar Navigation (Priority: P1)

**Goal**: "Active Verification" appears in the dashboard sidebar under the Email Verification group, links to `/home/active-verification`, and highlights when active.

**Independent Test**: From any `/home/*` page, sidebar shows "Active Verification" item. Click it → navigates to `/home/active-verification`. Sidebar item is highlighted when on that route.

### Implementation for User Story 3

- [ ] T009 [US3] Add "Active Verification" navigation entry to the sidebar configuration in `frontend/src/components/layout/sidebar.tsx` (or equivalent sidebar config file). Add under the "Email Verification" group alongside Quick Verify, Bulk Verify, History, API Keys. Use the refresh-sparkle icon (`/icons/refresh-sparkle.svg`), label "Active Verification", and route `/home/active-verification`. Ensure active state highlighting follows existing sidebar patterns.

**Checkpoint**: Sidebar shows the new item on all `/home/*` pages. Clicking it navigates correctly. Active state is highlighted.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Visual QA and edge case handling across all user stories

- [ ] T010 [P] Visual QA: Compare the empty state page against `docs/figma/active-verification/screenshots/01-empty-state.png` — verify icon, heading, subtitle, description text, and CTA button match Figma pixel-accurately on a 1280px+ viewport.
- [ ] T011 [P] Visual QA: Compare the connect modal against `docs/figma/active-verification/screenshots/02-connect-data-source.png` — verify title, subtitle, search input, integration card grid (layout, spacing, badges, opacity), and Connect button match Figma.
- [ ] T012 Handle edge case: modal search with no matches — when all cards are filtered out, display an appropriate empty state within the modal (e.g., "No integrations found" message) in `frontend/src/components/active-verification/connect-modal.tsx`.
- [ ] T013 Handle edge case: modal responsive behavior — ensure the 3-column integration card grid reflows gracefully if the modal is constrained (e.g., on narrower viewports), in `frontend/src/components/active-verification/connect-modal.tsx`.
- [ ] T014 Run quickstart.md verification checklist — confirm all 10 acceptance criteria from `specs/006-active-verification/quickstart.md` pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 3)**: Depends on T001 (icons) and T002 (refresh-sparkle icon)
- **US2 (Phase 4)**: Depends on T001 (icons) and T003 (integrations data). T008 depends on T006 and T007 (composes them).
- **US3 (Phase 5)**: Depends on T002 (refresh-sparkle icon for sidebar). Independent of US1 and US2.
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 1. T005 (page) references the ConnectModal from US2, but can render with a null/placeholder modal while US2 is in progress.
- **User Story 2 (P1)**: Depends on Phase 1. Fully independent of US1 and US3 — the modal is a standalone component.
- **User Story 3 (P1)**: Depends on Phase 1 (icon only). Fully independent of US1 and US2 — sidebar is an existing component that just needs a config entry.

### Within Each User Story

- T006 and T007 (IntegrationCard + IntegrationSearch) before T008 (ConnectModal) — the modal composes them
- T004 (EmptyState) before T005 (page) — the page renders the empty state
- All other tasks within a story are sequential

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel. T003 can run in parallel with T001/T002.
- **Phase 3 + Phase 4 + Phase 5**: All three user stories can be worked on in parallel after Phase 1, since they produce different files with no cross-dependencies (except T005 which imports ConnectModal — can use a null placeholder initially).
- **Within US2**: T006 (IntegrationCard) and T007 (IntegrationSearch) can run in parallel.
- **Phase 6**: T010 and T011 (visual QA) can run in parallel.

---

## Parallel Example: User Story 2

```bash
# Launch atomic components in parallel:
Task: "Create IntegrationCard in frontend/src/components/active-verification/integration-card.tsx"
Task: "Create IntegrationSearch in frontend/src/components/active-verification/integration-search.tsx"

# Then compose them (sequential):
Task: "Create ConnectModal in frontend/src/components/active-verification/connect-modal.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 + 3 Together)

All three user stories are P1 and together form the minimum viable feature:

1. Complete Phase 1: Setup (icons + data) — ~15 min
2. Complete Phase 3: US1 (empty state page) — ~30 min
3. Complete Phase 4: US2 (connect modal) — ~45 min
4. Complete Phase 5: US3 (sidebar nav) — ~10 min
5. Complete Phase 6: Polish (visual QA + edge cases) — ~20 min
6. **VALIDATE**: Run quickstart.md checklist

### Recommended Single-Developer Order

Since all stories are P1 and this is a small feature:

1. T001, T002, T003 (Setup — all parallelizable)
2. T009 (Sidebar nav — quick win, enables manual route testing)
3. T003 already done → T006, T007 (atomic components — parallelizable)
4. T008 (ConnectModal — composes T006 + T007)
5. T004 (EmptyState)
6. T005 (Page — composes EmptyState + ConnectModal)
7. T010–T014 (Polish)

---

## Notes

- No backend changes, database migrations, or API endpoints in this feature
- All integration cards are "Coming Soon" — no functional integrations at MVP
- Figma screenshots in `docs/figma/active-verification/screenshots/` are the visual source of truth
- Design tokens are documented in `plan.md` under "Design Tokens" section
- If icon SVGs don't exist in the Figma directory, create minimal placeholder SVGs with the integration name as text
