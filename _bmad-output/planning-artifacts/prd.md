---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain-skipped
  - step-06-innovation-skipped
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
classification:
  projectType: saas_b2b
  domain: email_martech
  complexity: medium-high
  projectContext: brownfield
inputDocuments:
  - docs/architecture.md
  - docs/AUDIT-FINDINGS.md
  - docs/pages/00-landing-page.md
  - docs/pages/01-dashboard.md
  - docs/pages/02-quick-verify.md
  - docs/pages/03-bulk-verify.md
  - docs/pages/04-api-keys.md
  - docs/pages/05-usage.md
  - docs/pages/06-billing.md
  - docs/pages/07-profile.md
  - docs/pages/08-history.md
  - docs/pages/09-auth-pages.md
  - docs/pages/10-api-reference.md
  - docs/figma/index.md
  - docs/figma/auth/spec.md
  - docs/figma/dashboard/spec.md
  - docs/figma/bulk-verify/spec.md
  - docs/figma/active-verification/spec.md
  - docs/figma/api/spec.md
  - docs/figma/settings/spec.md
  - docs/figma/credit-history/spec.md
  - docs/figma/error-states/spec.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 22
workflowType: 'prd'
---

# Product Requirements Document - EmailKit

**Author:** ashinclude
**Date:** 2026-01-30

## Executive Summary

**EmailKit** is a multi-tenant B2B SaaS platform that provides email verification services to 1,000+ users. It proxies a single unlimited upstream email verification API key — provided by the original EmailVerify platform founder — and wraps it with per-user credit accounting, fair queuing, tiered rate limiting, and a 5-layer defense architecture for resilience.

EmailKit replicates the original EmailVerify platform with full feature parity at launch. Users can verify emails individually via a web dashboard, upload bulk CSV files for batch verification, integrate via a public REST API, and connect external tools (ReachInbox) for continuous list monitoring. Revenue comes from one-time credit purchases and 9-tier subscriptions processed through a hosted payment gateway (provider TBD).

The platform is built with Next.js (App Router) + TypeScript on the frontend and Node.js + Express + TypeScript on the backend, backed by PostgreSQL, Redis, and BullMQ Pro, deployed on DigitalOcean Kubernetes (DOKS).

**Companion Documents:**
- Architecture: `docs/architecture.md` (v2.0.0, 19 sections)
- UI Page Specs: `docs/pages/*.md` (11 files — original EmailVerify platform)
- Figma Design Specs: `docs/figma/` (8 sections, 60 screens — new EmailKit design)
- UI/UX Audit: `docs/AUDIT-FINDINGS.md`

## Success Criteria

### User Success
- Users verify a single email in **under 500ms end-to-end** (50ms upstream + overhead)
- Verification accuracy matches upstream provider at **99.9%+**
- Bulk verification of 10,000 emails completes with **real-time progress visibility** (SSE updates every 1% or 5s)
- API integration from zero to first successful verification in **under 15 minutes** (clear docs, SDKs, copy-paste examples)
- Users never experience a credit miscount — what they pay for is what they get, no exceptions
- Pricing delivers clear cost savings compared to running their own upstream API key or using competitors

### Business Success
- Full feature parity with original EmailVerify at launch — no missing pages, no "coming soon" placeholders
- Platform supports **1,000+ concurrent tenants** without degradation for any single user
- Pricing strategy flexible — credit packages and 9 subscription tiers implemented, exact pricing to be finalized
- Integration with **ReachInbox** available at launch (Active Verification feature)
- Credit-based revenue model operational: one-time purchases + recurring subscriptions via payment provider (TBD)

### Technical Success
- **Zero data loss**: No credit miscounts, no lost verification results, no double-charges (dual-layer Redis + PostgreSQL with 5-min reconciliation)
- **Resilience**: System degrades gracefully when upstream API fails — circuit breaker opens, jobs queue, credits refund on permanent failure
- **Fair queuing**: No single tenant can starve others — BullMQ Pro round-robin across all tenant groups
- **Uptime**: 99.99% availability target
- **Security**: GDPR-compliant soft delete, HMAC-SHA256 webhooks, bcrypt-hashed API keys, Cloudflare edge protection

### Measurable Outcomes
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Single verify latency (p95) | < 500ms | Prometheus histogram |
| Verification accuracy | 99.9%+ | Upstream provider SLA passthrough |
| Uptime | 99.99% | Health check monitoring |
| Credit reconciliation drift | < 100 credits | 5-minute reconciliation job |
| Bulk job completion (10K emails) | < 30 minutes | Job duration tracking |
| API integration time | < 15 minutes | Onboarding funnel analytics |
| Zero double-charges | 0 incidents | Idempotency key dedup rate |

## Product Scope

### MVP — Minimum Viable Product
**Full feature parity with original EmailVerify:**
- Landing page (simplified)
- Authentication (Google OAuth + email/password with email verification)
- Dashboard (metrics, charts, donut/trend visualizations)
- Quick Verify (single email, real-time results with reputation score)
- Bulk Verify (file upload + copy/paste, SSE progress, CSV export)
- History (bulk job tracking)
- API Keys management (create, expire, delete, `ev_` prefix format)
- Usage History (filterable, exportable verification logs)
- Billing (one-time credit purchases + 9 subscription tiers, payment provider TBD)
- Profile (name, email, password, language, avatar, account deletion)
- Public REST API (single verify, bulk verify, credits, webhooks)
- Active Verification (ReachInbox integration)
- Error states (404, 500, payment success/failed, VPN detection)

### Growth Features (Post-MVP)
- Additional integrations beyond ReachInbox (Smartlead, Instantly, Reply)
- Free Tools pages (email extractor, email checker, list cleaning, etc.)
- Public pages (comparison pages, blog, glossary, FAQs)
- Browser extensions (Chrome, Firefox)
- Additional SDKs beyond initial set
- Multi-language UI (16 languages — initially launch with English, expand post-MVP)
- AI Guides section (MCP Server, Agent Skills)

### Vision (Future)
- Whitelabel offering for agencies/resellers
- Advanced analytics and deliverability scoring
- Predictive email quality scoring (AI-powered)
- Enterprise SSO (SAML, OIDC) beyond Google OAuth
- Custom SLA tiers for enterprise clients
- Multi-region deployment for latency optimization

## User Journeys

### Journey 1: Sarah — The Email Marketer (Happy Path)

**Who:** Sarah runs email campaigns at a mid-size e-commerce company. She sends 50K+ emails monthly and her bounce rate just hit 8% — her ESP is threatening to throttle her account.

**Opening Scene:** Sarah Googles "bulk email verification tool" after her Mailchimp account gets a deliverability warning. She lands on EmailKit's landing page and sees "99.9% accuracy" and "verify 1M emails for $350." She signs up with Google OAuth — no forms, no friction.

**Rising Action:** She lands on the dashboard with 10 free credits. She quick-verifies her own email to see how it works — result in under a second, clean UI showing "Valid, Deliverable, Reputation 95%." Convinced, she exports her 45,000-email customer list from Mailchimp as CSV.

She navigates to Bulk Verify, drags the CSV into the upload zone. EmailKit shows column mapping — she confirms the email column. She buys the 50K credit package ($75, 70% savings) via Stripe. The verification starts immediately. She watches the progress bar tick up in real-time via SSE — 10%, 25%, 50%...

**Climax:** 28 minutes later, the job completes. The results donut chart shows: 38,200 valid (85%), 4,500 invalid (10%), 1,350 unknown (3%), 950 risky (2%). She downloads the CSV, filters for valid-only, and re-imports into Mailchimp.

**Resolution:** Her next campaign bounce rate drops from 8% to 0.3%. She sets up a monthly subscription (Professional plan, 10K credits/month) and makes EmailKit part of her workflow. She tells her marketing team about it.

**Capabilities Revealed:** Landing page conversion, Google OAuth, free credits onboarding, quick verify, bulk verify (file upload + column mapping), SSE progress, credit purchase, CSV export, Stripe checkout

---

### Journey 2: Raj — The Developer (API Integration)

**Who:** Raj is a backend engineer at a SaaS startup building a CRM. His product needs to validate email addresses at signup to prevent fake accounts and improve outbound deliverability.

**Opening Scene:** Raj finds EmailKit's API documentation page. He scans the endpoints — `POST /api/v1/verify` with a simple JSON body `{"email": "..."}`. Clean. He signs up with email/password, verifies his email via the 6-digit code.

**Rising Action:** He navigates to API Keys, creates a key named "CRM-Production" with 1-year expiry. The key appears once: `ev_Ue7HpvL9...` — he copies it into his `.env` file. He fires off a curl command:

```bash
curl -X POST https://api.emailkit.ai/v1/verify \
  -H "Authorization: Bearer ev_..." \
  -d '{"email": "test@gmail.com"}'
```

Response in 200ms. Valid. He integrates it into his signup flow — every new user's email gets verified before account creation. He sets up a `credits.low` webhook to alert his Slack channel when balance drops below 10%.

**Climax:** Three months in, his CRM has 12,000 users. Raj checks the usage page — 98.7% of verifications are accurate, his fake signup rate dropped from 15% to 0.8%. He upgrades to the Business plan for higher rate limits (50 req/sec).

**Resolution:** Raj's CRM's deliverability reputation improves. He writes a blog post about how they reduced fake signups, mentioning EmailKit. He starts using the bulk API endpoint to periodically re-verify their entire user database.

**Capabilities Revealed:** API documentation, email/password auth, email verification flow, API key creation, REST API endpoints, webhook setup, usage monitoring, rate limiting by tier, subscription upgrades

---

### Journey 3: Priya — The ReachInbox Power User (Active Verification)

**Who:** Priya manages outbound sales at a B2B agency. She runs campaigns through ReachInbox and burns through email lists fast. Sending to invalid emails tanks her sender reputation.

**Opening Scene:** Priya sees the Active Verification feature in EmailKit's dashboard sidebar. She clicks in and sees "Connect your email tools for continuous verification." ReachInbox is listed as an available integration.

**Rising Action:** She clicks "Connect ReachInbox," enters her ReachInbox credentials in the login modal. EmailKit pulls in her active email lists. She sees a dashboard showing her connected data sources, total emails synced, and verification status across all lists.

She sets up scheduled verification — every 24 hours, EmailKit re-verifies emails across all her active ReachInbox campaigns. The overview tab shows donut charts breaking down deliverable, risky, and undeliverable contacts. The email tab lets her filter and search by status.

**Climax:** After one week, EmailKit flags 3,200 emails across her campaigns that have gone invalid since her last manual check — domain expired, mailbox full, accounts deleted. She removes them before her next campaign blast.

**Resolution:** Her ReachInbox campaigns show 40% better open rates and zero hard bounces. She stops manually exporting/importing lists for verification. EmailKit runs continuously in the background, keeping her lists clean.

**Capabilities Revealed:** Active Verification, ReachInbox integration, OAuth/credential flow for external tools, scheduled verification, continuous monitoring dashboard, list-level reporting, status filtering

---

### Journey 4: Alex — The Platform Operator (Monitoring & Support)

**Who:** Alex is the DevOps/SRE engineer responsible for keeping EmailKit running. They manage the DOKS cluster, monitor system health, and handle escalations.

**Opening Scene:** Alex's PagerDuty fires at 2 AM — Prometheus alert: `upstream_error_rate > 50%`. The circuit breaker has tripped to OPEN state on the upstream email verification API.

**Rising Action:** Alex checks Grafana. The upstream API started returning 503s 10 minutes ago. Queue depth is climbing: 150,000 pending jobs and rising. But the system is holding — load shedding hasn't kicked in yet (threshold: 500K). Workers are idle, waiting for the circuit breaker to cycle to HALF-OPEN.

Alex checks the failure runbook (Section 17 of the architecture doc). For "Upstream API prolonged outage": circuit breaker open, jobs queue, alert team. No data loss — all jobs stay queued, no credits lost.

**Climax:** 15 minutes later, the upstream API recovers. Circuit breaker transitions to HALF-OPEN, sends 5 test calls — all succeed. Breaker closes. Workers resume draining the 200,000-job backlog. Alex watches queue depth fall: 200K → 150K → 100K → 50K → 0 over the next 40 minutes. Fair queuing ensures no single tenant's jobs starve during the drain.

**Resolution:** Alex runs the credit reconciliation job manually to verify — Redis and PostgreSQL balances match within 3 credits across all tenants. Zero data loss. No customer complaints. Alex updates the incident log and goes back to sleep.

**Capabilities Revealed:** Prometheus/Grafana monitoring, circuit breaker states, load shedding thresholds, queue management, failure runbook, credit reconciliation, worker autoscaling, fair queuing under load

---

### Journey Requirements Summary

| Journey | Primary Capabilities Required |
|---------|-------------------------------|
| Sarah (Marketer) | Landing page, OAuth, free credits, quick verify, bulk verify (upload + SSE), credit purchase, CSV export, Stripe |
| Raj (Developer) | API docs, email auth, API key management, REST API, webhooks, usage monitoring, rate limiting, subscriptions |
| Priya (ReachInbox) | Active Verification, external tool integration, scheduled verification, continuous monitoring, list management |
| Alex (Operator) | Prometheus/Grafana, circuit breaker, load shedding, queue management, reconciliation, failure runbook, autoscaling |

## B2B SaaS Specific Requirements

### Tenant Model
- **Single-user accounts**: Each account is one person with their own email, credentials, credits, API keys, and billing. No team/organization layer.
- **Multi-tenant isolation**: 1,000+ concurrent tenants sharing a single upstream API key. Fair queuing (BullMQ Pro round-robin) ensures no tenant starves others.
- **Per-tenant resources**: Individual credit balances (Redis + PostgreSQL), per-user rate limits (tiered by subscription), isolated API keys, separate webhook configurations.
- **Tenant identification**: UUID-based user IDs. API requests authenticated via `ev_`-prefixed API keys mapped to tenant accounts.

### Permission Model
- **Single role**: All authenticated users have the same permissions — no admin, moderator, or support roles in the application.
- **API key scoping**: Keys inherit the user's subscription tier for rate limiting. No per-key permission granularity.
- **Platform operations**: Monitoring, support, and administration happen outside the application (Grafana dashboards, database access, Kubernetes management).

### Subscription Tiers
- **9 tiers**: Starter, Popular, Professional, Business, Enterprise, Premium, Ultimate, Mega, Titan
- **Billing cycles**: Monthly and yearly (yearly at 50% discount)
- **One-time packages**: 9 credit packs (1K to 1M credits) with progressive discounts (up to 93% at 1M)
- **Credit model**: 1 credit = 1 email verification. Credits purchased or allocated by subscription.
- **Subscription credits**: Allocated per period. No rollover. Expire at period end.
- **One-time credits**: Never expire.
- **Pricing**: Exact pricing to be finalized. Structure mirrors original EmailVerify as baseline.

### Payment Gateway
- **Provider**: To be determined (Stripe or Razorpay under evaluation)
- **Requirements regardless of provider**:
  - Hosted checkout for one-time purchases
  - Recurring subscription management (monthly/yearly)
  - Webhook notifications for payment events (success, failure, cancellation, renewal)
  - Idempotent processing of payment events
  - Customer record linking (payment provider customer ID stored on user record)
- **Architecture note**: Payment integration should be abstracted to allow provider swap without rewriting core billing logic.

### Integration List
- **MVP**: ReachInbox (Active Verification — continuous email list monitoring via connected data source)
- **Post-MVP**: Smartlead, Instantly, Reply, and other outbound tools
- **Landing page only** (not functional at MVP): Mailchimp, SendGrid, HubSpot, Salesforce, ActiveCampaign, Klaviyo, Brevo, GetResponse, Constant Contact, Zapier, Make

### Compliance Requirements
- **GDPR**: Soft delete with 30-day grace period + anonymization (detailed in architecture doc Section 14)
- **Data retention**: Configurable per-user (7/14/30/60/90 days for verification results)
- **Data export**: GDPR Article 20 data portability from profile page
- **Terms of Service and Privacy Policy**: Required acceptance at signup

### Implementation Considerations
- **Stateless architecture**: All API and worker processes stateless — horizontal scaling via Kubernetes
- **Session management**: Server-side PostgreSQL sessions with httpOnly cookies (not JWT)
- **Rate limiting**: Per-user sliding window via Redis Lua scripts, tied to subscription tier
- **Monitoring**: Prometheus metrics + Grafana dashboards for queue depth, error rates, credit drift, circuit breaker state

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Full Feature Parity — Big Bang Launch
- All 13 features ship simultaneously. No partial launches, no beta waves.
- Rationale: EmailKit replicates a proven product. The value proposition is the complete package — users expect feature parity from day one.

**MVP Feature Set:** See Product Scope > MVP section above. All items are must-have.

### Development Phases

**Phase 1 (MVP):** All 13 features from Product Scope > MVP ship together. All 4 user journeys supported.

**Phase 2 (Growth):** Features from Product Scope > Growth Features.

**Phase 3 (Expansion):** Features from Product Scope > Vision.

### Risk Mitigation Strategy

**Technical Complexity (Primary Risk)**
- **Risk:** 5-layer defense architecture, BullMQ Pro, circuit breakers, dual-layer credits, SSE, webhook system — many interdependent components.
- **Mitigation:**
  - Build and validate each layer independently before integration
  - Start with single verify flow end-to-end, then extend to bulk
  - Credit system: get Redis Lua + PostgreSQL reconciliation working early — it touches everything
  - Circuit breaker and queue: validate with simulated upstream failures before production
  - Integration tests for the full request lifecycle (gateway → queue → worker → upstream → result)

**Upstream API Dependency**
- **Risk:** Single upstream API key. Revocation or rate limiting would be catastrophic.
- **Mitigation:**
  - Maintain relationship with upstream provider (the EmailVerify founder)
  - Circuit breaker ensures graceful degradation during outages
  - Queue buffers absorb spikes — no jobs lost during temporary failures
  - Monitor upstream health proactively (Prometheus alerts on error rates)

**Payment Gateway Uncertainty**
- **Risk:** Stripe vs Razorpay not decided. Delays billing implementation.
- **Mitigation:**
  - Abstract payment logic behind a provider interface
  - Implement checkout flow, subscription management, and webhook handling as generic operations
  - Swap provider-specific SDK at integration time without rewriting business logic

**Scope Discipline**
- **Risk:** Full feature parity is 13 features — risk of feature creep.
- **Mitigation:**
  - PRD defines exact MVP boundary — nothing beyond Phase 1 enters the build
  - Each feature maps to a specific user journey — no orphan features
  - Landing page is explicitly "simplified" — no building 34 public pages for MVP

## Functional Requirements

### Account Management
- **FR1:** Users can sign up with email and password
- **FR2:** Users can sign up and sign in using Google OAuth
- **FR3:** Users can verify their email address via a 6-digit code before accessing the dashboard
- **FR4:** Users can sign in with email and password
- **FR5:** Users can reset their password via email link
- **FR6:** Users can update their display name
- **FR7:** Users can update their email address (with re-verification)
- **FR8:** Users can update their password (requires current password)
- **FR9:** Users can upload and change their profile avatar
- **FR10:** Users can select their preferred language
- **FR11:** Users can delete their account (with re-authentication and email verification code)
- **FR12:** System enforces a 30-day grace period before permanently anonymizing deleted accounts
- **FR13:** Users who signed up with email/password can link their Google account

### Email Verification
- **FR14:** Users can verify a single email address via the web dashboard and receive real-time results
- **FR15:** Single verification results include status, deliverability, reputation score, classification tags (role, free, disposable, catch-all), and technical details (domain, MX records, SMTP status)
- **FR16:** Users can upload a CSV/Excel file of emails for bulk verification (up to 100,000 rows)
- **FR17:** Users can paste a list of emails for bulk verification via copy/paste
- **FR18:** Users can see real-time progress of bulk verification jobs (percentage, processed count, ETA)
- **FR19:** Users can download bulk verification results as CSV (full results or filtered by status)
- **FR20:** Users can map CSV columns to the email field during file upload
- **FR21:** Bulk file uploads create history records; copy/paste verifications do not
- **FR22:** System provides verification results with status values: valid, invalid, unknown, risky, disposable, catch-all, role

### Credit Management
- **FR23:** Users can view their current credit balance on the dashboard
- **FR24:** Users can purchase one-time credit packages (9 tiers from 1K to 1M credits)
- **FR25:** Users can subscribe to monthly or yearly plans (9 tiers from Starter to Titan)
- **FR26:** Users can upgrade or downgrade their subscription plan
- **FR27:** Users can cancel their subscription (credits remain usable until period end)
- **FR28:** System deducts 1 credit per email verified (atomic, no double-charges)
- **FR29:** System prevents verification when credit balance is insufficient
- **FR30:** Subscription credits expire at period end with no rollover; one-time credits never expire
- **FR31:** System refunds credits for permanently failed verifications

### API Access
- **FR32:** Users can create named API keys with configurable expiration (1mo, 3mo, 6mo, 1yr, never)
- **FR33:** API keys are displayed once upon creation and never retrievable again
- **FR34:** Users can view their API keys list (masked, with status, creation date, last used)
- **FR35:** Users can delete API keys (immediate revocation)
- **FR36:** Developers can verify single emails via the public REST API
- **FR37:** Developers can submit bulk verification jobs via the public REST API
- **FR38:** Developers can check bulk job status and download results via the public REST API
- **FR39:** Developers can check their credit balance via the public REST API
- **FR40:** Developers can create, list, and delete webhooks via the public REST API
- **FR41:** System delivers webhook notifications for verification completion, bulk completion, bulk failure, and low credits
- **FR42:** System enforces per-user rate limits based on subscription tier

### Data & Reporting
- **FR43:** Dashboard displays credit balance, total verifications, and API calls as summary metrics
- **FR44:** Dashboard displays email validity distribution as a donut chart (valid, invalid, unknown, risky, disposable, catch-all, role)
- **FR45:** Dashboard displays verification trend as a line chart with configurable time range (7, 30, 90 days)
- **FR46:** Users can view filterable usage history (search by email, filter by status, filter by method)
- **FR47:** Users can export usage history records (current page, all data, or custom range)
- **FR48:** Users can view bulk job history with status (pending, processing, completed, failed)
- **FR49:** Users can search bulk job history by file name and filter by status
- **FR50:** Users can view credit transaction history (purchases, deductions, refunds)

### Integrations
- **FR51:** Users can connect their ReachInbox account for active verification
- **FR52:** Users can configure Active Verification to re-verify all emails in connected lists at intervals of 1h, 6h, 12h, or 24h, with each cycle producing updated status for every email and a completion log
- **FR53:** Active Verification displays aggregated results across all connected data sources
- **FR54:** Users can filter and search verified emails within active verification lists by status
- **FR55:** System processes payments through a hosted checkout flow (payment provider TBD)
- **FR56:** System manages recurring subscriptions including renewals, failures, and cancellations

### Platform Resilience
- **FR57:** System queues verification jobs fairly across all tenants (no single tenant starves others)
- **FR58:** System gracefully degrades when the upstream API is unavailable (jobs queue, no data loss)
- **FR59:** System automatically recovers and processes queued jobs when upstream API returns
- **FR60:** System reconciles credit balances between fast cache and durable storage
- **FR61:** System provides health check endpoints for monitoring (liveness, readiness, startup)

### Public Pages
- **FR62:** Landing page renders hero section (headline, subheadline, primary signup CTA), feature grid (6+ feature cards), integration logos bar, pricing table (9 subscription tiers with monthly/yearly prices), and footer with ToS and Privacy Policy links
- **FR63:** System displays appropriate error pages (404, 500, VPN detection)
- **FR64:** Payment success and failure states are communicated to users via modals
- **FR65:** New users receive free credits upon account creation

## Non-Functional Requirements

### Performance
- **NFR1:** Single email verification completes in < 500ms end-to-end (p95)
- **NFR2:** Dashboard page loads in < 2 seconds (initial render)
- **NFR3:** Bulk verification of 10,000 emails completes in < 30 minutes
- **NFR4:** SSE progress updates deliver within 5 seconds of actual progress change
- **NFR5:** API key creation and deletion take effect within 30 seconds
- **NFR6:** Public API endpoints respond in < 200ms for non-verification requests (credits, webhooks, job status)
- **NFR7:** Webhook deliveries fire within 10 seconds of triggering event

### Security
- **NFR8:** All data in transit encrypted via TLS 1.2+
- **NFR9:** All data at rest encrypted via managed database encryption
- **NFR10:** Passwords hashed with bcrypt (cost factor 12)
- **NFR11:** API keys hashed with bcrypt; plaintext never stored or retrievable
- **NFR12:** Session tokens are 256-bit cryptographically random, stored as SHA-256 hash
- **NFR13:** Webhook payloads signed with HMAC-SHA256; replay protection via 5-minute timestamp window
- **NFR14:** CSRF protection on all state-changing web requests
- **NFR15:** Input validation on all user-supplied data (email format, file size, JSON schema)
- **NFR16:** Secrets stored in environment variables or container orchestration secrets — never in code or config files
- **NFR17:** Edge proxy/CDN for DDoS protection, WAF, and bot management

### Scalability
- **NFR18:** System supports 1,000+ concurrent tenants without per-tenant degradation
- **NFR19:** Worker pool autoscales from 2 to 50 based on queue depth and wait time
- **NFR20:** Queue supports up to 1,000,000 pending jobs before load shedding activates
- **NFR21:** Load shedding rejects bulk requests at 500K queue depth, all non-critical at 800K
- **NFR22:** Global upstream call rate controlled at 1,000 requests/sec via token bucket
- **NFR23:** Database and cache scale vertically via managed service tiers without application changes

### Reliability
- **NFR24:** System availability target: 99.99% uptime
- **NFR25:** Recovery Point Objective (RPO): < 1 hour
- **NFR26:** Recovery Time Objective (RTO): < 30 minutes
- **NFR27:** Circuit breaker opens at 50% failure rate, prevents cascade failures
- **NFR28:** No job loss during upstream outages — all jobs remain queued until recovery
- **NFR29:** Credit reconciliation detects and corrects drift within 10 minutes (5-minute job cycle)
- **NFR30:** Zero-downtime deployments via rolling updates
- **NFR31:** Failed webhook deliveries retry 4 times (immediate, 1min, 5min, 30min)

### Integration
- **NFR32:** Upstream API calls use connection pooling (max 200 concurrent connections)
- **NFR33:** Upstream API timeouts: 3s connect, 10s read, 15s total
- **NFR34:** Payment gateway abstracted to support provider swap without core logic changes
- **NFR35:** ReachInbox integration handles credential storage securely and connection failures gracefully

## References

| Document | Path | Description |
|----------|------|-------------|
| Architecture | `docs/architecture.md` | Full system architecture v2.0.0 — 5-layer defense, DB schema, API design, auth, webhooks, SSE, Stripe, CSV export, security, monitoring, DR |
| Landing Page Spec | `docs/pages/00-landing-page.md` | Original EmailVerify landing page specification |
| Dashboard Spec | `docs/pages/01-dashboard.md` | Dashboard metrics, charts, sidebar navigation |
| Quick Verify Spec | `docs/pages/02-quick-verify.md` | Single email verification page |
| Bulk Verify Spec | `docs/pages/03-bulk-verify.md` | Bulk verification (upload + paste) |
| API Keys Spec | `docs/pages/04-api-keys.md` | API key management page |
| Usage Spec | `docs/pages/05-usage.md` | Verification history and usage logs |
| Billing Spec | `docs/pages/06-billing.md` | Credits, subscriptions, pricing |
| Profile Spec | `docs/pages/07-profile.md` | User profile and account settings |
| History Spec | `docs/pages/08-history.md` | Bulk job history |
| Auth Pages Spec | `docs/pages/09-auth-pages.md` | Sign in, sign up, password reset |
| API Reference Spec | `docs/pages/10-api-reference.md` | Public REST API documentation |
| UI/UX Audit | `docs/AUDIT-FINDINGS.md` | 3 audit sessions with findings and corrections |
| Figma Design Index | `docs/figma/index.md` | Design system overview and section index |
| Figma Auth | `docs/figma/auth/spec.md` | Authentication screen designs |
| Figma Dashboard | `docs/figma/dashboard/spec.md` | Dashboard and single verify designs |
| Figma Bulk Verify | `docs/figma/bulk-verify/spec.md` | Bulk verification flow designs |
| Figma Active Verify | `docs/figma/active-verification/spec.md` | Active verification and ReachInbox designs |
| Figma API | `docs/figma/api/spec.md` | API key management designs |
| Figma Settings | `docs/figma/settings/spec.md` | Account settings and billing designs |
| Figma Credit History | `docs/figma/credit-history/spec.md` | Credit transaction history designs |
| Figma Error States | `docs/figma/error-states/spec.md` | Error pages and payment modals |
