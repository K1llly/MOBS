import { Role } from '@prisma/client';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import { createUserSchema, resetPasswordSchema, updateStatusSchema, UserService } from './user.service';

export function createUserRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new UserService(db);

  router.use(authenticate);

  router.get(
    '/users',
    requireRole(Role.MANAGER),
    asyncHandler(async (req, res) => {
      const role = typeof req.query.role === 'string' ? (req.query.role as Role) : undefined;
      res.json(await service.listUsers(req.auth!.institutionId, role));
    }),
  );

  router.post(
    '/users',
    requireRole(Role.MANAGER),
    validate(createUserSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createUser(req.auth!.institutionId, req.body));
    }),
  );

  router.patch(
    '/users/:userId/status',
    requireRole(Role.MANAGER),
    validate(updateStatusSchema),
    asyncHandler(async (req, res) => {
      res.json(
        await service.setActive(req.auth!.institutionId, req.params.userId!, req.body.isActive),
      );
    }),
  );

  router.patch(
    '/users/:userId/password',
    requireRole(Role.MANAGER),
    validate(resetPasswordSchema),
    asyncHandler(async (req, res) => {
      res.json(
        await service.resetPassword(
          req.auth!.institutionId,
          req.params.userId!,
          req.body.newPassword,
        ),
      );
    }),
  );

  router.delete(
    '/users/:userId',
    requireRole(Role.MANAGER),
    asyncHandler(async (req, res) => {
      res.json(
        await service.deleteUser(req.auth!.institutionId, req.auth!.sub, req.params.userId!),
      );
    }),
  );

  router.get(
    '/teachers',
    requireRole(Role.MANAGER, Role.TEACHER),
    asyncHandler(async (req, res) => {
      res.json(await service.listTeachers(req.auth!.institutionId));
    }),
  );

  router.get(
    '/teachers/me/courses',
    requireRole(Role.TEACHER),
    asyncHandler(async (req, res) => {
      res.json(await service.listTeacherCourses(req.auth!.sub));
    }),
  );

  router.get(
    '/students',
    asyncHandler(async (req, res) => {
      const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
      res.json(await service.listStudents(req.auth!.institutionId, req.auth!, classId));
    }),
  );

  return router;
}
