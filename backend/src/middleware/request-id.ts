import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Middleware to generate and attach X-Request-ID to all requests
 * - If client provides X-Request-ID, validate and use it
 * - Otherwise, generate a new unique ID
 * - Always include X-Request-ID in response headers
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if client provided a request ID
  const clientRequestId = req.headers['x-request-id'];

  let requestId: string;

  if (typeof clientRequestId === 'string' && clientRequestId.length > 0 && clientRequestId.length <= 64) {
    // Use client-provided ID (sanitized)
    requestId = clientRequestId.replace(/[^a-zA-Z0-9-_]/g, '');
  } else {
    // Generate new ID with req_ prefix for API requests
    requestId = `req_${nanoid(21)}`;
  }

  // Attach to request object
  req.requestId = requestId;

  // Set response header
  res.setHeader('X-Request-ID', requestId);

  next();
}

export default requestIdMiddleware;
