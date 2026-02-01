import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors.js';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details: Record<string, string> = {};
      for (const issue of (result.error as ZodError).issues) {
        const path = issue.path.join('.');
        details[path] = issue.message;
      }
      next(new ValidationError('Validation failed', details));
      return;
    }
    req.body = result.data;
    next();
  };
}
