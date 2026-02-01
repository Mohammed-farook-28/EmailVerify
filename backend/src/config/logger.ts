/**
 * Pino Logger Configuration
 *
 * Structured JSON logging for production with pretty printing for development.
 * Integrates with OpenTelemetry for distributed tracing.
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = (process.env.LOG_LEVEL as pino.Level) || 'info';

export const logger = pino({
  level: logLevel,
  // Pretty print in development for better readability
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  // Base configuration for structured logging
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'emailkit-api',
  },
  // Customize timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  // Format error objects properly
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/**
 * Create a child logger with additional context
 *
 * @example
 * const requestLogger = createLogger({ requestId: '123', userId: 'user-456' });
 * requestLogger.info('Processing request');
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Express middleware for request logging
 */
export function expressLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Attach logger to request object
    req.log = createLogger({
      requestId,
      method: req.method,
      url: req.url,
      userId: req.session?.user?.id,
    });

    // Log request
    req.log.info('Incoming request');

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      req.log[level]({
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('content-length'),
      }, 'Request completed');
    });

    next();
  };
}

export default logger;
