import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { Role } from '@prisma/client';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { asyncHandler, validate } from '../../middlewares/validate';
import { ApiError } from '../../lib/errors';
import {
  ClassroomService,
  assignCourseSchema,
  createClassSchema,
  createCourseSchema,
  createRoomSchema,
  enrollStudentSchema,
} from './classroom.service';

export function createClassroomRouter(db: PrismaClient): Router {
  const router = Router();
  const service = new ClassroomService(db);

  router.use(authenticate);

  router.get(
    '/classes',
    asyncHandler(async (req, res) => {
      res.json(await service.listClasses(req.auth!.institutionId));
    }),
  );

  router.get(
    '/classes/:classId',
    asyncHandler(async (req, res) => {
      res.json(await service.getClass(req.auth!.institutionId, req.params.classId!));
    }),
  );

  router.post(
    '/classes',
    requireRole(Role.MANAGER),
    validate(createClassSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createClass(req.auth!.institutionId, req.body));
    }),
  );

  router.post(
    '/classes/:classId/students',
    requireRole(Role.MANAGER),
    validate(enrollStudentSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(
        await service.enrollStudent(req.auth!.institutionId, req.params.classId!, req.body.studentId),
      );
    }),
  );

  router.get(
    '/courses',
    asyncHandler(async (req, res) => {
      res.json(await service.listCourses(req.auth!.institutionId));
    }),
  );

  router.post(
    '/courses',
    requireRole(Role.MANAGER),
    validate(createCourseSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createCourse(req.auth!.institutionId, req.body));
    }),
  );

  router.post(
    '/classes/:classId/courses',
    requireRole(Role.MANAGER),
    validate(assignCourseSchema),
    asyncHandler(async (req, res) => {
      const result = await service.assignCourse(
        req.auth!.institutionId,
        req.params.classId!,
        req.body,
      );
      if (result.schoolClassId !== req.params.classId) {
        throw ApiError.conflict('ASSIGNMENT_MISMATCH', 'Ders ataması doğrulanamadı');
      }
      res.status(201).json(result);
    }),
  );

  router.get(
    '/rooms',
    asyncHandler(async (req, res) => {
      res.json(await service.listRooms(req.auth!.institutionId));
    }),
  );

  router.get(
    '/terms',
    asyncHandler(async (req, res) => {
      res.json(await service.listTerms(req.auth!.institutionId));
    }),
  );

  router.post(
    '/rooms',
    requireRole(Role.MANAGER),
    validate(createRoomSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createRoom(req.auth!.institutionId, req.body));
    }),
  );

  return router;
}
