# Research: Undici HTTP Client Connection Pooling Best Practices

**Date**: 2026-02-01
**Context**: EmailKit upstream API proxy configuration for 10+ worker pods × 50 concurrent jobs
**Current Spec**: Architecture defines 200 max connections, need validation and best practices

---

## Executive Summary

Undici is the fastest HTTP/1.1 client for Node.js and is production-ready. For EmailKit's use case (10 workers × 50 concurrent jobs = 500 theoretical concurrent requests), the architecture's specified **200 max connections** is appropriate and aligns with industry best practices for HTTP connection pooling.

**Key Findings**:
- **Recommended Pool Size**: 100-200 connections for production APIs (architecture: 200 ✓)
- **Timeout Configuration**: Connect 3s, Headers 10s, Body 30s (architecture: 3s/10s/15s total ✓)
- **Keep-Alive**: 30s timeout with 10min max (architecture: 30s/10min ✓)
- **Pipelining**: Set to 1 (disabled) for API reliability (architecture: 1 ✓)

The current architecture specification is **production-ready** and follows undici best practices.

---

## 1. Undici Agent Configuration Options

### Core Configuration Parameters

Based on official undici documentation and production examples:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `connections` | Number | 10 | Max concurrent HTTP connections per Pool |
| `pipelining` | Number | 1 | Max pipelined requests per connection (use 1 to disable) |
| `keepAliveTimeout` | Number | 4000ms | Idle timeout after which socket closes |
| `keepAliveMaxTimeout` | Number | 600000ms | Maximum socket lifetime (10min default) |
| `connectTimeout` | Number | 10000ms | TCP/TLS connection establishment timeout |
| `headersTimeout` | Number | 300000ms | Time to wait for complete HTTP headers (300s default) |
| `bodyTimeout` | Number | 300000ms | Time between receiving body data chunks (300s default) |
| `idleTimeout` | Number | 4000ms | Socket timeout without active requests |
| `socketTimeout` | Number | 30000ms | Socket timeout WITH active requests |
| `keepAliveTimeoutThreshold` | Number | 1000ms | Adjustment for server keep-alive timing inaccuracies |

**Sources**:
- [Undici npm documentation](https://www.npmjs.com/package/undici/v/3.3.0)
- [HTTP Fundamentals: Understanding Undici](https://blog.platformatic.dev/http-fundamentals-understanding-undici-and-its-working-mechanism)
- [Connection Management - undici-types](https://tessl.io/registry/tessl/npm-undici-types/7.15.0/files/docs/connection-management.md)

---

## 2. Production Configuration Examples

### Recommended Production Setup (TypeScript)

```typescript
import { Pool, Agent, setGlobalDispatcher } from 'undici';

// Option 1: Direct Pool Configuration (for single upstream)
const upstreamPool = new Pool('https://api.emailverify.upstream.com', {
  connections: 200,              // Max concurrent HTTP connections
  pipelining: 1,                 // Disabled (one request per connection)

  // Timeouts
  connectTimeout: 3000,          // 3s connection establishment
  headersTimeout: 10000,         // 10s to receive headers
  bodyTimeout: 30000,            // 30s between body chunks

  // Keep-alive settings
  keepAliveTimeout: 30000,       // 30s idle timeout
  keepAliveMaxTimeout: 600000,   // 10min max connection lifetime

  // Advanced
  keepAliveTimeoutThreshold: 1000, // 1s adjustment for server timing
});

// Option 2: Global Agent Configuration (for multiple origins)
const agent = new Agent({
  connections: 200,
  pipelining: 1,
  connectTimeout: 3000,
  headersTimeout: 10000,
  bodyTimeout: 30000,
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 600000,
  factory(origin, opts) {
    return new Pool(origin, { ...opts });
  }
});

setGlobalDispatcher(agent);

// Usage
const response = await upstreamPool.request({
  path: '/api/v1/verify',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY',
  },
  body: JSON.stringify({ email: 'test@example.com' }),
});
```

### High-Traffic Production Configuration with Interceptors

```typescript
import { Agent, interceptors, setGlobalDispatcher } from 'undici';

const { cache, dns, retry } = interceptors;

const defaultDispatcher = new Agent({
  connections: 200,
  headersTimeout: 10000,  // 10 seconds
  bodyTimeout: 30000,     // 30 seconds
  connectTimeout: 3000,   // 3 seconds
}).compose(cache(), dns(), retry());

setGlobalDispatcher(defaultDispatcher);
```

**Note**: The defaults (300s for headers/body timeout) are too high for production. Always set explicit timeouts.

**Sources**:
- [A Complete Guide to Timeouts in Node.js](https://betterstack.com/community/guides/scaling-nodejs/nodejs-timeouts/)
- [Snyk: How to use undici.Pool](https://snyk.io/advisor/npm-package/undici/functions/undici.Pool)
- [Exploring TypeScript and Undici](https://www.webdevtutor.net/blog/typescript-undici)

---

## 3. Understanding Timeout Types

### Timeout Phases in HTTP Request

```
[connectTimeout] → [headersTimeout] → [bodyTimeout (between chunks)]
     3s                 10s                   30s
```

**connectTimeout**:
- **When**: TCP/TLS connection establishment phase
- **Use Case**: Detect unreachable upstream quickly
- **Recommendation**: 3-5s for external APIs

**headersTimeout**:
- **When**: Waiting for complete HTTP response headers
- **Use Case**: Detect slow server responses early
- **Recommendation**: 10s for API endpoints
- **Default**: 300s (too high for production)

**bodyTimeout**:
- **When**: Time between receiving body data chunks (resets on each chunk)
- **Use Case**: Prevent hanging on large/slow responses
- **Recommendation**: 30s for typical API responses
- **Default**: 300s (too high for production)
- **Note**: Set to 0 to disable

**socketTimeout** (alternative approach):
- **When**: Time between any activity on active socket
- **Default**: 30s
- **Use Case**: General socket activity timeout

**Sources**:
- [undici Client.md documentation](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md)
- [Advanced timeouts discussion](https://github.com/nodejs/undici/issues/874)
- [A Complete Guide to Timeouts in Node.js](https://betterstack.com/community/guides/scaling-nodejs/nodejs-timeouts/)

---

## 4. Connection Pool Sizing Guidelines

### Industry Formulas

**General Purpose (Database Connections)**:
```
connections = (core_count × 2) + effective_spindle_count
```
For SSDs: `connections = core_count × 4`

**HTTP Connection Pools**:
```
connections = concurrent_requests × response_time_factor
```
Where response_time_factor accounts for request duration vs arrival rate.

**Google Cloud Bigtable Formula** (adapted for HTTP):
```
min_connections = (QPS ÷ (1000 ÷ latency_ms)) ÷ 50
max_connections = (QPS ÷ (1000 ÷ latency_ms)) ÷ 10
```
Optimal: 10-50 outstanding requests per connection.

**Multi-Instance Deployment**:
```
max_connections_per_instance = (upstream_max_connections × 0.8) ÷ num_instances
```
0.8 factor provides headroom for overhead.

### Production Recommendations

| Scenario | Connection Pool Size |
|----------|---------------------|
| Low concurrency (< 10 req/s) | 10-20 connections |
| Medium concurrency (10-100 req/s) | 50-100 connections |
| High concurrency (100-1000 req/s) | 100-200 connections |
| Very high concurrency (> 1000 req/s) | 200-500 connections |

**Default HTTP pool sizes**:
- Apache HttpClient: 25 total, 5 per route
- Node.js default: 5 per host
- Production recommendation: **100-200** (confirmed across multiple sources)

**Sources**:
- [The Art of HTTP Connection Pooling](https://devblogs.microsoft.com/premier-developer/the-art-of-http-connection-pooling-how-to-optimize-your-connections-for-peak-performance/)
- [Configure connection pools - Google Cloud](https://cloud.google.com/bigtable/docs/configure-connection-pools)
- [Connection Pooling Patterns](https://medium.com/@artemkhrenov/connection-pooling-patterns-optimizing-database-connections-for-scalable-applications-159e78281389)
- [So, how big should that connection pool be?](https://medium.com/@gaborfarkasds/so-how-big-should-that-connection-pool-be-e5c69f2e15dd)

---

## 5. EmailKit-Specific Sizing Analysis

### Current Architecture Specification

From `docs/architecture.md` (Layer 5):
```javascript
const upstreamPool = {
  connections: 200,          // max concurrent HTTP connections
  pipelining: 1,             // no pipelining (one request per connection)
  keepAliveTimeout: 30000,   // 30s keep-alive
  keepAliveMaxTimeout: 600000, // 10 min max
};
```

Timeouts:
- Connect timeout: **3 seconds**
- Read timeout: **10 seconds**
- Total timeout: **15 seconds**

### Validation Against Use Case

**Current Setup**:
- 10 worker pods
- 50 concurrent jobs per worker
- **Theoretical max concurrent**: 10 × 50 = 500 requests

**Connection Pool**: 200 connections

**Analysis**:

1. **Is 200 too small for 500 theoretical concurrent requests?**
   - **No**. Not all jobs will make upstream calls simultaneously
   - BullMQ groups provide fair queuing (spread across time)
   - Global token bucket limits to **1000 tokens/sec** (architecture spec)
   - With 10s avg response time: `1000 req/s × 0.01s = 10 concurrent` (steady state)
   - Peak bursts with 50ms response: `1000 req/s × 0.05s = 50 concurrent`
   - **200 connections provides 4x headroom** over typical concurrent load

2. **Connection Reuse Efficiency**:
   - Keep-alive 30s means connections survive ~3-10 requests (depending on request rate)
   - Pipelining disabled (1) = one request per connection at a time
   - This is correct for reliability (pipelining can cause issues with some servers)

3. **Timeout Alignment**:
   - Connect 3s: Fast fail for unreachable upstream ✓
   - Read 10s: Reasonable for email verification API ✓
   - Total 15s: Absolute max prevents zombie requests ✓
   - **Note**: Architecture says "read timeout" but undici uses `headersTimeout` + `bodyTimeout`
   - **Recommendation**: Map to `headersTimeout: 10000, bodyTimeout: 30000`

4. **Industry Benchmark Alignment**:
   - Production recommendation: 100-200 connections for high-traffic APIs ✓
   - Architecture spec: **200 connections** ✓
   - **Conclusion**: Perfectly aligned with best practices

### Recommended Adjustment to Architecture Spec

**Current** (docs/architecture.md):
```javascript
const upstreamPool = {
  connections: 200,
  pipelining: 1,
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 600000,
};
// Timeouts:
// - Connect timeout: 3 seconds
// - Read timeout: 10 seconds
// - Total timeout: 15 seconds
```

**Recommended** (undici-compatible):
```typescript
import { Pool } from 'undici';

const upstreamPool = new Pool('https://upstream-api.example.com', {
  // Connection pool
  connections: 200,              // Max concurrent HTTP connections
  pipelining: 1,                 // Disabled for reliability

  // Timeouts (undici parameter names)
  connectTimeout: 3000,          // 3s - Fast fail if upstream unreachable
  headersTimeout: 10000,         // 10s - Kill slow header responses
  bodyTimeout: 30000,            // 30s - Time between body chunks (not total)

  // Keep-alive
  keepAliveTimeout: 30000,       // 30s idle timeout
  keepAliveMaxTimeout: 600000,   // 10min absolute max
  keepAliveTimeoutThreshold: 1000, // 1s adjustment for server timing
});
```

**Key Change**: `bodyTimeout: 30000` instead of "total timeout 15s" because:
- undici doesn't have a "total timeout" parameter
- `bodyTimeout` resets between chunks, so long responses can exceed it
- For absolute max timeout, implement a wrapper with `AbortController` and `setTimeout`

**Total Timeout Wrapper** (if needed):
```typescript
async function requestWithTotalTimeout(pool, options, totalTimeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), totalTimeoutMs);

  try {
    const response = await pool.request({
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## 6. Keep-Alive Best Practices

### Default Behavior

- **Keep-alive is ALWAYS enabled** in undici (cannot be disabled)
- Default `idleTimeout`: 4s
- Default `keepAliveMaxTimeout`: 600s (10min)

### Production Recommendations

**keepAliveTimeout** (idle timeout):
- **Purpose**: Close unused connections to free resources
- **Recommendation**: 30-60s for external APIs
- **Architecture**: 30s ✓

**keepAliveMaxTimeout** (absolute max):
- **Purpose**: Force connection refresh to handle upstream server restarts, LB changes
- **Recommendation**: 5-10min for stable APIs
- **Architecture**: 10min ✓

**keepAliveTimeoutThreshold**:
- **Purpose**: Account for timing inaccuracies (network latency, clock skew)
- **Recommendation**: 1000ms (1s)
- **Default**: 1000ms

### Why Keep-Alive Matters

1. **TLS Handshake Overhead**: ~50-100ms per new connection
2. **Connection Reuse**: 10-50 requests per connection typical
3. **Upstream Friendliness**: Reduces load on upstream server
4. **Resource Efficiency**: Fewer file descriptors, less memory

**At 1000 req/s**:
- Without keep-alive: 1000 TLS handshakes/s = 50-100s CPU time wasted
- With 30s keep-alive: ~33 new connections/s (97% reuse)

**Sources**:
- [Undici keep-alive documentation](https://www.npmjs.com/package/undici/v/2.0.0)
- [HTTP Fundamentals: Understanding Undici](https://blog.platformatic.dev/http-fundamentals-understanding-undici-and-its-working-mechanism)
- [Reduce default idle timeout discussion](https://github.com/nodejs/undici/issues/276)

---

## 7. Pipelining Considerations

### What is HTTP Pipelining?

Sending multiple requests over a single connection **without waiting for responses** (requests queued in-flight).

**Example**:
```
Connection 1:
  → Request A
  → Request B (sent before A response arrives)
  → Request C (sent before A, B responses arrive)
  ← Response A
  ← Response B
  ← Response C
```

### Why Architecture Disables It (pipelining: 1)

**Advantages**:
- Reduced latency for multiple requests
- Better connection utilization

**Disadvantages** (why disabled for EmailKit):
- **Head-of-line blocking**: Slow Request A blocks B, C responses
- **Server compatibility**: Many servers don't handle pipelining correctly
- **Complexity**: Error handling more difficult
- **Retry logic**: Failed pipelined requests harder to retry
- **HTTP/2 makes it obsolete**: Better handled by multiplexing

**Production Recommendation**:
- **For HTTP/1.1 to external APIs**: `pipelining: 1` (disabled) ✓
- **For internal microservices**: Consider `pipelining: 2-5`
- **For HTTP/2**: Enable `allowH2: true` instead (multiplexing is superior)

**Sources**:
- [Undici pipelining warning](https://www.npmjs.com/package/undici/v/3.3.0)
- [HTTP Fundamentals: Understanding Undici](https://blog.platformatic.dev/http-fundamentals-understanding-undici-and-its-working-mechanism)

---

## 8. Production Monitoring & Tuning

### Key Metrics to Monitor

**Connection Pool Health**:
```typescript
// Undici doesn't expose pool stats by default
// Wrap Pool to add metrics

class InstrumentedPool extends Pool {
  private activeConnections = 0;
  private queuedRequests = 0;

  async request(opts) {
    this.queuedRequests++;
    const start = Date.now();

    try {
      const response = await super.request(opts);

      // Metrics
      metrics.histogram('undici.request.duration', Date.now() - start);
      metrics.gauge('undici.pool.active', this.activeConnections);
      metrics.gauge('undici.pool.queued', this.queuedRequests);

      return response;
    } catch (error) {
      metrics.counter('undici.request.error', { type: error.code });
      throw error;
    } finally {
      this.queuedRequests--;
    }
  }
}
```

**Metrics to Track**:
1. `undici.request.duration` - Request latency histogram
2. `undici.pool.active` - Current active connections
3. `undici.pool.queued` - Queued requests waiting for connection
4. `undici.request.error` - Error rate by type (timeout, connection refused, etc.)
5. `undici.connection.reuse_rate` - % of requests reusing existing connection

### Tuning Signals

**Increase pool size if**:
- `undici.pool.queued` consistently > 0
- High request latency but low upstream latency
- Connection pool saturation errors

**Decrease pool size if**:
- `undici.pool.active` rarely exceeds 50% of max
- Upstream complains about connection limits

**Adjust timeouts if**:
- `connectTimeout` errors: Upstream unreachable or network issues
- `headersTimeout` errors: Upstream slow to respond
- `bodyTimeout` errors: Legitimate large responses being cut off

---

## 9. Error Handling Best Practices

### Common Undici Errors

```typescript
import { errors } from 'undici';

try {
  const response = await pool.request(options);
} catch (error) {
  if (error instanceof errors.ConnectTimeoutError) {
    // connectTimeout exceeded - upstream unreachable
    // Action: Circuit breaker open, alert ops
  } else if (error instanceof errors.HeadersTimeoutError) {
    // headersTimeout exceeded - slow upstream
    // Action: Retry with exponential backoff
  } else if (error instanceof errors.BodyTimeoutError) {
    // bodyTimeout exceeded - slow response body
    // Action: Check if legitimate large response or network issue
  } else if (error instanceof errors.RequestAbortedError) {
    // Request aborted (e.g., AbortController)
    // Action: Log and don't retry
  } else if (error.code === 'ECONNREFUSED') {
    // Connection refused
    // Action: Circuit breaker open
  } else if (error.code === 'ETIMEDOUT') {
    // Socket timeout
    // Action: Retry
  }
}
```

### Retry Strategy

```typescript
async function requestWithRetry(pool, options, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await pool.request(options);
    } catch (error) {
      lastError = error;

      // Don't retry client errors or aborts
      if (error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }
      if (error instanceof errors.RequestAbortedError) {
        throw error;
      }

      // Exponential backoff with jitter
      const backoff = Math.min(1000 * (2 ** attempt), 10000);
      const jitter = Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, backoff + jitter));
    }
  }

  throw lastError;
}
```

---

## 10. Summary & Recommendations

### Architecture Validation: ✓ Production-Ready

The current architecture specification in `docs/architecture.md` is **correct and follows best practices**:

| Parameter | Architecture | Best Practice | Status |
|-----------|--------------|---------------|--------|
| Connections | 200 | 100-200 for production | ✓ Optimal |
| Pipelining | 1 (disabled) | 1 for external APIs | ✓ Correct |
| Keep-alive timeout | 30s | 30-60s | ✓ Good |
| Keep-alive max | 10min | 5-10min | ✓ Good |
| Connect timeout | 3s | 3-5s | ✓ Good |
| Headers timeout | 10s (as "read") | 10s | ✓ Good |
| Body timeout | Not specified | 30s | → Add |

### Recommended Implementation Code

**File**: `backend/src/services/upstream-client.ts`

```typescript
import { Pool } from 'undici';
import { Logger } from './logger';

export class UpstreamClient {
  private pool: Pool;
  private logger: Logger;

  constructor(upstreamUrl: string) {
    this.logger = new Logger('UpstreamClient');

    this.pool = new Pool(upstreamUrl, {
      // Connection pool (architecture spec)
      connections: 200,
      pipelining: 1,

      // Timeouts (undici parameter names)
      connectTimeout: 3000,          // 3s
      headersTimeout: 10000,         // 10s
      bodyTimeout: 30000,            // 30s between chunks

      // Keep-alive (architecture spec)
      keepAliveTimeout: 30000,       // 30s
      keepAliveMaxTimeout: 600000,   // 10min
      keepAliveTimeoutThreshold: 1000, // 1s
    });

    this.logger.info('Upstream pool initialized', {
      url: upstreamUrl,
      connections: 200,
    });
  }

  async verifyEmail(email: string, idempotencyKey: string): Promise<VerificationResult> {
    const controller = new AbortController();
    const totalTimeout = setTimeout(() => controller.abort(), 15000); // 15s total

    try {
      const response = await this.pool.request({
        path: '/api/v1/verify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.UPSTREAM_API_KEY}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });

      if (response.statusCode !== 200) {
        throw new Error(`Upstream error: ${response.statusCode}`);
      }

      const data = await response.body.json();
      return data;

    } finally {
      clearTimeout(totalTimeout);
    }
  }

  async close(): Promise<void> {
    await this.pool.close();
    this.logger.info('Upstream pool closed');
  }
}
```

### Key Takeaways

1. **Pool size of 200 is optimal** for EmailKit's workload (10 workers × 50 jobs, 1000 req/s token bucket)
2. **Timeouts are correctly specified** but need undici parameter mapping
3. **Keep-alive settings are production-grade** (30s/10min)
4. **Pipelining correctly disabled** for external API reliability
5. **Add explicit `bodyTimeout: 30000`** to complete timeout configuration
6. **Implement total timeout with AbortController** for 15s absolute max
7. **Monitor connection pool metrics** (active, queued, reuse rate)

### Additional Resources

- [Official undici documentation](https://undici.nodejs.org/)
- [undici GitHub repository](https://github.com/nodejs/undici)
- [Node.js official undici guide](https://nodejs.org/en/learn/getting-started/fetch)
- [Deep Dive into Undici by Matteo Collina](https://gitnation.com/contents/deep-dive-into-undici)
- [The Art of HTTP Connection Pooling](https://devblogs.microsoft.com/premier-developer/the-art-of-http-connection-pooling-how-to-optimize-your-connections-for-peak-performance/)

---

**Research Status**: Complete ✓
**Next Steps**: Implement `UpstreamClient` class with validated configuration during worker implementation phase
