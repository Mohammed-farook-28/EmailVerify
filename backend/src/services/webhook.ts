/**
 * Webhook Management Service
 *
 * Handles CRUD operations for webhooks, test ping validation,
 * and status management (active/failing/paused).
 */

import { db } from '../db/index.js';
import { webhook, webhookDelivery, user, type Webhook, type NewWebhook } from '../db/schema.js';
import { eq, and, count, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateWebhookSecret, hashSecret, getSecretPrefix } from '../lib/hmac.js';
import { logger } from '../config/logger.js';
import { sendWebhookPausedNotification } from './email.js';

const log = logger.child({ module: 'webhook-service' });

// Maximum webhooks per user
const MAX_WEBHOOKS_PER_USER = 10;

// Test ping timeout (5 seconds per FR-013a)
const TEST_PING_TIMEOUT_MS = 5000;

export type WebhookEventType =
  | 'verification.completed'
  | 'bulk.completed'
  | 'bulk.failed'
  | 'credits.low';

export interface CreateWebhookParams {
  userId: string;
  url: string;
  events: WebhookEventType[];
  payloadMode?: 'full' | 'summary';
}

export interface CreateWebhookResult {
  id: string;
  url: string;
  events: WebhookEventType[];
  payloadMode: 'full' | 'summary';
  status: 'active' | 'failing' | 'paused';
  secret: string; // Only returned at creation!
  secretPrefix: string;
  createdAt: Date;
}

export interface WebhookListItem {
  id: string;
  url: string;
  events: WebhookEventType[];
  payloadMode: 'full' | 'summary';
  status: 'active' | 'failing' | 'paused';
  secretPrefix: string;
  failureCount: number;
  lastDeliveryAt: Date | null;
  createdAt: Date;
}

export interface UpdateWebhookParams {
  url?: string;
  events?: WebhookEventType[];
  payloadMode?: 'full' | 'summary';
  status?: 'active' | 'paused';
}

/**
 * Count webhooks for a user
 */
async function countUserWebhooks(userId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(webhook)
    .where(eq(webhook.userId, userId));
  return result[0]?.count ?? 0;
}

/**
 * Send test ping to webhook URL (T038)
 * Returns true if successful (2xx response within 5 seconds)
 */
export async function sendTestPing(url: string): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  const testPayload = {
    type: 'webhook.test',
    data: {
      message: 'This is a test ping from EmailKit',
      timestamp: new Date().toISOString(),
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_PING_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EmailKit-Webhook/1.0',
        'X-Webhook-Test': 'true',
      },
      body: JSON.stringify(testPayload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { success: true, statusCode: response.status };
    } else {
      return {
        success: false,
        error: `Endpoint returned HTTP ${response.status}`,
        statusCode: response.status,
      };
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out after 5 seconds' };
    }
    return { success: false, error: err.message || 'Connection failed' };
  }
}

/**
 * Create a new webhook (T037, T039, T045)
 * - Validates max webhooks limit (T045)
 * - Sends test ping (T038)
 * - Generates signing secret (T039)
 */
export async function createWebhook(params: CreateWebhookParams): Promise<CreateWebhookResult> {
  const { userId, url, events, payloadMode = 'full' } = params;

  // T045: Check webhook limit
  const currentCount = await countUserWebhooks(userId);
  if (currentCount >= MAX_WEBHOOKS_PER_USER) {
    throw new WebhookError(
      'MAX_WEBHOOKS_EXCEEDED',
      `Maximum of ${MAX_WEBHOOKS_PER_USER} webhooks allowed per user`
    );
  }

  // T038: Send test ping to validate URL
  const pingResult = await sendTestPing(url);
  if (!pingResult.success) {
    throw new WebhookError(
      'TEST_PING_FAILED',
      `Webhook URL validation failed: ${pingResult.error}`,
      { statusCode: pingResult.statusCode }
    );
  }

  // T039: Generate signing secret
  const secret = generateWebhookSecret();
  const secretHash = hashSecret(secret);
  const secretPrefix = getSecretPrefix(secret);

  // Create webhook record
  const webhookId = nanoid();
  const now = new Date();

  const newWebhook: NewWebhook = {
    id: webhookId,
    userId,
    url,
    secretHash,
    secretPrefix,
    events: events as any, // JSONB
    payloadMode,
    status: 'active',
    failureCount: 0,
    lastDeliveryAt: null,
    createdAt: now,
  };

  await db.insert(webhook).values(newWebhook);

  log.info({ webhookId, userId, url }, 'Webhook created');

  return {
    id: webhookId,
    url,
    events,
    payloadMode,
    status: 'active',
    secret, // Only returned at creation!
    secretPrefix,
    createdAt: now,
  };
}

/**
 * List all webhooks for a user
 */
export async function listWebhooks(
  userId: string,
  cursor?: string,
  limit: number = 20
): Promise<{ webhooks: WebhookListItem[]; nextCursor: string | null }> {
  let query = db
    .select()
    .from(webhook)
    .where(eq(webhook.userId, userId))
    .orderBy(desc(webhook.createdAt))
    .limit(limit + 1);

  // Apply cursor if provided (cursor is the createdAt timestamp)
  if (cursor) {
    const cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf-8'));
    query = db
      .select()
      .from(webhook)
      .where(and(eq(webhook.userId, userId)))
      .orderBy(desc(webhook.createdAt))
      .limit(limit + 1);
  }

  const webhooks = await query;

  // Check if there are more results
  const hasMore = webhooks.length > limit;
  const results = hasMore ? webhooks.slice(0, limit) : webhooks;

  // Generate next cursor
  let nextCursor: string | null = null;
  if (hasMore && results.length > 0) {
    const lastItem = results[results.length - 1];
    nextCursor = Buffer.from(lastItem.createdAt.toISOString()).toString('base64');
  }

  return {
    webhooks: results.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events as WebhookEventType[],
      payloadMode: w.payloadMode as 'full' | 'summary',
      status: w.status as 'active' | 'failing' | 'paused',
      secretPrefix: w.secretPrefix,
      failureCount: w.failureCount,
      lastDeliveryAt: w.lastDeliveryAt,
      createdAt: w.createdAt,
    })),
    nextCursor,
  };
}

/**
 * Get a single webhook by ID
 */
export async function getWebhook(webhookId: string, userId: string): Promise<WebhookListItem | null> {
  const w = await db.query.webhook.findFirst({
    where: and(eq(webhook.id, webhookId), eq(webhook.userId, userId)),
  });

  if (!w) {
    return null;
  }

  return {
    id: w.id,
    url: w.url,
    events: w.events as WebhookEventType[],
    payloadMode: w.payloadMode as 'full' | 'summary',
    status: w.status as 'active' | 'failing' | 'paused',
    secretPrefix: w.secretPrefix,
    failureCount: w.failureCount,
    lastDeliveryAt: w.lastDeliveryAt,
    createdAt: w.createdAt,
  };
}

/**
 * Update a webhook
 */
export async function updateWebhook(
  webhookId: string,
  userId: string,
  params: UpdateWebhookParams
): Promise<WebhookListItem | null> {
  // Verify ownership
  const existing = await db.query.webhook.findFirst({
    where: and(eq(webhook.id, webhookId), eq(webhook.userId, userId)),
  });

  if (!existing) {
    return null;
  }

  // If URL is being changed, validate with test ping
  if (params.url && params.url !== existing.url) {
    const pingResult = await sendTestPing(params.url);
    if (!pingResult.success) {
      throw new WebhookError(
        'TEST_PING_FAILED',
        `Webhook URL validation failed: ${pingResult.error}`,
        { statusCode: pingResult.statusCode }
      );
    }
  }

  // Build update object
  const updates: Partial<Webhook> = {};
  if (params.url) updates.url = params.url;
  if (params.events) updates.events = params.events as any;
  if (params.payloadMode) updates.payloadMode = params.payloadMode;
  if (params.status) {
    updates.status = params.status;
    // Reset failure count when reactivating
    if (params.status === 'active') {
      updates.failureCount = 0;
    }
  }

  if (Object.keys(updates).length === 0) {
    // No changes
    return getWebhook(webhookId, userId);
  }

  await db.update(webhook).set(updates).where(eq(webhook.id, webhookId));

  log.info({ webhookId, userId, updates: Object.keys(updates) }, 'Webhook updated');

  return getWebhook(webhookId, userId);
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(webhookId: string, userId: string): Promise<boolean> {
  const existing = await db.query.webhook.findFirst({
    where: and(eq(webhook.id, webhookId), eq(webhook.userId, userId)),
  });

  if (!existing) {
    return false;
  }

  await db.delete(webhook).where(eq(webhook.id, webhookId));

  log.info({ webhookId, userId }, 'Webhook deleted');

  return true;
}

/**
 * Update webhook status after delivery attempt (T049)
 * - active -> failing: On first failure
 * - failing -> active: On successful delivery
 * - failing -> paused: After 4 consecutive failures
 */
export async function updateWebhookStatus(
  webhookId: string,
  success: boolean
): Promise<'active' | 'failing' | 'paused'> {
  const w = await db.query.webhook.findFirst({
    where: eq(webhook.id, webhookId),
  });

  if (!w) {
    throw new Error(`Webhook ${webhookId} not found`);
  }

  let newStatus: 'active' | 'failing' | 'paused' = w.status as any;
  let newFailureCount = w.failureCount;

  if (success) {
    // Successful delivery - reset to active
    newStatus = 'active';
    newFailureCount = 0;
  } else {
    // Failed delivery
    newFailureCount += 1;

    if (newFailureCount >= 4) {
      // T049/T053: Pause after 4 consecutive failures
      newStatus = 'paused';
      log.warn({ webhookId, failureCount: newFailureCount }, 'Webhook paused after 4 failures');

      // T053: Send email notification to user
      sendWebhookPausedEmail(w.userId, w.url, webhookId).catch((err) => {
        log.error({ err, webhookId, userId: w.userId }, 'Failed to send webhook paused notification');
      });
    } else {
      newStatus = 'failing';
    }
  }

  await db
    .update(webhook)
    .set({
      status: newStatus,
      failureCount: newFailureCount,
      lastDeliveryAt: success ? new Date() : undefined,
    })
    .where(eq(webhook.id, webhookId));

  return newStatus;
}

/**
 * T053: Send email notification when webhook is paused
 * Fetches user email and sends notification asynchronously
 */
async function sendWebhookPausedEmail(
  userId: string,
  webhookUrl: string,
  webhookId: string
): Promise<void> {
  const userRecord = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true },
  });

  if (!userRecord?.email) {
    log.warn({ userId, webhookId }, 'Cannot send webhook paused notification: user email not found');
    return;
  }

  await sendWebhookPausedNotification(userRecord.email, webhookUrl, webhookId);
  log.info({ userId, webhookId, email: userRecord.email }, 'Sent webhook paused notification');
}

/**
 * Get webhooks subscribed to a specific event type
 */
export async function getWebhooksForEvent(
  userId: string,
  eventType: WebhookEventType
): Promise<Webhook[]> {
  const webhooks = await db.query.webhook.findMany({
    where: and(
      eq(webhook.userId, userId),
      eq(webhook.status, 'active')
    ),
  });

  // Filter by event type (events is a JSONB array)
  return webhooks.filter((w) => {
    const events = w.events as WebhookEventType[];
    return events.includes(eventType);
  });
}

/**
 * Get webhook with its secret (for signing payloads)
 * Only used internally by webhook worker
 */
export async function getWebhookWithSecret(webhookId: string): Promise<Webhook | null> {
  const result = await db.query.webhook.findFirst({
    where: eq(webhook.id, webhookId),
  });
  return result ?? null;
}

/**
 * Custom error class for webhook operations
 */
export class WebhookError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

// ============================================
// Webhook Trigger Functions (T050-T052)
// ============================================

// Import enqueue function - lazy loaded to avoid circular deps
let enqueueWebhookDelivery: ((
  webhookId: string,
  eventType: WebhookEventType,
  payload: Record<string, any>,
  userId: string
) => Promise<string>) | null = null;

async function getEnqueueFunction() {
  if (!enqueueWebhookDelivery) {
    const { enqueueWebhookDelivery: fn } = await import('./webhook-worker.js');
    enqueueWebhookDelivery = fn;
  }
  return enqueueWebhookDelivery;
}

/**
 * Trigger webhooks for an event (T050-T052)
 * Finds all active webhooks subscribed to the event and enqueues delivery
 */
export async function triggerWebhooks(
  userId: string,
  eventType: WebhookEventType,
  payload: Record<string, any>
): Promise<void> {
  try {
    const webhooks = await getWebhooksForEvent(userId, eventType);

    if (webhooks.length === 0) {
      log.debug({ userId, eventType }, 'No webhooks subscribed to event');
      return;
    }

    const enqueue = await getEnqueueFunction();

    for (const w of webhooks) {
      await enqueue(w.id, eventType, payload, userId);
    }

    log.info({ userId, eventType, webhookCount: webhooks.length }, 'Webhooks triggered');
  } catch (err) {
    log.error({ err, userId, eventType }, 'Failed to trigger webhooks');
    // Don't throw - webhook failures shouldn't break the main flow
  }
}

/**
 * T050: Trigger verification.completed webhook
 */
export async function triggerVerificationCompleted(
  userId: string,
  verificationResult: {
    email: string;
    status: string;
    score: number;
    deliverability: string;
    attributes: Record<string, boolean>;
  }
): Promise<void> {
  await triggerWebhooks(userId, 'verification.completed', {
    type: 'verification.completed',
    email: verificationResult.email,
    result: verificationResult,
    timestamp: new Date().toISOString(),
  });
}

/**
 * T051: Trigger bulk.completed webhook
 */
export async function triggerBulkCompleted(
  userId: string,
  jobInfo: {
    jobId: string;
    totalCount: number;
    validCount: number;
    invalidCount: number;
    riskyCount: number;
    unknownCount: number;
    resultUrl: string;
  }
): Promise<void> {
  await triggerWebhooks(userId, 'bulk.completed', {
    type: 'bulk.completed',
    jobId: jobInfo.jobId,
    summary: {
      total: jobInfo.totalCount,
      valid: jobInfo.validCount,
      invalid: jobInfo.invalidCount,
      risky: jobInfo.riskyCount,
      unknown: jobInfo.unknownCount,
    },
    resultUrl: jobInfo.resultUrl,
    timestamp: new Date().toISOString(),
  });
}

/**
 * T051: Trigger bulk.failed webhook
 */
export async function triggerBulkFailed(
  userId: string,
  jobInfo: {
    jobId: string;
    error: string;
  }
): Promise<void> {
  await triggerWebhooks(userId, 'bulk.failed', {
    type: 'bulk.failed',
    jobId: jobInfo.jobId,
    error: jobInfo.error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * T052: Trigger credits.low webhook
 * Fires when balance drops below 10% of last purchase amount
 */
export async function triggerCreditsLow(
  userId: string,
  creditInfo: {
    currentBalance: number;
    threshold: number;
    lastPurchaseAmount: number;
  }
): Promise<void> {
  await triggerWebhooks(userId, 'credits.low', {
    type: 'credits.low',
    balance: creditInfo.currentBalance,
    threshold: creditInfo.threshold,
    lastPurchaseAmount: creditInfo.lastPurchaseAmount,
    timestamp: new Date().toISOString(),
  });
}

export default {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  updateWebhookStatus,
  getWebhooksForEvent,
  getWebhookWithSecret,
  sendTestPing,
  triggerWebhooks,
  triggerVerificationCompleted,
  triggerBulkCompleted,
  triggerBulkFailed,
  triggerCreditsLow,
  WebhookError,
};
