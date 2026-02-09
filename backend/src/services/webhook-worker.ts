/**
 * Webhook Delivery Worker
 *
 * BullMQ worker for delivering webhook payloads with retry logic.
 * T046: Create delivery queue and worker
 * T047: HMAC-SHA256 payload signing
 * T048: Retry with backoff (0, 1m, 5m, 30m)
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { webhookDelivery, type NewWebhookDelivery } from '../db/schema.js';
import { getWebhookWithSecret, updateWebhookStatus, type WebhookEventType } from './webhook.js';
import { signWebhookPayload } from '../lib/hmac.js';
import { logger } from '../config/logger.js';

const log = logger.child({ module: 'webhook-worker' });

// Delivery timeout (30 seconds per FR-017a)
const DELIVERY_TIMEOUT_MS = 30000;

// Retry delays: immediate (0), 1 minute, 5 minutes, 30 minutes (FR-017)
const RETRY_DELAYS_MS = [0, 60000, 300000, 1800000];

// Create Redis connection for BullMQ
const connection = new IORedis.default({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Create webhook delivery queue
export const webhookDeliveryQueue = new Queue('webhook-delivery', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
    attempts: 4, // 4 attempts total (immediate + 3 retries)
    backoff: {
      type: 'custom',
    },
  },
});

export interface WebhookDeliveryJob {
  webhookId: string;
  eventId: string;
  eventType: WebhookEventType;
  payload: Record<string, any>;
  userId: string;
}

/**
 * Enqueue a webhook delivery
 */
export async function enqueueWebhookDelivery(
  webhookId: string,
  eventType: WebhookEventType,
  payload: Record<string, any>,
  userId: string
): Promise<string> {
  const eventId = `evt_${nanoid(16)}`;

  await webhookDeliveryQueue.add(
    'deliver',
    {
      webhookId,
      eventId,
      eventType,
      payload,
      userId,
    } as WebhookDeliveryJob,
    {
      jobId: eventId,
    }
  );

  log.debug({ webhookId, eventId, eventType }, 'Webhook delivery enqueued');

  return eventId;
}

/**
 * Deliver webhook payload with HMAC signing (T047)
 */
async function deliverWebhook(
  job: Job<WebhookDeliveryJob>
): Promise<{ success: boolean; statusCode?: number; error?: string; durationMs: number }> {
  const { webhookId, eventId, eventType, payload } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  // Get webhook with secret
  const webhook = await getWebhookWithSecret(webhookId);
  if (!webhook) {
    return { success: false, error: 'Webhook not found', durationMs: 0 };
  }

  // Skip if webhook is paused
  if (webhook.status === 'paused') {
    return { success: false, error: 'Webhook is paused', durationMs: 0 };
  }

  // Build full payload
  const fullPayload = {
    id: eventId,
    type: eventType,
    created: Math.floor(Date.now() / 1000),
    data: webhook.payloadMode === 'full' ? payload : { summary: true, ...getSummary(payload) },
  };

  const payloadString = JSON.stringify(fullPayload);

  // T047: Sign payload with HMAC-SHA256
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(payloadString, webhook.signingSecret, timestamp);

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EmailKit-Webhook/1.0',
        'X-Webhook-ID': webhookId,
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Event-ID': eventId,
        'X-Event-Type': eventType,
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const durationMs = Date.now() - startTime;
    const success = response.ok;

    // Get response body (truncated, with 5s timeout to prevent hanging)
    let responseBody: string | undefined;
    try {
      const text = await Promise.race([
        response.text(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Body read timeout')), 5000)
        ),
      ]);
      responseBody = text.slice(0, 1000); // Truncate to 1KB
    } catch {
      // Ignore body read errors
    }

    // Record delivery attempt
    await recordDeliveryAttempt({
      webhookId,
      eventId,
      eventType,
      payload: fullPayload,
      status: success ? 'delivered' : 'failed',
      responseCode: response.status,
      responseBody,
      durationMs,
      attempt: attemptNumber,
    });

    // Update webhook status
    await updateWebhookStatus(webhookId, success);

    if (success) {
      log.info({ webhookId, eventId, eventType, durationMs, statusCode: response.status }, 'Webhook delivered');
    } else {
      log.warn({ webhookId, eventId, eventType, durationMs, statusCode: response.status }, 'Webhook delivery failed');
    }

    return {
      success,
      statusCode: response.status,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err.name === 'AbortError' ? 'Request timed out' : err.message;

    // Record failed attempt
    await recordDeliveryAttempt({
      webhookId,
      eventId,
      eventType,
      payload: fullPayload,
      status: 'failed',
      responseCode: undefined,
      responseBody: errorMessage,
      durationMs,
      attempt: attemptNumber,
    });

    // Update webhook status
    await updateWebhookStatus(webhookId, false);

    log.warn({ webhookId, eventId, eventType, durationMs, error: errorMessage }, 'Webhook delivery error');

    return {
      success: false,
      error: errorMessage,
      durationMs,
    };
  }
}

/**
 * Record a delivery attempt in the database
 */
async function recordDeliveryAttempt(params: {
  webhookId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  status: 'pending' | 'delivered' | 'failed';
  responseCode?: number;
  responseBody?: string;
  durationMs: number;
  attempt: number;
}): Promise<void> {
  const delivery: NewWebhookDelivery = {
    id: nanoid(),
    webhookId: params.webhookId,
    eventId: params.eventId,
    eventType: params.eventType,
    payload: params.payload,
    status: params.status,
    responseCode: params.responseCode ?? null,
    responseBody: params.responseBody ?? null,
    durationMs: params.durationMs,
    attempt: params.attempt,
    nextRetryAt: null,
    createdAt: new Date(),
  };

  await db.insert(webhookDelivery).values(delivery);
}

/**
 * Get summary version of payload (for summary mode)
 */
function getSummary(payload: Record<string, any>): Record<string, any> {
  // Return minimal info with link to fetch full details
  return {
    id: payload.id,
    type: payload.type,
    // Include key identifiers but not full data
    email: payload.email,
    jobId: payload.jobId,
  };
}

// Create worker with custom backoff strategy
export const webhookWorker = new Worker<WebhookDeliveryJob>(
  'webhook-delivery',
  async (job) => {
    const result = await deliverWebhook(job);

    if (!result.success) {
      // Throw to trigger retry
      throw new Error(result.error || `Delivery failed with status ${result.statusCode}`);
    }

    return result;
  },
  {
    connection,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 1000, // 100 deliveries per second max
    },
    settings: {
      backoffStrategy: (attemptsMade: number) => {
        return RETRY_DELAYS_MS[attemptsMade] ?? 1800000;
      },
    },
  }
);

// T048: Custom backoff strategy
webhookWorker.on('failed', async (job, err) => {
  if (!job) return;

  const attemptNumber = job.attemptsMade;

  if (attemptNumber < 4) {
    const nextDelay = RETRY_DELAYS_MS[attemptNumber] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    log.info(
      { jobId: job.id, attemptNumber, nextDelayMs: nextDelay },
      'Webhook delivery will retry'
    );
  } else {
    log.warn({ jobId: job.id, attemptNumber }, 'Webhook delivery exhausted all retries');
  }
});

webhookWorker.on('completed', (job) => {
  log.debug({ jobId: job?.id }, 'Webhook delivery job completed');
});

webhookWorker.on('error', (err) => {
  log.error({ err }, 'Webhook worker error');
});

export default {
  webhookDeliveryQueue,
  webhookWorker,
  enqueueWebhookDelivery,
};
