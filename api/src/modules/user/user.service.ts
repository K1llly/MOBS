import { Role, type PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env';
import { ApiError } from '../../lib/errors';

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
    /// Boş bırakılırsa YY+KADEME+SIRA kuralıyla otomatik üretilir.
    studentNumber: z.string().min(1).max(24).optional(),
    classId: z.string().optional(),
  });

export const updateStatusSchema = z.object({ isActive: z.boolean() });
export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Yeni şifre en az 8 karakter olmalıdır').max(72),
});

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async listUsers(institutionId: string, role?: Role) {
    const users = await this.db.user.findMany({
      where: { institutionId, ...(role ? { role } : {}) },
      include: {
        teacherProfile: true,
        studentProfile: { include: { schoolClass: true } },
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

    if (actor.role === Role.TEACHER) {
      const teacher = await this.db.teacherProfile.findUnique({
        where: { userId: actor.sub },
        include: { classCourses: { select: { schoolClassId: true } } },
      });
      if (!teacher) return [];

      const classIds = [...new Set(teacher.classCourses.map((item) => item.schoolClassId))];
      const students = await this.db.studentProfile.findMany({
        where: {
          user: { institutionId },
          schoolClassId: classId ? classId : { in: classIds },
        },
        include: { user: true, schoolClass: true },
        orderBy: { studentNumber: 'asc' },
      });
      return students.map(mapStudent);
    }

    const students = await this.db.studentProfile.findMany({
      where: { user: { institutionId }, ...(classId ? { schoolClassId: classId } : {}) },
      include: { user: true, schoolClass: true },
      orderBy: { studentNumber: 'asc' },
    });
    return students.map(mapStudent);
  }

  /** Öğretmenin yalnızca kendi derslerini listeler (not girişi vb. için). */
  async listTeacherCourses(userId: string) {
    const teacher = await this.db.teacherProfile.findUnique({
      where: { userId },
      include: {
        classCourses: {
          include: { course: true, schoolClass: true },
          orderBy: { course: { name: 'asc' } },
        },
      },
    });
    if (!teacher) throw ApiError.notFound('TEACHER_NOT_FOUND', 'Öğretmen profili bulunamadı');

    return teacher.classCourses.map((classCourse) => ({
      id: classCourse.courseId,
      code: classCourse.course.code,
      name: classCourse.course.name,
      weeklyHours: classCourse.weeklyHours,
      isBarrier: classCourse.course.isBarrier,
      classId: classCourse.schoolClassId,
      className: classCourse.schoolClass.name,
    }));
  }

  async createUser(institutionId: string, input: z.infer<typeof createUserSchema>) {
    const existing = await this.db.user.findUnique({ where: { username: input.username } });
    if (existing) throw ApiError.conflict('USERNAME_TAKEN', 'Bu kullanıcı adı zaten kullanılıyor');

    let schoolClass: {
      id: string;
      name: string;
      capacity: number;
      studentCount: number;
      gradeLevel: number | null;
    } | null = null;

    if (input.role === Role.STUDENT && input.classId) {
      const found = await this.db.schoolClass.findFirst({
        where: { id: input.classId, institutionId },
        include: { _count: { select: { students: true } }, gradeLevel: true },
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
        gradeLevel: found.gradeLevel?.level ?? null,
      };
    }

    let studentNumber: string | undefined;
    if (input.role === Role.STUDENT) {
      studentNumber =
        input.studentNumber?.trim() ||
        (await this.generateStudentNumber(institutionId, schoolClass?.gradeLevel ?? null));

      const duplicate = await this.db.studentProfile.findUnique({ where: { studentNumber } });
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
                  studentNumber: studentNumber!,
                  schoolClassId: schoolClass?.id,
                },
              }
            : undefined,
      },
      select: { id: true, username: true, fullName: true, role: true },
    });

    return user;
  }

  /**
   * Öğrenci numarası kuralı: YY + KADEME(2) + SIRA(4)
   * Örn. 2026-2027 / 9. sınıf / ilk öğrenci -> 26090001
   */
  private async generateStudentNumber(institutionId: string, gradeLevel: number | null) {
    const academicYear = await this.db.academicYear.findFirst({
      where: { institutionId, isActive: true },
      orderBy: { startDate: 'desc' },
    });
    const year = (academicYear?.startDate ?? new Date()).getFullYear() % 100;
    const prefix = `${String(year).padStart(2, '0')}${String(gradeLevel ?? 0).padStart(2, '0')}`;

    const rows = await this.db.studentProfile.findMany({
      where: { studentNumber: { startsWith: prefix } },
      select: { studentNumber: true },
    });

    let max = 0;
    for (const row of rows) {
      const suffix = Number(row.studentNumber.slice(prefix.length));
      if (Number.isFinite(suffix) && suffix > max) max = suffix;
    }

    let next = max + 1;
    let candidate = `${prefix}${String(next).padStart(4, '0')}`;
    while (await this.db.studentProfile.findUnique({ where: { studentNumber: candidate } })) {
      next += 1;
      candidate = `${prefix}${String(next).padStart(4, '0')}`;
    }
    return candidate;
  }

  /** Yönetici, eski şifreyi görmeden yeni şifre belirler. */
  async resetPassword(institutionId: string, userId: string, newPassword: string) {
    const user = await this.db.user.findFirst({ where: { id: userId, institutionId } });
    if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'Kullanıcı bulunamadı');

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await this.db.user.update({ where: { id: userId }, data: { passwordHash } });

    return { id: user.id, username: user.username, role: user.role, updated: true };
  }

  /** Yönetici, öğrenci veya öğretmen hesabını siler. */
  async deleteUser(institutionId: string, actorId: string, userId: string) {
    const user = await this.db.user.findFirst({ where: { id: userId, institutionId } });
    if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'Kullanıcı bulunamadı');

    if (user.id === actorId) {
      throw ApiError.badRequest('CANNOT_DELETE_SELF', 'Kendi hesabınızı silemezsiniz');
    }
    if (user.role === Role.MANAGER) {
      throw ApiError.badRequest(
        'CANNOT_DELETE_MANAGER',
        'Yönetici hesapları silinemez; önce pasifleştirin',
      );
    }

    await this.db.$transaction(async (tx) => {
      if (user.role === Role.TEACHER) {
        const teacher = await tx.teacherProfile.findUnique({ where: { userId } });
        if (teacher) {
          // Ders atamaları ve program slotları korunur, öğretmen bağı boşaltılır.
          await tx.classCourse.updateMany({
            where: { teacherId: teacher.id },
            data: { teacherId: null },
          });
          await tx.scheduleSlot.updateMany({
            where: { teacherId: teacher.id },
            data: { teacherId: null },
          });
        }
      }

      await tx.user.delete({ where: { id: userId } });
    });

    return { id: user.id, username: user.username, role: user.role, deleted: true };
  }

  async setActive(institutionId: string, userId: string, isActive: boolean) {
    const user = await this.db.user.findFirst({ where: { id: userId, institutionId } });
    if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'Kullanıcı bulunamadı');

    if (user.role === Role.MANAGER && !isActive) {
      const activeManagers = await this.db.user.count({
        where: { institutionId, role: Role.MANAGER, isActive: true },
      });
      if (activeManagers <= 1) {
        throw ApiError.badRequest(
          'LAST_MANAGER',
          'Son aktif yönetici pasifleştirilemez; önce başka bir yönetici oluşturun',
        );
      }
    }

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
