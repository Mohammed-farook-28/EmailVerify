import { z } from 'zod';

export const signUpSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().max(255).transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(128),
  terms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms of service' }),
  }),
});

export const signInSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  userId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const resendVerificationSchema = z.object({
  userId: z.string().uuid(),
});

export const passwordResetSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
});

export const passwordResetVerifySchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  newPassword: z.string().min(8).max(128),
});

export const updateNameSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
});

export const updateEmailSchema = z.object({
  newEmail: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

export const verifyEmailChangeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const updateLanguageSchema = z.object({
  language: z.enum(['en']),
});

export const updateDataRetentionSchema = z.object({
  retentionDays: z.number().refine((v) => [7, 14, 30, 60, 90].includes(v), {
    message: 'Retention days must be 7, 14, 30, 60, or 90',
  }),
});

export const updateBillingInfoSchema = z.object({
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  state: z.string().max(255).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});

export const deletionCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  password: z.string().optional(),
});

export const deleteAccountSchema = z.object({
  password: z.string().optional(),
  confirmationCode: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

// ============================================
// API v1 Schemas (Public API)
// ============================================

// API Key Management
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresIn: z.enum(['1m', '3m', '6m', '1y', 'never']).optional().default('never'),
  isTest: z.boolean().optional().default(false),
});

export const apiKeyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  isTest: z.boolean(),
  status: z.enum(['active', 'expired', 'revoked']),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  usageCount: z.number(),
  createdAt: z.string(),
});

// Single Email Verification
export const singleVerifyRequestSchema = z.object({
  email: z.string().email().max(320), // RFC 5321 max email length
});

export const verificationResultSchema = z.object({
  email: z.string(),
  status: z.enum(['valid', 'invalid', 'risky', 'unknown']),
  score: z.number().min(0).max(1),
  deliverability: z.enum(['deliverable', 'undeliverable', 'risky', 'unknown']),
  attributes: z.object({
    disposable: z.boolean(),
    freeProvider: z.boolean(),
    roleAccount: z.boolean(),
    catchAll: z.boolean(),
    mxRecordsFound: z.boolean(),
    smtpValid: z.boolean(),
  }),
  requestId: z.string(),
});

// Batch Verification (up to 100 emails)
export const batchVerifyRequestSchema = z.object({
  emails: z.array(z.string().email().max(320)).min(1).max(100),
});

export const batchVerifyResponseSchema = z.object({
  results: z.array(verificationResultSchema),
  creditsUsed: z.number(),
  requestId: z.string(),
});

// Bulk Verification (async, large jobs)
export const bulkVerifyRequestSchema = z.object({
  emails: z.array(z.string().email().max(320)).min(1).max(500000),
});

export const bulkJobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  totalCount: z.number(),
  processedCount: z.number(),
  progress: z.number().min(0).max(100),
  validCount: z.number(),
  invalidCount: z.number(),
  riskyCount: z.number(),
  unknownCount: z.number(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  resultUrl: z.string().nullable(),
  resultExpiresAt: z.string().nullable(),
});

// Credits
export const creditsResponseSchema = z.object({
  balance: z.number(),
  updatedAt: z.string(),
});

// Webhook Management
export const webhookEventType = z.enum([
  'verification.completed',
  'bulk.completed',
  'bulk.failed',
  'credits.low',
]);

export const createWebhookSchema = z.object({
  url: z.string().url().refine(
    (url) => {
      const parsed = new URL(url);
      // Allow HTTPS or localhost for development
      return parsed.protocol === 'https:' ||
             parsed.hostname === 'localhost' ||
             parsed.hostname === '127.0.0.1';
    },
    { message: 'URL must use HTTPS (localhost exempt for development)' }
  ),
  events: z.array(webhookEventType).min(1),
  payloadMode: z.enum(['full', 'summary']).optional().default('full'),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().refine(
    (url) => {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' ||
             parsed.hostname === 'localhost' ||
             parsed.hostname === '127.0.0.1';
    },
    { message: 'URL must use HTTPS (localhost exempt for development)' }
  ).optional(),
  events: z.array(webhookEventType).min(1).optional(),
  payloadMode: z.enum(['full', 'summary']).optional(),
  status: z.enum(['active', 'paused']).optional(),
});

export const webhookResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(webhookEventType),
  payloadMode: z.enum(['full', 'summary']),
  status: z.enum(['active', 'failing', 'paused']),
  failureCount: z.number(),
  lastDeliveryAt: z.string().nullable(),
  createdAt: z.string(),
});

// Pagination
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
});

// Error responses
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string(),
});

// Idempotency key validation (UUID v4)
export const idempotencyKeySchema = z.string().uuid();

// Rate limit headers type
export type RateLimitHeaders = {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
};
