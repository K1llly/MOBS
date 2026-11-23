import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors';
import type { Role } from '../lib/jwt';

/** Rol bazlı erişim kontrolü (RBAC). */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(ApiError.unauthorized());
    }
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden('ROLE_FORBIDDEN', 'Bu kaynağa erişim rolünüze kapalı'));
    }
    next();
  };
}
