import { pgTable, text, timestamp, boolean, integer, jsonb, real, index } from 'drizzle-orm/pg-core';

// Better Auth Core Tables

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),

  // Custom fields for EmailKit
  firstName: text('first_name'),
  lastName: text('last_name'),
  language: text('language').notNull().default('en'),
  dataRetentionDays: integer('data_retention_days').notNull().default(30),
  deletionRequestedAt: timestamp('deletion_requested_at'),
  paymentCustomerId: text('payment_customer_id'),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),

  // Custom: Track last authentication time for re-auth requirement
  lastAuthenticatedAt: timestamp('last_authenticated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(), // Google ID
  providerId: text('provider_id').notNull(), // "google"
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // email or userId
  value: text('value').notNull(), // hashed OTP
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),

  // Custom: Track verification attempts
  attempts: integer('attempts').notNull().default(0),
});

// Custom EmailKit Tables

export const creditEvent = pgTable(
  'credit_event',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    idempotencyKey: text('idempotency_key').unique(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index('credit_event_user_id_created_at_idx').on(
      table.userId,
      table.createdAt
    ),
  })
);

export const billingInfo = pgTable('billing_info', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verificationResult = pgTable(
  'verification_result',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: text('status').notNull(), // 'valid', 'invalid', 'risky', 'unknown'
    score: real('score').notNull(), // 0.0 to 1.0
    deliverability: text('deliverability').notNull(), // 'deliverable', 'undeliverable', 'risky', 'unknown'
    attributes: jsonb('attributes').notNull(), // { disposable, freeProvider, roleAccount, catchAll, mxRecordsFound, smtpValid }
    serverInfo: jsonb('server_info').notNull(), // { processingTime, requestId, timestamp }
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index('verification_result_user_id_created_at_idx').on(
      table.userId,
      table.createdAt
    ),
    userIdEmailCreatedAtIdx: index('verification_result_user_id_email_created_at_idx').on(
      table.userId,
      table.email,
      table.createdAt
    ),
  })
);

// Subscription table - tracks user subscriptions
export const subscription = pgTable('subscription', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique() // One subscription per user
    .references(() => user.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripePriceId: text('stripe_price_id').notNull(), // Current price ID
  planId: text('plan_id').notNull(), // e.g., 'starter-monthly', 'pro-annual'
  status: text('status').notNull(), // 'active', 'past_due', 'canceled', 'incomplete', 'trialing', 'unpaid'
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: timestamp('canceled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Checkout session tracking - for polling and reconciliation
export const checkoutSession = pgTable(
  'checkout_session',
  {
    id: text('id').primaryKey(), // Stripe session ID
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'one_time_purchase' or 'subscription'
    status: text('status').notNull(), // 'open', 'complete', 'expired'
    paymentStatus: text('payment_status').notNull(), // 'paid', 'unpaid', 'no_payment_required'
    metadata: jsonb('metadata').notNull(), // { credits, planId, price, etc. }
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    userIdIdx: index('checkout_session_user_id_idx').on(table.userId),
  })
);

// Webhook event idempotency - prevent duplicate processing
export const processedWebhookEvent = pgTable('processed_webhook_event', {
  id: text('id').primaryKey(), // Stripe event ID
  type: text('type').notNull(), // Event type (e.g., 'checkout.session.completed')
  processedAt: timestamp('processed_at').notNull().defaultNow(),
});

// Bulk Verification Tables
export const bulkJob = pgTable(
  'bulk_job',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(), // 'file' or 'paste'
    filename: text('filename'),
    totalCount: integer('total_count').notNull(),
    processedCount: integer('processed_count').notNull().default(0),
    status: text('status').notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
    validCount: integer('valid_count').notNull().default(0),
    invalidCount: integer('invalid_count').notNull().default(0),
    riskyCount: integer('risky_count').notNull().default(0),
    unknownCount: integer('unknown_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    resultExpiresAt: timestamp('result_expires_at'),
    resultUrl: text('result_url'),
    upstreamJobId: text('upstream_job_id'), // Task ID from upstream /verify/file API
  },
  (table) => ({
    userIdIdx: index('bulk_job_user_id_idx').on(table.userId),
    statusIdx: index('bulk_job_status_idx').on(table.status),
    createdAtIdx: index('bulk_job_created_at_idx').on(table.createdAt),
  })
);

export const bulkVerificationResult = pgTable(
  'bulk_verification_result',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => bulkJob.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    status: text('status').notNull(), // 'valid', 'invalid', 'risky', 'unknown'
    deliverable: boolean('deliverable').notNull(),
    risky: boolean('risky').notNull(),
    unknown: boolean('unknown').notNull(),
    riskScore: real('risk_score').notNull(),
    mxRecords: jsonb('mx_records'),
    smtpProvider: text('smtp_provider'),
    isFreeEmail: boolean('is_free_email').notNull().default(false),
    isRoleBased: boolean('is_role_based').notNull().default(false),
    isCatchAll: boolean('is_catch_all').notNull().default(false),
    isDisposable: boolean('is_disposable').notNull().default(false),
    hasMxRecords: boolean('has_mx_records').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    jobIdIdx: index('bulk_verification_result_job_id_idx').on(table.jobId),
    statusIdx: index('bulk_verification_result_status_idx').on(table.status),
  })
);

// API Key table - stores API key metadata (raw key never stored, only hash)
export const apiKey = pgTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    keyPrefix: text('key_prefix').notNull(), // First 12 chars for display (e.g., `ek_Ue7HpvL9`)
    isTest: boolean('is_test').notNull().default(false), // True for `ek_test_` keys
    status: text('status').notNull().default('active'), // 'active', 'expired', 'revoked'
    expiresAt: timestamp('expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    usageCount: integer('usage_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    revokedAt: timestamp('revoked_at'),
    hardDeleteAt: timestamp('hard_delete_at'),
  },
  (table) => ({
    userIdIdx: index('api_key_user_id_idx').on(table.userId),
    hardDeleteAtIdx: index('api_key_hard_delete_at_idx').on(table.hardDeleteAt),
  })
);

// Webhook table - stores webhook endpoint configurations
export const webhook = pgTable(
  'webhook',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    url: text('url').notNull(), // HTTPS endpoint URL
    signingSecret: text('signing_secret').notNull(), // Raw signing secret for HMAC
    secretPrefix: text('secret_prefix').notNull(), // First 12 chars (e.g., `whsec_abc123`)
    events: jsonb('events').notNull(), // Array of subscribed event types
    payloadMode: text('payload_mode').notNull().default('full'), // 'full' or 'summary'
    status: text('status').notNull().default('active'), // 'active', 'failing', 'paused'
    failureCount: integer('failure_count').notNull().default(0),
    lastDeliveryAt: timestamp('last_delivery_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('webhook_user_id_idx').on(table.userId),
    statusIdx: index('webhook_status_idx').on(table.status),
  })
);

// Webhook delivery table - stores individual webhook delivery attempts for debugging
export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id')
      .notNull()
      .references(() => webhook.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(), // Unique event identifier
    eventType: text('event_type').notNull(), // Event type (e.g., verification.completed)
    payload: jsonb('payload').notNull(), // Full payload sent
    status: text('status').notNull().default('pending'), // 'pending', 'delivered', 'failed'
    responseCode: integer('response_code'),
    responseBody: text('response_body'), // Response body (truncated)
    durationMs: integer('duration_ms'),
    attempt: integer('attempt').notNull().default(1), // Attempt number (1-4)
    nextRetryAt: timestamp('next_retry_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    webhookIdIdx: index('webhook_delivery_webhook_id_idx').on(table.webhookId),
    eventIdIdx: index('webhook_delivery_event_id_idx').on(table.eventId),
    createdAtIdx: index('webhook_delivery_created_at_idx').on(table.createdAt),
  })
);

// Type exports for use in application code
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type CreditEvent = typeof creditEvent.$inferSelect;
export type NewCreditEvent = typeof creditEvent.$inferInsert;
export type BillingInfo = typeof billingInfo.$inferSelect;
export type NewBillingInfo = typeof billingInfo.$inferInsert;
export type VerificationResult = typeof verificationResult.$inferSelect;
export type NewVerificationResult = typeof verificationResult.$inferInsert;
export type Subscription = typeof subscription.$inferSelect;
export type NewSubscription = typeof subscription.$inferInsert;
export type CheckoutSession = typeof checkoutSession.$inferSelect;
export type NewCheckoutSession = typeof checkoutSession.$inferInsert;
export type ProcessedWebhookEvent = typeof processedWebhookEvent.$inferSelect;
export type NewProcessedWebhookEvent = typeof processedWebhookEvent.$inferInsert;
export type BulkJob = typeof bulkJob.$inferSelect;
export type NewBulkJob = typeof bulkJob.$inferInsert;
export type BulkVerificationResult = typeof bulkVerificationResult.$inferSelect;
export type NewBulkVerificationResult = typeof bulkVerificationResult.$inferInsert;
export type ApiKey = typeof apiKey.$inferSelect;
export type NewApiKey = typeof apiKey.$inferInsert;
export type Webhook = typeof webhook.$inferSelect;
export type NewWebhook = typeof webhook.$inferInsert;
export type WebhookDelivery = typeof webhookDelivery.$inferSelect;
export type NewWebhookDelivery = typeof webhookDelivery.$inferInsert;
