# Developer Quickstart: Email Verification Engine

**Feature**: 002-verification-engine
**Last Updated**: 2026-02-01

## Overview

This guide helps you set up the email verification engine locally for development and testing. You'll run the backend API, worker processes, and frontend dashboard.

---

## Prerequisites

From Epic 1 (already installed):
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- npm or yarn

New for this epic:
- BullMQ Pro license (ask team lead)
- Upstream email verification API key (ask team lead)

---

## Quick Setup (5 Minutes)

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../EmailVerify-Frontend
npm install
```

###

 2. Environment Variables

**Backend** (`backend/.env`):
```env
# Existing from Epic 1
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/emailkit
REDIS_URL=redis://localhost:6379
SESSION_SECRET=<from Epic 1>
CSRF_SECRET=<from Epic 1>
GOOGLE_CLIENT_ID=<from Epic 1>
GOOGLE_CLIENT_SECRET=<from Epic 1>

# New for Epic 2
UPSTREAM_API_KEY=<get from team lead>
UPSTREAM_API_URL=https://api.emailverify-provider.com
BULL_MQ_PRO_LICENSE=<get from team lead>
LOKI_URL=http://localhost:3100
OTEL_EXPORTER_URL=http://localhost:4318
```

**Frontend** (`EmailVerify-Frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. Database Migration

```bash
cd backend
npx drizzle-kit push
```

This creates the `verification_results` table.

### 4. Start Services

**Terminal 1** - Backend API:
```bash
cd backend
npm run dev
```

**Terminal 2** - Verification Workers:
```bash
cd backend
npm run workers
```

**Terminal 3** - Frontend:
```bash
cd EmailVerify-Frontend
npm run dev
```

### 5. Verify Setup

1. Open http://localhost:3001 (frontend auto-redirect from port 3000)
2. Sign in with Google or email/password
3. Navigate to /home/quick-verify
4. Enter test email: `test@gmail.com`
5. See verification result

---

## Development Workflow

### Running Tests

```bash
# Backend unit tests
cd backend
npm test

# Backend integration tests
npm run test:integration

# Backend contract tests
npm run test:contract

# Frontend tests
cd ../EmailVerify-Frontend
npm test
```

### Checking Health

```bash
# Liveness (always returns 200)
curl http://localhost:3000/health/live

# Readiness (checks PostgreSQL + Redis)
curl http://localhost:3000/health/ready

# Startup (checks workers connected)
curl http://localhost:3000/health/startup

# Prometheus metrics
curl http://localhost:3000/metrics
```

### Monitoring Queue

```bash
# Check queue depth
redis-cli GET queue:verification:count

# Check circuit breaker state
redis-cli GET cb:upstream:state

# Check credit balance for user
redis-cli GET user:<user-id>:credits
```

### Viewing Logs

With Grafana Loki (if running):
```bash
# Tail logs
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={job="emailkit-backend"}' | jq
```

Without Loki (console logs):
```bash
# Backend logs are JSON formatted
cd backend
npm run dev | pino-pretty
```

---

## Common Tasks

### Test Verification Flow

```bash
# Manual API call
curl -X POST http://localhost:3000/home/quick-verify \
  -H "Content-Type: application/json" \
  -H "Cookie: ev.session_token=<your-session-cookie>" \
  -d '{"email":"test@example.com"}'
```

### Trigger Circuit Breaker

```bash
# Simulate upstream failures (for testing)
# Set upstream URL to non-existent endpoint
export UPSTREAM_API_URL=http://localhost:9999/fake
npm run workers

# Watch circuit breaker open after 50% failure rate
redis-cli GET cb:upstream:state
```

### Run Credit Reconciliation

```bash
# Reconciliation runs every 5 minutes automatically
# To trigger manually:
cd backend
npm run reconcile:once
```

### Clean Old Verification Results

```bash
# Retention cleanup runs daily at 2 AM UTC
# To trigger manually:
cd backend
npm run cleanup:retention
```

---

## Troubleshooting

### Workers Not Starting

**Error**: `ECONNREFUSED` connecting to Redis

**Solution**:
```bash
# Check Redis is running
redis-cli ping
# Should return PONG

# If not running:
redis-server
```

### Queue Jobs Stuck

**Error**: Jobs in queue but not processing

**Solution**:
```bash
# Check worker logs for errors
cd backend
npm run workers

# Check BullMQ Pro license
echo $BULL_MQ_PRO_LICENSE
# Should be set

# Clear stalled jobs
redis-cli DEL bull:verification:stalled
```

### Verification Fails with 402

**Error**: `Insufficient credits`

**Solution**:
```bash
# Award yourself credits
redis-cli SET user:<your-user-id>:credits 1000

# Or run SQL
psql emailkit -c "INSERT INTO credit_events (user_id, type, amount, balance_after, idempotency_key) VALUES ('<your-user-id>', 'purchase', 1000, 1000, 'manual-credit-$(date +%s)');"
```

### Circuit Breaker Stuck Open

**Error**: All verifications fail with circuit breaker open

**Solution**:
```bash
# Reset circuit breaker state
redis-cli SET cb:upstream:state '{"state":"CLOSED","failureCount":0,"lastTransition":"2026-02-01T00:00:00Z"}'

# Restart workers
cd backend
npm run workers
```

### PostgreSQL Connection Errors

**Error**: `Connection terminated unexpectedly`

**Solution**:
```bash
# Check PostgreSQL is running
psql -U user -d emailkit -c "SELECT 1"

# Check connection pool settings
# Max connections should be >= 20 (10 API + 10 workers)
psql -U postgres -c "SHOW max_connections"
```

---

## Architecture Overview (Local Dev)

```
┌─────────────────────────────────────────────────────────┐
│  Your Machine                                            │
│                                                          │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────┐  │
│  │   Next.js    │    │   Express     │    │  Worker  │  │
│  │  (port 3001) │───>│  (port 3000)  │───>│  Process │  │
│  └──────────────┘    └───────┬───────┘    └────┬─────┘  │
│                               │                 │        │
│                          ┌────▼─────┐      ┌───▼────┐   │
│                          │PostgreSQL│      │ Redis  │   │
│                          │(port 5432│      │ (6379) │   │
│                          └──────────┘      └────────┘   │
│                                                 │        │
└─────────────────────────────────────────────────┼────────┘
                                                  │
                                           ┌──────▼──────┐
                                           │  Upstream   │
                                           │  API (mock) │
                                           └─────────────┘
```

**Data Flow**:
1. User submits email in Next.js frontend
2. POST /home/quick-verify to Express backend
3. Credit check (Redis Lua atomic deduct)
4. Job enqueued to BullMQ (Redis)
5. Worker picks up job
6. Circuit breaker checks state (Redis)
7. Call upstream API via undici pool
8. Store result in PostgreSQL
9. Return result + updated credit balance

---

## Useful Commands

### Database

```bash
# Connect to PostgreSQL
psql -U user -d emailkit

# View verification results
SELECT id, email, status, score FROM verification_results ORDER BY created_at DESC LIMIT 10;

# View credit events
SELECT * FROM credit_events ORDER BY created_at DESC LIMIT 10;

# View users with credits
SELECT u.email, SUM(ce.amount) as balance
FROM users u
LEFT JOIN credit_events ce ON ce.user_id = u.id
GROUP BY u.id, u.email;
```

### Redis

```bash
# Connect to Redis
redis-cli

# View all keys
KEYS *

# Check queue depth
LLEN bull:verification:wait

# Check active jobs
LLEN bull:verification:active

# View circuit breaker state
GET cb:upstream:state

# View credit balance
GET user:<uuid>:credits
```

### Logs

```bash
# Backend logs (JSON)
cd backend
npm run dev 2>&1 | tee logs/backend.log

# Worker logs
npm run workers 2>&1 | tee logs/workers.log

# Frontend logs
cd ../EmailVerify-Frontend
npm run dev 2>&1 | tee logs/frontend.log
```

---

## Mock Upstream API (For Testing)

If you don't have access to the real upstream API, use the mock server:

```bash
# Start mock server
cd backend
npm run mock:upstream

# Mock runs on port 8080
# Returns fake verification results
```

Update `.env`:
```env
UPSTREAM_API_URL=http://localhost:8080
UPSTREAM_API_KEY=mock-key-12345
```

---

## Next Steps

1. **Read the spec**: `specs/002-verification-engine/spec.md`
2. **Read the plan**: `specs/002-verification-engine/plan.md`
3. **Check contracts**: `specs/002-verification-engine/contracts/*.yaml`
4. **Run tests**: `npm test`
5. **Start implementing**: Follow tasks in `specs/002-verification-engine/tasks.md` (after Phase 2)

---

## Getting Help

- **Architecture questions**: See `docs/architecture.md`
- **API documentation**: See `specs/002-verification-engine/contracts/`
- **Data model**: See `specs/002-verification-engine/data-model.md`
- **Slack**: #emailkit-dev channel
- **Team lead**: @tech-lead on Slack

---

**Document Version**: 1.0
**Maintained by**: Engineering Team
**Last Review**: 2026-02-01
