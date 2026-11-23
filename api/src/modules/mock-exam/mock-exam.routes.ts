import { Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import {
  MockExamService,
  createSessionSchema,
  createTemplateSchema,
  mockResultSchema,
} from './mock-exam.service';

export function createMockExamRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new MockExamService(db);

  router.use(authenticate);

  router.get(
    '/mock-exams/templates',
    asyncHandler(async (req, res) => {
      res.json(await service.listTemplates(req.auth!.institutionId));
    }),
  );

  router.post(
    '/mock-exams/templates',
    requireRole(Role.MANAGER),
    validate(createTemplateSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createTemplate(req.auth!.institutionId, req.body));
    }),
  );

  router.get(
    '/mock-exams/sessions',
    asyncHandler(async (req, res) => {
      res.json(await service.listSessions(req.auth!.institutionId));
    }),
  );

  router.post(
    '/mock-exams/sessions',
    requireRole(Role.MANAGER),
    validate(createSessionSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createSession(req.auth!.institutionId, req.body));
    }),
  );

  router.post(
    '/mock-exams/sessions/:sessionId/results',
    requireRole(Role.MANAGER, Role.TEACHER),
    validate(mockResultSchema),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(await service.enterResult(req.auth!.institutionId, req.params.sessionId!, req.body));
    }),
  );

  router.get(
    '/mock-exams/sessions/:sessionId/ranking',
    requireRole(Role.MANAGER, Role.TEACHER),
    asyncHandler(async (req, res) => {
      res.json(await service.ranking(req.auth!.institutionId, req.params.sessionId!));
    }),
  );

  router.get(
    '/students/:studentId/mock-exams',
    asyncHandler(async (req, res) => {
      res.json(await service.studentResults(req.auth!.institutionId, req.params.studentId!));
    }),
  );

  return router;
}
