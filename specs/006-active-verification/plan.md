# Implementation Plan: Active Verification (UI Shell)

**Branch**: `006-active-verification` | **Date**: 2026-02-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-active-verification/spec.md`

## Summary

Build the Active Verification UI shell — a frontend-only feature consisting of an empty state page, a "Connect Data Source" modal with 8 integration cards (all marked "Coming Soon"), and a sidebar navigation entry. No backend endpoints, database tables, or provider integration logic. The feature is implemented as Next.js pages/components within the existing `frontend/` project, following the established Figma design system (dark theme, Manrope/Open Sans typography, green accent palette).

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 15+ (App Router), React 19+
**Primary Dependencies**: Next.js, React, Tailwind CSS (assumed from Figma design system), Radix UI or similar headless primitives for modal
**Storage**: N/A (no backend or database work)
**Testing**: Vitest + React Testing Library (unit/component), Playwright (optional E2E)
**Target Platform**: Web — desktop browsers (1280px+ per SC-001)
**Project Type**: Web application (frontend only for this feature)
**Performance Goals**: Modal opens within 200ms (SC-002), search filtering with no perceptible delay (SC-003)
**Constraints**: Must match Figma designs pixel-accurately; all 8 integration cards present; no functional integrations
**Scale/Scope**: 1 page, 1 modal, 1 sidebar item, ~8 components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is an empty template — no project-specific principles defined. No gates to evaluate. PASS.

**Post-Phase-1 re-check**: Still PASS — no principles to violate.

## Project Structure

### Documentation (this feature)

```text
specs/006-active-verification/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no DB entities)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (no API contracts — UI shell only)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── app/
│   │   └── home/
│   │       └── active-verification/
│   │           └── page.tsx                # Route: /home/active-verification
│   ├── components/
│   │   └── active-verification/
│   │       ├── empty-state.tsx             # Empty state with CTA
│   │       ├── connect-modal.tsx           # "Connect with your data source" modal
│   │       ├── integration-card.tsx        # Single integration card (available or coming soon)
│   │       └── integration-search.tsx      # Search input for filtering cards
│   ├── data/
│   │   └── integrations.ts                # Static integration metadata (name, category, logo, status)
│   └── ...
└── public/
    └── icons/
        ├── refresh-sparkle.svg              # Empty state icon
        └── integrations/
            └── (reachinbox.svg, smartlead.svg, etc.)
└── tests/
    └── components/
        └── active-verification/
            ├── empty-state.test.tsx
            ├── connect-modal.test.tsx
            └── integration-card.test.tsx
```

**Structure Decision**: Web application structure. Frontend-only changes within the existing `frontend/` directory. The `active-verification/` page uses the shared dashboard layout (sidebar + header) provided by the `app/home/layout.tsx` parent. No backend changes.

## Complexity Tracking

No constitution violations to justify.

## Component Architecture

### Page: `/home/active-verification` (page.tsx)

- Uses the shared `home` layout (sidebar + header already present)
- Renders `EmptyState` component as the sole content (MVP always shows empty state)
- Manages modal open/close state

### Component: `EmptyState`

- Refresh-sparkle icon (64px, orange-tinted background)
- "Get Started with Active Verification" heading (Manrope Bold 24px, #FFFFFF)
- Subtitle + description text (Manrope Medium 12px, #B3B3B3)
- "Verify" CTA button (green gradient, triggers modal open callback)

### Component: `ConnectModal`

- Modal overlay with `#343433` background, 12px border-radius, 683px width
- Title: "Connect with your data source" (Inter Semi Bold 24px)
- Subtitle with "Learn more about integrations" link
- `IntegrationSearch` input for filtering
- 3-column grid of `IntegrationCard` components
- "Connect" button (disabled — no selectable integrations)
- Close on X button or backdrop click

### Component: `IntegrationCard`

- Two variants: `available` (not used in MVP) and `coming-soon`
- Coming Soon: `#262624` bg, `#404034` border, 0.5 opacity, "Coming Soon" badge (#313E45 bg, #2BA7E4 text)
- Shows integration logo (32px), name (Inter Medium 14px), category (Manrope Medium 12px)

### Component: `IntegrationSearch`

- Text input with search icon
- Transparent bg, `#404034` border, 8px border-radius
- Filters the integration list by name or category (client-side, case-insensitive)

### Data: `integrations.ts`

Static array of 8 integration objects:

```typescript
interface Integration {
  id: string;
  name: string;
  category: string;
  logoSrc: string;
  status: 'available' | 'coming_soon';
}
```

All 8 entries have `status: 'coming_soon'` for MVP.

## Sidebar Integration

The shared sidebar component (assumed at `frontend/src/components/layout/sidebar.tsx` or similar) needs a new navigation entry:

- **Label**: "Active Verification" (or "Active Ver." if space-constrained per Figma)
- **Icon**: Refresh-sparkle icon
- **Route**: `/home/active-verification`
- **Group**: Under "Email Verification" alongside Quick Verify, Bulk Verify, History, API Keys

This is a single-line addition to the sidebar navigation configuration — not a new component.

## Design Tokens (Active Verification specific)

These tokens extend the existing design system:

| Token | Value | Usage |
|-------|-------|-------|
| `--av-modal-bg` | `#343433` | Connect modal background |
| `--av-card-bg` | `#262624` | Integration card background |
| `--av-card-border` | `#404034` | Default card border |
| `--av-card-selected-bg` | `#583A2D` | Selected integration (future) |
| `--av-card-selected-border` | `#1AFF4C` | Selected card border (future) |
| `--av-coming-soon-bg` | `#313E45` | Coming Soon badge bg |
| `--av-coming-soon-text` | `#2BA7E4` | Coming Soon badge text |
| `--av-empty-icon-bg` | `rgba(255,164,58,0.1)` | Empty state icon background |
