# Data Model: Public API & Webhooks

**Feature**: 005-api-webhooks | **Date**: 2026-02-05

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────────────┐
│    user     │       │   api_key   │       │ idempotency_record  │
├─────────────┤       ├─────────────┤       ├─────────────────────┤
│ id (PK)     │◄──────│ user_id (FK)│       │ key (PK)            │
│ email       │       │ id (PK)     │       │ user_id             │
│ ...         │       │ name        │       │ request_hash        │
└─────────────┘       │ key_hash    │       │ response            │
      │               │ key_prefix  │       │ expires_at          │
      │               │ is_test     │       │ created_at          │
      │               │ status      │       └─────────────────────┘
      │               │ expires_at  │       (Redis, not PostgreSQL)
      │               │ last_used_at│
      │               │ created_at  │
      │               │ revoked_at  │
      │               └─────────────┘
      │
      │               ┌─────────────┐       ┌─────────────────────┐
      └───────────────│   webhook   │       │  webhook_delivery   │
                      ├─────────────┤       ├─────────────────────┤
                      │ id (PK)     │◄──────│ webhook_id (FK)     │
                      │ user_id (FK)│       │ id (PK)             │
                      │ url         │       │ event_id            │
                      │ secret_hash │       │ event_type          │
                      │ events      │       │ payload             │
                      │ payload_mode│       │ status              │
                      │ status      │       │ response_code       │
                      │ failure_cnt │       │ duration_ms         │
                      │ last_delivery│      │ attempt             │
                      │ created_at  │       │ created_at          │
                      └─────────────┘       └─────────────────────┘
```

## Table Definitions

### api_key

Stores API key metadata. The raw key is never stored - only a SHA-256 hash.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Unique identifier (nanoid) |
| user_id | text | FK → user.id, NOT NULL | Owner of the key |
| name | text | NOT NULL | User-provided name (e.g., "Production") |
| key_hash | text | NOT NULL, UNIQUE | SHA-256 hash of full key |
| key_prefix | text | NOT NULL | First 12 chars for display (e.g., `ek_Ue7HpvL9`) |
| is_test | boolean | NOT NULL, DEFAULT false | True for `ek_test_` keys |
| status | text | NOT NULL, DEFAULT 'active' | 'active', 'expired', 'revoked' |
| expires_at | timestamp | NULL | Optional expiration date |
| last_used_at | timestamp | NULL | Updated on each API call |
| usage_count | integer | NOT NULL, DEFAULT 0 | Total API calls made |
| created_at | timestamp | NOT NULL, DEFAULT now() | Creation timestamp |
| revoked_at | timestamp | NULL | When soft-deleted |
| hard_delete_at | timestamp | NULL | When to hard delete (revoked_at + 90 days) |

**Indexes**:
- `api_key_user_id_idx` on `user_id`
- `api_key_key_hash_idx` on `key_hash` (UNIQUE)
- `api_key_hard_delete_at_idx` on `hard_delete_at` (for cleanup job)

**Drizzle Schema**:
```typescript
export const apiKey = pgTable('api_key', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  isTest: boolean('is_test').notNull().default(false),
  status: text('status').notNull().default('active'), // active, expired, revoked
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  revokedAt: timestamp('revoked_at'),
  hardDeleteAt: timestamp('hard_delete_at'),
}, (table) => ({
  userIdIdx: index('api_key_user_id_idx').on(table.userId),
  hardDeleteAtIdx: index('api_key_hard_delete_at_idx').on(table.hardDeleteAt),
}));
```

### webhook

Stores webhook endpoint configurations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Unique identifier (nanoid) |
| user_id | text | FK → user.id, NOT NULL | Owner of webhook |
| url | text | NOT NULL | HTTPS endpoint URL |
| secret_hash | text | NOT NULL | SHA-256 hash of signing secret |
| secret_prefix | text | NOT NULL | First 12 chars (e.g., `whsec_abc123`) |
| events | jsonb | NOT NULL | Array of subscribed event types |
| payload_mode | text | NOT NULL, DEFAULT 'full' | 'full' or 'summary' |
| status | text | NOT NULL, DEFAULT 'active' | 'active', 'failing', 'paused' |
| failure_count | integer | NOT NULL, DEFAULT 0 | Consecutive failures |
| last_delivery_at | timestamp | NULL | Last successful delivery |
| created_at | timestamp | NOT NULL, DEFAULT now() | Creation timestamp |

**Indexes**:
- `webhook_user_id_idx` on `user_id`
- `webhook_status_idx` on `status`

**Drizzle Schema**:
```typescript
export const webhook = pgTable('webhook', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secretHash: text('secret_hash').notNull(),
  secretPrefix: text('secret_prefix').notNull(),
  events: jsonb('events').notNull(), // ['verification.completed', 'bulk.completed', etc.]
  payloadMode: text('payload_mode').notNull().default('full'), // full, summary
  status: text('status').notNull().default('active'), // active, failing, paused
  failureCount: integer('failure_count').notNull().default(0),
  lastDeliveryAt: timestamp('last_delivery_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('webhook_user_id_idx').on(table.userId),
  statusIdx: index('webhook_status_idx').on(table.status),
}));
```

### webhook_delivery

Stores individual webhook delivery attempts for debugging.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Unique identifier (nanoid) |
| webhook_id | text | FK → webhook.id, NOT NULL | Parent webhook |
| event_id | text | NOT NULL | Unique event identifier |
| event_type | text | NOT NULL | Event type (e.g., verification.completed) |
| payload | jsonb | NOT NULL | Full payload sent |
| status | text | NOT NULL | 'pending', 'delivered', 'failed' |
| response_code | integer | NULL | HTTP response code |
| response_body | text | NULL | Response body (truncated) |
| duration_ms | integer | NULL | Request duration |
| attempt | integer | NOT NULL, DEFAULT 1 | Attempt number (1-4) |
| next_retry_at | timestamp | NULL | When to retry if failed |
| created_at | timestamp | NOT NULL, DEFAULT now() | Delivery timestamp |

**Indexes**:
- `webhook_delivery_webhook_id_idx` on `webhook_id`
- `webhook_delivery_event_id_idx` on `event_id`
- `webhook_delivery_created_at_idx` on `created_at`

**Drizzle Schema**:
```typescript
export const webhookDelivery = pgTable('webhook_delivery', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id').notNull().references(() => webhook.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'), // pending, delivered, failed
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
  durationMs: integer('duration_ms'),
  attempt: integer('attempt').notNull().default(1),
  nextRetryAt: timestamp('next_retry_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  webhookIdIdx: index('webhook_delivery_webhook_id_idx').on(table.webhookId),
  eventIdIdx: index('webhook_delivery_event_id_idx').on(table.eventId),
  createdAtIdx: index('webhook_delivery_created_at_idx').on(table.createdAt),
}));
```

## Redis Keys

### Idempotency Cache

```
Key:    idempotency:{userId}:{idempotencyKey}
Value:  JSON { requestHash: string, response: object, createdAt: number }
TTL:    24 hours (86400 seconds)
```

### Rate Limit Counters

```
Key:    ratelimit:api:{userId}
Value:  Sorted set of timestamps (existing pattern)
TTL:    Window duration (e.g., 1 second)
```

### API Key Last Used Cache

```
Key:    apikey:lastused:{keyHash}
Value:  Timestamp
TTL:    None (updated async to reduce DB writes)
```

## Validation Rules

### API Key
- Name: 1-100 characters, required
- Expiration: Must be in future if provided
- User can have max 10 keys (active + revoked with hard_delete_at in future)

### Webhook
- URL: Must be valid HTTPS URL
- Events: Must be valid event types from allowed list
- User can have max 10 webhooks
- URL must respond to test ping with 2xx

### Idempotency Key
- Must be valid UUID v4 format
- Required for all POST requests
- Cannot be reused with different request body (returns 422)

## State Transitions

### API Key Status

```
                    ┌─────────────────────┐
                    │                     │
                    ▼                     │
┌────────┐     ┌─────────┐     ┌─────────┐
│ active │────▶│ expired │     │         │
└────────┘     └─────────┘     │ revoked │
    │               │          │         │
    └───────────────┴─────────▶└─────────┘
                                    │
                                    │ (90 days later)
                                    ▼
                              ┌───────────┐
                              │ hard_deleted │
                              └───────────┘
```

- `active` → `expired`: When `expires_at` passes (background job)
- `active` → `revoked`: When user deletes key
- `expired` → `revoked`: When user deletes expired key
- `revoked` → hard deleted: 90 days after revocation (background job)

### Webhook Status

```
┌────────┐     ┌─────────┐     ┌────────┐
│ active │────▶│ failing │────▶│ paused │
└────────┘     └─────────┘     └────────┘
    ▲               │               │
    │               │               │
    └───────────────┴───────────────┘
         (manual reactivation)
```

- `active` → `failing`: First delivery failure
- `failing` → `active`: Successful delivery (resets failure_count)
- `failing` → `paused`: 4 consecutive failures
- `paused` → `active`: User manually reactivates

## Event Types

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `verification.completed` | Single/batch verification finishes | Verification result(s) |
| `bulk.completed` | Bulk job finishes successfully | Job summary, result URL |
| `bulk.failed` | Bulk job fails | Job ID, error details |
| `credits.low` | Balance < 10% of last purchase | Current balance, threshold |
| `webhook.test` | Test ping on creation | Test message |
