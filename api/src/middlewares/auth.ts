import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors';
import { verifyToken } from '../lib/jwt';

/** `Authorization: Bearer <token>` başlığını doğrular ve `req.auth` doldurur. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized());
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    next(new ApiError(401, 'TOKEN_INVALID', 'Oturum süresi dolmuş veya geçersiz token'));
  }
}
