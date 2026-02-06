# Research: Active Verification (UI Shell)

**Feature**: 006-active-verification
**Date**: 2026-02-06

## Overview

This is a UI-shell-only feature with no backend integration. Research scope is limited to frontend implementation patterns.

## Decision 1: Modal Implementation Approach

**Decision**: Use a headless modal primitive (Radix Dialog or equivalent) with custom styling per Figma specs.

**Rationale**: Headless primitives handle accessibility (focus trapping, ESC to close, aria attributes) correctly out of the box, while allowing full control over styling to match the dark-themed Figma design. The Figma modal has specific dimensions (683px width), shadows, and border styles that would fight against opinionated component libraries.

**Alternatives considered**:
- **Custom modal from scratch**: Risks accessibility issues (focus trapping, screen reader support). Rejected.
- **Material UI / Chakra modal**: Heavily styled; would require extensive overrides to match dark theme. Rejected.
- **shadcn/ui Dialog**: Good option if the project uses shadcn. Built on Radix under the hood. Acceptable alternative.

## Decision 2: Integration Card Data Source

**Decision**: Use a static TypeScript array (`integrations.ts`) with hardcoded integration metadata.

**Rationale**: All 8 integrations are "Coming Soon" — there is no dynamic data, no API to call, no database to query. A static array is the simplest correct solution. When real integrations are added in the future, this can be replaced with an API call without changing the component interface.

**Alternatives considered**:
- **Fetch from backend API**: No endpoint exists; creating one for static data is overengineering. Rejected.
- **JSON file**: Works but TypeScript object gives type safety and IDE support. Rejected.
- **CMS/config service**: Extreme overengineering for 8 static cards. Rejected.

## Decision 3: Search Implementation

**Decision**: Client-side filtering with `Array.filter()` on the static integrations array, debounced at 150ms.

**Rationale**: With only 8 items, client-side filtering is instant. No need for server-side search, fuzzy matching libraries, or complex search logic. A simple case-insensitive `includes()` check on name and category fields is sufficient.

**Alternatives considered**:
- **No search at all**: The Figma design explicitly includes a search input, so it must be functional. Rejected.
- **Fuse.js fuzzy search**: Overkill for 8 items. Rejected.

## Decision 4: Icon Assets

**Decision**: Use SVG icons from `docs/figma/active-verification/icons/` as React components or `<Image>` elements.

**Rationale**: The Figma spec references specific icons (refresh-sparkle, integration logos). These should be extracted from the Figma assets directory and placed in the frontend assets folder. SVG format allows color manipulation and crisp rendering at any size.

**Alternatives considered**:
- **Icon library (Lucide, Heroicons)**: Won't have the specific integration logos (Reachinbox, Smartlead, etc.). Can supplement for generic icons. Partially used.
- **PNG/WebP**: Loses scalability. Rejected for icons.

## Decision 5: Styling Approach

**Decision**: Use Tailwind CSS utility classes with CSS custom properties for Active Verification design tokens.

**Rationale**: Aligns with the planned tech stack (Next.js + Tailwind is the dominant pattern). Custom properties for AV-specific tokens allow easy theming and future modification without touching component code. The Figma spec provides exact hex values, font sizes, and spacing that map well to Tailwind utilities.

**Alternatives considered**:
- **CSS Modules**: Viable but less consistent if the rest of the project uses Tailwind. Rejected unless project convention differs.
- **styled-components / Emotion**: Runtime CSS-in-JS adds bundle size for no benefit in this context. Rejected.

## No Unresolved Items

All technical decisions are resolved. No NEEDS CLARIFICATION items remain. The UI shell has no external dependencies, no backend integration, and no data persistence requirements.
