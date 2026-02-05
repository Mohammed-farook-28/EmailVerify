/**
 * Webhook API Routes
 *
 * CRUD endpoints for webhook management via API.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { apiKeyAuthMiddleware } from '../../middleware/api-key-auth.js';
import { idempotencyMiddleware } from '../../middleware/idempotency.js';
import { apiRateLimit } from '../../middleware/rate-limit.js';
import { createWebhookSchema, updateWebhookSchema, cursorPaginationSchema } from '../../lib/schemas.js';
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  WebhookError,
} from '../../services/webhook.js';
import { logger } from '../../config/logger.js';

const log = logger.child({ module: 'api-v1-webhooks' });

const router = Router();

// All routes require API key authentication
router.use(apiKeyAuthMiddleware);

// Apply rate limiting
router.use(apiRateLimit());

/**
 * GET /api/v1/webhooks
 *
 * List all webhooks for the authenticated user (T040)
 * Supports cursor-based pagination
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.apiKeyUserId!;

    // Validate pagination params
    const parseResult = cursorPaginationSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parseResult.error.flatten().fieldErrors,
        },
        requestId: req.requestId,
      });
      return;
    }

    const { cursor, limit } = parseResult.data;
    const { webhooks, nextCursor } = await listWebhooks(userId, cursor, limit);

    res.json({
      webhooks: webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        payloadMode: w.payloadMode,
        status: w.status,
        secretPrefix: w.secretPrefix,
        failureCount: w.failureCount,
        lastDeliveryAt: w.lastDeliveryAt?.toISOString() || null,
        createdAt: w.createdAt.toISOString(),
      })),
      pagination: {
        hasMore: nextCursor !== null,
        nextCursor,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    log.error({ err, userId: req.apiKeyUserId }, 'Failed to list webhooks');
    next(err);
  }
});

/**
 * POST /api/v1/webhooks
 *
 * Create a new webhook (T041)
 * Validates URL with test ping before activation
 * Returns signing secret ONCE at creation
 */
router.post(
  '/',
  idempotencyMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.apiKeyUserId!;

      // Validate request body
      const parseResult = createWebhookSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
          requestId: req.requestId,
        });
        return;
      }

      const { url, events, payloadMode } = parseResult.data;

      const result = await createWebhook({
        userId,
        url,
        events: events as any,
        payloadMode,
      });

      log.info({ webhookId: result.id, userId, url }, 'Webhook created via API');

      res.status(201).json({
        id: result.id,
        url: result.url,
        events: result.events,
        payloadMode: result.payloadMode,
        status: result.status,
        secret: result.secret, // IMPORTANT: Only shown once!
        secretPrefix: result.secretPrefix,
        createdAt: result.createdAt.toISOString(),
        warning: 'Save this signing secret now. It will not be shown again.',
        requestId: req.requestId,
      });
    } catch (err) {
      if (err instanceof WebhookError) {
        const statusCode =
          err.code === 'MAX_WEBHOOKS_EXCEEDED' ? 400 :
          err.code === 'TEST_PING_FAILED' ? 400 :
          500;

        res.status(statusCode).json({
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
          requestId: req.requestId,
        });
        return;
      }

      log.error({ err, userId: req.apiKeyUserId }, 'Failed to create webhook');
      next(err);
    }
  }
);

/**
 * GET /api/v1/webhooks/:id
 *
 * Get a single webhook by ID (T042)
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.apiKeyUserId!;
    const webhookId = req.params.id as string;

    const webhook = await getWebhook(webhookId, userId);

    if (!webhook) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        },
        requestId: req.requestId,
      });
      return;
    }

    res.json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      payloadMode: webhook.payloadMode,
      status: webhook.status,
      secretPrefix: webhook.secretPrefix,
      failureCount: webhook.failureCount,
      lastDeliveryAt: webhook.lastDeliveryAt?.toISOString() || null,
      createdAt: webhook.createdAt.toISOString(),
      requestId: req.requestId,
    });
  } catch (err) {
    log.error({ err, webhookId: req.params.id }, 'Failed to get webhook');
    next(err);
  }
});

/**
 * PATCH /api/v1/webhooks/:id
 *
 * Update a webhook (T043)
 * If URL changes, validates with test ping
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.apiKeyUserId!;
    const webhookId = req.params.id as string;

    // Validate request body
    const parseResult = updateWebhookSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        },
        requestId: req.requestId,
      });
      return;
    }

    const updates = parseResult.data;

    const webhook = await updateWebhook(webhookId, userId, updates as any);

    if (!webhook) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        },
        requestId: req.requestId,
      });
      return;
    }

    log.info({ webhookId, userId, updates: Object.keys(updates) }, 'Webhook updated via API');

    res.json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      payloadMode: webhook.payloadMode,
      status: webhook.status,
      secretPrefix: webhook.secretPrefix,
      failureCount: webhook.failureCount,
      lastDeliveryAt: webhook.lastDeliveryAt?.toISOString() || null,
      createdAt: webhook.createdAt.toISOString(),
      requestId: req.requestId,
    });
  } catch (err) {
    if (err instanceof WebhookError) {
      res.status(400).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
        requestId: req.requestId,
      });
      return;
    }

    log.error({ err, webhookId: req.params.id }, 'Failed to update webhook');
    next(err);
  }
});

/**
 * DELETE /api/v1/webhooks/:id
 *
 * Delete a webhook (T044)
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.apiKeyUserId!;
    const webhookId = req.params.id as string;

    const deleted = await deleteWebhook(webhookId, userId);

    if (!deleted) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        },
        requestId: req.requestId,
      });
      return;
    }

    log.info({ webhookId, userId }, 'Webhook deleted via API');

    res.status(200).json({
      success: true,
      message: 'Webhook has been deleted',
      requestId: req.requestId,
    });
  } catch (err) {
    log.error({ err, webhookId: req.params.id }, 'Failed to delete webhook');
    next(err);
  }
});

export default router;
