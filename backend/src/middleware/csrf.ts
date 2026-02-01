import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { ForbiddenError } from '../lib/errors.js';

const CSRF_HEADER = 'x-csrf-token';
const tokenCache = new Map<string, string>();

function generateCsrfToken(sessionId: string): string {
  const existing = tokenCache.get(sessionId);
  if (existing) return existing;

  const token = crypto
    .createHmac('sha256', env.csrfSecret)
    .update(sessionId)
    .digest('hex');
  tokenCache.set(sessionId, token);
  return token;
}

export function attachCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session && req.method === 'GET') {
    const token = generateCsrfToken(req.session.id);
    res.setHeader(CSRF_HEADER, token);
  }
  next();
}

export function validateCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  if (!req.session) {
    next();
    return;
  }

  const clientToken = req.headers[CSRF_HEADER] as string | undefined;
  if (!clientToken) {
    next(new ForbiddenError('Missing CSRF token'));
    return;
  }

  const expectedToken = generateCsrfToken(req.session.id);
  const valid = crypto.timingSafeEqual(
    Buffer.from(clientToken),
    Buffer.from(expectedToken),
  );

  if (!valid) {
    next(new ForbiddenError('Invalid CSRF token'));
    return;
  }

  next();
}
