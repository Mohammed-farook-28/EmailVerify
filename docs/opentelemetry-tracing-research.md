# OpenTelemetry Tracing Research for EmailKit

**Research Date**: 2026-02-01
**Context**: Distributed tracing setup for verification flow
**Target**: Node.js/TypeScript + Express + Redis + BullMQ

## Executive Summary

This document provides comprehensive research on implementing OpenTelemetry distributed tracing for EmailKit's verification flow: `gateway.auth → gateway.credit_check → queue.enqueue → worker.process → upstream.verify`. The solution integrates Express and Redis auto-instrumentation with custom span creation for the verification pipeline.

---

## 1. OpenTelemetry SDK Initialization

### Required Packages

```bash
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/sdk-metrics \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http
```

### Initialization Code (`instrumentation.ts`)

**Requirements**: Node.js v20+ for `--import` flag with TypeScript

```typescript
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Enable diagnostic logging for troubleshooting (development only)
if (process.env.NODE_ENV === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

// Configure trace exporter
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: {},
  timeoutMillis: 10000, // 10s timeout for export
});

// Configure metric exporter
const metricExporter = new OTLPMetricExporter({
  url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
  headers: {},
  timeoutMillis: 10000,
});

// Configure batch span processor for production
const spanProcessor = new BatchSpanProcessor(traceExporter, {
  maxQueueSize: 2048,              // Maximum spans buffered in memory
  maxExportBatchSize: 512,         // Spans per batch
  scheduledDelayMillis: 5000,      // Batch flush interval (5s)
  exportTimeoutMillis: 30000,      // Timeout for batch export (30s)
});

// Initialize SDK
const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'emailkit-api',
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
  }),
  spanProcessor,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000, // Export metrics every 60s
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Fine-tune auto-instrumentation
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          // Don't trace health checks
          return req.url === '/health' || req.url === '/metrics';
        },
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-ioredis': {
        enabled: true,
      },
    }),
  ],
  // Sampling strategy (10% in production)
  sampler: process.env.NODE_ENV === 'production'
    ? new TraceIdRatioBasedSampler(0.1) // 10% sampling
    : new AlwaysOnSampler(), // 100% sampling in dev
});

// Start SDK
sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.error('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
```

### Application Entry Point

**Start your app with the instrumentation:**

```bash
# For TypeScript (Node.js v20+)
node --import ./instrumentation.ts ./dist/server.js

# For JavaScript
node --require ./instrumentation.js ./dist/server.js
```

Or use environment variable:
```bash
export NODE_OPTIONS="--import ./instrumentation.ts"
node ./dist/server.js
```

**Critical**: The SDK must be initialized **before** any other module in your application is loaded.

---

## 2. Auto-Instrumentation Packages

### Core Auto-Instrumentation Bundle

**`@opentelemetry/auto-instrumentations-node`** includes all common instrumentations:

- `@opentelemetry/instrumentation-http` - HTTP/HTTPS client and server
- `@opentelemetry/instrumentation-express` - Express framework
- `@opentelemetry/instrumentation-ioredis` - IORedis client
- `@opentelemetry/instrumentation-dns` - DNS resolution
- `@opentelemetry/instrumentation-net` - TCP/UDP networking
- Plus 20+ additional libraries

### Individual Packages for EmailKit

If you prefer granular control over bundle size:

```bash
npm install --save \
  @opentelemetry/instrumentation-http \
  @opentelemetry/instrumentation-express \
  @opentelemetry/instrumentation-ioredis \
  @appsignal/opentelemetry-instrumentation-bullmq
```

**Manual registration:**

```typescript
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { BullMQInstrumentation } from '@appsignal/opentelemetry-instrumentation-bullmq';

const sdk = new NodeSDK({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new IORedisInstrumentation({
      // Custom serialization to avoid leaking sensitive data
      dbStatementSerializer: (cmdName, cmdArgs) => {
        // Example: redact email addresses
        if (cmdName === 'GET' || cmdName === 'SET') {
          return `${cmdName} [REDACTED]`;
        }
        return `${cmdName} ${cmdArgs.slice(0, 2).join(' ')}`;
      },
      requestHook: (span, { moduleVersion, cmdName, cmdArgs }) => {
        // Add custom attributes
        span.setAttribute('redis.command', cmdName);
      },
    }),
    new BullMQInstrumentation(), // For queue tracing
  ],
});
```

### BullMQ Instrumentation

**Recommended Package**: `@appsignal/opentelemetry-instrumentation-bullmq`

```bash
npm install --save @appsignal/opentelemetry-instrumentation-bullmq
```

**Features**:
- Automatically traces job enqueue, processing, and completion
- Complies with OpenTelemetry Semantic Convention for Messaging Spans
- Compatible with OpenTelemetry JS API and SDK 1.0+
- Integrates with BullMQ Pro groups for multi-tenant tracing

**Alternative**: Official `bullmq-otel` (available since BullMQ v5.16)

---

## 3. Span Naming Conventions & Best Practices

### Core Pattern: `{verb} {object}`

**Format**: `<action> <target>`

**Examples**:
- `verify email` (not `verifyEmail` or `verify_email`)
- `check credits`
- `enqueue job`
- `process verification`
- `call upstream`

### Semantic Conventions for Auto-Instrumentation

**HTTP Server Spans**:
```
Format: {HTTP_METHOD} {route}
Examples:
  - POST /api/v1/verify
  - GET /api/v1/credits
```

**Database/Redis Spans**:
```
Format: {operation} {target}
Examples:
  - GET user:credits:123
  - ZADD rate_limit:user:456
  - EVAL check_and_deduct (for Lua scripts)
```

**RPC/Queue Spans**:
```
Format: {service}/{method}
Examples:
  - verification.queue/enqueue
  - verification.worker/process
```

### Best Practices

1. **Low Cardinality**: Never include user IDs, email addresses, or dynamic values in span names
   - ❌ Bad: `verify alice@example.com`
   - ✅ Good: `verify email` (put email in attribute)

2. **Consistency**: Use the same name for the same operation across all code paths
   - ❌ Bad: `verify`, `verifyEmail`, `email_verification`
   - ✅ Good: `verify email` everywhere

3. **Business-Meaningful**: Names should make sense to product managers, not just engineers
   - ❌ Bad: `process_queue_job`
   - ✅ Good: `process verification`

4. **Use Attributes for Details**: Put variable data in span attributes, not names
   ```typescript
   span.setAttribute('email.domain', 'example.com');
   span.setAttribute('verification.type', 'bulk');
   span.setAttribute('user.tier', 'pro');
   ```

5. **Follow Semantic Conventions**: Use official conventions where available
   - `http.method`, `http.route`, `http.status_code`
   - `db.system`, `db.operation`, `db.statement`
   - `messaging.operation`, `messaging.destination`

---

## 4. Custom Span Creation for Verification Flow

### Get a Tracer

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('emailkit-verification', '1.0.0');
```

### Pattern 1: `startActiveSpan` (Recommended for Most Cases)

**Use when**: The operation may create child spans (e.g., calling other services)

```typescript
import { SpanStatusCode, trace, context } from '@opentelemetry/api';

async function verifyEmail(email: string, userId: string): Promise<VerificationResult> {
  const tracer = trace.getTracer('emailkit-verification');

  return tracer.startActiveSpan('verify email', async (span) => {
    try {
      // Add attributes (high-cardinality data goes here, not in span name)
      span.setAttribute('email.domain', email.split('@')[1]);
      span.setAttribute('user.id', userId);
      span.setAttribute('user.tier', await getUserTier(userId));

      // Your verification logic
      // Child spans are automatically linked to this parent
      const result = await performVerification(email);

      // Add result attributes
      span.setAttribute('verification.result', result.status);
      span.setAttribute('verification.deliverable', result.deliverable);

      // Mark success
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      // Record error
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      // Span is automatically ended
      span.end();
    }
  });
}
```

### Pattern 2: `startSpan` (For Leaf Operations)

**Use when**: The operation is a leaf node with no child spans

```typescript
async function checkCredits(userId: string): Promise<number> {
  const tracer = trace.getTracer('emailkit-verification');
  const span = tracer.startSpan('check credits');

  try {
    span.setAttribute('user.id', userId);

    const credits = await redisClient.get(`user:credits:${userId}`);

    span.setAttribute('credits.balance', credits);
    span.setStatus({ code: SpanStatusCode.OK });

    return parseInt(credits || '0', 10);
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end(); // CRITICAL: Always end the span
  }
}
```

### Pattern 3: Creating Child Spans Manually

```typescript
import { trace, context as otelContext } from '@opentelemetry/api';

async function processVerificationJob(job: Job): Promise<void> {
  const tracer = trace.getTracer('emailkit-worker');

  return tracer.startActiveSpan('process verification', async (parentSpan) => {
    parentSpan.setAttribute('job.id', job.id);
    parentSpan.setAttribute('job.type', 'verification');

    // Create child span
    const childSpan = tracer.startSpan('deduct credits', {
      // Link to parent manually
      parent: parentSpan,
    });

    try {
      await deductCredits(job.data.userId);
      childSpan.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      childSpan.recordException(error as Error);
      childSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      childSpan.end();
    }

    // Continue with parent span work
    const result = await callUpstream(job.data.email);
    parentSpan.setAttribute('upstream.status', result.status);
    parentSpan.end();
  });
}
```

### EmailKit Verification Flow Spans

```typescript
// Gateway Layer
tracer.startActiveSpan('gateway.auth', async (span) => {
  span.setAttribute('auth.type', 'bearer');
  // ... auth logic
});

tracer.startActiveSpan('gateway.credit_check', async (span) => {
  span.setAttribute('user.id', userId);
  span.setAttribute('credits.required', 1);
  // ... credit check logic
});

tracer.startActiveSpan('gateway.rate_limit', async (span) => {
  span.setAttribute('rate_limit.tier', userTier);
  // ... rate limit check
});

// Queue Layer
tracer.startActiveSpan('queue.enqueue', async (span) => {
  span.setAttribute('queue.name', 'verification');
  span.setAttribute('job.priority', priority);
  span.setAttribute('job.tenant_id', tenantId);
  // ... enqueue logic
});

// Worker Layer
tracer.startActiveSpan('worker.process', async (span) => {
  span.setAttribute('worker.id', workerId);
  span.setAttribute('job.id', jobId);
  // ... worker processing
});

tracer.startActiveSpan('worker.deduct_credits', async (span) => {
  // ... credit deduction
});

// Upstream Layer
tracer.startActiveSpan('upstream.verify', async (span) => {
  span.setAttribute('upstream.provider', 'zerobounce');
  span.setAttribute('circuit_breaker.state', circuitState);
  // ... upstream call
});
```

---

## 5. Sampling Strategy for Production

### Recommended Approach: Head-Based Sampling

**TraceIdRatioBasedSampler** - Sample a fixed percentage of traces

```typescript
import { TraceIdRatioBasedSampler, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';

const sampler = process.env.NODE_ENV === 'production'
  ? new TraceIdRatioBasedSampler(0.1)  // 10% sampling in production
  : new AlwaysOnSampler();              // 100% sampling in development

const sdk = new NodeSDK({
  sampler,
  // ... other config
});
```

### Sampling Rates by Environment

| Environment | Sampling Rate | Rationale |
|-------------|---------------|-----------|
| Development | 100% (1.0) | Full visibility for debugging |
| Staging | 50% (0.5) | Balance cost and coverage |
| Production | 10% (0.1) | Reduce overhead and cost |
| Production (High Traffic) | 1-5% (0.01-0.05) | For 1000+ req/s |

### Advanced: Composite Sampling

**Sample 100% of errors, 10% of success**

```typescript
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

// Custom sampler (requires implementation)
class ErrorAwareSampler {
  shouldSample(context, traceId, spanName, spanKind, attributes, links) {
    // Always sample if error occurred
    if (attributes['http.status_code'] >= 400) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLE };
    }

    // Otherwise, use ratio-based sampling
    const ratioSampler = new TraceIdRatioBasedSampler(0.1);
    return ratioSampler.shouldSample(context, traceId, spanName, spanKind, attributes, links);
  }
}

const sdk = new NodeSDK({
  sampler: new ErrorAwareSampler(),
});
```

### Tail-Based Sampling (Advanced)

**Requires OpenTelemetry Collector**

```yaml
# collector-config.yaml
processors:
  tail_sampling:
    policies:
      - name: error-policy
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow-traces
        type: latency
        latency:
          threshold_ms: 1000
      - name: rate-limited-policy
        type: rate_limiting
        rate_limiting:
          spans_per_second: 100
```

**Pros**: Sample based on full trace data (errors, latency)
**Cons**: Requires collector, more complex setup, higher memory usage

### Environment Variable Configuration

```bash
# Use OTEL standard environment variables
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling
```

### Monitoring Sampling Impact

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('emailkit-sampling');
const sampledCounter = meter.createCounter('traces.sampled');
const droppedCounter = meter.createCounter('traces.dropped');

// Track sampling decisions
sampler.shouldSample = (context, traceId, spanName, spanKind, attributes, links) => {
  const result = originalShouldSample(context, traceId, spanName, spanKind, attributes, links);

  if (result.decision === SamplingDecision.RECORD_AND_SAMPLE) {
    sampledCounter.add(1);
  } else {
    droppedCounter.add(1);
  }

  return result;
};
```

---

## 6. Production Configuration Checklist

### Environment Variables

```bash
# Service identification
export OTEL_SERVICE_NAME=emailkit-api
export OTEL_SERVICE_VERSION=1.0.0

# OTLP Exporter endpoints
export OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example.com:4318
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://collector.example.com:4318/v1/traces
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://collector.example.com:4318/v1/metrics

# Protocol (http/protobuf recommended)
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Sampling
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1

# Batch Span Processor
export OTEL_BSP_EXPORT_TIMEOUT=30000
export OTEL_BSP_MAX_EXPORT_BATCH_SIZE=512
export OTEL_BSP_MAX_QUEUE_SIZE=2048
export OTEL_BSP_SCHEDULE_DELAY=5000

# Logging (production)
export OTEL_LOG_LEVEL=info
```

### BatchSpanProcessor Configuration

```typescript
const spanProcessor = new BatchSpanProcessor(traceExporter, {
  maxQueueSize: 2048,              // Limit memory usage
  maxExportBatchSize: 512,         // Reasonable batch size
  scheduledDelayMillis: 5000,      // 5s flush interval
  exportTimeoutMillis: 30000,      // 30s timeout for export
});
```

**Performance Impact**:
- Latency: +0.5-2ms per request
- CPU: +2-5%
- Memory: +10-30MB

### Security: TLS/mTLS

```typescript
import * as fs from 'fs';

const traceExporter = new OTLPTraceExporter({
  url: 'https://collector.example.com:4318/v1/traces',
  headers: {
    'Authorization': `Bearer ${process.env.OTEL_COLLECTOR_TOKEN}`,
  },
  // TLS configuration
  credentials: {
    ca: fs.readFileSync('./certs/ca.pem'),
    cert: fs.readFileSync('./certs/client-cert.pem'),
    key: fs.readFileSync('./certs/client-key.pem'),
  },
  timeoutMillis: 10000,
});
```

### Health Check Exclusion

```typescript
instrumentations: [
  getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingRequestHook: (req) => {
        // Don't trace health checks, metrics endpoints
        const ignoredPaths = ['/health', '/metrics', '/favicon.ico'];
        return ignoredPaths.some(path => req.url?.startsWith(path));
      },
    },
  }),
]
```

---

## 7. Integration with Monitoring Backends

### Prometheus + Grafana

**Exporter**: OTLP HTTP → OpenTelemetry Collector → Prometheus

```yaml
# collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [prometheus]
```

### Jaeger (For Trace Visualization)

```bash
npm install --save @opentelemetry/exporter-jaeger
```

```typescript
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const jaegerExporter = new JaegerExporter({
  endpoint: 'http://localhost:14268/api/traces',
});
```

### Console Exporter (Development)

```typescript
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

const exporter = process.env.NODE_ENV === 'development'
  ? new ConsoleSpanExporter()
  : new OTLPTraceExporter({ /* production config */ });
```

---

## 8. Key Takeaways

### ✅ Do's

1. **Initialize early**: Load `instrumentation.ts` before any application code
2. **Use auto-instrumentation**: Let `@opentelemetry/auto-instrumentations-node` handle Express, HTTP, Redis
3. **Follow naming conventions**: Use `{verb} {object}` pattern, keep low cardinality
4. **Use `startActiveSpan`**: For operations that create child spans
5. **Add attributes**: Put variable data in attributes, not span names
6. **Always end spans**: Use `try/finally` or `startActiveSpan` callback
7. **Sample in production**: Use 10% sampling for high-traffic services
8. **Batch exports**: Use `BatchSpanProcessor` for performance
9. **Exclude health checks**: Don't trace `/health`, `/metrics`
10. **Monitor sampling**: Track sampled vs. dropped traces

### ❌ Don'ts

1. **Don't include PII in span names**: Email addresses, user IDs go in attributes
2. **Don't use `startSpan` for parent operations**: Use `startActiveSpan` instead
3. **Don't forget to end spans**: Causes memory leaks and incomplete traces
4. **Don't sample 100% in production**: Excessive overhead and cost
5. **Don't use `SimpleSpanProcessor` in production**: Use `BatchSpanProcessor`
6. **Don't trace high-frequency operations at 100%**: Redis `GET` calls can flood your backend
7. **Don't ignore errors**: Always call `span.recordException()` and set error status
8. **Don't use custom span names inconsistently**: Pick one format and stick to it
9. **Don't skip resource configuration**: Set `service.name` and `service.version`
10. **Don't configure after app startup**: Instrumentation must be first

---

## 9. References

### Official Documentation
- [Node.js | OpenTelemetry](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [Instrumentation | OpenTelemetry](https://opentelemetry.io/docs/languages/js/instrumentation/)
- [How to Name Your Spans | OpenTelemetry](https://opentelemetry.io/blog/2025/how-to-name-your-spans/)
- [Sampling | OpenTelemetry](https://opentelemetry.io/docs/languages/js/sampling/)
- [OTLP Exporter Configuration | OpenTelemetry](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/)

### NPM Packages
- [@opentelemetry/sdk-node](https://www.npmjs.com/package/@opentelemetry/sdk-node)
- [@opentelemetry/auto-instrumentations-node](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node)
- [@opentelemetry/instrumentation-express](https://www.npmjs.com/package/@opentelemetry/instrumentation-express)
- [@opentelemetry/instrumentation-ioredis](https://www.npmjs.com/package/@opentelemetry/instrumentation-ioredis)
- [@appsignal/opentelemetry-instrumentation-bullmq](https://www.npmjs.com/package/@appsignal/opentelemetry-instrumentation-bullmq)

### Guides & Best Practices
- [OpenTelemetry Best Practices #1: Naming | Honeycomb](https://www.honeycomb.io/blog/opentelemetry-best-practices-naming)
- [Distributed Tracing in Node.js with OpenTelemetry | Better Stack](https://betterstack.com/community/guides/observability/opentelemetry-nodejs-tracing/)
- [Sampling in OpenTelemetry: A Beginner's Guide | Better Stack](https://betterstack.com/community/guides/observability/opentelemetry-sampling/)
- [Essential OpenTelemetry Best Practices | Better Stack](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/)

### Community Resources
- [GitHub - open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js)
- [GitHub - appsignal/opentelemetry-instrumentation-bullmq](https://github.com/appsignal/opentelemetry-instrumentation-bullmq)
- [OpenTelemetry Tracing API (GitHub Docs)](https://github.com/open-telemetry/opentelemetry-js-api/blob/main/docs/tracing.md)

---

## 10. Next Steps for EmailKit Implementation

1. **Create `instrumentation.ts`** in backend root with production-ready configuration
2. **Install dependencies**: Add all OpenTelemetry packages to `package.json`
3. **Update `package.json` scripts**: Add `--import ./instrumentation.ts` to start command
4. **Implement custom spans** for verification flow (gateway, queue, worker, upstream)
5. **Configure environment variables** for production OTLP collector endpoint
6. **Set up Prometheus + Grafana** for trace visualization
7. **Test sampling strategy** under load (start with 10%, adjust based on volume)
8. **Add monitoring dashboards** for trace metrics (latency, error rate, sampling rate)
9. **Document span naming conventions** in team wiki for consistency
10. **Review and optimize** after 1 week of production data

---

**End of Research Document**
