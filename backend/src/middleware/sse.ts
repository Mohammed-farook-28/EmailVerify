import { Request, Response, NextFunction } from 'express';

/**
 * Server-Sent Events (SSE) middleware
 * Sets up the proper headers for SSE streaming
 */
export function sseMiddleware(req: Request, res: Response, next: NextFunction) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // CORS headers if needed
  if (process.env.FRONTEND_URL) {
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Flush headers immediately
  res.flushHeaders();

  // Handle client disconnect
  req.on('close', () => {
    res.end();
  });

  next();
}

/**
 * Helper function to send an SSE event
 */
export function sendSSEEvent(
  res: Response,
  eventName: string,
  data: any,
  id?: string
) {
  if (id) {
    res.write(`id: ${id}\n`);
  }
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Helper function to send a comment (keeps connection alive)
 */
export function sendSSEComment(res: Response, comment: string) {
  res.write(`: ${comment}\n\n`);
}
