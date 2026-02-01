import type { Request, Response, NextFunction } from 'express';
import { AppError, RateLimitError, ValidationError, ForbiddenError } from '../lib/errors.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  if (err instanceof RateLimitError) {
    res.status(err.statusCode).json({
      error: err.message,
      retryAfter: err.retryAfter,
    });
    return;
  }

  if (err instanceof ForbiddenError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.action) body.action = err.action;
    if (err.method) body.method = err.method;
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
