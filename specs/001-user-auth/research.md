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

## Decision 10: Logging Library for Grafana Loki Integration

**Decision**: Pino with pino-loki transport, using worker threads for asynchronous logging.
**Rationale**:
- **Performance**: Pino is 5x faster than Winston with minimal CPU/memory overhead, critical for high-throughput verification platform (1000+ req/sec target)
- **Worker Thread Architecture**: Pino v7+ uses worker threads for transports, keeping main event loop unblocked even under high logging volume
- **Native Loki Integration**: pino-loki transport provides direct push to Grafana Loki with configurable batching (default: 5s interval, 10,000 buffer)
- **Structured JSON by Default**: Pino outputs structured JSON logs natively, required for Loki indexing and querying
- **OpenTelemetry Compatibility**: Built-in formatters API allows easy injection of trace IDs, span IDs via `@opentelemetry/api`
- **Modern Stack Alignment**: Requires Node.js 20+ (matches architecture spec), uses native fetch API
- **Deployment Simplicity**: Direct push API eliminates need for Promtail sidecar (deprecated, EOL March 2026)

**Configuration Details**:
```typescript
import pino from 'pino';
import { trace } from '@opentelemetry/api';
import type { LokiOptions } from 'pino-loki';

const transport = pino.transport<LokiOptions>({
  target: 'pino-loki',
  options: {
    host: process.env.LOKI_HOST, // Grafana Loki endpoint
    batching: {
      interval: 5,           // Send logs every 5 seconds
      maxBufferSize: 50000   // Larger buffer for high-volume platform
    },
    labels: {
      application: 'emailkit',
      environment: process.env.NODE_ENV,
      service: 'auth-service'  // Service-level label (low cardinality)
    },
    structuredMetaKey: 'meta', // Structured metadata sent to Loki
    basicAuth: {
      username: process.env.LOKI_USERNAME,
      password: process.env.LOKI_PASSWORD
    }
  }
});

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    log: (log) => {
      // Inject OpenTelemetry trace context
      const currentSpan = trace.getActiveSpan();
      if (currentSpan) {
        const { traceId, spanId, traceFlags } = currentSpan.spanContext();
        log.traceId = traceId;
        log.spanId = spanId;
        log.traceFlags = traceFlags;
      }
      return log;
    }
  }
}, transport);
```

**Log Format Standards**:
- **Level**: Use standard Pino levels (fatal, error, warn, info, debug, trace) — default to `info` in production
- **Required Fields**: `timestamp`, `level`, `msg`, `traceId`, `spanId` (when in trace context)
- **Structured Metadata**: Use `meta` key for high-cardinality data (user IDs, email addresses, job IDs) — NOT as Loki labels
- **Loki Labels** (low cardinality only): `application`, `environment`, `service`, `tier` (Starter/Pro/etc)
- **Field Naming**: snake_case to match Loki/Prometheus conventions

**Label Cardinality Rules** (from Grafana best practices):
- Keep total active streams < 100,000 per tenant
- Never use unbounded values as labels (user IDs, email addresses, timestamps, UUIDs)
- Use labels only for: regions, clusters, environments, services, tiers (bounded sets)
- High-cardinality data goes in structured metadata or log message, NOT labels

**Deployment Pattern**:
- **Recommended**: Direct push API via pino-loki (eliminates sidecar)
- **Alternative**: Grafana Alloy agent (Promtail replacement, EOL-safe) if centralized log collection is required
- **Retention**: Configure Loki for 30-day retention as per architecture requirement

**Alternatives considered**:
- **Winston + winston-loki**: More complex API, slower performance (5x slower than Pino), heavier CPU/memory footprint. Less suitable for high-throughput platform.
- **Promtail Sidecar**: Deprecated (EOL March 2, 2026), requires extra container/process, adds operational complexity. Direct push is simpler and future-proof.
- **Grafana Alloy**: Unified observability collector, better for multi-signal scenarios (metrics + logs + traces), but overkill for simple log shipping. Consider if migrating to full Grafana stack.
- **Manual Loki HTTP API**: No batching, no reconnect logic, no worker threads — reinventing pino-loki. Not recommended.

**References**:
- Pino documentation: https://github.com/pinojs/pino
- pino-loki transport: https://github.com/Julien-R44/pino-loki
- Grafana Loki label best practices: https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/
- OpenTelemetry Pino integration: https://www.npmjs.com/package/@opentelemetry/instrumentation-pino
- Promtail deprecation notice: https://grafana.com/docs/loki/latest/send-data/promtail/

---

## Research: Kubernetes Health Check Implementation (2026-02-01)

### Overview

Research on implementing Kubernetes health check endpoints for Node.js backend with PostgreSQL and Redis dependencies. Target: 1-second timeout to prevent blocking K8s probes.

### 1. Liveness vs Readiness vs Startup Probes

**Key Differences**:

| Probe Type | Purpose | On Failure | Check Frequency |
|------------|---------|-----------|-----------------|
| **Liveness** | Is the application running? | Restart container | After startup passes |
| **Readiness** | Can it accept traffic? | Remove from load balancer | After startup passes |
| **Startup** | Has it finished initializing? | Restart if exceeds threshold | Until first success |

**Critical Design Principle**:
- **Liveness probes MUST be lightweight** and check ONLY internal application health
- **NEVER depend on external services** (database, cache) in liveness probes
- If liveness checks database and database fails → pod enters restart loop
- **Readiness probes CAN check external dependencies** (safe to temporarily remove from load balancer)

**Sources**:
- [Kubernetes Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Readiness vs. Liveness Probes Differences](https://medium.com/@jrkessl/readiness-vs-liveness-probes-what-is-the-difference-and-startup-probes-215560f043e4)
- [Kubernetes Liveness Probes Configuration](https://www.groundcover.com/blog/kubernetes-liveness-probe)

### 2. PostgreSQL Connection Pool Health Check

**Pattern**: Use `SELECT 1` query with connection pool timeout.

**Implementation**:

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  min: 5,
  connectionTimeoutMillis: 1000,    // 1s timeout for health checks
  idleTimeoutMillis: 30000,
  query_timeout: 1000,              // Client-side query timeout
  statement_timeout: 1000           // Server-side query timeout
});

async function checkPostgresHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    return false;
  }
}
```

**Key Timeout Parameters**:
- `connectionTimeoutMillis`: Timeout for acquiring connection from pool
- `query_timeout`: Client-side timeout before aborting query
- `statement_timeout`: Server-side timeout (PostgreSQL terminates query)

**Pool Health Metrics** (for monitoring):
```typescript
{
  totalCount: pool.totalCount,      // Total connections in pool
  idleCount: pool.idleCount,        // Idle connections
  waitingCount: pool.waitingCount   // Queries waiting for connection
}
```

**Sources**:
- [node-postgres Pool API](https://node-postgres.com/apis/pool)
- [How to Implement Connection Pooling in Node.js](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view)
- [Best way to check pool health? Issue #3208](https://github.com/brianc/node-postgres/issues/3208)
- [Set timeout for 1 query when using pg-pool](https://github.com/brianc/node-postgres/issues/2652)

### 3. Redis Health Check with Timeout

**Pattern**: Use `ping()` command with Promise.race() timeout or built-in commandTimeout.

**Implementation Option 1 - Built-in Command Timeout**:

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  commandTimeout: 1000,  // 1s timeout for all commands
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: null   // Fail fast for health checks
});

async function checkRedisHealth(): Promise<boolean> {
  try {
    // Check connection status first
    if (redis.status === 'wait' || redis.status === 'end') {
      return false;
    }

    await redis.ping();
    return true;
  } catch (error) {
    return false;
  }
}
```

**Implementation Option 2 - Promise.race() Pattern**:

```typescript
async function checkRedisHealthWithTimeout(): Promise<boolean> {
  try {
    const pingPromise = redis.ping();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Redis ping timeout')), 1000);
    });

    await Promise.race([pingPromise, timeoutPromise]);
    return true;
  } catch (error) {
    return false;
  }
}
```

**Key Configuration**:
- `commandTimeout`: Global timeout for all Redis commands
- `enableOfflineQueue: false`: Don't queue commands when disconnected (fail fast)
- `maxRetriesPerRequest: 1`: Minimal retries for health checks
- Check `redis.status` before pinging (values: 'wait', 'connecting', 'ready', 'end')

**Sources**:
- [ioredis GitHub Repository](https://github.com/redis/ioredis)
- [ioredis npm Package](https://www.npmjs.com/package/ioredis)
- [Fix Azure Cache for Redis Long Hangup](https://tanutaran.medium.com/fix-azure-cache-for-redis-long-hangup-and-unstable-connection-for-node-js-node-redis-69304670fcc5)
- [ioredis API Documentation](https://ioredis.readthedocs.io/en/latest/API/)
- [ioredis CommonRedisOptions](https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html)

### 4. Express Health Check Endpoints

**Pattern**: Separate `/health/live`, `/health/ready`, `/health/startup` endpoints with request timeout.

**Implementation**:

```typescript
import express from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';

const app = express();

// Liveness: Only check if process is alive (no external deps)
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: Check external dependencies
app.get('/health/ready', async (req, res) => {
  const checks: Record<string, boolean> = {};

  try {
    // Set overall timeout for readiness check
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), 1000);
    });

    const healthCheckPromise = (async () => {
      // Check PostgreSQL
      checks.postgres = await checkPostgresHealth();

      // Check Redis
      checks.redis = await checkRedisHealth();

      return checks;
    })();

    const results = await Promise.race([healthCheckPromise, timeoutPromise]);

    const allHealthy = Object.values(results).every(v => v === true);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ready' : 'not_ready',
      checks: results
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      checks,
      error: error.message
    });
  }
});

// Startup: Same as readiness for this application
app.get('/health/startup', async (req, res) => {
  // Can be same as /health/ready or simplified
  res.status(200).json({ status: 'ok' });
});
```

**Endpoint Naming Conventions**:
- Kubernetes community standard: `/readyz`, `/livez`, `/startupz`
- Alternative: `/health/ready`, `/health/live`, `/health/startup`
- Both are acceptable; choose one and be consistent

**Timeout Implementation**:
- Use `Promise.race()` to enforce 1-second overall timeout
- Individual checks (PostgreSQL, Redis) should have < 1s timeouts
- Return 503 (Service Unavailable) for failed readiness checks
- Return 200 (OK) for successful checks

**Sources**:
- [IBM Health Checks in Kubernetes for Node.js](https://developer.ibm.com/tutorials/health-checking-kubernetes-nodejs-application/)
- [Express.js Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)
- [Node.js Reference Architecture - Health Checks](https://nodeshift.dev/nodejs-reference-architecture/operations/healthchecks/)
- [readyz and livez with NodeJS/Express](https://klaushofrichter.medium.com/readyz-and-livez-getting-started-with-kubernetes-health-endpoints-using-nodejs-express-aeeddc6ebb93)
- [Managing Async Operations with AbortController](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html)

### 5. Kubernetes Probe Configuration

**YAML Configuration Example**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: emailkit-backend
spec:
  template:
    spec:
      containers:
      - name: backend
        image: emailkit/backend:latest
        ports:
        - containerPort: 3000

        # Startup probe - for slow initialization
        startupProbe:
          httpGet:
            path: /health/startup
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          failureThreshold: 12      # 5s + (12 × 5s) = 65s max startup time
          timeoutSeconds: 1

        # Liveness probe - lightweight, no external deps
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 0    # Startup probe handles delay
          periodSeconds: 10
          failureThreshold: 3       # 3 failures × 10s = 30s before restart
          timeoutSeconds: 1

        # Readiness probe - checks external dependencies
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 0    # Startup probe handles delay
          periodSeconds: 5
          failureThreshold: 3       # 3 failures × 5s = 15s before removal
          successThreshold: 1
          timeoutSeconds: 1
```

**Configuration Best Practices**:

| Parameter | Liveness | Readiness | Startup |
|-----------|----------|-----------|---------|
| `initialDelaySeconds` | 0 (use startup) | 0 (use startup) | 5-10s |
| `periodSeconds` | 10s | 5s | 5s |
| `failureThreshold` | 3 | 3 | 12-30 |
| `timeoutSeconds` | 1s | 1s | 1s |
| `successThreshold` | 1 (fixed) | 1-2 | 1 (fixed) |

**Key Principles**:
- `initialDelaySeconds`: Set to 0 for liveness/readiness when using startup probe
- `periodSeconds`: Balance between fast detection and resource usage (5-10s typical)
- `failureThreshold`: `failureThreshold × periodSeconds` = total time before action
- `timeoutSeconds`: Keep at 1s to prevent cascading delays
- For slow apps: Use startup probe with high `failureThreshold × periodSeconds` (e.g., 30 × 10 = 300s)

**Startup Probe for Slow Applications**:
- Node.js apps typically start in 5-30s
- Configure: `initialDelaySeconds: 10, periodSeconds: 5, failureThreshold: 10` = 60s max
- Liveness/readiness probes only start AFTER startup probe succeeds
- Prevents premature container restarts during initialization

**Sources**:
- [Kubernetes Startup Probes Examples & Pitfalls](https://loft.sh/blog/kubernetes-startup-probes-examples-common-pitfalls/)
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes Readiness Probes Guide](https://www.groundcover.com/blog/kubernetes-readiness-probe)
- [Kubernetes Health Checks and Probes](https://betterstack.com/community/guides/monitoring/kubernetes-health-checks/)
- [k8s-probes-demo YAML Example](https://github.com/Praqma/k8s-probes-demo/blob/master/readiness-liveness-with-startup-probe.yaml)

### 6. Recommended Libraries

**Option 1: Lightweight (Recommended for EmailKit)**:
- Manual implementation with `Promise.race()` timeout
- Direct integration with existing `pg` and `ioredis` clients
- Minimal dependencies, full control over health logic

**Option 2: Libraries**:
- **lightship** - Abstracts readiness/liveness/startup checks and graceful shutdown
  - GitHub: [gajus/lightship](https://github.com/gajus/lightship)
  - npm: [lightship](https://www.npmjs.com/package/lightship)
- **kubernetes-health** - Helper for implementing K8s health checks
  - GitHub: [jacobwgillespie/kubernetes-health](https://github.com/jacobwgillespie/kubernetes-health)
  - npm: [kubernetes-health](https://www.npmjs.com/package/kubernetes-health)
- **terminus** - Health checks and graceful shutdown for Express
  - Provides cleanup logic for graceful shutdowns and health check logic

**Decision for EmailKit**: Manual implementation preferred
- Keeps dependencies minimal
- Full control over timeout behavior
- Simpler to debug and maintain
- Architecture already specifies Express, pg, and ioredis

### 7. Implementation Summary

**Liveness Endpoint** (`/health/live`):
```typescript
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```
- No external dependencies
- Always returns 200 if process is running
- Instant response (< 1ms)

**Readiness Endpoint** (`/health/ready`):
```typescript
app.get('/health/ready', async (req, res) => {
  try {
    const [pgHealthy, redisHealthy] = await Promise.all([
      checkPostgresHealth(),
      checkRedisHealth()
    ]);

    if (pgHealthy && redisHealthy) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({
        status: 'not_ready',
        postgres: pgHealthy,
        redis: redisHealthy
      });
    }
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});
```
- Checks PostgreSQL (SELECT 1 with 1s timeout)
- Checks Redis (PING with 1s timeout)
- Parallel execution with `Promise.all()`
- Returns 503 if any dependency fails
- Total time: < 1s (enforced by individual check timeouts)

**Startup Endpoint** (`/health/startup`):
- Can be same as readiness or simplified
- Only checked during pod initialization
- After first success, K8s switches to liveness/readiness probes

### 8. Monitoring and Debugging

**Health Check Logs**:
```typescript
async function checkPostgresHealth(): Promise<boolean> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      console.log(`[HEALTH] PostgreSQL check passed (${Date.now() - start}ms)`);
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`[HEALTH] PostgreSQL check failed (${Date.now() - start}ms):`, error.message);
    return false;
  }
}
```

**Prometheus Metrics** (optional):
- `health_check_duration_seconds{endpoint="ready",dependency="postgres"}`
- `health_check_failures_total{endpoint="ready",dependency="postgres"}`
- `health_check_status{endpoint="ready"}` (1 = healthy, 0 = unhealthy)

**Debugging Failed Probes**:
```bash
# View pod events
kubectl describe pod <pod-name>

# View probe logs
kubectl logs <pod-name> | grep HEALTH

# Test health endpoints directly
kubectl exec <pod-name> -- curl localhost:3000/health/ready
```

### Research Complete

All required information gathered:
- ✅ Liveness vs readiness vs startup probe differences
- ✅ PostgreSQL connection pool health check pattern (SELECT 1 with timeout)
- ✅ Redis ping with timeout implementation (ioredis commandTimeout + Promise.race)
- ✅ K8s probe configuration (YAML with initialDelaySeconds, periodSeconds, timeoutSeconds)
- ✅ Timeout implementation to prevent blocking probes (1-second timeout via Promise.race)
- ✅ Express endpoint implementation patterns
- ✅ Best practices for Node.js applications with external dependencies

**Next Steps**: Implement health check endpoints in backend implementation phase.
