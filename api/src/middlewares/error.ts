import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound('ROUTE_NOT_FOUND', `Rota bulunamadı: ${req.method} ${req.originalUrl}`));
}

/** Tüm hataları tek biçimde döndüren merkezi hata yakalayıcı. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped =
      error.code === 'P2002'
        ? ApiError.conflict('RESOURCE_CONFLICT', 'Bu kayıt zaten mevcut')
        : error.code === 'P2025'
          ? ApiError.notFound()
          : new ApiError(500, 'DATABASE_ERROR', 'Veritabanı işlemi başarısız');
    res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message },
    });
    return;
  }

  console.error('[unhandled]', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir sunucu hatası oluştu' },
  });
}
