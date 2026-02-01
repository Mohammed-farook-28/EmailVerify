import type { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

// Better Auth session and user types
type BetterAuthSession = {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};

// Extend Express Request type to include Better Auth user and session
declare global {
  namespace Express {
    interface Request {
      user?: BetterAuthSession['user'];
      session?: BetterAuthSession['session'];
    }
  }
}

/**
 * Middleware to require authentication using Better Auth
 * Checks for a valid session and attaches user to request
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers as any),
    });

    if (!session) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Attach user and session to request
    req.user = session.user;
    req.session = session.session;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to optionally attach user if authenticated
 * Does not require authentication - useful for routes that can be accessed by both auth'd and non-auth'd users
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers as any),
    });

    if (session) {
      req.user = session.user;
      req.session = session.session;
    }

    next();
  } catch (error) {
    // Continue without auth on error
    next();
  }
}
