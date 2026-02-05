import { Router, Request, Response, NextFunction } from 'express';
import { apiKeyAuthMiddleware } from '../../middleware/api-key-auth.js';
import { idempotencyMiddleware } from '../../middleware/idempotency.js';
import { apiRateLimit } from '../../middleware/rate-limit.js';
import {
  singleVerifyRequestSchema,
  batchVerifyRequestSchema,
  bulkVerifyRequestSchema,
} from '../../lib/schemas.js';
import { getBalance, deductCredits } from '../../services/credit.js';
import { callUpstreamAPI, type VerificationResult } from '../../services/upstream-client.js';
import { db } from '../../db/index.js';
import { bulkJob, bulkVerificationResult } from '../../db/schema.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { bulkVerificationQueue } from '../../services/bulk-verification.js';
import { logger as pinoLogger } from '../../config/logger.js';

const logger = pinoLogger.child({ module: 'api-v1-verify' });

const router = Router();

// All routes require API key authentication
router.use(apiKeyAuthMiddleware);

// Apply rate limiting
router.use(apiRateLimit());

/**
 * POST /api/v1/verify
 *
 * Single email verification endpoint
 * - Verifies email as-is without normalizing plus addressing (FR-009b)
 * - Test mode keys return mock responses without consuming credits
 * - Requires Idempotency-Key header
 */
router.post(
  '/',
  idempotencyMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.apiKeyUserId!;
      const isTestMode = req.apiKeyIsTest;

      // Validate request body
      const parseResult = singleVerifyRequestSchema.safeParse(req.body);
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

      const { email } = parseResult.data;

      // Test mode: return mock response without using credits
      if (isTestMode) {
        logger.debug({ userId, email }, 'Test mode verification');
        res.json(createMockVerificationResult(email, req.requestId));
        return;
      }

      // Check credits (1 credit per verification)
      const balance = await getBalance(userId);
      if (balance < 1) {
        res.status(402).json({
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'Insufficient credits to perform verification',
            creditsRequired: 1,
            creditsAvailable: balance,
          },
          requestId: req.requestId,
        });
        return;
      }

      // Perform verification (email verified as-is, no normalization per FR-009b)
      const result = await callUpstreamAPI(email, userId);

      // Deduct credits
      await deductCredits(userId, 1, req.requestId);

      res.json({
        email: result.email,
        status: result.status,
        score: result.score,
        deliverability: result.deliverability,
        attributes: {
          disposable: result.attributes.disposable,
          freeProvider: result.attributes.freeProvider,
          roleAccount: result.attributes.roleAccount,
          catchAll: result.attributes.catchAll,
          mxRecordsFound: result.attributes.mxRecordsFound,
          smtpValid: result.attributes.smtpValid,
        },
        requestId: req.requestId,
      });
    } catch (err) {
      logger.error({ err, userId: req.apiKeyUserId }, 'Verification failed');
      next(err);
    }
  }
);

/**
 * POST /api/v1/verify/batch
 *
 * Batch verification endpoint (up to 100 emails)
 * - Verifies emails as-is without normalizing plus addressing (FR-009b)
 * - Test mode keys return mock responses without consuming credits
 * - Requires Idempotency-Key header
 */
router.post(
  '/batch',
  idempotencyMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.apiKeyUserId!;
      const isTestMode = req.apiKeyIsTest;

      // Validate request body
      const parseResult = batchVerifyRequestSchema.safeParse(req.body);
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

      const { emails } = parseResult.data;
      const creditsNeeded = emails.length;

      // Test mode: return mock responses without using credits
      if (isTestMode) {
        logger.debug({ userId, count: emails.length }, 'Test mode batch verification');
        res.json({
          results: emails.map((email: string) => createMockVerificationResult(email, req.requestId)),
          creditsUsed: 0,
          requestId: req.requestId,
        });
        return;
      }

      // Check credits
      const balance = await getBalance(userId);
      if (balance < creditsNeeded) {
        res.status(402).json({
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'Insufficient credits to perform batch verification',
            creditsRequired: creditsNeeded,
            creditsAvailable: balance,
          },
          requestId: req.requestId,
        });
        return;
      }

      // Perform verifications (emails verified as-is, no normalization per FR-009b)
      const results = await Promise.all(
        emails.map(async (email: string) => {
          try {
            return await callUpstreamAPI(email, userId);
          } catch (err) {
            logger.error({ err, email }, 'Individual verification failed in batch');
            return createErrorResult(email);
          }
        })
      );

      // Count successful verifications and deduct credits
      const successfulCount = results.filter((r: VerificationResult) => r.status !== 'unknown').length;
      if (successfulCount > 0) {
        await deductCredits(userId, successfulCount, req.requestId);
      }

      res.json({
        results: results.map((result: VerificationResult) => ({
          email: result.email,
          status: result.status,
          score: result.score,
          deliverability: result.deliverability,
          attributes: {
            disposable: result.attributes.disposable,
            freeProvider: result.attributes.freeProvider,
            roleAccount: result.attributes.roleAccount,
            catchAll: result.attributes.catchAll,
            mxRecordsFound: result.attributes.mxRecordsFound,
            smtpValid: result.attributes.smtpValid,
          },
        })),
        creditsUsed: successfulCount,
        requestId: req.requestId,
      });
    } catch (err) {
      logger.error({ err, userId: req.apiKeyUserId }, 'Batch verification failed');
      next(err);
    }
  }
);

// ============================================
// Bulk Verification Endpoints (T029-T036)
// ============================================

/**
 * Tier-based bulk job limits
 * T030: Job size limits per tier
 * T031: Concurrent job limits per tier
 */
const BULK_TIER_LIMITS: Record<string, { maxEmails: number; maxConcurrentJobs: number }> = {
  starter: { maxEmails: 10000, maxConcurrentJobs: 1 },
  growth: { maxEmails: 25000, maxConcurrentJobs: 2 },
  pro: { maxEmails: 50000, maxConcurrentJobs: 3 },
  scale: { maxEmails: 100000, maxConcurrentJobs: 5 },
  titan: { maxEmails: 500000, maxConcurrentJobs: 10 },
};

/**
 * Count active (pending/processing) bulk jobs for a user
 */
async function countActiveJobs(userId: string): Promise<number> {
  const result = await db
    .select({ id: bulkJob.id })
    .from(bulkJob)
    .where(
      and(
        eq(bulkJob.userId, userId),
        or(
          eq(bulkJob.status, 'pending'),
          eq(bulkJob.status, 'processing')
        )
      )
    );
  return result.length;
}

/**
 * POST /api/v1/verify/bulk
 *
 * Submit a bulk verification job (async processing)
 * - T029: Create endpoint
 * - T030: Tier-based size limits
 * - T031: Tier-based concurrent job limits
 * - Requires Idempotency-Key header
 */
router.post(
  '/bulk',
  idempotencyMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.apiKeyUserId!;
      const isTestMode = req.apiKeyIsTest;
      const tier = req.apiKeyUserTier || 'starter';

      // Validate request body
      const parseResult = bulkVerifyRequestSchema.safeParse(req.body);
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

      const { emails } = parseResult.data;
      const emailCount = emails.length;

      // Get tier limits
      const limits = BULK_TIER_LIMITS[tier] || BULK_TIER_LIMITS.starter;

      // T030: Check tier-based size limit
      if (emailCount > limits.maxEmails) {
        res.status(400).json({
          error: {
            code: 'JOB_SIZE_EXCEEDED',
            message: `Your ${tier} tier allows maximum ${limits.maxEmails.toLocaleString()} emails per job. You submitted ${emailCount.toLocaleString()}.`,
            maxAllowed: limits.maxEmails,
            submitted: emailCount,
          },
          requestId: req.requestId,
        });
        return;
      }

      // T031: Check tier-based concurrent job limit
      const activeJobs = await countActiveJobs(userId);
      if (activeJobs >= limits.maxConcurrentJobs) {
        res.status(400).json({
          error: {
            code: 'CONCURRENT_JOB_LIMIT',
            message: `Your ${tier} tier allows maximum ${limits.maxConcurrentJobs} concurrent jobs. You have ${activeJobs} active jobs.`,
            maxConcurrent: limits.maxConcurrentJobs,
            activeJobs,
          },
          requestId: req.requestId,
        });
        return;
      }

      // Test mode: return mock job without actually processing
      if (isTestMode) {
        const mockJobId = `job_test_${nanoid(12)}`;
        res.status(202).json({
          id: mockJobId,
          status: 'pending',
          totalCount: emailCount,
          processedCount: 0,
          progress: 0,
          createdAt: new Date().toISOString(),
          message: 'Test mode: job simulated but not processed',
          requestId: req.requestId,
        });
        return;
      }

      // Check credits
      const balance = await getBalance(userId);
      if (balance < emailCount) {
        res.status(402).json({
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'Insufficient credits for bulk verification',
            creditsRequired: emailCount,
            creditsAvailable: balance,
          },
          requestId: req.requestId,
        });
        return;
      }

      // Create the bulk job
      const jobId = nanoid();
      const retentionDays = 14;
      const resultExpiresAt = new Date();
      resultExpiresAt.setDate(resultExpiresAt.getDate() + retentionDays);

      // Deduct credits
      await deductCredits(userId, emailCount, jobId);

      // Create bulk job record
      await db.insert(bulkJob).values({
        id: jobId,
        userId,
        sourceType: 'api',
        filename: null,
        totalCount: emailCount,
        processedCount: 0,
        status: 'pending',
        validCount: 0,
        invalidCount: 0,
        riskyCount: 0,
        unknownCount: 0,
        createdAt: new Date(),
        resultExpiresAt,
      });

      // Insert emails as pending verification results
      const verificationRecords = emails.map((email: string) => ({
        id: nanoid(),
        jobId,
        email,
        status: 'pending',
        deliverable: false,
        risky: false,
        unknown: true,
        riskScore: 0,
        isFreeEmail: false,
        isRoleBased: false,
        isCatchAll: false,
        isDisposable: false,
        hasMxRecords: false,
        createdAt: new Date(),
      }));

      // Insert in batches
      const batchSize = 1000;
      for (let i = 0; i < verificationRecords.length; i += batchSize) {
        const batch = verificationRecords.slice(i, i + batchSize);
        await db.insert(bulkVerificationResult).values(batch);
      }

      // Enqueue for processing
      await bulkVerificationQueue.add(
        'process-bulk-job',
        { jobId, userId, totalCount: emailCount },
        { priority: 5, jobId: `bulk-${jobId}` }
      );

      logger.info({ jobId, userId, emailCount }, 'Bulk job submitted via API');

      res.status(202).json({
        id: jobId,
        status: 'pending',
        totalCount: emailCount,
        processedCount: 0,
        progress: 0,
        createdAt: new Date().toISOString(),
        resultExpiresAt: resultExpiresAt.toISOString(),
        requestId: req.requestId,
      });
    } catch (err) {
      logger.error({ err, userId: req.apiKeyUserId }, 'Bulk job submission failed');
      next(err);
    }
  }
);

/**
 * GET /api/v1/verify/bulk/:jobId
 *
 * Get bulk job status
 * - T032: Status endpoint
 * - T035: Job ownership validation
 * - T036: 410 Gone for expired results
 */
router.get('/bulk/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.apiKeyUserId!;
    const jobId = req.params.jobId as string;

    // Get job
    const job = await db.query.bulkJob.findFirst({
      where: eq(bulkJob.id, jobId),
    });

    if (!job) {
      res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Bulk verification job not found',
        },
        requestId: req.requestId,
      });
      return;
    }

    // T035: Job ownership validation
    if (job.userId !== userId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this job',
        },
        requestId: req.requestId,
      });
      return;
    }

    // T036: Check if results have expired
    if (job.resultExpiresAt && new Date(job.resultExpiresAt) < new Date()) {
      res.status(410).json({
        error: {
          code: 'RESULTS_EXPIRED',
          message: 'Job results have expired and are no longer available',
          expiredAt: job.resultExpiresAt.toISOString(),
        },
        requestId: req.requestId,
      });
      return;
    }

    // Calculate progress
    const progress = job.totalCount > 0
      ? Math.round((job.processedCount / job.totalCount) * 100)
      : 0;

    res.json({
      id: job.id,
      status: job.status,
      totalCount: job.totalCount,
      processedCount: job.processedCount,
      progress,
      validCount: job.validCount,
      invalidCount: job.invalidCount,
      riskyCount: job.riskyCount,
      unknownCount: job.unknownCount,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
      resultUrl: job.status === 'completed' ? `/api/v1/verify/bulk/${job.id}/results` : null,
      resultExpiresAt: job.resultExpiresAt?.toISOString() || null,
      requestId: req.requestId,
    });
  } catch (err) {
    logger.error({ err, jobId: req.params.jobId }, 'Failed to get bulk job status');
    next(err);
  }
});

/**
 * GET /api/v1/verify/bulk/:jobId/results
 *
 * Download bulk job results as CSV
 * - T033: Results endpoint
 * - T034: CSV with header row
 * - T035: Job ownership validation
 * - T036: 410 Gone for expired results
 */
router.get('/bulk/:jobId/results', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.apiKeyUserId!;
    const jobId = req.params.jobId as string;

    // Get job
    const job = await db.query.bulkJob.findFirst({
      where: eq(bulkJob.id, jobId),
    });

    if (!job) {
      res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Bulk verification job not found',
        },
        requestId: req.requestId,
      });
      return;
    }

    // T035: Job ownership validation
    if (job.userId !== userId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this job',
        },
        requestId: req.requestId,
      });
      return;
    }

    // T036: Check if results have expired
    if (job.resultExpiresAt && new Date(job.resultExpiresAt) < new Date()) {
      res.status(410).json({
        error: {
          code: 'RESULTS_EXPIRED',
          message: 'Job results have expired and are no longer available',
          expiredAt: job.resultExpiresAt.toISOString(),
        },
        requestId: req.requestId,
      });
      return;
    }

    // Check job is completed
    if (job.status !== 'completed') {
      res.status(400).json({
        error: {
          code: 'JOB_NOT_COMPLETED',
          message: `Job is ${job.status}. Results are only available after completion.`,
          status: job.status,
        },
        requestId: req.requestId,
      });
      return;
    }

    // Get all results
    const results = await db
      .select()
      .from(bulkVerificationResult)
      .where(eq(bulkVerificationResult.jobId, jobId))
      .orderBy(bulkVerificationResult.createdAt);

    // T034: Generate CSV with header row
    const csvHeader = 'email,status,deliverable,risky,risk_score,disposable,free_email,role_based,catch_all,mx_records';
    const csvRows = results.map((r) =>
      [
        r.email,
        r.status,
        r.deliverable,
        r.risky,
        r.riskScore,
        r.isDisposable,
        r.isFreeEmail,
        r.isRoleBased,
        r.isCatchAll,
        r.hasMxRecords,
      ].join(',')
    );
    const csv = [csvHeader, ...csvRows].join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="verification-results-${jobId}.csv"`);
    res.setHeader('X-Request-ID', req.requestId);

    res.send(csv);
  } catch (err) {
    logger.error({ err, jobId: req.params.jobId }, 'Failed to get bulk job results');
    next(err);
  }
});

/**
 * Create a mock verification result for test mode
 */
function createMockVerificationResult(email: string, requestId: string) {
  return {
    email,
    status: 'valid' as const,
    score: 0.95,
    deliverability: 'deliverable' as const,
    attributes: {
      disposable: false,
      freeProvider: email.includes('@gmail.com') || email.includes('@yahoo.com'),
      roleAccount: email.startsWith('admin@') || email.startsWith('support@'),
      catchAll: false,
      mxRecordsFound: true,
      smtpValid: true,
    },
    requestId,
  };
}

/**
 * Create an error result for failed verifications
 */
function createErrorResult(email: string): VerificationResult {
  return {
    email,
    status: 'unknown',
    score: 0,
    deliverability: 'unknown',
    attributes: {
      disposable: false,
      freeProvider: false,
      roleAccount: false,
      catchAll: false,
      mxRecordsFound: false,
      smtpValid: false,
    },
    serverInfo: {
      processingTime: 0,
      requestId: '',
      timestamp: new Date().toISOString(),
    },
  };
}

export default router;
