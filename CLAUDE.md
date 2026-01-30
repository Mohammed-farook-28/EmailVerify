# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Interaction Rules

1. **Ask, Don't Assume** — Use AskUserQuestion tool for ANY confusion, doubt, decision point, or need for clarity. Never guess. Never assume. Always ask first.

2. **Think Simple** — Don't overcomplicate. Don't oversimplify. Find the honest middle ground. Be reliable and responsible in every recommendation.

3. **No AI Co-Author Tags** — When committing to git, do NOT include "Co-Authored-By: Claude" or any Anthropic attribution in commit messages.

4. **Maximize AskUserQuestion Usage** — Use the AskUserQuestion tool proactively and liberally, not just when blocked. Ask to confirm direction, validate assumptions, and clarify ambiguity before proceeding.

## Project Overview

EmailVerify is a multi-tenant email verification SaaS platform. It proxies a **single upstream API key** to 1000+ users, managing fair queuing, credit accounting, and resilience. This is based on an existing EmailVerify platform but is **not a 1:1 replica** — modifications and improvements may be made.

**Current status**: Specification phase only. Architecture and UI specs are complete. No source code, build system, tests, or lint configuration exists yet.

## Repository Layout

- `docs/architecture.md` — Full system architecture (5-layer defense, DB schema, API design, scaling)
- `docs/pages/*.md` — 11 UI page specifications (landing, dashboard, quick-verify, bulk-verify, api-keys, usage, billing, profile, history, auth, api-reference)
- `docs/AUDIT-FINDINGS.md` — UI/UX audit with ASCII diagrams
- `docs/figma/` — Figma design specs (60 pages across 8 sections, each with `spec.md` and `screenshots/`). Start from `docs/figma/index.md`
- `specs/` — Feature specifications (currently only `001-user-auth/spec.md` placeholder)
- `.specify/` — Spec-driven development framework (templates in `.specify/templates/`, helper scripts in `.specify/scripts/bash/`)
- `.specify/memory/constitution.md` — Project constitution template (not yet filled in — principles listed in this file under "Constitution" are from `docs/architecture.md`)
- `_bmad/` — BMAD product management/development methodology framework (gitignored)

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
