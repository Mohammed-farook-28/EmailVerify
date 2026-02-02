import type { Request, Response, NextFunction } from 'express';
import { stripeClient } from '../services/stripe-client.js';
import { logger } from '../config/logger.js';

/**
 * Middleware to verify Stripe webhook signatures
 *
 * IMPORTANT: This middleware requires raw body buffer to verify signatures.
 * Must be used with express.raw() middleware on the webhook route.
 *
 * Usage:
 * ```ts
 * app.post(
 *   '/api/billing/webhook',
 *   express.raw({ type: 'application/json' }),
 *   verifyStripeSignature,
 *   handleWebhook
 * );
 * ```
 */
export async function verifyStripeSignature(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      logger.warn('Webhook received without stripe-signature header');
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    // Verify signature and construct event
    // req.body should be raw Buffer from express.raw() middleware
    const event = await stripeClient.verifyWebhookSignature(req.body, signature);

    // Attach verified event to request for downstream handlers
    (req as any).stripeEvent = event;

    next();
  } catch (error) {
    logger.error({ error }, 'Webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
  }
}
