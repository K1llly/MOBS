import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ApiError } from '../lib/errors';

/**
 * Zod şeması ile gövde/parametre doğrulama.
 * Hata durumunda `400 VALIDATION_ERROR` ve alan bazlı detay döner.
 */
export function validate<T>(schema: ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        ApiError.badRequest('VALIDATION_ERROR', 'İstek doğrulaması başarısız', flattenZod(result.error)),
      );
    }
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}

function flattenZod(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/** Async route handler'ları sarmalayarak hataları merkezi handler'a iletir. */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
