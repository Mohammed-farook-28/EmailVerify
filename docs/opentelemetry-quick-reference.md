# OpenTelemetry Quick Reference - EmailKit

**Quick access code snippets for common tracing patterns**

---

## Installation (One Command)

```bash
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/sdk-metrics \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @appsignal/opentelemetry-instrumentation-bullmq
```

---

## Minimal `instrumentation.ts` (Copy-Paste Ready)

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'emailkit-api',
  }),
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    }
  ),
  instrumentations: [getNodeAutoInstrumentations()],
  sampler: new TraceIdRatioBasedSampler(process.env.NODE_ENV === 'production' ? 0.1 : 1.0),
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

**Usage**: `node --import ./instrumentation.ts ./dist/server.js`

---

## Common Span Patterns

### Pattern 1: Async Function with Error Handling

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('emailkit-verification');

async function verifyEmail(email: string, userId: string) {
  return tracer.startActiveSpan('verify email', async (span) => {
    try {
      span.setAttribute('email.domain', email.split('@')[1]);
      span.setAttribute('user.id', userId);

      const result = await performVerification(email);

      span.setAttribute('verification.result', result.status);
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Pattern 2: Synchronous Function

```typescript
function checkRateLimit(userId: string): boolean {
  const span = tracer.startSpan('check rate limit');

  try {
    span.setAttribute('user.id', userId);

    const allowed = rateLimiter.consume(userId);

    span.setAttribute('rate_limit.allowed', allowed);
    span.setStatus({ code: SpanStatusCode.OK });

    return allowed;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

### Pattern 3: Express Middleware

```typescript
import { trace, context, propagation } from '@opentelemetry/api';

function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const tracer = trace.getTracer('emailkit-api');

  tracer.startActiveSpan('http.middleware.auth', (span) => {
    span.setAttribute('http.route', req.route?.path || req.path);
    span.setAttribute('http.method', req.method);

    // Auth logic
    const userId = extractUserId(req);
    span.setAttribute('user.id', userId);

    span.end();
    next();
  });
}
```

### Pattern 4: Queue Job Processing

```typescript
// Worker processing with trace context propagation
async function processVerificationJob(job: Job) {
  return tracer.startActiveSpan('worker.process', async (span) => {
    span.setAttribute('job.id', job.id);
    span.setAttribute('job.name', job.name);
    span.setAttribute('worker.id', process.pid);

    try {
      // Deduct credits
      await tracer.startActiveSpan('worker.deduct_credits', async (creditSpan) => {
        const userId = job.data.userId;
        creditSpan.setAttribute('user.id', userId);

        await deductCredits(userId, 1);
        creditSpan.setStatus({ code: SpanStatusCode.OK });
        creditSpan.end();
      });

      // Call upstream
      const result = await tracer.startActiveSpan('upstream.verify', async (upstreamSpan) => {
        upstreamSpan.setAttribute('email', job.data.email);
        upstreamSpan.setAttribute('upstream.provider', 'zerobounce');

        const response = await callUpstream(job.data.email);

        upstreamSpan.setAttribute('upstream.status', response.status);
        upstreamSpan.setStatus({ code: SpanStatusCode.OK });
        upstreamSpan.end();

        return response;
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## EmailKit Verification Flow Spans

```typescript
// Gateway: Auth
tracer.startActiveSpan('gateway.auth', (span) => {
  span.setAttribute('auth.type', 'bearer');
  span.setAttribute('api_key.prefix', apiKey.substring(0, 8));
  // ...
  span.end();
});

// Gateway: Credit Check
tracer.startActiveSpan('gateway.credit_check', async (span) => {
  span.setAttribute('user.id', userId);
  span.setAttribute('credits.required', 1);

  const balance = await checkCredits(userId);
  span.setAttribute('credits.balance', balance);

  span.end();
});

// Gateway: Rate Limit
tracer.startActiveSpan('gateway.rate_limit', (span) => {
  span.setAttribute('user.tier', tier);
  span.setAttribute('rate_limit.limit', limits[tier]);
  // ...
  span.end();
});

// Queue: Enqueue
tracer.startActiveSpan('queue.enqueue', async (span) => {
  span.setAttribute('queue.name', 'verification');
  span.setAttribute('job.priority', priority);
  span.setAttribute('job.tenant_id', tenantId);

  await queue.add('verify', jobData);

  span.end();
});

// Worker: Process
tracer.startActiveSpan('worker.process', async (span) => {
  span.setAttribute('worker.id', workerId);
  span.setAttribute('job.id', job.id);
  // ...
  span.end();
});

// Upstream: Call
tracer.startActiveSpan('upstream.verify', async (span) => {
  span.setAttribute('upstream.provider', 'zerobounce');
  span.setAttribute('circuit_breaker.state', breaker.state);

  const response = await upstreamClient.verify(email);

  span.setAttribute('upstream.latency_ms', response.latencyMs);
  span.setAttribute('upstream.status_code', response.statusCode);

  span.end();
});
```

---

## Common Attributes

### HTTP Attributes
```typescript
span.setAttribute('http.method', 'POST');
span.setAttribute('http.route', '/api/v1/verify');
span.setAttribute('http.status_code', 200);
span.setAttribute('http.request_content_length', 1024);
span.setAttribute('http.response_content_length', 512);
```

### Database/Redis Attributes
```typescript
span.setAttribute('db.system', 'redis');
span.setAttribute('db.operation', 'GET');
span.setAttribute('db.statement', 'GET user:credits:123');
```

### User/Tenant Attributes
```typescript
span.setAttribute('user.id', userId);
span.setAttribute('user.tier', 'pro');
span.setAttribute('tenant.id', tenantId);
```

### Job/Queue Attributes
```typescript
span.setAttribute('job.id', jobId);
span.setAttribute('job.name', 'verification');
span.setAttribute('job.priority', 1);
span.setAttribute('queue.name', 'verification');
span.setAttribute('worker.id', workerId);
```

### Verification Attributes
```typescript
span.setAttribute('email.domain', 'example.com');
span.setAttribute('verification.type', 'single'); // or 'bulk'
span.setAttribute('verification.result', 'deliverable');
span.setAttribute('verification.reason', 'valid_mailbox');
```

### Circuit Breaker Attributes
```typescript
span.setAttribute('circuit_breaker.state', 'closed'); // closed, open, half-open
span.setAttribute('circuit_breaker.failure_rate', 0.15);
```

---

## Environment Variables (Production)

```bash
# .env.production
OTEL_SERVICE_NAME=emailkit-api
OTEL_SERVICE_VERSION=1.0.0
OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example.com:4318
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://collector.example.com:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://collector.example.com:4318/v1/metrics
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_BSP_MAX_QUEUE_SIZE=2048
OTEL_BSP_MAX_EXPORT_BATCH_SIZE=512
OTEL_BSP_SCHEDULE_DELAY=5000
OTEL_BSP_EXPORT_TIMEOUT=30000
OTEL_LOG_LEVEL=info
NODE_OPTIONS=--import ./instrumentation.ts
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "start": "node --import ./instrumentation.ts ./dist/server.js",
    "dev": "NODE_ENV=development node --import ./instrumentation.ts --watch ./dist/server.js",
    "build": "tsc"
  }
}
```

---

## Debugging: Console Exporter

```typescript
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

// For development only
const exporter = new ConsoleSpanExporter();
const spanProcessor = new SimpleSpanProcessor(exporter);

const sdk = new NodeSDK({
  spanProcessor,
  // ...
});
```

---

## Sampling Strategies

### Development (100%)
```typescript
import { AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
const sampler = new AlwaysOnSampler();
```

### Production (10%)
```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
const sampler = new TraceIdRatioBasedSampler(0.1);
```

### Error-Aware Sampling (Conceptual)
```typescript
// Sample 100% of errors, 10% of success
class ErrorAwareSampler implements Sampler {
  shouldSample(context, traceId, spanName, spanKind, attributes, links) {
    if (attributes['http.status_code'] >= 400) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLE };
    }
    const ratioSampler = new TraceIdRatioBasedSampler(0.1);
    return ratioSampler.shouldSample(context, traceId, spanName, spanKind, attributes, links);
  }
}
```

---

## Common Pitfalls

### ❌ Don't Forget to End Spans
```typescript
// BAD
const span = tracer.startSpan('operation');
await doWork();
// span.end() is missing!

// GOOD
const span = tracer.startSpan('operation');
try {
  await doWork();
} finally {
  span.end(); // Always in finally block
}
```

### ❌ Don't Put High-Cardinality Data in Span Names
```typescript
// BAD
tracer.startActiveSpan(`verify ${email}`, ...);

// GOOD
tracer.startActiveSpan('verify email', (span) => {
  span.setAttribute('email.domain', email.split('@')[1]);
  // ...
});
```

### ❌ Don't Use startSpan for Parent Operations
```typescript
// BAD - child spans won't be linked
const span = tracer.startSpan('parent');
await childOperation(); // This won't be a child span

// GOOD - child spans are automatically linked
tracer.startActiveSpan('parent', async (span) => {
  await childOperation(); // This will be a child span
  span.end();
});
```

---

## Testing Tracing Locally

### 1. Run Jaeger (Docker)
```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

### 2. Point Exporter to Jaeger
```typescript
const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});
```

### 3. Open Jaeger UI
```
http://localhost:16686
```

---

**End of Quick Reference**
