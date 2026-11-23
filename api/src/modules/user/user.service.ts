import { Role, type PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env';
import { ApiError } from '../../lib/errors';
import { loadFlags } from '../../lib/rules';

export const createUserSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Kullanıcı adı geçersiz karakter içeriyor'),
    password: z.string().min(8).max(72),
    fullName: z.string().min(3).max(120),
    role: z.nativeEnum(Role),
    branch: z.string().max(80).optional(),
    studentNumber: z.string().min(1).max(24).optional(),
    classId: z.string().optional(),
    childrenIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.role !== Role.STUDENT || Boolean(data.studentNumber), {
    message: 'Öğrenci için öğrenci numarası zorunludur',
    path: ['studentNumber'],
  });

export const updateStatusSchema = z.object({ isActive: z.boolean() });

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async listUsers(institutionId: string, role?: Role) {
    const users = await this.db.user.findMany({
      where: { institutionId, ...(role ? { role } : {}) },
      include: {
        teacherProfile: true,
        studentProfile: { include: { schoolClass: true } },
        parentProfile: { include: { children: { include: { student: { include: { user: true } } } } } },
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      branch: user.teacherProfile?.branch ?? null,
      studentNumber: user.studentProfile?.studentNumber ?? null,
      classId: user.studentProfile?.schoolClassId ?? null,
      className: user.studentProfile?.schoolClass?.name ?? null,
      children:
        user.parentProfile?.children.map((child) => ({
          studentId: child.studentId,
          fullName: child.student.user.fullName,
        })) ?? [],
    }));
  }

  async listTeachers(institutionId: string) {
    const teachers = await this.db.teacherProfile.findMany({
      where: { user: { institutionId, isActive: true } },
      include: { user: true, _count: { select: { classCourses: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });

    return teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.userId,
      fullName: teacher.user.fullName,
      branch: teacher.branch,
      courseCount: teacher._count.classCourses,
    }));
  }

  async listStudents(
    institutionId: string,
    actor: { role: Role; sub: string },
    classId?: string,
  ) {
    if (actor.role === Role.STUDENT) {
      const own = await this.db.studentProfile.findFirst({
        where: { userId: actor.sub },
        include: { user: true, schoolClass: true },
      });
      return own ? [mapStudent(own)] : [];
    }

    if (actor.role === Role.PARENT) {
      const children = await this.db.studentProfile.findMany({
        where: { user: { institutionId }, parents: { some: { parent: { userId: actor.sub } } } },
        include: { user: true, schoolClass: true },
      });
      return children.map(mapStudent);
    }

    const students = await this.db.studentProfile.findMany({
      where: { user: { institutionId }, ...(classId ? { schoolClassId: classId } : {}) },
      include: { user: true, schoolClass: true },
      orderBy: { studentNumber: 'asc' },
    });
    return students.map(mapStudent);
  }

  async createUser(institutionId: string, input: z.infer<typeof createUserSchema>) {
    const flags = await loadFlags(this.db, institutionId);

    if (input.role === Role.PARENT && !flags.PARENT_PORTAL) {
      throw ApiError.badRequest(
        'ROLE_NOT_ENABLED',
        'Bu kurum tipinde veli (PARENT) rolü aktif değil',
      );
    }

    const existing = await this.db.user.findUnique({ where: { username: input.username } });
    if (existing) throw ApiError.conflict('USERNAME_TAKEN', 'Bu kullanıcı adı zaten kullanılıyor');

    let schoolClass: { id: string; name: string; capacity: number; studentCount: number } | null =
      null;

    if (input.role === Role.STUDENT && input.classId) {
      const found = await this.db.schoolClass.findFirst({
        where: { id: input.classId, institutionId },
        include: { _count: { select: { students: true } } },
      });
      if (!found) throw ApiError.notFound('CLASS_NOT_FOUND', 'Sınıf/şube bulunamadı');
      if (found._count.students >= found.capacity) {
        throw ApiError.conflict('CLASS_CAPACITY_FULL', `${found.name} şubesi dolu`);
      }
      schoolClass = {
        id: found.id,
        name: found.name,
        capacity: found.capacity,
        studentCount: found._count.students,
      };
    }

    if (input.role === Role.STUDENT && input.studentNumber) {
      const duplicate = await this.db.studentProfile.findUnique({
        where: { studentNumber: input.studentNumber },
      });
      if (duplicate) {
        throw ApiError.conflict('STUDENT_NUMBER_TAKEN', 'Bu öğrenci numarası zaten kayıtlı');
      }
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    const user = await this.db.user.create({
      data: {
        institutionId,
        username: input.username,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
        teacherProfile: input.role === Role.TEACHER ? { create: { branch: input.branch } } : undefined,
        studentProfile:
          input.role === Role.STUDENT
            ? {
                create: {
                  studentNumber: input.studentNumber!,
                  schoolClassId: schoolClass?.id,
                },
              }
            : undefined,
        parentProfile:
          input.role === Role.PARENT
            ? {
                create: {
                  children: input.childrenIds?.length
                    ? { create: input.childrenIds.map((studentId) => ({ studentId })) }
                    : undefined,
                },
              }
            : undefined,
      },
      select: { id: true, username: true, fullName: true, role: true },
    });

    return user;
  }

  async setActive(institutionId: string, userId: string, isActive: boolean) {
    const user = await this.db.user.findFirst({ where: { id: userId, institutionId } });
    if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'Kullanıcı bulunamadı');

    await this.db.user.update({ where: { id: userId }, data: { isActive } });
    return { id: userId, isActive };
  }
}

function mapStudent(student: {
  id: string;
  studentNumber: string;
  user: { fullName: string };
  schoolClassId: string | null;
  schoolClass: { name: string } | null;
}) {
  return {
    id: student.id,
    studentNumber: student.studentNumber,
    fullName: student.user.fullName,
    classId: student.schoolClassId,
    className: student.schoolClass?.name ?? null,
  };
}
