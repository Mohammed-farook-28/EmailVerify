/**
 * Dashboard Webhook Routes
 *
 * Endpoints for webhook management and delivery logs viewing via dashboard.
 * All routes require session authentication.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../db/index.js';
import { webhook, webhookDelivery } from '../../db/schema.js';
import { eq, and, desc, lt } from 'drizzle-orm';
import { logger } from '../../config/logger.js';
import { cursorPaginationSchema } from '../../lib/schemas.js';

const log = logger.child({ module: 'dashboard-webhooks' });

const router = Router();

/**
 * GET /home/webhooks
 *
 * List all webhooks for the authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const webhooks = await db.query.webhook.findMany({
      where: eq(webhook.userId, userId),
      orderBy: [desc(webhook.createdAt)],
    });

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
    });
  } catch (err) {
    log.error({ err, userId: req.user?.id }, 'Failed to list webhooks');
    next(err);
  }
});

/**
 * GET /home/webhooks/:id
 *
 * Get a single webhook by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const webhookId = req.params.id as string;

    const w = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, webhookId),
        eq(webhook.userId, userId)
      ),
    });

    if (!w) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
      return;
    }

    res.json({
      id: w.id,
      url: w.url,
      events: w.events,
      payloadMode: w.payloadMode,
      status: w.status,
      secretPrefix: w.secretPrefix,
      failureCount: w.failureCount,
      lastDeliveryAt: w.lastDeliveryAt?.toISOString() || null,
      createdAt: w.createdAt.toISOString(),
    });
  } catch (err) {
    log.error({ err, webhookId: req.params.id, userId: req.user?.id }, 'Failed to get webhook');
    next(err);
  }
});

/**
 * GET /home/webhooks/:id/deliveries
 *
 * List delivery logs for a specific webhook (view-only)
 * Uses cursor-based pagination
 */
router.get('/:id/deliveries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const webhookId = req.params.id as string;

    // Verify webhook ownership
    const w = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, webhookId),
        eq(webhook.userId, userId)
      ),
      columns: { id: true },
    });

    if (!w) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
      return;
    }

    // Parse pagination params
    const parseResult = cursorPaginationSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parseResult.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const { cursor, limit } = parseResult.data;
    const pageLimit = limit || 20;

    // Build query
    let query = db
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.webhookId, webhookId))
      .orderBy(desc(webhookDelivery.createdAt))
      .limit(pageLimit + 1); // Fetch one extra to check for more

    // Apply cursor (cursor is the createdAt timestamp of the last item)
    if (cursor) {
      const cursorDate = new Date(cursor);
      query = db
        .select()
        .from(webhookDelivery)
        .where(
          and(
            eq(webhookDelivery.webhookId, webhookId),
            lt(webhookDelivery.createdAt, cursorDate)
          )
        )
        .orderBy(desc(webhookDelivery.createdAt))
        .limit(pageLimit + 1);
    }

    const deliveries = await query;

    // Check if there are more results
    const hasMore = deliveries.length > pageLimit;
    const items = hasMore ? deliveries.slice(0, pageLimit) : deliveries;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    res.json({
      deliveries: items.map((d) => ({
        id: d.id,
        eventId: d.eventId,
        eventType: d.eventType,
        status: d.status,
        responseCode: d.responseCode,
        responseBody: d.responseBody ? d.responseBody.substring(0, 500) : null, // Truncate
        durationMs: d.durationMs,
        attempt: d.attempt,
        nextRetryAt: d.nextRetryAt?.toISOString() || null,
        createdAt: d.createdAt.toISOString(),
      })),
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (err) {
    log.error({ err, webhookId: req.params.id }, 'Failed to get webhook deliveries');
    next(err);
  }
});

/**
 * GET /home/webhooks/:id/deliveries/:deliveryId
 *
 * Get a single delivery with full payload details
 */
router.get('/:id/deliveries/:deliveryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const webhookId = req.params.id as string;
    const deliveryId = req.params.deliveryId as string;

    // Verify webhook ownership
    const w = await db.query.webhook.findFirst({
      where: and(
        eq(webhook.id, webhookId),
        eq(webhook.userId, userId)
      ),
      columns: { id: true },
    });

    if (!w) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
      return;
    }

    // Get delivery
    const delivery = await db.query.webhookDelivery.findFirst({
      where: and(
        eq(webhookDelivery.id, deliveryId),
        eq(webhookDelivery.webhookId, webhookId)
      ),
    });

    if (!delivery) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Delivery not found' } });
      return;
    }

    res.json({
      id: delivery.id,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      payload: delivery.payload, // Full payload
      status: delivery.status,
      responseCode: delivery.responseCode,
      responseBody: delivery.responseBody,
      durationMs: delivery.durationMs,
      attempt: delivery.attempt,
      nextRetryAt: delivery.nextRetryAt?.toISOString() || null,
      createdAt: delivery.createdAt.toISOString(),
    });
  } catch (err) {
    log.error({ err, webhookId: req.params.id, deliveryId: req.params.deliveryId }, 'Failed to get delivery');
    next(err);
  }
});

export default router;
