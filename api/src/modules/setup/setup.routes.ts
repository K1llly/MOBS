import { Router } from 'express';
import { asyncHandler, validate } from '../../middlewares/validate';
import { blockIfInitialized } from '../../middlewares/setupGuard';
import { initializeSchema } from './setup.schema';
import type { SetupService } from './setup.service';

export function createSetupRouter(service: SetupService): Router {
  const router = Router();

  /** US-06 / FR-SETUP-01 — İlk açılış algılama. */
  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      res.json(await service.getStatus());
    }),
  );

  /** Kurulum sihirbazının 1. adımı için preset özetleri. */
  router.get('/presets', (_req, res) => {
    res.json({ presets: service.getPresetSummaries() });
  });

  /** US-06 / FR-SETUP-02..05 — Atomik kurulum ve bootstrap admin. */
  router.post(
    '/initialize',
    blockIfInitialized(service),
    validate(initializeSchema),
    asyncHandler(async (req, res) => {
      const result = await service.initialize(req.body);
      res.status(201).json(result);
    }),
  );

  return router;
}
