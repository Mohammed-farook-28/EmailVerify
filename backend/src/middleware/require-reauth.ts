import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors.js';
import { db } from '../db/index.js';
import { session as sessionTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const REAUTH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Middleware to require re-authentication for sensitive operations
 * Checks if the user has authenticated within the last 10 minutes
 */
export async function requireReauth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session) {
    next(new ForbiddenError('Not authenticated'));
    return;
  }

  try {
    // Query database for full session record with lastAuthenticatedAt
    const [dbSession] = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.id, req.session.id))
      .limit(1);

    if (!dbSession) {
      next(new ForbiddenError('Session not found'));
      return;
    }

    const lastAuth = dbSession.lastAuthenticatedAt;
    const elapsed = Date.now() - new Date(lastAuth).getTime();

    if (elapsed > REAUTH_WINDOW_MS) {
      // Determine re-auth method based on whether user has verified email
      const method = req.user?.emailVerified ? 'password' : 'google';
      next(
        new ForbiddenError(
          'Re-authentication required',
          'reauth',
          method,
        ),
      );
      return;
    }

    next();
  } catch (error) {
    console.error('Re-auth check error:', error);
    next(new ForbiddenError('Re-authentication check failed'));
  }
}
