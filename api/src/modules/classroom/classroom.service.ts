import { Role, type PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/errors';
import type { AuthPayload } from '../../lib/jwt';
import { z } from 'zod';

export const createClassSchema = z.object({
  name: z.string().min(1).max(32),
  capacity: z.coerce.number().int().min(1).max(200),
  gradeLevel: z.coerce.number().int().min(1).max(12).optional(),
  homeRoomId: z.string().optional(),
});

export const createCourseSchema = z.object({
  code: z.string().min(2).max(16),
  name: z.string().min(2).max(80),
  weeklyHours: z.coerce.number().int().min(1).max(40).default(2),
  isBarrier: z.boolean().default(false),
  ects: z.coerce.number().int().min(0).max(60).optional(),
  credits: z.coerce.number().int().min(0).max(30).optional(),
});

export const assignCourseSchema = z.object({
  courseId: z.string().min(1),
  teacherId: z.string().optional(),
  weeklyHours: z.coerce.number().int().min(1).max(40).optional(),
  blockPattern: z.array(z.coerce.number().int().min(1).max(12)).optional(),
});

export const assignTeacherSchema = z.object({ teacherId: z.string().min(1) });

export const enrollStudentSchema = z.object({ studentId: z.string().min(1) });

export const createRoomSchema = z.object({
  name: z.string().min(1).max(32),
  capacity: z.coerce.number().int().min(1).max(500).default(30),
});

export class ClassroomService {
  constructor(private readonly db: PrismaClient) {}

  async listClasses(institutionId: string) {
    const classes = await this.db.schoolClass.findMany({
      where: { institutionId },
      include: {
        gradeLevel: true,
        homeRoom: true,
        _count: { select: { students: true, classCourses: true } },
      },
      orderBy: { name: 'asc' },
    });

    return classes.map((item) => ({
      id: item.id,
      name: item.name,
      capacity: item.capacity,
      studentCount: item._count.students,
      courseCount: item._count.classCourses,
      gradeLevel: item.gradeLevel?.level ?? null,
      homeRoom: item.homeRoom?.name ?? null,
      isFull: item._count.students >= item.capacity,
    }));
  }

  async getClass(institutionId: string, classId: string) {
    const item = await this.db.schoolClass.findFirst({
      where: { id: classId, institutionId },
      include: {
        gradeLevel: true,
        homeRoom: true,
        classCourses: { include: { course: true, teacher: { include: { user: true } } } },
        students: { include: { user: true }, orderBy: { studentNumber: 'asc' } },
      },
    });
    if (!item) throw ApiError.notFound('CLASS_NOT_FOUND', 'Sınıf/şube bulunamadı');

    return {
      id: item.id,
      name: item.name,
      capacity: item.capacity,
      gradeLevel: item.gradeLevel?.level ?? null,
      homeRoom: item.homeRoom?.name ?? null,
      courses: item.classCourses.map((classCourse) => ({
        id: classCourse.id,
        courseId: classCourse.courseId,
        courseName: classCourse.course.name,
        code: classCourse.course.code,
        weeklyHours: classCourse.weeklyHours,
        blockPattern: classCourse.blockPattern,
        teacherId: classCourse.teacherId,
        teacherName: classCourse.teacher?.user.fullName ?? null,
      })),
      students: item.students.map((student) => ({
        id: student.id,
        studentNumber: student.studentNumber,
        fullName: student.user.fullName,
      })),
    };
  }

  async createClass(
    institutionId: string,
    input: z.infer<typeof createClassSchema>,
  ) {
    const gradeLevel = input.gradeLevel
      ? await this.db.gradeLevel.findFirst({ where: { institutionId, level: input.gradeLevel } })
      : null;

    if (input.gradeLevel && !gradeLevel) {
      throw ApiError.badRequest(
        'GRADE_LEVEL_NOT_FOUND',
        `${input.gradeLevel}. sınıf kademesi bu kurumda tanımlı değil`,
      );
    }

    if (input.homeRoomId) {
      const room = await this.db.room.findFirst({ where: { id: input.homeRoomId, institutionId } });
      if (!room) throw ApiError.notFound('ROOM_NOT_FOUND', 'Derslik bulunamadı');
    }

    return this.db.schoolClass.create({
      data: {
        institutionId,
        name: input.name,
        capacity: input.capacity,
        gradeLevelId: gradeLevel?.id,
        homeRoomId: input.homeRoomId,
      },
      include: { gradeLevel: true, homeRoom: true },
    });
  }

  async listCourses(institutionId: string) {
    const courses = await this.db.course.findMany({
      where: { institutionId },
      include: {
        teachers: { include: { teacher: { include: { user: true } } } },
        _count: { select: { classCourses: true } },
      },
      orderBy: { name: 'asc' },
    });
    return courses.map((course) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      weeklyHours: course.weeklyHours,
      isBarrier: course.isBarrier,
      ects: course.ects,
      credits: course.credits,
      classCount: course._count.classCourses,
      teachers: course.teachers.map((item) => ({
        id: item.teacherId,
        fullName: item.teacher.user.fullName,
        branch: item.teacher.branch,
      })),
    }));
  }

  async createCourse(institutionId: string, input: z.infer<typeof createCourseSchema>) {
    return this.db.course.create({
      data: {
        institutionId,
        code: input.code,
        name: input.name,
        weeklyHours: input.weeklyHours,
        isBarrier: input.isBarrier,
        ects: input.ects,
        credits: input.credits,
      },
    });
  }

  async assignTeacherToCourse(institutionId: string, courseId: string, teacherId: string) {
    const course = await this.db.course.findFirst({ where: { id: courseId, institutionId } });
    if (!course) throw ApiError.notFound('COURSE_NOT_FOUND', 'Ders bulunamadı');

    const teacher = await this.db.teacherProfile.findFirst({
      where: { id: teacherId, user: { institutionId, isActive: true } },
      include: { user: true },
    });
    if (!teacher) throw ApiError.notFound('TEACHER_NOT_FOUND', 'Öğretmen bulunamadı');

    const existing = await this.db.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId } },
    });
    if (existing) {
      throw ApiError.conflict('TEACHER_ALREADY_ASSIGNED', 'Bu öğretmen derse zaten atanmış');
    }

    await this.db.courseTeacher.create({ data: { courseId, teacherId } });
    return {
      courseId,
      teacherId,
      fullName: teacher.user.fullName,
      branch: teacher.branch,
    };
  }

  async removeTeacherFromCourse(institutionId: string, courseId: string, teacherId: string) {
    const course = await this.db.course.findFirst({ where: { id: courseId, institutionId } });
    if (!course) throw ApiError.notFound('COURSE_NOT_FOUND', 'Ders bulunamadı');

    const inUse = await this.db.classCourse.findFirst({ where: { courseId, teacherId } });
    if (inUse) {
      throw ApiError.conflict(
        'TEACHER_IN_USE',
        'Bu öğretmen bir şubede bu derse atanmış; önce sınıf atamasını değiştirin',
      );
    }

    await this.db.courseTeacher.deleteMany({ where: { courseId, teacherId } });
    return { courseId, teacherId, removed: true };
  }

  async listCourseTeachers(institutionId: string, courseId: string) {
    const course = await this.db.course.findFirst({ where: { id: courseId, institutionId } });
    if (!course) throw ApiError.notFound('COURSE_NOT_FOUND', 'Ders bulunamadı');

    const rows = await this.db.courseTeacher.findMany({
      where: { courseId },
      include: { teacher: { include: { user: true } } },
    });

    return rows.map((row) => ({
      id: row.teacherId,
      fullName: row.teacher.user.fullName,
      branch: row.teacher.branch,
    }));
  }

  async assignCourse(
    institutionId: string,
    classId: string,
    input: z.infer<typeof assignCourseSchema>,
  ) {
    const schoolClass = await this.db.schoolClass.findFirst({
      where: { id: classId, institutionId },
    });
    if (!schoolClass) throw ApiError.notFound('CLASS_NOT_FOUND', 'Sınıf/şube bulunamadı');

    const course = await this.db.course.findFirst({
      where: { id: input.courseId, institutionId },
    });
    if (!course) throw ApiError.notFound('COURSE_NOT_FOUND', 'Ders bulunamadı');

    if (input.teacherId) {
      const teacher = await this.db.teacherProfile.findFirst({
        where: { id: input.teacherId, user: { institutionId } },
      });
      if (!teacher) throw ApiError.notFound('TEACHER_NOT_FOUND', 'Öğretmen bulunamadı');

      const courseTeacher = await this.db.courseTeacher.findUnique({
        where: {
          courseId_teacherId: { courseId: input.courseId, teacherId: input.teacherId },
        },
      });
      if (!courseTeacher) {
        throw ApiError.badRequest(
          'TEACHER_NOT_ASSIGNED_TO_COURSE',
          `${course.name} dersine önce bu öğretmeni atayın`,
        );
      }
    }

    const weeklyHours = input.weeklyHours ?? course.weeklyHours;
    const blockPattern = input.blockPattern ?? [];

    return this.db.classCourse.upsert({
      where: { schoolClassId_courseId: { schoolClassId: classId, courseId: input.courseId } },
      create: {
        schoolClassId: classId,
        courseId: input.courseId,
        teacherId: input.teacherId,
        weeklyHours,
        blockPattern,
      },
      update: {
        teacherId: input.teacherId,
        weeklyHours,
        blockPattern,
      },
      include: { course: true, teacher: { include: { user: true } } },
    });
  }

  /** US-02 — Kontenjan kilidi: kapasite doluysa 409 döner. */
  async enrollStudent(actor: AuthPayload, classId: string, studentId: string) {
    if (actor.role === Role.TEACHER) {
      await this.assertTeacherTeachesClass(actor, classId);
    }

    return this.db.$transaction(async (tx) => {
      const schoolClass = await tx.schoolClass.findFirst({
        where: { id: classId, institutionId: actor.institutionId },
        include: { _count: { select: { students: true } } },
      });
      if (!schoolClass) throw ApiError.notFound('CLASS_NOT_FOUND', 'Sınıf/şube bulunamadı');

      const student = await tx.studentProfile.findFirst({
        where: { id: studentId, user: { institutionId: actor.institutionId } },
      });
      if (!student) throw ApiError.notFound('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı');

      if (student.schoolClassId === classId) {
        return { studentId, classId, moved: false };
      }

      if (schoolClass._count.students >= schoolClass.capacity) {
        throw ApiError.conflict(
          'CLASS_CAPACITY_FULL',
          `${schoolClass.name} şubesi dolu (${schoolClass.capacity} kontenjan)`,
        );
      }

      await tx.studentProfile.update({ where: { id: studentId }, data: { schoolClassId: classId } });
      return { studentId, classId, moved: true };
    });
  }

  /** Şubeye eklenebilecek öğrenciler (arama destekli). */
  async listCandidates(actor: AuthPayload, classId: string, query?: string) {
    if (actor.role === Role.TEACHER) {
      await this.assertTeacherTeachesClass(actor, classId);
    }

    const schoolClass = await this.db.schoolClass.findFirst({
      where: { id: classId, institutionId: actor.institutionId },
      include: { gradeLevel: true },
    });
    if (!schoolClass) throw ApiError.notFound('CLASS_NOT_FOUND', 'Sınıf/şube bulunamadı');

    const q = query?.trim();
    const students = await this.db.studentProfile.findMany({
      where: {
        schoolClassId: { not: classId },
        ...(q
          ? {
              OR: [
                {
                  user: {
                    institutionId: actor.institutionId,
                    fullName: { contains: q, mode: 'insensitive' },
                  },
                },
                { studentNumber: { contains: q, mode: 'insensitive' } },
              ],
            }
          : { user: { institutionId: actor.institutionId } }),
      },
      include: { user: true, schoolClass: true },
      orderBy: { studentNumber: 'asc' },
      take: 25,
    });

    return students.map((student) => ({
      id: student.id,
      studentNumber: student.studentNumber,
      fullName: student.user.fullName,
      classId: student.schoolClassId,
      className: student.schoolClass?.name ?? null,
    }));
  }

  private async assertTeacherTeachesClass(actor: AuthPayload, classId: string) {
    const teacher = await this.db.teacherProfile.findUnique({ where: { userId: actor.sub } });
    const teaches = teacher
      ? await this.db.classCourse.findFirst({ where: { teacherId: teacher.id, schoolClassId: classId } })
      : null;
    if (!teaches) {
      throw ApiError.forbidden('TEACHER_SCOPE', 'Bu şubede dersiniz yok');
    }
  }

  async listRooms(institutionId: string) {
    return this.db.room.findMany({ where: { institutionId }, orderBy: { name: 'asc' } });
  }

  async createRoom(institutionId: string, input: z.infer<typeof createRoomSchema>) {
    return this.db.room.create({ data: { institutionId, ...input } });
  }

  async listTerms(institutionId: string) {
    const terms = await this.db.term.findMany({
      where: { academicYear: { institutionId } },
      include: { academicYear: true },
      orderBy: [{ academicYear: { startDate: 'desc' } }, { startDate: 'asc' }],
    });

    return terms.map((term) => ({
      id: term.id,
      name: `${term.academicYear.name} · ${term.name}`,
      type: term.type,
      isActive: term.isActive,
      startDate: term.startDate,
      endDate: term.endDate,
    }));
  }

  /** Kurumun tanımlı sınıf düzeyleri (kademeler). */
  async listGradeLevels(institutionId: string) {
    return this.db.gradeLevel.findMany({
      where: { institutionId },
      orderBy: { level: 'asc' },
      select: { id: true, level: true, name: true },
    });
  }
}
