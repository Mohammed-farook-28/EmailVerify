# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Interaction Rules

1. **Ask, Don't Assume** — Use AskUserQuestion tool for ANY confusion, doubt, decision point, or need for clarity. Never guess. Never assume. Always ask first.

2. **Think Simple** — Don't overcomplicate. Don't oversimplify. Find the honest middle ground. Be reliable and responsible in every recommendation.

3. **No AI Co-Author Tags** — When committing to git, do NOT include "Co-Authored-By: Claude" or any Anthropic attribution in commit messages.

4. **Maximize AskUserQuestion Usage** — Use the AskUserQuestion tool proactively and liberally, not just when blocked. Ask to confirm direction, validate assumptions, and clarify ambiguity before proceeding.

## Project Overview

EmailKit is a multi-tenant email verification SaaS platform. It proxies a **single upstream API key** to 1000+ users, managing fair queuing, credit accounting, and resilience. This is based on an existing EmailVerify platform but is **not a 1:1 replica** — modifications and improvements may be made.

**Current status**: Backend implementation in progress. Features 001–005 are implemented. Frontend exists in a separate repo. Smoke tests (22 tests across 6 files) are in place.

## Repository Layout

- `docs/architecture.md` — Full system architecture (5-layer defense, DB schema, API design, scaling)
- `docs/pages/*.md` — 11 UI page specifications (landing, dashboard, quick-verify, bulk-verify, api-keys, usage, billing, profile, history, auth, api-reference)
- `docs/AUDIT-FINDINGS.md` — UI/UX audit with ASCII diagrams
- `docs/figma/` — Figma design specs (60 pages across 8 sections, each with `spec.md` and `screenshots/`). Start from `docs/figma/index.md`
- `specs/` — Feature specifications (001-user-auth through 006-active-verification, all have spec.md)
- `backend/` — Express + TypeScript backend (see Backend Structure below)
- `.specify/` — Spec-driven development framework (templates in `.specify/templates/`, helper scripts in `.specify/scripts/bash/`)
- `.specify/memory/constitution.md` — Project constitution template
- `_bmad/` — BMAD product management/development methodology framework (gitignored)

## Backend Structure

```
backend/src/
├── app.ts / server.ts          — Express app setup & entry point
├── config/                     — env, database, redis, stripe, logger (Pino), swagger
├── middleware/                  — auth, api-key-auth, rate-limit, idempotency, csrf, sse, error-handler, validate
├── routes/                     — health, profile, user, verification, billing, bulk, webhooks
│   ├── api-v1/                 — Public API: verify, credits, webhooks, health
│   └── dashboard/              — API keys, usage, webhooks management
├── services/                   — 26 service files (verification, bulk, upstream-client, credit, billing, stripe, subscription, queue, circuit-breaker, webhook, api-key, user, etc.)
├── workers/                    — 9 workers (verification, bulk, reconciliation, subscription-renewal, api-key-cleanup, api-key-expiry, retention-cleanup, result-expiry-notify, dlq-handler)
├── db/                         — Drizzle ORM schema + connection pool
├── types/                      — TypeScript type definitions
├── models/                     — Data models (user, session, credit-event, billing-info, verification-code)
├── lib/                        — Utilities (auth/Better Auth, crypto, errors, hmac, metrics/Prometheus, schemas/Zod, serializers)
└── mock-upstream-api.ts        — Mock upstream API for testing
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 15+ (App Router) + React 19+ + TypeScript + Tailwind CSS |
| Backend | Node.js 20+ + TypeScript 5.7 + Express 4.21 |
| Database | PostgreSQL 16+ (Drizzle ORM 0.45) |
| Queue | BullMQ 5.67 (Redis 7+) |
| Rate Limiting | Redis Lua scripts (sliding window) |
| Circuit Breaker | Opossum 9.0 |
| HTTP Client | Undici 7.19 (connection pooling) |
| Auth | Better Auth 1.4 (OAuth/session) |
| Payments | Stripe SDK 20.x (PaymentProvider abstraction for future gateways) |
| Real-time | Server-Sent Events (SSE) |
| Monitoring | Prometheus (prom-client 15.1) + OpenTelemetry |
| Logging | Pino 10.3 |
| Validation | Zod 3.24 |
| Testing | Vitest 2.1 + Supertest 7.0 |
| File Parsing | csv-parse, csv-stringify, xlsx |
| Storage | AWS S3 SDK (DigitalOcean Spaces) |

## Architecture (5-Layer Defense)

All requests flow through these layers in order:

1. **API Gateway** — Auth, per-user rate limits (tiered Starter→Titan), credit check (atomic Redis Lua), load shedding
2. **Fair Queue** — BullMQ Pro Groups for round-robin across tenants; single-verify jobs get priority over bulk batches
3. **Worker Pool** — 10+ workers × 50 concurrent jobs; global token bucket (1,000 tokens/sec) controls upstream call rate; autoscales 2–50 workers
4. **Circuit Breaker** — Opens at 50% failure rate over last 100 calls; 30s wait; half-open probes with 5 test calls; exponential backoff with jitter
5. **Upstream Proxy** — undici pool (max 200 connections); 3s connect / 10s read / 15s total timeouts; idempotency keys in Redis (1hr TTL)

**Credit System**: Dual-layer — Redis for speed (atomic Lua check-and-deduct), PostgreSQL for durability (credit_events ledger). Reconciliation job runs every 5 minutes.

## Spec-Driven Development Workflow

Features are developed through the `.specify/` framework:

1. **Phase 0** (Research): Create git branch `###-feature`
2. **Phase 1** (Design): Write spec.md, plan.md, data-model.md using templates in `.specify/templates/`
3. **Phase 2** (Task breakdown): Generate tasks.md, run consistency analysis
4. **Phase 3+**: Implement user stories by priority (P1, P2, P3)

Helper scripts in `.specify/scripts/bash/`:
- `check-prerequisites.sh` — Validate prerequisites and locate feature directory (used by all slash commands)
- `setup-plan.sh` — Create implementation plan from template
- `create-new-feature.sh` — Generate feature directory structure
- `update-agent-context.sh` — Update context for agents

## Quality Gates

Before merge: all unit tests pass, integration tests cover API endpoints, no accuracy regression, no critical/high security vulns, performance benchmarks within 10%.

Before release: load test at 10x peak, staging verification with real emails, rollback plan documented.

## API Surface

**Public API** (Bearer token auth via `ek_` prefixed API key):
- `POST /api/v1/verify` — Single email
- `POST /api/v1/verify/bulk` — Bulk (CSV/JSON)
- `GET /api/v1/verify/bulk/:jobId` — Job status
- `GET /api/v1/verify/bulk/:jobId/results` — Download results
- `GET /api/v1/credits` — Balance
- `POST /api/v1/webhooks` — Create webhook
- `GET /api/v1/webhooks` — List webhooks
- `DELETE /api/v1/webhooks/:id` — Delete webhook

**Internal API** (session cookie auth):
- `/auth/*` — Google OAuth
- `/home/*` — Quick-verify, bulk-verify, api-keys, credit-history, billing, profile, active-verification

**Billing API** (session cookie auth):
- `POST /api/billing/checkout/one-time` — Create one-time purchase checkout
- `POST /api/billing/checkout/subscription` — Create subscription checkout
- `GET /api/billing/checkout/status/:sessionId` — Poll checkout status
- `GET /api/billing/info` — Get balance and subscription info
- `GET /api/billing/transactions` — Get transaction history (paginated)
- `GET /api/billing/transactions/export` — Export transactions as CSV
- `POST /api/billing/subscription/change` — Upgrade/downgrade subscription
- `POST /api/billing/subscription/cancel` — Cancel subscription
- `POST /api/billing/subscription/reactivate` — Reactivate subscription
- `GET /api/billing/packages` — List credit packages (public)
- `GET /api/billing/plans` — List subscription plans (public)
- `POST /api/billing/webhook` — Stripe webhook endpoint (Stripe only)

## Key Design Decisions

- **BullMQ Pro** over SQS/RabbitMQ/Kafka: TypeScript-native, built-in multi-tenant groups, no extra infra beyond Redis
- **Redis Lua sliding window** for rate limiting: atomic, distributed, smooth per-user fairness
- **Redis + PostgreSQL hybrid** for credits: speed on the hot path, ACID durability for audit
- **SSE over WebSockets** for real-time: simpler, auto-reconnect, sufficient for progress updates
- **Redis config**: `maxmemory-policy: noeviction`, `appendonly: yes`, `removeOnComplete: true` on all jobs — BullMQ breaks without these
- **Stripe** for payments: Supports one-time purchases (9 packages: 1K-1M credits) and subscriptions (5 tiers × 2 billing cycles = 10 plans)
- **PaymentProvider abstraction**: Interface layer allows future integration of Razorpay or other payment gateways
- **Idempotency-first**: All credit operations and webhook events use unique idempotency keys to prevent duplicates
- **Subscription credits expire**: Subscription credits expire at period end, one-time purchase credits never expire

## Dashboard Routes

| Route | Page |
|-------|------|
| `/home` | Redirects to `/home/quick-verify` (no dashboard page) |
| `/home/quick-verify` | Single email verification |
| `/home/bulk-verify` | Bulk verification (upload/paste) |
| `/home/history` | Bulk job history |
| `/home/api-keys` | API key management |
| `/home/credit-history` | Credit transaction history |
| `/home/billing` | Credits and subscriptions |
| `/home/profile` | User settings |
| `/home/active-verification` | Deliverability (active verification) |
| `/auth/sign-in` | Sign in |
| `/auth/sign-up` | Sign up |
| `/auth/password-reset` | Password reset |

## Implemented Features

| Feature | Status | Key Components |
|---------|--------|----------------|
| 001-user-auth | Implemented | Better Auth, Google OAuth, sessions, profile, avatar upload |
| 002-verification-engine | Implemented | Single email verify, upstream proxy, circuit breaker, queue workers |
| 003-billing | Implemented | Stripe checkout (one-time + subscriptions), webhooks, credit system |
| 004-bulk-verification | Implemented | CSV/JSON upload, bulk workers, job tracking, result storage |
| 005-api-webhooks | Implemented | Public API v1, API key management, webhook delivery system |
| 006-active-verification | Spec only | Frontend-only feature (no backend work) |

## NPM Scripts (backend/)

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm run workers` | Verification job processor |
| `npm run workers:bulk` | Bulk job processor |
| `npm run workers:reconcile` | Credit reconciliation (5min) |
| `npm run mock:upstream` | Mock upstream API server |
| `npm run db:generate` | Generate migrations from schema |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm test` | Run all tests |

## Current Branch Work

Branch `update-ui-backend` — Adding upstream job ID tracking to bulk verification:
- New migration: `0004_add_upstream_job_id.sql`
- Modified: schema, billing routes, bulk-verification service, upstream-client, bulk types, bulk-worker
