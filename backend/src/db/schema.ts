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
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

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
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // email or userId
  value: text('value').notNull(), // hashed OTP
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),

  // Custom: Track verification attempts
  attempts: integer('attempts').notNull().default(0),
});

// Custom EmailKit Tables

export const creditEvent = pgTable('credit_event', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'signup_bonus', 'purchase', 'subscription', 'subscription_renewal', 'expire', 'verification_used', etc.
  amount: integer('amount').notNull(), // Positive for credits, negative for deductions
  balanceAfter: integer('balance_after').notNull(),
  referenceType: text('reference_type'), // 'verification_job', 'payment', 'subscription', 'checkout_session', etc.
  referenceId: text('reference_id'),
  idempotencyKey: text('idempotency_key').unique(),
  metadata: jsonb('metadata'), // Additional context (e.g., package, plan, expiration date)
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

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
export const checkoutSession = pgTable('checkout_session', {
  id: text('id').primaryKey(), // Stripe session ID
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'one_time_purchase' or 'subscription'
  status: text('status').notNull(), // 'open', 'complete', 'expired'
  paymentStatus: text('payment_status').notNull(), // 'paid', 'unpaid', 'no_payment_required'
  metadata: jsonb('metadata').notNull(), // { packageId, planId, priceId, etc. }
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

// Webhook event idempotency - prevent duplicate processing
export const processedWebhookEvent = pgTable('processed_webhook_event', {
  id: text('id').primaryKey(), // Stripe event ID
  type: text('type').notNull(), // Event type (e.g., 'checkout.session.completed')
  processedAt: timestamp('processed_at').notNull().defaultNow(),
});

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
