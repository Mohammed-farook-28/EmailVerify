# Research: Public API & Webhooks

**Feature**: 005-api-webhooks | **Date**: 2026-02-05

## Research Tasks Completed

### 1. API Key Generation & Storage

**Decision**: Use `ek_` prefix + 32 bytes of cryptographically random data encoded as Base64 URL-safe

**Rationale**:
- Prefix allows quick identification of key type (production `ek_` vs test `ek_test_`)
- 32 bytes (256 bits) provides sufficient entropy for secure authentication
- Base64 URL-safe encoding produces 43 characters (no padding) - compact and URL-compatible
- Store only SHA-256 hash in database - original key cannot be recovered if DB is compromised

**Alternatives Considered**:
- UUID v4 (128 bits): Rejected - less entropy, longer representation
- Hex encoding: Rejected - 64 characters, less compact than Base64
- bcrypt for hashing: Rejected - SHA-256 sufficient for API keys (not passwords), faster for validation

**Implementation**:
```typescript
import { randomBytes, createHash } from 'crypto';

function generateApiKey(isTest: boolean = false): { raw: string; hash: string } {
  const prefix = isTest ? 'ek_test_' : 'ek_';
  const bytes = randomBytes(32);
  const encoded = bytes.toString('base64url'); // 43 chars, no padding
  const raw = `${prefix}${encoded}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}
```

### 2. Webhook Signing (HMAC-SHA256)

**Decision**: Use Stripe-style webhook signing with timestamp and HMAC-SHA256

**Rationale**:
- Industry standard pattern (Stripe, GitHub, Slack use similar approaches)
- Timestamp in signature prevents replay attacks
- HMAC-SHA256 is fast and secure for message authentication

**Signature Format**:
```
X-Webhook-Signature: t=<timestamp>,v1=<signature>
```

**Signing Algorithm**:
```typescript
import { createHmac } from 'crypto';

function signWebhookPayload(timestamp: number, body: string, secret: string): string {
  const payload = `${timestamp}.${body}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}
```

**Alternatives Considered**:
- Ed25519 signatures: Rejected - asymmetric crypto adds complexity without benefit here
- JWT wrapping: Rejected - overhead for simple webhook payloads
- No timestamp: Rejected - vulnerable to replay attacks

### 3. Webhook Delivery & Retry Strategy

**Decision**: Use BullMQ with exponential backoff (immediate, 1min, 5min, 30min)

**Rationale**:
- BullMQ already used for bulk verification - consistent pattern
- Built-in retry with configurable backoff
- Dead letter queue for failed webhooks after 4 attempts
- Redis-backed persistence survives worker restarts

**Configuration**:
```typescript
const webhookQueue = new Queue('webhook-delivery', {
  defaultJobOptions: {
    attempts: 4,
    backoff: {
      type: 'custom',
      delay: (attemptsMade: number) => {
        const delays = [0, 60000, 300000, 1800000]; // immediate, 1min, 5min, 30min
        return delays[attemptsMade] || 1800000;
      },
    },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});
```

**Alternatives Considered**:
- Cron-based retry: Rejected - BullMQ handles this natively
- In-process retry: Rejected - doesn't survive restarts, no persistence
- Kafka: Rejected - over-engineered for this use case

### 4. Rate Limiting Implementation

**Decision**: Extend existing sliding window rate limiter with tier-based configuration

**Rationale**:
- Existing `rate-limit.ts` middleware uses Redis sorted sets
- Add tier lookup from user's subscription
- Include X-RateLimit-* headers on all responses

**Rate Limit Headers**:
```
X-RateLimit-Limit: 10        # Max requests per window
X-RateLimit-Remaining: 7     # Requests remaining
X-RateLimit-Reset: 1707134400 # Unix timestamp when window resets
```

**Tier Limits** (from architecture.md):

| Tier | Requests/sec | Concurrent |
|------|-------------|------------|
| Starter | 10 | 5 |
| Growth | 15 | 10 |
| Pro | 25 | 15 |
| Scale | 50 | 30 |
| Titan | 100 | 50 |

**Alternatives Considered**:
- Token bucket: Rejected - sliding window already implemented and proven
- Separate Redis instance: Rejected - existing rate limit Redis sufficient

### 5. Idempotency Implementation

**Decision**: Redis-backed idempotency with 24-hour TTL

**Rationale**:
- Fast key-value lookup in Redis
- Automatic expiration with TTL
- Store both request hash and response for cache hits

**Key Structure**:
```
idempotency:{userId}:{idempotencyKey} -> { requestHash, response, createdAt }
```

**Algorithm**:
1. Check if idempotency key exists
2. If exists and request hash matches: return cached response
3. If exists and request hash differs: return 422 (idempotency key reuse with different request)
4. If not exists: process request, cache response with 24h TTL

**Alternatives Considered**:
- PostgreSQL for idempotency: Rejected - adds write load, Redis faster
- No request hash validation: Rejected - allows key reuse with different requests
- Shorter TTL: Rejected - 24 hours is standard for payment/critical APIs

### 6. Test Mode Keys (ek_test_)

**Decision**: Prefix-based detection with mock responses

**Rationale**:
- Simple prefix check in auth middleware
- No database lookup needed to detect test mode
- Returns consistent mock successful responses

**Mock Response**:
```json
{
  "email": "test@example.com",
  "status": "valid",
  "score": 0.95,
  "deliverability": "deliverable",
  "attributes": {
    "disposable": false,
    "freeProvider": false,
    "roleAccount": false,
    "catchAll": false,
    "mxRecordsFound": true,
    "smtpValid": true
  }
}
```

**Alternatives Considered**:
- Separate test environment: Rejected - complicates developer experience
- Database flag on key: Rejected - prefix is simpler, no extra column needed

### 7. Webhook URL Validation (Test Ping)

**Decision**: Send test ping on webhook creation, require 2xx response

**Rationale**:
- Validates endpoint is reachable before activation
- Prevents invalid URLs from being saved
- Uses same signing mechanism as real webhooks

**Test Ping Payload**:
```json
{
  "event": "webhook.test",
  "timestamp": 1707134400,
  "data": {
    "message": "This is a test webhook from EmailKit"
  }
}
```

**Timeout**: 5 seconds (shorter than 30s delivery timeout since it's just validation)

**Alternatives Considered**:
- No validation: Rejected - leads to immediate failures and poor UX
- HEAD request only: Rejected - doesn't validate webhook handling logic

### 8. Cursor-Based Pagination

**Decision**: Use opaque cursor encoding (base64 of `{lastId}:{timestamp}`)

**Rationale**:
- Consistent with modern APIs (Stripe, GitHub)
- Handles real-time data better than offset pagination
- Prevents issues with deleted records

**Query Parameters**:
```
GET /api/v1/webhooks?limit=10&after=eyJpZCI6ImFiYzEyMyIsInRzIjoxNzA3MTM0NDAwfQ==
```

**Response**:
```json
{
  "data": [...],
  "hasMore": true,
  "nextCursor": "eyJpZCI6Inh5ejc4OSIsInRzIjoxNzA3MTM0NTAwfQ=="
}
```

**Alternatives Considered**:
- Offset pagination: Rejected - inconsistent with real-time changes
- Keyset pagination (visible params): Rejected - exposes internal IDs

## Dependencies Verified

| Dependency | Version | Purpose |
|------------|---------|---------|
| Express | 4.x | Existing - HTTP routing |
| Drizzle ORM | 0.29+ | Existing - Database queries |
| BullMQ Pro | 7.x | Existing - Webhook delivery queue |
| Redis (ioredis) | 5.x | Existing - Rate limiting, idempotency |
| crypto (Node.js) | Built-in | API key generation, HMAC signing |
| zod | 3.x | Existing - Request validation |
| undici | 6.x | HTTP client for webhook delivery |

## Integration Points

1. **Better Auth**: Existing session-based auth for API key management UI
2. **Credit Service**: Existing credit check/deduct for API verification
3. **Verification Service**: Existing single verification logic
4. **Bulk Verification**: Existing BullMQ-based bulk job processing
5. **Subscription Service**: Tier lookup for rate limits and bulk job limits
