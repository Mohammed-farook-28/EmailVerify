/**
 * Email Verification Routes
 *
 * Endpoints:
 * - POST /home/quick-verify - Single email verification
 * - GET /home/quick-verify/recent - Recent verification results
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { sseMiddleware, sendSSEEvent } from '../middleware/sse.js';
import { logger, createLogger } from '../config/logger.js';
import { deductCredits, getBalance, refundCredits } from '../services/credit.js';
import { enqueueSingleVerification, isQueueOverloaded } from '../services/queue.js';
import { getRecentVerifications, getVerificationByEmailSince } from '../services/verification.js';
import { incrementLoadSheddingCounter } from '../lib/metrics.js';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// Request validation schemas
const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
});

/**
 * POST /home/quick-verify
 *
 * Verify a single email address
 *
 * Request body:
 * - email: string (email to verify)
 *
 * Response:
 * - 200: Job enqueued successfully, returns job ID
 * - 400: Invalid email format
 * - 402: Insufficient credits
 * - 503: Service overloaded
 */
router.post('/quick-verify', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const requestLogger = createLogger({
    userId,
    operation: 'quick-verify',
    email: req.body.email,
  });

  try {
    // Validate request body
    const { email } = verifyEmailSchema.parse(req.body);

    requestLogger.info('Processing verification request');

    // Check queue overload (load shedding)
    // Note: We check BEFORE deducting credits to avoid unnecessary refunds
    const overloaded = await isQueueOverloaded();
    if (overloaded) {
      incrementLoadSheddingCounter();
      requestLogger.warn('Queue overloaded, rejecting request');
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Too many pending verifications. Please try again later.',
        retryAfter: 60, // seconds
      });
    }

    // Check credit balance
    const currentBalance = await getBalance(userId);
    if (currentBalance < 1) {
      requestLogger.warn({ currentBalance }, 'Insufficient credits');
      return res.status(402).json({
        error: 'Insufficient credits',
        message: 'You need at least 1 credit to verify an email',
        currentBalance,
      });
    }

    // Deduct credits (atomic operation)
    const jobId = `verify-${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const newBalance = await deductCredits(userId, 1, jobId);

      // Enqueue verification job
      const queueJobId = await enqueueSingleVerification(email, userId);

      requestLogger.info(
        {
          jobId,
          queueJobId,
          newBalance,
          email,
        },
        'Verification job enqueued'
      );

      return res.json({
        success: true,
        jobId: queueJobId,
        email,
        creditsDeducted: 1,
        newBalance,
        message: 'Email verification started',
      });
    } catch (error: any) {
      if (error.message === 'Insufficient credits') {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: 'You need at least 1 credit to verify an email',
          currentBalance: await getBalance(userId),
        });
      }
      throw error;
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      requestLogger.warn({ errors: error.errors }, 'Invalid request body');
      return res.status(400).json({
        error: 'Invalid request',
        message: error.errors[0].message,
        errors: error.errors,
      });
    }

    requestLogger.error({ error: error.message, stack: error.stack }, 'Verification request failed');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process verification request',
    });
  }
});

/**
 * GET /home/quick-verify/recent
 *
 * Get recent verification results for the authenticated user
 *
 * Query params:
 * - limit: number (default: 10, max: 100)
 * - offset: number (default: 0)
 *
 * Response:
 * - 200: { success, results, count, total, page, totalPages }
 */
router.get('/quick-verify/recent', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 100);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  const requestLogger = createLogger({
    userId,
    operation: 'get-recent-verifications',
    limit,
    offset,
  });

  try {
    requestLogger.info('Fetching recent verifications');

    const { results, total } = await getRecentVerifications(userId, limit, offset);
    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    requestLogger.info({ count: results.length, total }, 'Retrieved recent verifications');

    return res.json({
      success: true,
      results,
      count: results.length,
      total,
      page,
      totalPages,
    });
  } catch (error: any) {
    requestLogger.error(
      { error: error.message, stack: error.stack },
      'Failed to get recent verifications'
    );
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve verification results',
    });
  }
});

/**
 * GET /home/quick-verify/stream?email=xxx&since=ISO
 *
 * SSE stream that waits for a single verification result.
 * Polls the DB every 1s until the result appears or 30s timeout.
 *
 * Events:
 * - waiting: Still processing
 * - result: Verification result (final)
 * - error: Timeout or failure
 */
router.get('/quick-verify/stream', sseMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const email = req.query.email as string;
  const since = req.query.since as string;

  if (!email || !since) {
    sendSSEEvent(res, 'error', { error: 'Missing email or since parameter' });
    return res.end();
  }

  const sinceDate = new Date(since);

  sendSSEEvent(res, 'waiting', { email, status: 'processing' });

  let attempt = 0;
  const maxAttempts = 30;

  const pollInterval = setInterval(async () => {
    attempt++;

    try {
      const result = await getVerificationByEmailSince(userId, email, sinceDate);

      if (result) {
        clearInterval(pollInterval);
        sendSSEEvent(res, 'result', result);
        return res.end();
      }

      if (attempt >= maxAttempts) {
        clearInterval(pollInterval);
        sendSSEEvent(res, 'error', { error: 'Timeout waiting for result' });
        return res.end();
      }
    } catch (error: any) {
      clearInterval(pollInterval);
      logger.error({ error: error.message, email, userId }, 'Error polling for result');
      sendSSEEvent(res, 'error', { error: 'Internal error while polling' });
      res.end();
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(pollInterval);
  });
});

export default router;
