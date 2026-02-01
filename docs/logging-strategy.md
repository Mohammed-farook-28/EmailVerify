# Logging Strategy: Pino + Grafana Loki

**Document Version**: 1.0.0
**Date**: 2026-02-01
**Status**: Approved
**Research Context**: 001-user-auth feature specification

---

## Executive Summary

**Selected Stack**: Pino logger + pino-loki transport → Grafana Loki (30-day retention)

**Key Requirements Met**:
- ✅ Structured JSON logging with OpenTelemetry trace ID correlation
- ✅ High-performance async logging (worker threads, non-blocking I/O)
- ✅ Direct integration with Grafana Loki for centralized log aggregation
- ✅ INFO-level default with configurable levels per environment
- ✅ 30-day retention in Loki with queryable structured metadata
- ✅ Low operational overhead (no sidecar required)

---

## 1. Decision: Pino over Winston

### Performance Comparison

| Metric | Pino | Winston |
|--------|------|---------|
| Speed | 5x faster | Baseline |
| CPU Overhead | Minimal | Higher |
| Memory Footprint | Low | Higher |
| Async Transport | Worker threads (native) | Custom implementation |
| JSON Output | Default | Requires configuration |
| Loki Integration | pino-loki (active, 2.x) | winston-loki (less maintained) |
| Node.js 20+ Support | Native fetch API | Requires polyfill |

### Why Pino Wins for EmailKit

1. **High-Throughput Platform**: Target 1,000+ req/sec across 1000+ tenants requires minimal logging overhead
2. **Non-Blocking Architecture**: Pino v7+ uses worker threads for all transports, keeping main event loop free
3. **Native JSON Structured Logging**: No additional formatting required, Loki ingests directly
4. **Modern Node.js Alignment**: Built for Node.js 20+ with native fetch (matches architecture spec)
5. **Active Maintenance**: pino-loki actively maintained with v2.x releases in 2024-2025

**Code Comparison**:

```typescript
// ❌ Winston (more verbose, requires manual JSON formatting)
const winston = require('winston');
const LokiTransport = require('winston-loki');

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new LokiTransport({
      host: 'http://loki:3100',
      json: true,
      labels: { app: 'emailkit' }
    })
  ]
});

// ✅ Pino (concise, JSON by default, worker thread transport)
import pino from 'pino';

const logger = pino({
  level: 'info'
}, pino.transport({
  target: 'pino-loki',
  options: {
    host: 'http://loki:3100',
    labels: { application: 'emailkit' }
  }
}));
```

---

## 2. Loki Transport Configuration

### Production-Ready Setup

```typescript
// logger.ts
import pino from 'pino';
import { trace } from '@opentelemetry/api';
import type { LokiOptions } from 'pino-loki';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Development: Pretty print to console
// Production: JSON to Loki
const transport = isProduction
  ? pino.transport<LokiOptions>({
      target: 'pino-loki',
      options: {
        host: process.env.LOKI_HOST!, // e.g., https://loki.emailkit.io
        batching: {
          interval: 5,           // Send batched logs every 5 seconds
          maxBufferSize: 50000   // Buffer up to 50K logs (high-volume platform)
        },
        labels: {
          application: 'emailkit',
          environment: process.env.NODE_ENV,
          service: process.env.SERVICE_NAME || 'backend', // auth-service, worker-service, etc.
          region: process.env.REGION || 'us-east-1'
        },
        structuredMetaKey: 'meta', // High-cardinality data goes here (NOT labels)
        basicAuth: process.env.LOKI_USERNAME && process.env.LOKI_PASSWORD
          ? {
              username: process.env.LOKI_USERNAME,
              password: process.env.LOKI_PASSWORD
            }
          : undefined,
        // Optional: Custom headers for API key auth
        headers: process.env.LOKI_API_KEY
          ? { 'X-Scope-OrgID': 'emailkit' }
          : undefined,
      }
    })
  : pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname'
      }
    });

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',

  // Inject OpenTelemetry trace context into every log
  formatters: {
    log: (log) => {
      const currentSpan = trace.getActiveSpan();
      if (currentSpan) {
        const { traceId, spanId, traceFlags } = currentSpan.spanContext();
        log.traceId = traceId;
        log.spanId = spanId;
        log.traceFlags = traceFlags;
      }
      return log;
    }
  },

  // Base fields included in every log
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || require('os').hostname()
  },

  // Redact sensitive fields
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'apiKey'],
    censor: '[REDACTED]'
  }
}, transport);

// Child loggers for specific modules
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};
```

### Usage Examples

```typescript
import { logger, createModuleLogger } from './logger';

// Basic logging
logger.info('Server started on port 3000');
logger.error({ err: new Error('DB connection failed') }, 'Database error');

// Module-specific logger
const authLogger = createModuleLogger('auth');
authLogger.info({ userId: '123', email: 'user@example.com' }, 'User signed in');

// High-cardinality data in structured metadata (NOT labels)
logger.info({
  meta: {
    userId: 'user_abc123',
    jobId: 'job_xyz789',
    emailCount: 1500
  }
}, 'Bulk verification job created');

// Trace-aware logging (automatic traceId/spanId injection)
// When inside an OpenTelemetry span, logs automatically include trace context
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('emailkit');
const span = tracer.startSpan('verify-email');
logger.info({ email: 'test@example.com' }, 'Verifying email');
span.end();
// Log output: { traceId: '...', spanId: '...', email: 'test@example.com', msg: 'Verifying email' }
```

---

## 3. OpenTelemetry Trace Correlation

### Automatic Trace ID Injection

**Goal**: Every log line within an active span should include `traceId`, `spanId`, and `traceFlags` for correlation in Grafana.

**Implementation**:

```typescript
// Pino formatter extracts trace context from active span
import { trace } from '@opentelemetry/api';

const logger = pino({
  formatters: {
    log: (log) => {
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
});
```

**Alternative: Use OpenTelemetry Instrumentation**

```bash
npm install @opentelemetry/instrumentation-pino
```

```typescript
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

// Register instrumentation (auto-injects trace context)
new PinoInstrumentation({
  logKeys: {
    traceId: 'traceId',   // Customize field names
    spanId: 'spanId',
    traceFlags: 'traceFlags'
  }
});
```

### Querying Logs by Trace ID in Grafana

```logql
# Find all logs for a specific trace
{application="emailkit"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"

# Find error logs with trace context
{application="emailkit"} | json | level="error" | traceId!=""
```

---

## 4. Loki Label Strategy

### Label Cardinality Rules

**Critical**: Loki performance degrades with high-cardinality labels. Keep total streams < 100,000 per tenant.

**✅ Good Labels (Low Cardinality)**:
- `application`: Fixed value (`emailkit`)
- `environment`: Bounded set (`development`, `staging`, `production`)
- `service`: Fixed set (`auth-service`, `worker-service`, `api-gateway`)
- `region`: Bounded AWS/DO regions (`us-east-1`, `eu-west-1`)
- `tier`: User tier (`starter`, `professional`, `enterprise`) — max 9 values
- `tier_group`: Aggregated tier (`free`, `paid`) — max 2 values

**❌ Bad Labels (High Cardinality)**:
- ❌ `userId`: Unbounded (1000+ users → 1000+ streams)
- ❌ `jobId`: Unbounded (millions of jobs)
- ❌ `email`: Unbounded (infinite email addresses)
- ❌ `requestId`: Unbounded (one per request)
- ❌ `timestamp`: Continuous values

**Use Structured Metadata Instead**:

```typescript
// ❌ Wrong: High-cardinality data as labels
logger.info({
  userId: 'user_12345',  // This becomes a Loki label → BAD
  jobId: 'job_67890'
}, 'Job created');

// ✅ Correct: High-cardinality data in structured metadata
logger.info({
  meta: {
    userId: 'user_12345',  // Indexed metadata, queryable but not a stream label
    jobId: 'job_67890'
  }
}, 'Job created');
```

### Label Configuration

```typescript
const transport = pino.transport<LokiOptions>({
  target: 'pino-loki',
  options: {
    labels: {
      application: 'emailkit',
      environment: process.env.NODE_ENV,
      service: process.env.SERVICE_NAME || 'backend',
      region: process.env.REGION || 'us-east-1'
      // Total unique combinations: 1 × 3 × 5 × 3 = 45 streams (well within limits)
    },
    structuredMetaKey: 'meta', // High-cardinality data goes here
  }
});
```

### Naming Conventions

| Element | Format | Example | Notes |
|---------|--------|---------|-------|
| Labels | snake_case | `application`, `service_name`, `tier_group` | Must match `[a-zA-Z_:][a-zA-Z0-9_:]*` |
| Metadata Keys | camelCase | `userId`, `jobId`, `emailCount` | Standard JavaScript conventions |
| Reserved Prefixes | `__*__`, `grafana_*` | `__stream_shard__`, `grafana_cloud_token` | Avoid these |

---

## 5. Log Levels and Standards

### Standard Levels (Pino)

| Level | Numeric Value | Usage |
|-------|---------------|-------|
| `fatal` | 60 | Process crash, requires immediate restart |
| `error` | 50 | Request failed, exception thrown, data loss |
| `warn` | 40 | Degraded state, retry succeeded, config issue |
| `info` | 30 | **Default production level** — Business events, lifecycle |
| `debug` | 20 | Detailed diagnostics, variable values, flow control |
| `trace` | 10 | Very verbose, function entry/exit, loop iterations |

### Production Standard

**Default Level**: `info` (level 30)

**Log Volume Guidelines**:
- `info`: 1-10 logs per request (business events only)
- `warn`: < 1% of requests (degraded states)
- `error`: < 0.1% of requests (actual failures)

**Structured Log Format**:

```typescript
// ✅ Good: Structured fields + concise message
logger.info({
  meta: { userId: 'user_123', credits: 500 },
  duration: 250
}, 'Credit purchase completed');

// ❌ Bad: String interpolation loses structure
logger.info(`User user_123 purchased 500 credits in 250ms`);
```

### Required Fields

Every log line should include:

```typescript
{
  "timestamp": "2026-02-01T12:34:56.789Z",  // ISO 8601 (automatic)
  "level": "info",                          // Pino level name
  "msg": "Human-readable message",          // Brief description
  "traceId": "4bf92f3577b34da6a3ce929d...", // OpenTelemetry trace ID (if in span)
  "spanId": "00f067aa0ba902b7",             // OpenTelemetry span ID (if in span)
  "service": "auth-service",                // From labels
  "meta": {                                 // High-cardinality structured data
    "userId": "user_abc123",
    "operation": "password_reset"
  }
}
```

---

## 6. Deployment Pattern: Direct Push vs. Promtail vs. Alloy

### Recommended: Direct Push API (pino-loki)

**Advantages**:
- ✅ No sidecar process required (simpler Docker/K8s manifests)
- ✅ Built-in batching and retry logic
- ✅ Worker thread offloads I/O from main application thread
- ✅ Lower latency (no intermediate buffer on disk)

**Disadvantages**:
- ❌ Application must be network-reachable to Loki
- ❌ No log transformation/enrichment at collection layer

**When to Use**: Default choice for most scenarios, especially containerized apps with direct Loki access.

---

### Alternative 1: Grafana Alloy (Promtail Replacement)

**Context**: Promtail is deprecated (EOL March 2, 2026). Grafana Alloy is the official successor.

**Advantages**:
- ✅ Unified observability collector (logs + metrics + traces)
- ✅ Advanced log processing (relabeling, filtering, transformation)
- ✅ Service discovery (auto-detect containers, pods)
- ✅ OpenTelemetry Protocol (OTLP) support

**Disadvantages**:
- ❌ Extra sidecar/DaemonSet deployment complexity
- ❌ Overkill if only shipping logs (not metrics/traces)

**When to Use**:
- Multi-signal observability (logs + metrics + traces in one pipeline)
- Complex log transformation requirements
- Service discovery needed (dynamic container environments)

**Deployment Example (Kubernetes)**:

```yaml
# alloy-config.yaml
logging {
  level = "info"
  format = "json"
}

loki.source.file "logs" {
  targets = [
    {__path__ = "/var/log/emailkit/*.log"},
  ]
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "https://loki.emailkit.io/loki/api/v1/push"
    basic_auth {
      username = env("LOKI_USERNAME")
      password = env("LOKI_PASSWORD")
    }
  }
}
```

---

### ❌ Deprecated: Promtail Sidecar

**Status**: End-of-Life March 2, 2026 — DO NOT USE for new deployments.

**Migration Path**: Use `alloy convert --source-format=promtail` to migrate existing Promtail configs to Alloy.

---

## 7. Batching and Performance

### Batching Configuration

**Default**: 5-second interval, 10,000 log buffer

**High-Volume Tuning**:

```typescript
const transport = pino.transport<LokiOptions>({
  target: 'pino-loki',
  options: {
    batching: {
      interval: 5,          // Send every 5 seconds (balance latency vs. request overhead)
      maxBufferSize: 50000  // 50K logs max (prevents memory bloat if Loki unreachable)
    }
  }
});
```

**Buffer Overflow Behavior**: When buffer reaches `maxBufferSize`, **oldest logs are dropped** (FIFO eviction). This prevents memory exhaustion but results in data loss during Loki outages.

### Worker Thread Performance

Pino v7+ uses worker threads for all transports:

```typescript
// Main thread: Fast serialization to JSON
logger.info({ userId: '123' }, 'Event');

// Worker thread (automatic): Network I/O to Loki
// → Main thread remains unblocked, no impact on HTTP response latency
```

**When NOT to Use Worker Thread**:
- Logging only to local files (`pino.destination('./app.log')`)
- Very low log volume (< 10 logs/sec)

**Reason**: Worker thread adds ~100μs overhead per log. For local file writes, direct `pino.destination()` is faster.

---

## 8. Grafana Loki Retention and Querying

### Retention Policy

**Requirement**: 30 days retention (from architecture spec)

**Loki Configuration**:

```yaml
# loki-config.yaml
limits_config:
  retention_period: 720h  # 30 days

compactor:
  working_directory: /loki/compactor
  shared_store: s3
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
```

### Query Examples

```logql
# All info-level logs from auth service in last hour
{application="emailkit", service="auth-service"} | json | level="info"

# Error logs with trace context
{application="emailkit"} | json | level="error" | traceId!=""

# Logs for specific user (high-cardinality metadata)
{application="emailkit"} | json | meta_userId="user_abc123"

# Failed password reset attempts
{application="emailkit"} | json | meta_operation="password_reset" | level="error"

# Top 10 errors by message
sum by (msg) (count_over_time({application="emailkit"} | json | level="error" [1h]))
  | topk(10)
```

---

## 9. Security and Compliance

### Sensitive Data Redaction

**Pino Redaction**:

```typescript
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',  // Bearer tokens
      'req.headers.cookie',          // Session cookies
      'password',                    // User passwords
      'apiKey',                      // API keys
      'email',                       // PII (if required by compliance)
      'meta.creditCard'              // Payment data
    ],
    censor: '[REDACTED]',
    remove: false  // Keep key, replace value
  }
});

// Input
logger.info({ password: 'secret123', username: 'alice' }, 'User login');

// Output
// { password: '[REDACTED]', username: 'alice', msg: 'User login' }
```

### GDPR Considerations

**Log Retention**: 30 days complies with GDPR "storage limitation" principle (data retained only as long as necessary).

**Right to Erasure**: If user requests data deletion, purge logs by `meta.userId`:

```logql
# Identify log streams to delete
{application="emailkit"} | json | meta_userId="user_to_delete"
```

**Note**: Loki does not support selective log deletion within a stream. If GDPR "right to erasure" is strict requirement, consider:
1. Shorter retention (7-14 days)
2. External log masking service
3. Anonymize user IDs in logs (hash with salt)

---

## 10. Cost Optimization

### Reduce Log Volume

**Strategy 1: Sampling**

```typescript
// Only log 10% of info-level verification success events
if (Math.random() < 0.1 || level !== 'info') {
  logger.info({ meta: { jobId } }, 'Email verified');
}
```

**Strategy 2: Dynamic Log Levels**

```typescript
// Increase verbosity for specific users (debugging)
const logLevel = debugUserIds.includes(userId) ? 'debug' : 'info';
const logger = pino({ level: logLevel });
```

### Loki Storage Optimization

**Compression**: Enable Snappy or LZ4 compression in Loki:

```yaml
# loki-config.yaml
chunk_store_config:
  chunk_encoding: snappy  # ~3x compression ratio for JSON logs
```

**Compaction**: Run Loki compactor to merge small chunks:

```yaml
compactor:
  compaction_interval: 10m
  retention_enabled: true
```

**Estimated Costs** (30-day retention):
- 1,000 req/sec × 5 logs/req = 5,000 logs/sec
- 5,000 logs/sec × 500 bytes/log = 2.5 MB/sec
- 2.5 MB/sec × 86,400 sec/day × 30 days = **6.48 TB/month raw**
- With 3x compression: **~2.2 TB/month stored**

**Grafana Cloud Loki Pricing** (as of 2026):
- Free tier: 50 GB/month
- Pro tier: $0.50/GB → ~$1,100/month for 2.2 TB

**Self-Hosted Alternative**: DigitalOcean Spaces (S3-compatible) at $0.02/GB → ~$44/month

---

## 11. Testing and Validation

### Unit Tests

```typescript
// logger.test.ts
import { logger } from './logger';
import pino from 'pino';

describe('Logger', () => {
  it('should inject trace context when span is active', () => {
    const logs: any[] = [];
    const testLogger = pino({
      formatters: {
        log: (log) => {
          // Mock active span
          const mockSpan = {
            spanContext: () => ({
              traceId: 'abc123',
              spanId: 'def456',
              traceFlags: 1
            })
          };
          trace.getActiveSpan = () => mockSpan;

          // Run formatter
          const formatted = logger.formatters.log(log);
          logs.push(formatted);
          return formatted;
        }
      }
    });

    testLogger.info({ msg: 'test' });
    expect(logs[0]).toHaveProperty('traceId', 'abc123');
  });
});
```

### Integration Tests

```typescript
// loki-integration.test.ts
import { logger } from './logger';
import axios from 'axios';

describe('Loki Integration', () => {
  it('should push logs to Loki', async () => {
    logger.info({ meta: { testId: 'integration-test' } }, 'Test log');

    // Wait for batching interval (5s)
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Query Loki API
    const response = await axios.get(`${process.env.LOKI_HOST}/loki/api/v1/query`, {
      params: {
        query: '{application="emailkit"} | json | meta_testId="integration-test"'
      }
    });

    expect(response.data.data.result).toHaveLength(1);
  });
});
```

---

## 12. Migration Plan (If Existing Logging Exists)

### Phase 1: Parallel Logging (Week 1)

Run both old and new loggers simultaneously:

```typescript
import { logger as pinoLogger } from './logger-pino';
import { logger as oldLogger } from './logger-old';

export const logger = {
  info: (obj, msg) => {
    oldLogger.info(msg, obj);
    pinoLogger.info(obj, msg);
  },
  error: (obj, msg) => {
    oldLogger.error(msg, obj);
    pinoLogger.error(obj, msg);
  }
};
```

### Phase 2: Validation (Week 2)

- Compare log volumes in old vs. new systems
- Validate trace ID injection in Grafana
- Run performance benchmarks (CPU, memory, latency)

### Phase 3: Cutover (Week 3)

- Remove old logger
- Update dashboards to point to Loki
- Archive old logs (export to S3)

---

## 13. Monitoring and Alerting

### Key Metrics (Prometheus)

```prometheus
# Log ingestion rate
rate(loki_ingester_logs_total{application="emailkit"}[5m])

# Log errors (Loki write failures)
rate(pino_loki_errors_total[5m])

# Buffer overflow events
rate(pino_loki_buffer_dropped_total[5m])
```

### Grafana Alerts

```yaml
# Alert: High log drop rate
- alert: HighLogDropRate
  expr: rate(pino_loki_buffer_dropped_total[5m]) > 10
  for: 5m
  annotations:
    summary: "Loki buffer dropping logs (Loki unreachable?)"

# Alert: Loki ingestion lag
- alert: LokiIngestionLag
  expr: time() - loki_ingester_latest_timestamp > 300
  for: 5m
  annotations:
    summary: "Loki not ingesting logs for 5+ minutes"
```

---

## 14. References and Resources

### Official Documentation
- **Pino Logger**: https://github.com/pinojs/pino
- **pino-loki Transport**: https://github.com/Julien-R44/pino-loki (v2.x)
- **Grafana Loki Docs**: https://grafana.com/docs/loki/latest/
- **Loki Label Best Practices**: https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/
- **OpenTelemetry Pino Instrumentation**: https://www.npmjs.com/package/@opentelemetry/instrumentation-pino

### Community Resources
- **Pino Loki Integration Guide**: https://medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry-correlated-traces-logs-and-metrics-in-one-2c28b10c4fa0
- **Grafana Alloy Migration Guide**: https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/
- **Pino Performance Benchmarks**: https://github.com/pinojs/pino/blob/main/docs/benchmarks.md

### Related EmailKit Documents
- `/docs/architecture.md` (Section 13: Observability)
- `/specs/001-user-auth/research.md` (Decision 10: Logging Library)
- `/.specify/memory/constitution.md` (Reliability principles)

---

## Appendix A: Complete Logger Implementation

```typescript
// src/lib/logger.ts
import pino from 'pino';
import { trace } from '@opentelemetry/api';
import type { LokiOptions } from 'pino-loki';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const isTesting = process.env.NODE_ENV === 'test';

// Test: No output (use pino-abstract-transport for assertions)
// Dev: Pretty-printed console
// Prod: JSON to Loki
const transport = isTesting
  ? undefined
  : isDevelopment
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname'
      }
    })
  : pino.transport<LokiOptions>({
      target: 'pino-loki',
      options: {
        host: process.env.LOKI_HOST!,
        batching: {
          interval: Number(process.env.LOKI_BATCH_INTERVAL) || 5,
          maxBufferSize: Number(process.env.LOKI_BUFFER_SIZE) || 50000
        },
        labels: {
          application: 'emailkit',
          environment: process.env.NODE_ENV!,
          service: process.env.SERVICE_NAME || 'backend',
          region: process.env.REGION || 'us-east-1',
          version: process.env.APP_VERSION || 'unknown'
        },
        structuredMetaKey: 'meta',
        basicAuth: process.env.LOKI_USERNAME && process.env.LOKI_PASSWORD
          ? {
              username: process.env.LOKI_USERNAME,
              password: process.env.LOKI_PASSWORD
            }
          : undefined,
      }
    });

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

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
  },

  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || require('os').hostname()
  },

  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'apiKey',
      'token',
      'meta.password',
      'meta.apiKey'
    ],
    censor: '[REDACTED]'
  }
}, transport);

export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

// Graceful shutdown: flush logs before exit
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, flushing logs...');
  await new Promise(resolve => setTimeout(resolve, 6000)); // Wait for final batch
  process.exit(0);
});
```

---

## Appendix B: Environment Variables

```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=info                    # fatal, error, warn, info, debug, trace
SERVICE_NAME=auth-service         # Or worker-service, api-gateway, etc.
REGION=us-east-1

# Grafana Loki Configuration
LOKI_HOST=https://loki.emailkit.io
LOKI_USERNAME=emailkit
LOKI_PASSWORD=<secret>            # Or use LOKI_API_KEY for API key auth
LOKI_BATCH_INTERVAL=5             # Seconds between batch sends
LOKI_BUFFER_SIZE=50000            # Max logs to buffer before dropping oldest

# Application Version (for deployment tracking)
APP_VERSION=1.2.3
```

---

## Appendix C: Loki Query Cheat Sheet

```logql
# Basic queries
{application="emailkit"}                                      # All EmailKit logs
{application="emailkit", service="auth-service"}              # Auth service only
{application="emailkit"} | json | level="error"               # All errors

# Trace correlation
{application="emailkit"} | json | traceId="abc123..."         # Logs for trace
{application="emailkit"} | json | traceId!="" | level="error" # Errors with traces

# High-cardinality metadata
{application="emailkit"} | json | meta_userId="user_123"      # User-specific logs
{application="emailkit"} | json | meta_jobId="job_456"        # Job-specific logs

# Pattern matching
{application="emailkit"} | json | msg=~"(?i)password reset"   # Case-insensitive search

# Aggregations
sum by (level) (count_over_time({application="emailkit"} [1h]))  # Log counts by level
rate({application="emailkit"} | json | level="error" [5m])       # Error rate

# Top N queries
topk(10, sum by (msg) (count_over_time({application="emailkit"} | json | level="error" [1h])))
```

---

**Document Status**: Ready for Implementation
**Next Steps**:
1. Install dependencies: `npm install pino pino-loki @opentelemetry/api`
2. Create `src/lib/logger.ts` using Appendix A
3. Configure Loki endpoint and credentials
4. Add logging to authentication endpoints (see 001-user-auth tasks)
5. Set up Grafana dashboards for log visualization
