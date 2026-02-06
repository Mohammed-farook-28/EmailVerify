# Quickstart: Active Verification (UI Shell)

**Feature**: 006-active-verification
**Date**: 2026-02-06

## Prerequisites

- Node.js 20+
- Frontend project set up (`frontend/` directory with Next.js 15+)
- Shared dashboard layout with sidebar already implemented

## What This Feature Adds

1. **Page**: `/home/active-verification` — empty state with "Get Started" content and "Verify" CTA
2. **Modal**: "Connect with your data source" — grid of 8 integration cards, all "Coming Soon"
3. **Sidebar entry**: "Active Verification" navigation item under Email Verification group

## Files to Create

```
frontend/src/app/home/active-verification/page.tsx
frontend/src/components/active-verification/empty-state.tsx
frontend/src/components/active-verification/connect-modal.tsx
frontend/src/components/active-verification/integration-card.tsx
frontend/src/components/active-verification/integration-search.tsx
frontend/src/data/integrations.ts
frontend/tests/components/active-verification/empty-state.test.tsx
frontend/tests/components/active-verification/connect-modal.test.tsx
frontend/tests/components/active-verification/integration-card.test.tsx
```

## Files to Modify

```
frontend/src/components/layout/sidebar.tsx  (or equivalent — add nav item)
```

## Icon Assets Required

Copy from `docs/figma/active-verification/icons/` to `frontend/public/icons/integrations/`:
- `reachinbox-logo.svg`
- `smartlead-logo.svg`
- `instantly-logo.svg`
- `reply-logo.svg`
- `mailchimp-logo.svg`
- `make-logo.svg`
- `mixmax-logo.svg`
- `outreach-logo.svg`
- `refresh-sparkle.svg` (empty state icon)

**Note**: If icon SVGs don't exist in the Figma directory, they will need to be created or sourced from integration brand assets.

## Implementation Order

1. Add sidebar navigation entry (unblocks manual testing of the route)
2. Create the `integrations.ts` static data file
3. Build `IntegrationCard` component (atomic, testable independently)
4. Build `IntegrationSearch` component
5. Build `ConnectModal` component (composes card + search)
6. Build `EmptyState` component
7. Build `page.tsx` (composes empty state + modal)
8. Write tests
9. Visual QA against Figma screenshots

## Verification

After implementation, verify against these acceptance criteria:

- [ ] Navigate to `/home/active-verification` → see empty state
- [ ] Click "Verify" CTA → modal opens
- [ ] Modal shows 8 integration cards, all with "Coming Soon" badge
- [ ] All cards have reduced opacity (0.5)
- [ ] "Connect" button is disabled
- [ ] Type in search → cards filter by name/category
- [ ] Search with no matches → no cards visible
- [ ] Close modal (X button or backdrop click) → returns to empty state
- [ ] Sidebar shows "Active Verification" item, highlighted when on the page
- [ ] Colors, typography, and spacing match Figma designs

## No Backend Changes

This feature requires zero backend modifications. No API endpoints, database migrations, or server-side logic.
