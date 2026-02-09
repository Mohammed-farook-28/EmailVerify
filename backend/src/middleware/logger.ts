import type { Request, Response, NextFunction } from 'express';
import { logger as pinoLogger } from '../config/logger.js';

const httpLogger = pinoLogger.child({ module: 'http' });

export function logger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    httpLogger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
    });
  });

  next();
}
