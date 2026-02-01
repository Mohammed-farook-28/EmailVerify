# Research: User Authentication & Profile Management

**Feature**: 001-user-auth | **Date**: 2026-01-31

## Status: Complete

No NEEDS CLARIFICATION items exist in the Technical Context. All technical decisions are resolved via the architecture document (`docs/architecture.md`) and the 13 product decisions from the epics process. This research document records those pre-resolved decisions for traceability.

---

## Decision 1: Session Management Strategy

**Decision**: Server-side sessions stored in PostgreSQL with httpOnly cookies.
**Rationale**: Architecture Section 7 specifies this approach. Server-side sessions allow instant revocation (DELETE FROM sessions), multi-device support, and avoid JWT token size/blacklist problems. httpOnly + Secure + SameSite=Strict cookies prevent XSS and CSRF token theft.
**Alternatives considered**:
- JWT tokens — Rejected: cannot revoke without blacklist, token bloat for multi-tenant, no server-side session invalidation
- NextAuth.js — Rejected: adds unnecessary abstraction when backend manages sessions directly via cookies

## Decision 2: Password Hashing

**Decision**: bcrypt with cost factor 12.
**Rationale**: Architecture Section 14 specifies bcrypt cost 12. Provides ~250ms hash time on modern hardware, sufficient for brute-force resistance while keeping sign-in latency acceptable.
**Alternatives considered**:
- Argon2id — Superior algorithm but bcrypt is specified in architecture and widely supported in Node.js ecosystem
- scrypt — Less adoption, bcrypt is the pragmatic choice given existing architecture decision

## Decision 3: Rate Limiting Implementation

**Decision**: Redis sliding window via Lua scripts with composite keys (IP + email where applicable).
**Rationale**: Architecture Section 2 and Section 14 specify Redis Lua sliding window. Atomic operations prevent race conditions. Composite keys prevent both per-IP and per-account abuse.
**Alternatives considered**:
- Token bucket — Less granular for auth endpoints where fixed windows matter
- In-memory rate limiting — Not distributed, fails in multi-instance deployment

## Decision 4: Email Service

**Decision**: Resend with React Email templates.
**Rationale**: Architecture technology stack decision. Modern API, TypeScript-native, React Email for component-based templates.
**Alternatives considered**:
- SendGrid — More complex API, less TypeScript-friendly
- Nodemailer + SMTP — Lower-level, requires SMTP server management

## Decision 5: Avatar Storage

**Decision**: DigitalOcean Spaces (S3-compatible) with server-side upload and resize via sharp.
**Rationale**: Architecture specifies DO Spaces. Server-side resize to consistent dimensions (200x200) before storage reduces CDN bandwidth and ensures uniform display.
**Alternatives considered**:
- Client-side resize — Inconsistent across browsers, can be bypassed
- Direct-to-S3 presigned upload — More complex, harder to enforce server-side validation and resize

## Decision 6: Google OAuth Library

**Decision**: passport-google-oauth20 (Passport.js strategy).
**Rationale**: Most widely adopted Google OAuth library for Node.js/Express. Handles Authorization Code flow, token exchange, and profile extraction. Architecture Section 7 specifies OAuth 2.0 Authorization Code flow.
**Alternatives considered**:
- Manual implementation with googleapis — More control but reinvents session/token handling
- openid-client — More spec-compliant but overkill for single-provider OAuth

## Decision 7: Frontend Auth State

**Decision**: TanStack Query with `useQuery(['user'], fetchProfile)` and 5-minute staleTime.
**Rationale**: Epic Story 1.8 specifies this approach. TanStack Query provides caching, background refetch, and cache invalidation. 5-minute staleTime reduces unnecessary profile fetches while keeping data reasonably fresh.
**Alternatives considered**:
- React Context only — No caching, requires manual refetch logic
- Zustand/Redux — Overkill for auth state when TanStack Query already manages server state

## Decision 8: CSRF Protection

**Decision**: Per-session CSRF token, validated on all POST/PUT/DELETE from web dashboard.
**Rationale**: Architecture Section 7 specifies per-session CSRF tokens. API key-authenticated requests are exempt (Bearer tokens, not cookies).
**Alternatives considered**:
- Double-submit cookie — Simpler but less secure than server-side token validation
- SameSite=Strict only — Insufficient for all browsers/scenarios

## Decision 9: Re-authentication for Google-Only Users

**Decision**: Fresh Google OAuth prompt (re-consent) for sensitive operations.
**Rationale**: Spec clarification session 2026-01-31. Google-only users have no password, so re-authentication uses a fresh OAuth flow. This matches patterns used by Google, GitHub, and similar platforms.
**Alternatives considered**:
- Require Google-only users to set a password first — Poor UX, adds friction
- Skip re-authentication for Google users — Security gap for sensitive operations
