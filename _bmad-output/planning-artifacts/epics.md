---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - docs/architecture.md
---

# EmailKit - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for EmailKit, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Account Management**
- FR1: Users can sign up with email and password
- FR2: Users can sign up and sign in using Google OAuth
- FR3: Users can verify their email address via a 6-digit code before accessing the dashboard
- FR4: Users can sign in with email and password
- FR5: Users can reset their password via email link
- FR6: Users can update their display name
- FR7: Users can update their email address (with re-verification)
- FR8: Users can update their password (requires current password)
- FR9: Users can upload and change their profile avatar
- FR10: Users can select their preferred language
- FR11: Users can delete their account (with re-authentication and email verification code)
- FR12: System enforces a 30-day grace period before permanently anonymizing deleted accounts
- FR13: Users who signed up with email/password can link their Google account

**Email Verification**
- FR14: Users can verify a single email address via the web dashboard and receive real-time results
- FR15: Single verification results include status, deliverability, reputation score, classification tags (role, free, disposable, catch-all), and technical details (domain, MX records, SMTP status)
- FR16: Users can upload a CSV/Excel file of emails for bulk verification (up to 100,000 rows)
- FR17: Users can paste a list of emails for bulk verification via copy/paste
- FR18: Users can see real-time progress of bulk verification jobs (percentage, processed count, ETA)
- FR19: Users can download bulk verification results as CSV (full results or filtered by status)
- FR20: Users can map CSV columns to the email field during file upload
- FR21: Bulk file uploads create history records; copy/paste verifications do not
- FR22: System provides verification results with status values: valid, invalid, unknown, risky, disposable, catch-all, role

**Credit Management**
- FR23: Users can view their current credit balance on the dashboard
- FR24: Users can purchase one-time credit packages (9 tiers from 1K to 1M credits)
- FR25: Users can subscribe to monthly or yearly plans (9 tiers from Starter to Titan)
- FR26: Users can upgrade or downgrade their subscription plan
- FR27: Users can cancel their subscription (credits remain usable until period end)
- FR28: System deducts 1 credit per email verified (atomic, no double-charges)
- FR29: System prevents verification when credit balance is insufficient
- FR30: Subscription credits expire at period end with no rollover; one-time credits never expire
- FR31: System refunds credits for permanently failed verifications

**API Access**
- FR32: Users can create named API keys with configurable expiration (1mo, 3mo, 6mo, 1yr, never)
- FR33: API keys are displayed once upon creation and never retrievable again
- FR34: Users can view their API keys list (masked, with status, creation date, last used)
- FR35: Users can delete API keys (immediate revocation)
- FR36: Developers can verify single emails via the public REST API
- FR37: Developers can submit bulk verification jobs via the public REST API
- FR38: Developers can check bulk job status and download results via the public REST API
- FR39: Developers can check their credit balance via the public REST API
- FR40: Developers can create, list, and delete webhooks via the public REST API
- FR41: System delivers webhook notifications for verification completion, bulk completion, bulk failure, and low credits
- FR42: System enforces per-user rate limits based on subscription tier

**Data & Reporting**
- FR43: Dashboard displays credit balance, total verifications, and API calls as summary metrics
- FR44: Dashboard displays email validity distribution as a donut chart (valid, invalid, unknown, risky, disposable, catch-all, role)
- FR45: Dashboard displays verification trend as a line chart with configurable time range (7, 30, 90 days)
- FR46: Users can view filterable usage history (search by email, filter by status, filter by method)
- FR47: Users can export usage history records (current page, all data, or custom range)
- FR48: Users can view bulk job history with status (pending, processing, completed, failed)
- FR49: Users can search bulk job history by file name and filter by status
- FR50: Users can view credit transaction history (purchases, deductions, refunds)

**Integrations**
- FR51: Users can connect their ReachInbox account for active verification
- FR52: Users can configure Active Verification to re-verify all emails in connected lists at intervals of 1h, 6h, 12h, or 24h, with each cycle producing updated status for every email and a completion log
- FR53: Active Verification displays aggregated results across all connected data sources
- FR54: Users can filter and search verified emails within active verification lists by status
- FR55: System processes payments through a hosted checkout flow (payment provider TBD)
- FR56: System manages recurring subscriptions including renewals, failures, and cancellations

**Platform Resilience**
- FR57: System queues verification jobs fairly across all tenants (no single tenant starves others)
- FR58: System gracefully degrades when the upstream API is unavailable (jobs queue, no data loss)
- FR59: System automatically recovers and processes queued jobs when upstream API returns
- FR60: System reconciles credit balances between fast cache and durable storage
- FR61: System provides health check endpoints for monitoring (liveness, readiness, startup)

**Public Pages**
- FR62: Landing page renders hero section (headline, subheadline, primary signup CTA), feature grid (6+ feature cards), integration logos bar, pricing table (9 subscription tiers with monthly/yearly prices), and footer with ToS and Privacy Policy links
- FR63: System displays appropriate error pages (404, 500, VPN detection)
- FR64: Payment success and failure states are communicated to users via modals
- FR65: New users receive free credits upon account creation

### NonFunctional Requirements

**Performance**
- NFR1: Single email verification completes in < 500ms end-to-end (p95)
- NFR2: Dashboard page loads in < 2 seconds (initial render)
- NFR3: Bulk verification of 10,000 emails completes in < 30 minutes
- NFR4: SSE progress updates deliver within 5 seconds of actual progress change
- NFR5: API key creation and deletion take effect within 30 seconds
- NFR6: Public API endpoints respond in < 200ms for non-verification requests (credits, webhooks, job status)
- NFR7: Webhook deliveries fire within 10 seconds of triggering event

**Security**
- NFR8: All data in transit encrypted via TLS 1.2+
- NFR9: All data at rest encrypted via managed database encryption
- NFR10: Passwords hashed with bcrypt (cost factor 12)
- NFR11: API keys hashed with bcrypt; plaintext never stored or retrievable
- NFR12: Session tokens are 256-bit cryptographically random, stored as SHA-256 hash
- NFR13: Webhook payloads signed with HMAC-SHA256; replay protection via 5-minute timestamp window
- NFR14: CSRF protection on all state-changing web requests
- NFR15: Input validation on all user-supplied data (email format, file size, JSON schema)
- NFR16: Secrets stored in environment variables or container orchestration secrets — never in code or config files
- NFR17: Edge proxy/CDN for DDoS protection, WAF, and bot management

**Scalability**
- NFR18: System supports 1,000+ concurrent tenants without per-tenant degradation
- NFR19: Worker pool autoscales from 2 to 50 based on queue depth and wait time
- NFR20: Queue supports up to 1,000,000 pending jobs before load shedding activates
- NFR21: Load shedding rejects bulk requests at 500K queue depth, all non-critical at 800K
- NFR22: Global upstream call rate controlled at 1,000 requests/sec via token bucket
- NFR23: Database and cache scale vertically via managed service tiers without application changes

**Reliability**
- NFR24: System availability target: 99.99% uptime
- NFR25: Recovery Point Objective (RPO): < 1 hour
- NFR26: Recovery Time Objective (RTO): < 30 minutes
- NFR27: Circuit breaker opens at 50% failure rate, prevents cascade failures
- NFR28: No job loss during upstream outages — all jobs remain queued until recovery
- NFR29: Credit reconciliation detects and corrects drift within 10 minutes (5-minute job cycle)
- NFR30: Zero-downtime deployments via rolling updates
- NFR31: Failed webhook deliveries retry 4 times (immediate, 1min, 5min, 30min)

**Integration**
- NFR32: Upstream API calls use connection pooling (max 200 concurrent connections)
- NFR33: Upstream API timeouts: 3s connect, 10s read, 15s total
- NFR34: Payment gateway abstracted to support provider swap without core logic changes
- NFR35: ReachInbox integration handles credential storage securely and connection failures gracefully

### Additional Requirements

**From Architecture — Infrastructure & Setup**
- Database schema: 9 core tables (users, sessions, api_keys, subscriptions, credit_events, verification_results, bulk_jobs, webhooks, webhook_deliveries) with indexes
- Redis configuration: Sentinel HA (1 primary + 2 replicas), noeviction policy, AOF persistence, dedicated instances for queue vs cache
- BullMQ Pro license required ($495/year) for multi-tenant group fairness
- DOKS cluster setup with worker pod autoscaling (2–50 workers)
- Cloudflare edge proxy configuration (DNS, WAF, CDN, DDoS)
- DigitalOcean Spaces bucket for bulk result CSV storage with 14-day lifecycle

**From Architecture — Credit System**
- Dual-layer credit architecture: Redis Lua atomic deduction + PostgreSQL credit_events ledger
- 5-minute reconciliation job syncing Redis ↔ PostgreSQL
- In-flight job credit refund mechanism via stalled job detection + reconciliation drift correction
- Bulk job failure semantics: per-email refund, full-batch refund, full-job failure at >50% batch failure rate

**From Architecture — Resilience**
- Circuit breaker state persistence in Redis shared across all workers
- Global token bucket (1,000 tokens/sec) controlling upstream call rate
- Dead Letter Queue with alerting at >1,000 depth, automatic credit refund
- Retry budget capped at 10% of normal traffic volume
- Graceful worker shutdown (drain in-flight jobs before stopping)

**From Architecture — Security**
- Auth endpoint rate limits: sign-in 5/15min, sign-up 3/hr, password-reset 3/hr, verify-email 5/15min
- CSRF tokens per session, validated on all POST/PUT/DELETE
- Account recovery during 30-day grace period (login cancels deletion)
- GDPR data export (Article 20) from profile page

**From Architecture — Observability**
- Prometheus metrics: queue_depth, upstream_error_rate, circuit_breaker_state, redis_memory, credit_reconciliation_drift, dlq_depth, worker_concurrency, http_503_rate
- Grafana dashboards for operational visibility
- Distributed tracing via OpenTelemetry (trace propagation: Gateway → BullMQ → Worker → Upstream)
- Health check endpoints: /health/live, /health/ready, /health/startup

**From Architecture — API**
- Public API: Bearer token auth (ev_ prefix keys), 6 endpoint groups
- Internal API: Session cookie auth, 15+ endpoint groups
- Webhook system: HMAC-SHA256 signing, 4 event types, 4-attempt retry, idempotency via event IDs
- SSE for bulk job progress: 4 event types (progress, status_change, error, results_summary), Last-Event-ID reconnection

**From Architecture — Deployment**
- Zero-downtime rolling deploys via Kubernetes
- Canary deploys for critical changes (5% traffic, 10-min monitoring)
- Database migrations as separate pre-deploy step (backward-compatible only)
- Automated daily backups (PostgreSQL + Redis) with point-in-time recovery

### FR Coverage Map

- FR1: Epic 1 - Email/password signup
- FR2: Epic 1 - Google OAuth signup/signin
- FR3: Epic 1 - Email verification via 6-digit code
- FR4: Epic 1 - Email/password signin
- FR5: Epic 1 - Password reset via email
- FR6: Epic 1 - Update display name
- FR7: Epic 1 - Update email (with re-verification)
- FR8: Epic 1 - Update password
- FR9: Epic 1 - Upload/change avatar
- FR10: Epic 1 - Select preferred language
- FR11: Epic 1 - Delete account (with re-auth)
- FR12: Epic 1 - 30-day grace period before anonymization
- FR13: Epic 1 - Link Google account to email/password account
- FR14: Epic 2 - Single email verification via web dashboard
- FR15: Epic 2 - Verification results (status, reputation, tags, details)
- FR16: Epic 4 - Upload CSV/Excel for bulk verification
- FR17: Epic 4 - Paste email list for bulk verification
- FR18: Epic 4 - Real-time bulk job progress (SSE)
- FR19: Epic 4 - Download bulk results as CSV (full/filtered)
- FR20: Epic 4 - CSV column mapping during upload
- FR21: Epic 4 - Bulk uploads create history; paste does not
- FR22: Epic 2 - Verification status values (valid, invalid, unknown, etc.)
- FR23: Epic 2 - View credit balance on dashboard
- FR24: Epic 3 - Purchase one-time credit packages (9 tiers)
- FR25: Epic 3 - Subscribe to monthly/yearly plans (9 tiers)
- FR26: Epic 3 - Upgrade/downgrade subscription
- FR27: Epic 3 - Cancel subscription (credits usable until period end)
- FR28: Epic 2 - Atomic credit deduction (1 credit per email)
- FR29: Epic 2 - Block verification when insufficient credits
- FR30: Epic 3 - Subscription credits expire; one-time never expire
- FR31: Epic 2 - Refund credits for permanently failed verifications
- FR32: Epic 5 - Create named API keys with configurable expiration
- FR33: Epic 5 - API keys displayed once, never retrievable
- FR34: Epic 5 - View API keys list (masked, status, dates)
- FR35: Epic 5 - Delete API keys (immediate revocation)
- FR36: Epic 5 - Single email verification via public REST API
- FR37: Epic 5 - Submit bulk jobs via public REST API
- FR38: Epic 5 - Check bulk status and download results via API
- FR39: Epic 5 - Check credit balance via public REST API
- FR40: Epic 5 - Create/list/delete webhooks via public REST API
- FR41: Epic 5 - Webhook notifications (4 event types)
- FR42: Epic 5 - Per-user rate limits by subscription tier
- FR43: Epic 2 - Dashboard summary metrics (credits, verifications, API calls)
- FR44: Epic 2 - Dashboard donut chart (email validity distribution)
- FR45: Epic 2 - Dashboard trend line chart (7/30/90 days)
- FR46: Epic 5 - Filterable usage history
- FR47: Epic 5 - Export usage history records
- FR48: Epic 4 - View bulk job history with status
- FR49: Epic 4 - Search/filter bulk job history
- FR50: Epic 3 - View credit transaction history
- FR51: Epic 6 - Connect ReachInbox account
- FR52: Epic 6 - Configure scheduled re-verification (1h/6h/12h/24h)
- FR53: Epic 6 - Aggregated results across connected data sources
- FR54: Epic 6 - Filter/search emails within active verification lists
- FR55: Epic 3 - Hosted checkout flow (payment provider TBD)
- FR56: Epic 3 - Recurring subscription management (renewals, failures, cancellations)
- FR57: Epic 2 - Fair queuing across all tenants
- FR58: Epic 2 - Graceful degradation when upstream unavailable
- FR59: Epic 2 - Auto-recovery when upstream returns
- FR60: Epic 2 - Credit reconciliation (cache vs durable storage)
- FR61: Epic 2 - Health check endpoints (liveness, readiness, startup)
- FR62: Epic 7 - Landing page (hero, features, pricing, integrations, footer)
- FR63: Epic 7 - Error pages (404, 500, VPN detection)
- FR64: Epic 3 - Payment success/failure modals
- FR65: Epic 1 - Free credits upon account creation

## Epic List

### Epic 1: User Authentication & Profile Management — 7 stories
Users can discover EmailKit, create accounts (email/password or Google OAuth), verify their email, sign in, manage their profile (name, email, password, avatar, language), link Google accounts, and delete their account with a 30-day recovery grace period. New users receive free credits upon signup to begin verifying immediately.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR65
**File:** [epic-01-auth-and-profile.md](epics/epic-01-auth-and-profile.md)

### Epic 2: Email Verification Engine & Dashboard — 6 stories
Users can verify individual emails via the web dashboard and see detailed results (status, reputation score, classification tags, technical details). The full 5-layer defense architecture is operational: API gateway with auth and credit checks, BullMQ Pro fair queue with per-tenant round-robin, autoscaling worker pool, circuit breaker with Redis state persistence, and upstream proxy with connection pooling. Credit system is live with atomic Redis Lua deduction, PostgreSQL ledger, automatic refund on failure, and 5-minute reconciliation. Dashboard displays credit balance, total verifications, validity distribution donut chart, and trend line chart.
**FRs covered:** FR14, FR15, FR22, FR23, FR28, FR29, FR31, FR43, FR44, FR45, FR57, FR58, FR59, FR60, FR61
**File:** [epic-02-verification-engine.md](epics/epic-02-verification-engine.md)

### Epic 3: Billing & Credit Purchases — 4 stories
Users can purchase one-time credit packages (9 tiers, 1K–1M), subscribe to plans (9 tiers, monthly/yearly), upgrade/downgrade, and cancel subscriptions. Payment integration is abstracted to support Stripe or Razorpay. Subscription credits expire at period end with no rollover; one-time credits never expire. Credit transaction history is viewable. Payment success/failure communicated via modals.
**FRs covered:** FR24, FR25, FR26, FR27, FR30, FR50, FR55, FR56, FR64
**File:** [epic-03-billing.md](epics/epic-03-billing.md)

### Epic 4: Bulk Email Verification — 5 stories
Users can upload CSV/Excel files (up to 100K rows) or paste email lists for batch verification. Column mapping during upload. Real-time SSE progress updates (percentage, processed count, ETA). Downloadable results as CSV (full or filtered by status). Bulk job history with search and status filtering. File uploads create history records; paste verifications do not.
**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21, FR48, FR49
**File:** [epic-04-bulk-verification.md](epics/epic-04-bulk-verification.md)

### Epic 5: Public API & Webhooks — 6 stories
Developers can integrate via the public REST API using ev_-prefixed API keys. Key management: create with configurable expiration, view masked list, delete with immediate revocation. API endpoints: single verify, bulk submit, bulk status/results, credit balance, webhooks CRUD. Webhook system delivers HMAC-SHA256 signed notifications for 4 event types with 4-attempt retry. Per-user rate limiting enforced by subscription tier. Usage history with filtering and export.
**FRs covered:** FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR46, FR47
**File:** [epic-05-api-and-webhooks.md](epics/epic-05-api-and-webhooks.md)

### Epic 6: Active Verification (ReachInbox Integration) — 4 stories
Users can connect their ReachInbox account for continuous email list monitoring. Configure scheduled re-verification at 1h, 6h, 12h, or 24h intervals. View aggregated verification results across all connected data sources. Filter and search emails within active verification lists by status.
**FRs covered:** FR51, FR52, FR53, FR54
**File:** [epic-06-active-verification.md](epics/epic-06-active-verification.md)

### Epic 7: Landing Page & Public Pages — 2 stories
Landing page with hero section (headline, subheadline, primary signup CTA), feature grid (6+ cards), integration logos bar, pricing table (9 subscription tiers with monthly/yearly prices), and footer with ToS and Privacy Policy links. Error pages for 404, 500, and VPN detection.
**FRs covered:** FR62, FR63
**File:** [epic-07-landing-and-public.md](epics/epic-07-landing-and-public.md)
