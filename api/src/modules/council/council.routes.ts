import { CouncilCaseStatus, Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import {
  CouncilService,
  createCouncilCaseSchema,
  resolveCouncilCaseSchema,
} from './council.service';

export function createCouncilRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new CouncilService(db);

  router.use(authenticate);

  router.get(
    '/council-cases',
    requireRole(Role.MANAGER),
    asyncHandler(async (req, res) => {
      const status =
        typeof req.query.status === 'string' ? (req.query.status as CouncilCaseStatus) : undefined;
      res.json(await service.list(req.auth!.institutionId, status));
    }),
  );

  router.post(
    '/council-cases',
    requireRole(Role.MANAGER),
    validate(createCouncilCaseSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.create(req.auth!.institutionId, req.body));
    }),
  );

  router.patch(
    '/council-cases/:caseId',
    requireRole(Role.MANAGER),
    validate(resolveCouncilCaseSchema),
    asyncHandler(async (req, res) => {
      res.json(await service.resolve(req.auth!.institutionId, req.params.caseId!, req.body));
    }),
  );

  return router;
}
