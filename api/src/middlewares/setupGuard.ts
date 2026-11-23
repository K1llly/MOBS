import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors';

export interface InitializationProbe {
  isInitialized(): Promise<boolean>;
}

/**
 * FR-SETUP-05 — Kurulum kilidi.
 * Kurulum tamamlandıysa `/setup/initialize` tekrar çağrılamaz (403).
 */
export function blockIfInitialized(probe: InitializationProbe) {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (await probe.isInitialized()) {
        return next(
          ApiError.forbidden(
            'SYSTEM_ALREADY_INITIALIZED',
            'Sistem zaten kurulmuş; kurulum sihirbazı kalıcı olarak kilitlidir',
          ),
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
