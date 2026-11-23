import { Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import { AttendanceService, bulkAttendanceSchema } from './attendance.service';
import { AttendanceOverviewService } from './attendance.overview';

export function createAttendanceRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new AttendanceService(db);
  const overview = new AttendanceOverviewService(db);

  router.use(authenticate);

  router.get(
    '/attendance/overview',
    requireRole(Role.MANAGER),
    asyncHandler(async (req, res) => {
      const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
      res.json(await overview.overview(req.auth!.institutionId, classId));
    }),
  );

  router.post(
    '/attendance/bulk',
    requireRole(Role.MANAGER, Role.TEACHER),
    validate(bulkAttendanceSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.bulkUpsert(req.auth!, req.body));
    }),
  );

  router.get(
    '/students/:studentId/attendance',
    asyncHandler(async (req, res) => {
      const termId = typeof req.query.termId === 'string' ? req.query.termId : undefined;
      res.json(await service.summarize(req.auth!, req.params.studentId!, termId));
    }),
  );

  return router;
}
