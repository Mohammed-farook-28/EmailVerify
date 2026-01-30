# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EmailVerify is a multi-tenant email verification SaaS platform. It proxies a **single upstream API key** to 1000+ users, managing fair queuing, credit accounting, and resilience. The project is currently in the **specification phase** — architecture and UI specs are complete, but no source code has been written yet.

## Project Status

No build, test, or lint commands exist yet. The repository contains only documentation and specifications:

- `docs/architecture.md` — Full system architecture (5-layer defense pattern, database schema, API design, scaling projections)
- `docs/pages/*.md` — UI page specifications (11 files):
  - `00-landing-page.md` — Public landing page, nav dropdowns, footer, 16 languages
  - `01-dashboard.md` — Stats cards, charts, sidebar navigation
  - `02-quick-verify.md` — Single email verification form and results
  - `03-bulk-verify.md` — File upload and copy/paste bulk verification
  - `04-api-keys.md` — API key management (format: `sk_` prefix)
  - `05-usage.md` — Verification history with filters and export
  - `06-billing.md` — One-time purchase and subscription plans (Stripe)
  - `07-profile.md` — User settings, language, password, delete account
  - `08-history.md` — Bulk job history (file uploads only)
  - `09-auth-pages.md` — Sign in, sign up, password reset (Google OAuth)
  - `10-api-reference.md` — Full API documentation (endpoints, webhooks, SDKs)
- `docs/AUDIT-FINDINGS.md` — Verified UI/UX audit with ASCII diagrams and all URLs
- `docs/figma/` — Figma design specs organized by feature:
  - `auth/spec.md` — Auth pages design system, colors, typography
  - `auth/screenshots/` — Sign-in, sign-up, email verification PNGs
  - `auth/icons/` — Google OAuth icon, input icons (SVGs)
- `.specify/` — Spec-driven development framework with templates and automation scripts
- `.specify/memory/constitution.md` — Project constitution with non-negotiable principles
- `specs/` — Feature specifications (currently has a placeholder for user-auth)

## Planned Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js + TypeScript |
| Backend | Node.js + TypeScript + Express/Fastify |
| Database | PostgreSQL 16+ |
| Queue | BullMQ Pro (Redis 7+, dedicated instance) |
| Rate Limiting | Redis Lua scripts (sliding window) |
| Circuit Breaker | opossum |
| HTTP Client | undici (connection pooling) |
| Auth | Google OAuth 2.0 |
| Payments | Stripe |
| Real-time | Server-Sent Events (SSE) |
| Monitoring | Prometheus + Grafana |

## Architecture (5-Layer Defense)

All requests flow through these layers in order:

1. **API Gateway** — Auth, per-user rate limits (tiered Starter→Titan), credit check (atomic Redis Lua), load shedding
2. **Fair Queue** — BullMQ Pro Groups for round-robin across tenants; single-verify jobs get priority over bulk batches
3. **Worker Pool** — 10+ workers × 50 concurrent jobs; global token bucket (1,000 tokens/sec) controls upstream call rate; autoscales 2–50 workers
4. **Circuit Breaker** — Opens at 50% failure rate over last 100 calls; 30s wait; half-open probes with 5 test calls; exponential backoff with jitter
5. **Upstream Proxy** — undici pool (max 200 connections); 3s connect / 10s read / 15s total timeouts; idempotency keys in Redis (1hr TTL)

**Credit System**: Dual-layer — Redis for speed (atomic Lua check-and-deduct), PostgreSQL for durability (credit_events ledger). Reconciliation job runs every 5 minutes.

## Constitution (Non-Negotiable Principles)

Before implementing any feature, check `.specify/memory/constitution.md`. Key constraints:

- **Accuracy**: 99.9% verification accuracy, false positive < 0.05%, false negative < 0.1%
- **Performance**: Single verify < 50ms (p95), bulk 1,000+/min, 99.99% uptime, page load < 2s, DB queries < 100ms (p95)
- **Security**: API keys hashed at rest, TLS 1.2+, PII not stored beyond transaction, rate limiting per key
- **UX**: 16 languages, actionable error messages, credit cost shown before actions, confirm destructive actions, progress for ops > 1s
- **API-First**: All web features available via API, versioned URLs (`/v1/`), breaking changes keep prior version 12 months

## Spec-Driven Development Workflow

The `.specify/` framework defines the development process:

1. **Phase 0** (Research): Create git branch `###-feature`
2. **Phase 1** (Design): Write plan.md, data-model.md, contracts using templates in `.specify/templates/`
3. **Phase 2** (Implementation): Break down into tasks using tasks-template.md
4. **Phase 3+**: Implement user stories by priority (P1, P2, P3)

Helper scripts in `.specify/scripts/bash/`:
- `check-prerequisites.sh` — Validate prerequisites
- `setup-plan.sh` — Create implementation plan from template
- `create-new-feature.sh` — Generate feature directory structure
- `update-agent-context.sh` — Update context for agents

## Quality Gates

Before merge: all unit tests pass, integration tests cover API endpoints, no accuracy regression, no critical/high security vulns, performance benchmarks within 10%.

Before release: load test at 10x peak, staging verification with real emails, rollback plan documented.

## API Surface

**Public API** (Bearer token auth via `sk_` prefixed API key):
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
- `/home/*` — Dashboard, quick-verify, bulk-verify, api-keys, usage, billing, profile

## Key Design Decisions

- **BullMQ Pro** over SQS/RabbitMQ/Kafka: TypeScript-native, built-in multi-tenant groups, no extra infra beyond Redis
- **Redis Lua sliding window** for rate limiting: atomic, distributed, smooth per-user fairness
- **Redis + PostgreSQL hybrid** for credits: speed on the hot path, ACID durability for audit
- **SSE over WebSockets** for real-time: simpler, auto-reconnect, sufficient for progress updates
- **Redis config**: `maxmemory-policy: noeviction`, `appendonly: yes`, `removeOnComplete: true` on all jobs — BullMQ breaks without these

## Dashboard Routes

| Route | Page |
|-------|------|
| `/home` | Dashboard |
| `/home/quick-verify` | Single email verification |
| `/home/bulk-verify` | Bulk verification (upload/paste) |
| `/home/history` | Bulk job history |
| `/home/api-keys` | API key management |
| `/home/usage` | Verification history |
| `/home/billing` | Credits and subscriptions |
| `/home/profile` | User settings |
| `/auth/sign-in` | Sign in |
| `/auth/sign-up` | Sign up |
| `/auth/password-reset` | Password reset |
