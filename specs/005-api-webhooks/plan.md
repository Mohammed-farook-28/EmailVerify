# Implementation Plan: Public API & Webhooks

**Branch**: `005-api-webhooks` | **Date**: 2026-02-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-api-webhooks/spec.md`

## Summary

Implement a public REST API for programmatic email verification (single, batch, bulk) with API key authentication, webhook notifications for events, and per-user rate limiting based on subscription tiers. The API extends the existing verification engine and billing system with external developer access.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+)
**Primary Dependencies**: Express, Drizzle ORM, BullMQ Pro, Redis 7+, Better Auth
**Storage**: PostgreSQL 16+ (api_keys, webhooks, webhook_deliveries), Redis (rate limiting, idempotency cache)
**Testing**: Vitest (unit), Supertest (integration)
**Target Platform**: Linux server (DigitalOcean DOKS)
**Project Type**: Web application (backend API + frontend dashboard)
**Performance Goals**: <200ms p95 for single verification, <30s for batch (100 emails), 2000 req/s global limit, tier-based user limits (Starter: 10/s → Titan: 100/s)
**Constraints**: Must integrate with existing auth system, billing/subscription system, and verification engine
**Scale/Scope**: 1000+ users, up to 10 API keys per user, up to 10 webhooks per user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Leverage existing patterns | ✅ PASS | Uses existing auth middleware, rate-limit middleware, credit service |
| BullMQ for async work | ✅ PASS | Bulk jobs already use BullMQ; webhook delivery will use same pattern |
| Redis for rate limiting | ✅ PASS | Existing sliding window rate limiter extended for API |
| PostgreSQL for durability | ✅ PASS | API keys, webhooks stored in PostgreSQL |
| Idempotency first | ✅ PASS | Idempotency-Key header with Redis TTL |
| Credit atomicity | ✅ PASS | Uses existing credit service with Lua scripts |

**No violations identified.** Proceeding with Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/005-api-webhooks/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── openapi.yaml     # Public API specification
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── db/
│   │   └── schema.ts          # Add: apiKey, webhook, webhookDelivery tables
│   ├── routes/
│   │   ├── api-v1/            # NEW: Public API routes
│   │   │   ├── verify.ts      # Single, batch, bulk verification
│   │   │   ├── credits.ts     # Credit balance endpoint
│   │   │   ├── webhooks.ts    # Webhook CRUD
│   │   │   ├── health.ts      # Public health check
│   │   │   └── index.ts       # Router aggregation
│   │   ├── dashboard/         # Existing internal routes
│   │   │   └── api-keys.ts    # NEW: API key management for web UI
│   │   ├── dashboard.ts       # Extended: Usage history endpoints for /home/usage
│   │   └── webhooks.ts        # Existing Stripe webhook handler (unchanged)
│   ├── middleware/
│   │   ├── api-key-auth.ts    # NEW: Bearer token authentication
│   │   ├── idempotency.ts     # NEW: Idempotency-Key handling
│   │   ├── rate-limit.ts      # Extended: tier-based API rate limiting
│   │   └── request-id.ts      # NEW: X-Request-ID generation
│   ├── services/
│   │   ├── api-key.ts         # NEW: Key generation, hashing, validation
│   │   ├── webhook.ts         # NEW: Webhook management and delivery
│   │   └── webhook-worker.ts  # NEW: BullMQ worker for webhook delivery
│   └── lib/
│       ├── hmac.ts            # NEW: HMAC-SHA256 signing
│       └── schemas.ts         # Extended: API request/response schemas
└── tests/
    ├── integration/
    │   └── api-v1/            # NEW: API integration tests
    └── unit/
        ├── api-key.test.ts    # NEW
        └── webhook.test.ts    # NEW

frontend/
└── src/
    └── app/(dashboard)/home/
        ├── api-keys/          # NEW: API key management UI
        └── webhooks/          # FUTURE: Not in scope for initial release
```

**Structure Decision**: Web application pattern. Public API routes namespaced under `/api/v1/`. Internal dashboard routes remain under `/home/*`. No changes to frontend structure required for P1/P2 stories; P3 (UI integration) adds `api-keys/` page.

## Complexity Tracking

> No constitution violations requiring justification.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Separate `/api/v1/` namespace | Yes | Clear separation between public API and internal dashboard routes |
| BullMQ for webhook delivery | Yes | Consistent with existing bulk verification; provides retry with backoff |
| Redis for idempotency | Yes | 24-hour TTL matches spec; fast lookup without DB load |
