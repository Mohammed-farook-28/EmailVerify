# EmailKit Test Plan — Minimal Smoke Tests

**Version**: 2.0 | **Date**: 2026-02-10
**Framework**: Vitest 2.x + Supertest 7.x (both already in devDependencies)
**Philosophy**: Real DB, real Redis, no mocks except upstream API and Stripe.

---

## Setup

- **Test DB**: `emailkit_test` — Drizzle `db:push` to sync schema before tests
- **Test Redis**: Same host, DB index 1 (`/1`) — flushed between suites
- **`.env.test`**: Points to test DB + test Redis, mock upstream, Stripe test keys
- **Upstream API**: Mocked via `vi.mock` (never hit real upstream in tests)
- **Stripe**: Mocked (use real Stripe test-mode webhooks for manual E2E later)

```
backend/
  tests/
    setup.ts              # Connect test DB + Redis, push schema
    teardown.ts           # Close connections
    helpers/
      factories.ts        # createUser, createSession, createApiKey, seedCredits
      app.ts              # Export supertest-wrapped Express app
    smoke/
      01-auth.test.ts
      02-credits.test.ts
      03-quick-verify.test.ts
      04-api-v1.test.ts
      05-billing-webhook.test.ts
      06-pure-functions.test.ts
    fixtures/
      valid-emails.csv
```

---

## Tests (22 total)

### 01-auth.test.ts (4 tests)

| # | Test | What it proves |
|---|------|---------------|
| 1 | Sign up → verify email → get session cookie | Full registration flow works |
| 2 | Sign in with valid credentials → get session cookie | Login works |
| 3 | Sign in with wrong password → 401 | Auth rejects bad creds |
| 4 | Authenticated route without session → 401 | Session guard works |

### 02-credits.test.ts (4 tests)

All tests use real DB + real Redis.

| # | Test | What it proves |
|---|------|---------------|
| 1 | New user gets signup bonus → `GET /api/billing/info` shows correct balance | Signup bonus + balance read works |
| 2 | `deductCredits(user, 5, ref)` → balance decreases by 5 in both Redis and DB | Deduction is consistent across both stores |
| 3 | `deductCredits` with amount > balance → throws "Insufficient credits" | Overdraft protection works |
| 4 | 10 parallel `deductCredits(user, 1, ...)` calls on balance of 10 → final balance is 0, not negative | Row-locking prevents race conditions |

### 03-quick-verify.test.ts (3 tests)

| # | Test | What it proves |
|---|------|---------------|
| 1 | `POST /home/quick-verify` with session + credits → 200, credit deducted, job enqueued | Happy path end-to-end |
| 2 | `POST /home/quick-verify` with 0 credits → 402 | Credit gate works |
| 3 | `GET /home/quick-verify/recent` returns user's results only | Ownership isolation |

### 04-api-v1.test.ts (4 tests)

| # | Test | What it proves |
|---|------|---------------|
| 1 | Create API key → use key in `Authorization: Bearer` → `POST /api/v1/verify` returns result | Full API key auth + verify flow |
| 2 | `POST /api/v1/verify` without API key → 401 | Auth gate works |
| 3 | `POST /api/v1/verify` with expired API key → 401 | Expiry enforcement |
| 4 | `GET /api/v1/credits` with valid API key → returns balance | Credit balance via API |

### 05-billing-webhook.test.ts (3 tests)

| # | Test | What it proves |
|---|------|---------------|
| 1 | Simulate `checkout.session.completed` webhook → credits added to user | One-time purchase flow |
| 2 | Simulate `invoice.paid` webhook → subscription credits added | Subscription renewal flow |
| 3 | Duplicate webhook with same event ID → credits NOT double-added | Idempotency works |

### 06-pure-functions.test.ts (4 tests)

These are genuine unit tests — no mocking, no DB, no Redis.

| # | Test | What it proves |
|---|------|---------------|
| 1 | `hashPassword()` + `verifyPassword()` round-trip | Bcrypt works correctly |
| 2 | `signWebhookPayload()` + `verifyWebhookSignature()` round-trip | HMAC signing/verification |
| 3 | `verifyWebhookSignature()` rejects tampered payload | Tamper detection |
| 4 | `verifyWebhookSignature()` rejects expired timestamp | Replay protection |

---

## What's NOT tested (and why)

| Skipped | Reason |
|---------|--------|
| SSE streaming | Hard to test in Supertest; manually verify in browser |
| Bulk CSV upload + worker processing | Too many moving parts for smoke tests; test manually with mock upstream |
| Circuit breaker state transitions | Test manually by killing mock upstream |
| Reconciliation worker | Test manually; the credit concurrency test (#2.4) proves the core logic |
| Webhook delivery + retry | Test manually; HMAC pure function test proves signing works |
| Rate limiting | Test manually; easy to verify with `curl` in a loop |
| File parser (CSV/Excel) | Add later if CSV parsing bugs show up |

---

## Running

```bash
# One-time setup
createdb emailkit_test
cp .env .env.test  # Edit to point at emailkit_test + Redis db 1

# Run
npm run test              # All tests
npm run test:unit         # Pure function tests only (no DB needed)
npm run test -- --watch   # Watch mode during development
```
