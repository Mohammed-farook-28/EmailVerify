import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

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
  type: text('type').notNull(), // 'signup_bonus', 'purchase', 'verification_used', etc.
  amount: integer('amount').notNull(), // Positive for credits, negative for deductions
  balanceAfter: integer('balance_after').notNull(),
  referenceType: text('reference_type'), // 'verification_job', 'payment', etc.
  referenceId: text('reference_id'),
  idempotencyKey: text('idempotency_key').unique(),
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
