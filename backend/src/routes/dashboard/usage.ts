/**
 * Usage History Routes
 *
 * Endpoints for viewing and exporting verification history.
 *
 * Endpoints:
 * - GET /home/usage - List verification history with pagination and filtering
 * - GET /home/usage/export - Export verification history as CSV
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { verificationResult, user } from '../../db/schema.js';
import { eq, and, desc, like, gte, lte, sql, or } from 'drizzle-orm';
import { requireAuth } from '../../middleware/auth.js';
import { logger as pinoLogger } from '../../config/logger.js';

const logger = pinoLogger.child({ module: 'usage-routes' });

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Query validation schema
const listUsageSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  email: z.string().optional(),
  status: z.enum(['valid', 'invalid', 'risky', 'unknown', 'all']).default('all'),
  method: z.enum(['web', 'api', 'bulk', 'all']).default('all'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Export validation schema
const exportUsageSchema = z.object({
  email: z.string().optional(),
  status: z.enum(['valid', 'invalid', 'risky', 'unknown', 'all']).default('all'),
  method: z.enum(['web', 'api', 'bulk', 'all']).default('all'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(10000).default(1000),
});

/**
 * GET /home/usage
 *
 * List verification history with cursor pagination and filtering.
 * Respects user's data retention settings.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // Validate query params
    const parseResult = listUsageSchema.safeParse(req.query);
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

    const { cursor, limit, email, status, method, startDate, endDate } = parseResult.data;

    // Get user's data retention setting
    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { dataRetentionDays: true },
    });

    const retentionDays = userRecord?.dataRetentionDays ?? 30;
    const retentionCutoff = new Date();
    retentionCutoff.setDate(retentionCutoff.getDate() - retentionDays);

    // Build where conditions
    const conditions = [
      eq(verificationResult.userId, userId),
      gte(verificationResult.createdAt, retentionCutoff),
    ];

    // Email filter (partial match)
    if (email) {
      conditions.push(like(verificationResult.email, `%${email}%`));
    }

    // Status filter
    if (status !== 'all') {
      conditions.push(eq(verificationResult.status, status));
    }

    // Method filter - stored in serverInfo.method
    if (method !== 'all') {
      conditions.push(
        sql`${verificationResult.serverInfo}->>'method' = ${method}`
      );
    }

    // Date range filter
    if (startDate) {
      conditions.push(gte(verificationResult.createdAt, new Date(startDate)));
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      conditions.push(lte(verificationResult.createdAt, endDateTime));
    }

    // Cursor pagination
    if (cursor) {
      try {
        const cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf-8'));
        conditions.push(lte(verificationResult.createdAt, cursorDate));
      } catch {
        // Invalid cursor, ignore
      }
    }

    // Query with limit + 1 to check if there are more results
    const results = await db
      .select()
      .from(verificationResult)
      .where(and(...conditions))
      .orderBy(desc(verificationResult.createdAt))
      .limit(limit + 1);

    // Check if there are more results
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = Buffer.from(lastItem.createdAt.toISOString()).toString('base64');
    }

    // Format response
    const formattedItems = items.map((item) => {
      const serverInfo = item.serverInfo as Record<string, unknown>;
      return {
        id: item.id,
        email: item.email,
        status: item.status,
        score: item.score,
        deliverability: item.deliverability,
        method: serverInfo?.method || 'web',
        apiKeyId: serverInfo?.apiKeyId || null,
        creditsCost: 1, // Single verification costs 1 credit
        createdAt: item.createdAt.toISOString(),
      };
    });

    logger.info({ userId, count: items.length }, 'Usage history retrieved');

    res.json({
      items: formattedItems,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to list usage history');
    next(err);
  }
});

/**
 * GET /home/usage/export
 *
 * Export verification history as CSV.
 * Respects user's data retention settings.
 */
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // Validate query params
    const parseResult = exportUsageSchema.safeParse(req.query);
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

    const { email, status, method, startDate, endDate, limit } = parseResult.data;

    // Get user's data retention setting
    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { dataRetentionDays: true },
    });

    const retentionDays = userRecord?.dataRetentionDays ?? 30;
    const retentionCutoff = new Date();
    retentionCutoff.setDate(retentionCutoff.getDate() - retentionDays);

    // Build where conditions
    const conditions = [
      eq(verificationResult.userId, userId),
      gte(verificationResult.createdAt, retentionCutoff),
    ];

    // Email filter
    if (email) {
      conditions.push(like(verificationResult.email, `%${email}%`));
    }

    // Status filter
    if (status !== 'all') {
      conditions.push(eq(verificationResult.status, status));
    }

    // Method filter
    if (method !== 'all') {
      conditions.push(
        sql`${verificationResult.serverInfo}->>'method' = ${method}`
      );
    }

    // Date range filter
    if (startDate) {
      conditions.push(gte(verificationResult.createdAt, new Date(startDate)));
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      conditions.push(lte(verificationResult.createdAt, endDateTime));
    }

    // Query results
    const results = await db
      .select()
      .from(verificationResult)
      .where(and(...conditions))
      .orderBy(desc(verificationResult.createdAt))
      .limit(limit);

    // Generate CSV
    const csvHeader = 'Email,Status,Score,Deliverability,Method,Date\n';
    const csvRows = results.map((item) => {
      const serverInfo = item.serverInfo as Record<string, unknown>;
      const method = serverInfo?.method || 'web';
      const date = item.createdAt.toISOString();
      // Escape email in case it contains commas
      const escapedEmail = item.email.includes(',') ? `"${item.email}"` : item.email;
      return `${escapedEmail},${item.status},${item.score},${item.deliverability},${method},${date}`;
    });

    const csv = csvHeader + csvRows.join('\n');

    logger.info({ userId, count: results.length }, 'Usage history exported');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="verification-history-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to export usage history');
    next(err);
  }
});

export default router;
