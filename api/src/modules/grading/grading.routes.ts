import { Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import { GradingService, gradeInputSchema } from './grading.service';

export function createGradingRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new GradingService(db);

  router.use(authenticate);

  router.post(
    '/students/:studentId/grades',
    requireRole(Role.MANAGER, Role.TEACHER),
    validate(gradeInputSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.enterGrade(req.auth!, req.params.studentId!, req.body));
    }),
  );

  router.get(
    '/students/:studentId/grades',
    asyncHandler(async (req, res) => {
      const termId = typeof req.query.termId === 'string' ? req.query.termId : undefined;
      res.json(await service.listGrades(req.auth!, req.params.studentId!, termId));
    }),
  );

  router.get(
    '/students/:studentId/report-card',
    asyncHandler(async (req, res) => {
      const termId = typeof req.query.termId === 'string' ? req.query.termId : undefined;
      res.json(await service.reportCard(req.auth!, req.params.studentId!, termId));
    }),
  );

  return router;
}
