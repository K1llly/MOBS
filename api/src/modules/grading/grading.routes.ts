import { Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import { GradingService, gradeInputSchema } from './grading.service';
import { GradingPolicyService, replacePoliciesSchema } from './grading.policies';

export function createGradingRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new GradingService(db);
  const policies = new GradingPolicyService(db);

  router.use(authenticate);

  router.post(
    '/students/:studentId/grades',
    requireRole(Role.TEACHER),
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

  router.get(
    '/reports/report-cards',
    requireRole(Role.MANAGER),
    asyncHandler(async (req, res) => {
      const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
      const termId = typeof req.query.termId === 'string' ? req.query.termId : undefined;
      res.json(await service.bulkReportCards(req.auth!, classId, termId));
    }),
  );

  router.get(
    '/grade-policies',
    requireRole(Role.MANAGER),
    asyncHandler(async (req, res) => {
      res.json(await policies.list(req.auth!.institutionId));
    }),
  );

  router.put(
    '/grade-policies',
    requireRole(Role.MANAGER),
    validate(replacePoliciesSchema),
    asyncHandler(async (req, res) => {
      res.json(await policies.replace(req.auth!.institutionId, req.body));
    }),
  );

  return router;
}
