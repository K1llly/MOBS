import { AttendanceStatus, Role, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import type { AuthPayload } from '../../lib/jwt';
import { loadRules, resolveTerm, ruleNumber } from '../../lib/rules';
import { evaluateAbsence } from '../grading/grading.strategies';

export const attendanceRecordSchema = z.object({
  studentId: z.string().min(1),
  classCourseId: z.string().min(1),
  date: z.coerce.date(),
  period: z.coerce.number().int().min(1).max(12),
  status: z.nativeEnum(AttendanceStatus),
  note: z.string().max(200).optional(),
});

export const bulkAttendanceSchema = z.object({
  records: z.array(attendanceRecordSchema).min(1).max(500),
});

export class AttendanceService {
  constructor(private readonly db: PrismaClient) {}

  async bulkUpsert(actor: AuthPayload, input: z.infer<typeof bulkAttendanceSchema>) {
    const studentIds = [...new Set(input.records.map((record) => record.studentId))];

    const students = await this.db.studentProfile.findMany({
      where: { id: { in: studentIds }, user: { institutionId: actor.institutionId } },
      include: { schoolClass: true },
    });
    if (students.length !== studentIds.length) {
      throw ApiError.badRequest('STUDENT_NOT_FOUND', 'Bir veya daha fazla öğrenci bulunamadı');
    }

    if (actor.role === Role.TEACHER) {
      const teacher = await this.db.teacherProfile.findUnique({ where: { userId: actor.sub } });
      if (!teacher) throw ApiError.forbidden('TEACHER_SCOPE', 'Öğretmen profili bulunamadı');

      const courseIds = [...new Set(input.records.map((record) => record.classCourseId))];
      const owned = await this.db.classCourse.findMany({
        where: { id: { in: courseIds }, teacherId: teacher.id },
        select: { id: true },
      });
      if (owned.length !== courseIds.length) {
        throw ApiError.forbidden('TEACHER_SCOPE', 'Yalnızca kendi derslerinize yoklama girebilirsiniz');
      }
    }

    const results = await this.db.$transaction(
      input.records.map((record) =>
        this.db.attendanceRecord.upsert({
          where: {
            studentId_classCourseId_date_period: {
              studentId: record.studentId,
              classCourseId: record.classCourseId,
              date: record.date,
              period: record.period,
            },
          },
          create: {
            studentId: record.studentId,
            classCourseId: record.classCourseId,
            date: record.date,
            period: record.period,
            status: record.status,
            note: record.note,
            recordedById: actor.sub,
          },
          update: { status: record.status, note: record.note, recordedById: actor.sub },
        }),
      ),
    );

    return { saved: results.length };
  }

  async summarize(actor: AuthPayload, studentId: string, termId?: string) {
    const student = await this.db.studentProfile.findFirst({
      where: { id: studentId, user: { institutionId: actor.institutionId } },
      include: { user: true, schoolClass: true },
    });
    if (!student) throw ApiError.notFound('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı');

    if (actor.role === Role.STUDENT && student.userId !== actor.sub) {
      throw ApiError.forbidden('STUDENT_SCOPE', 'Yalnızca kendi devamsızlığınızı görebilirsiniz');
    }

    const term = await resolveTerm(this.db, actor.institutionId, termId);
    const rules = await loadRules(this.db, actor.institutionId);

    const records = await this.db.attendanceRecord.findMany({
      where: { studentId, date: { gte: term.startDate, lte: term.endDate } },
      include: { classCourse: { include: { course: true } } },
      orderBy: [{ date: 'desc' }, { period: 'asc' }],
      take: 200,
    });

    const unexcused = records.filter((record) => record.status === AttendanceStatus.ABSENT).length;
    const excused = records.filter((record) => record.status === AttendanceStatus.EXCUSED).length;
    const summary = evaluateAbsence(
      { unexcused, excused },
      {
        unexcusedLimit: ruleNumber(rules, 'unexcusedAbsenceLimit', 10),
        totalLimit: ruleNumber(rules, 'totalAbsenceLimit', 30),
      },
    );

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        studentNumber: student.studentNumber,
        className: student.schoolClass?.name ?? null,
      },
      term: { id: term.id, name: term.name },
      summary: {
        ...summary,
        excused,
        unexcusedLimit: ruleNumber(rules, 'unexcusedAbsenceLimit', 10),
        totalLimit: ruleNumber(rules, 'totalAbsenceLimit', 30),
      },
      records: records.map((record) => ({
        id: record.id,
        date: record.date,
        period: record.period,
        status: record.status,
        courseName: record.classCourse.course.name,
        note: record.note,
      })),
    };
  }
}
