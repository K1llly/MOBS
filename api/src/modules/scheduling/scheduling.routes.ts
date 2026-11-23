import { Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import { ApiError } from '../../lib/errors';
import {
  SchedulingService,
  autoFillSchema,
  setAvailabilitySchema,
} from './scheduling.service';
import { z } from 'zod';

const publishSchema = z.object({ planId: z.string().min(1) });
const pinSchema = z.object({ isPinned: z.boolean() });

export function createSchedulingRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new SchedulingService(db);

  router.use(authenticate);

  router.get(
    '/schedule',
    asyncHandler(async (req, res) => {
      const termId = typeof req.query.termId === 'string' ? req.query.termId : undefined;
      res.json(await service.getSchedule(req.auth!.institutionId, req.auth!, termId));
    }),
  );

  router.post(
    '/schedule/auto-fill',
    requireRole(Role.MANAGER),
    validate(autoFillSchema),
    asyncHandler(async (req, res) => {
      res.json(await service.autoFill(req.auth!.institutionId, req.body));
    }),
  );

  router.post(
    '/schedule/publish',
    requireRole(Role.MANAGER),
    validate(publishSchema),
    asyncHandler(async (req, res) => {
      res.json(await service.publish(req.auth!.institutionId, req.body.planId));
    }),
  );

  router.patch(
    '/schedule/slots/:slotId/pin',
    requireRole(Role.MANAGER),
    validate(pinSchema),
    asyncHandler(async (req, res) => {
      res.json(
        await service.pinSlot(req.auth!.institutionId, req.params.slotId!, req.body.isPinned),
      );
    }),
  );

  // Öğretmenin kendi müsaitliği
  router.get(
    '/teachers/me/availability',
    requireRole(Role.TEACHER),
    asyncHandler(async (req, res) => {
      const teacher = await service.getTeacherProfile(req.auth!.institutionId, req.auth!.sub);
      res.json(await service.getAvailability(req.auth!.institutionId, teacher.id));
    }),
  );

  router.put(
    '/teachers/me/availability',
    requireRole(Role.TEACHER),
    validate(setAvailabilitySchema),
    asyncHandler(async (req, res) => {
      const teacher = await service.getTeacherProfile(req.auth!.institutionId, req.auth!.sub);
      res.json(
        await service.setAvailability(req.auth!.institutionId, teacher.id, req.body.slots),
      );
    }),
  );

  router.get(
    '/teachers/:teacherId/availability',
    requireRole(Role.MANAGER, Role.TEACHER),
    asyncHandler(async (req, res) => {
      if (req.auth!.role === Role.TEACHER) {
        const own = await service.getTeacherProfile(req.auth!.institutionId, req.auth!.sub);
        if (own.id !== req.params.teacherId) {
          throw ApiError.forbidden('TEACHER_SCOPE', 'Yalnızca kendi müsaitliğinizi görebilirsiniz');
        }
      }
      res.json(await service.getAvailability(req.auth!.institutionId, req.params.teacherId!));
    }),
  );

  router.put(
    '/teachers/:teacherId/availability',
    requireRole(Role.MANAGER),
    validate(setAvailabilitySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await service.setAvailability(req.auth!.institutionId, req.params.teacherId!, req.body.slots),
      );
    }),
  );

  return router;
}
