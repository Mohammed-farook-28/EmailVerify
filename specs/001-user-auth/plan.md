# Implementation Plan: User Authentication & Profile Management

**Branch**: `001-user-auth` | **Date**: 2026-01-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-user-auth/spec.md`

## Summary

Build the complete authentication and profile management system for EmailKit. This includes email/password registration with 6-digit email verification, Google OAuth 2.0 sign-up/sign-in with account linking, session management (server-side PostgreSQL sessions with httpOnly cookies), password reset, profile CRUD (name, email, password, avatar, language, billing info, data retention), account deletion with 30-day GDPR grace period, data export, and frontend route protection. The backend uses Node.js/Express with PostgreSQL and Redis; the frontend uses Next.js with TanStack Query for auth state.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ for backend, Next.js 15+ for frontend)
**Primary Dependencies**:
- Backend: Express, @node-rs/bcrypt (cost 12), Resend (email), sharp (image resize), passport-google-oauth20, crypto (session tokens), zod (validation)
- Frontend: Next.js App Router, TanStack Query, React Hook Form, zod + @hookform/resolvers, sonner (toasts)
**Storage**: PostgreSQL 16+ (users, sessions, credit_events tables), Redis 7+ (rate limiting, credit cache), DigitalOcean Spaces (avatars)
**Testing**: vitest (unit + integration), supertest (API), Playwright (e2e)
**Target Platform**: Linux server (backend), Web browser (frontend)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: 1,000 concurrent authenticated users, sign-in < 500ms, route redirects < 500ms
**Constraints**: Session tokens 256-bit, bcrypt cost 12, 30-day session expiry, rate limits per architecture Section 14
**Scale/Scope**: 1,000+ users, 14 API endpoints, 8 frontend pages, 4 database tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file is a blank template (not yet ratified). No specific gates to enforce. Proceeding with architecture.md as the authoritative technical reference.

**Post-Phase 1 re-check**: N/A — no constitution gates defined.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-auth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
│   ├── auth.yaml        # Authentication endpoints
│   └── profile.yaml     # Profile management endpoints
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/          # Environment, database, Redis, Resend config
│   ├── middleware/       # Auth, rate-limit, CSRF, error-handler, validation
│   ├── routes/          # Express route definitions (auth/, profile/)
│   ├── services/        # Business logic (auth, user, session, email, avatar)
│   ├── models/          # Database query functions (users, sessions, credit-events)
│   ├── lib/             # Shared utilities (crypto, validation schemas, errors)
│   └── app.ts           # Express app setup
├── migrations/          # PostgreSQL migrations (users, sessions, credit_events)
├── tests/
│   ├── unit/            # Service + model unit tests
│   ├── integration/     # API endpoint tests (supertest)
│   └── fixtures/        # Test data factories
├── package.json
└── tsconfig.json

frontend/  (existing repo: EmailVerify-Frontend)
├── src/
│   ├── app/
│   │   ├── (auth)/auth/          # Sign-in, sign-up, verify-email, password-reset, callback
│   │   └── (dashboard)/home/     # Protected dashboard routes
│   ├── components/
│   │   ├── layout/               # Sidebar, header, logo (existing)
│   │   ├── settings/             # Profile forms (existing shells)
│   │   └── modals/               # Delete account modal (existing shell)
│   ├── lib/
│   │   ├── api.ts                # NEW: Base fetch wrapper with auth
│   │   ├── auth-provider.tsx     # NEW: Auth context + TanStack Query
│   │   ├── types/index.ts        # Existing, already updated
│   │   ├── validations/auth.ts   # Existing Zod schemas
│   │   └── data/mock.ts          # To be replaced with API calls
│   └── middleware.ts              # NEW: Next.js route protection
└── tests/
    └── e2e/                       # Playwright auth flow tests
```

**Structure Decision**: Web application with separate backend and frontend repositories. Backend is new (to be created in this epic). Frontend exists at `/Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/` with UI shells already built — needs API wiring.

## Complexity Tracking

No constitution violations to justify.
