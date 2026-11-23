import { Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler } from '../../middlewares/validate';
import { DashboardService } from './dashboard.service';

export function createDashboardRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new DashboardService(db);

  router.use(authenticate);

  router.get(
    '/dashboard/summary',
    requireRole(Role.MANAGER),
    asyncHandler(async (req, res) => {
      res.json(await service.summary(req.auth!.institutionId));
    }),
  );

  return router;
}
