import { InstitutionType, Role, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import type { AuthPayload } from '../../lib/jwt';
import {
  MockExamValidationError,
  computeMockResult,
  isValidPenaltyRatio,
  resolveMockExamAffectsFinalGrade,
} from './mock-exam.calc';

const ratioSchema = z.coerce
  .number()
  .int()
  .refine((value) => isValidPenaltyRatio(value), 'Katsayı 0, 3 veya 4 olmalıdır');

export const createTemplateSchema = z.object({
  name: z.string().min(3).max(120),
  wrongPenaltyRatio: ratioSchema.default(4),
  sections: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        courseId: z.string().optional(),
        questionCount: z.coerce.number().int().min(1).max(200),
      }),
    )
    .min(1, 'En az bir ders bölümü gerekir'),
});

export const createSessionSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(3).max(120),
  examDate: z.coerce.date(),
  schoolClassId: z.string().optional(),
  affectsFinalGrade: z.boolean().optional(),
  weightIfAffected: z.number().min(0).max(1).optional(),
});

export const mockResultSchema = z.object({
  studentId: z.string().min(1),
  sectionId: z.string().min(1),
  correctCount: z.coerce.number().int().min(0),
  wrongCount: z.coerce.number().int().min(0),
});

export class MockExamService {
  constructor(private readonly db: PrismaClient) {}

  async listTemplates(institutionId: string) {
    const templates = await this.db.mockExamTemplate.findMany({
      where: { institutionId },
      include: {
        sections: { include: { course: true }, orderBy: { name: 'asc' } },
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      wrongPenaltyRatio: template.wrongPenaltyRatio,
      sessionCount: template._count.sessions,
      totalQuestions: template.sections.reduce((total, section) => total + section.questionCount, 0),
      sections: template.sections.map((section) => ({
        id: section.id,
        name: section.name,
        courseId: section.courseId,
        courseName: section.course?.name ?? null,
        questionCount: section.questionCount,
      })),
    }));
  }

  async createTemplate(institutionId: string, input: z.infer<typeof createTemplateSchema>) {
    if (!isValidPenaltyRatio(input.wrongPenaltyRatio)) {
      throw ApiError.badRequest('INVALID_PENALTY_RATIO', 'Katsayı 0, 3 veya 4 olmalıdır');
    }

    for (const section of input.sections) {
      if (section.courseId) {
        const course = await this.db.course.findFirst({
          where: { id: section.courseId, institutionId },
        });
        if (!course) throw ApiError.notFound('COURSE_NOT_FOUND', 'Ders bulunamadı');
      }
    }

    const duplicate = await this.db.mockExamTemplate.findFirst({
      where: { institutionId, name: input.name },
    });
    if (duplicate) {
      throw ApiError.conflict('TEMPLATE_EXISTS', 'Bu adla bir deneme şablonu zaten var');
    }

    return this.db.mockExamTemplate.create({
      data: {
        institutionId,
        name: input.name,
        wrongPenaltyRatio: input.wrongPenaltyRatio,
        sections: {
          create: input.sections.map((section) => ({
            name: section.name,
            courseId: section.courseId,
            questionCount: section.questionCount,
          })),
        },
      },
      include: { sections: true },
    });
  }

  async listSessions(institutionId: string) {
    const sessions = await this.db.mockExamSession.findMany({
      where: { institutionId },
      include: {
        template: { include: { sections: true } },
        schoolClass: true,
        _count: { select: { results: true } },
      },
      orderBy: { examDate: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      name: session.name,
      examDate: session.examDate,
      status: session.status,
      templateId: session.templateId,
      templateName: session.template.name,
      wrongPenaltyRatio: session.template.wrongPenaltyRatio,
      totalQuestions: session.template.sections.reduce(
        (total, section) => total + section.questionCount,
        0,
      ),
      className: session.schoolClass?.name ?? null,
      affectsFinalGrade: session.affectsFinalGrade,
      weightIfAffected: session.weightIfAffected,
      resultCount: session._count.results,
      sections: session.template.sections.map((section) => ({
        id: section.id,
        name: section.name,
        questionCount: section.questionCount,
      })),
    }));
  }

  async createSession(institutionId: string, input: z.infer<typeof createSessionSchema>) {
    const institution = await this.db.institutionConfig.findUnique({ where: { id: institutionId } });
    if (!institution) throw ApiError.notFound('INSTITUTION_NOT_FOUND', 'Kurum bulunamadı');

    const template = await this.db.mockExamTemplate.findFirst({
      where: { id: input.templateId, institutionId },
    });
    if (!template) throw ApiError.notFound('TEMPLATE_NOT_FOUND', 'Deneme şablonu bulunamadı');

    let affectsFinalGrade: boolean;
    try {
      affectsFinalGrade = resolveMockExamAffectsFinalGrade(
        institution.type,
        input.affectsFinalGrade,
      );
    } catch (error) {
      if (error instanceof MockExamValidationError) {
        throw ApiError.badRequest(error.code, error.message);
      }
      throw error;
    }

    if (institution.type === InstitutionType.PRIMARY && affectsFinalGrade) {
      throw ApiError.badRequest(
        'MOCK_EXAM_CANNOT_AFFECT_OFFICIAL_GRADE',
        'İlkokulda deneme sınavı karneye etki edemez',
      );
    }

    if (input.schoolClassId) {
      const schoolClass = await this.db.schoolClass.findFirst({
        where: { id: input.schoolClassId, institutionId },
      });
      if (!schoolClass) throw ApiError.notFound('CLASS_NOT_FOUND', 'Sınıf/şube bulunamadı');
    }

    return this.db.mockExamSession.create({
      data: {
        institutionId,
        templateId: input.templateId,
        name: input.name,
        examDate: input.examDate,
        schoolClassId: input.schoolClassId,
        affectsFinalGrade,
        weightIfAffected: affectsFinalGrade ? (input.weightIfAffected ?? 0.1) : null,
      },
      include: { template: true },
    });
  }

  /** FR-MOCK-04 — Sonuç girişi (yalnızca öğretmen); boş ve net otomatik hesaplanır. */
  async enterResult(
    actor: AuthPayload,
    sessionId: string,
    input: z.infer<typeof mockResultSchema>,
  ) {
    const institutionId = actor.institutionId;
    const session = await this.db.mockExamSession.findFirst({
      where: { id: sessionId, institutionId },
      include: { template: { include: { sections: true } } },
    });
    if (!session) throw ApiError.notFound('SESSION_NOT_FOUND', 'Deneme oturumu bulunamadı');

    if (actor.role === Role.TEACHER && session.schoolClassId) {
      const teacher = await this.db.teacherProfile.findUnique({ where: { userId: actor.sub } });
      const owns = teacher
        ? await this.db.classCourse.findFirst({
            where: { teacherId: teacher.id, schoolClassId: session.schoolClassId },
          })
        : null;
      if (!owns) {
        throw ApiError.forbidden('TEACHER_SCOPE', 'Bu oturumun şubesinde dersiniz yok');
      }
    }

    const section = session.template.sections.find((item) => item.id === input.sectionId);
    if (!section) {
      throw ApiError.badRequest('SECTION_NOT_FOUND', 'Bölüm bu deneme şablonuna ait değil');
    }

    const student = await this.db.studentProfile.findFirst({
      where: { id: input.studentId, user: { institutionId } },
    });
    if (!student) throw ApiError.notFound('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı');

    let computed;
    try {
      computed = computeMockResult({
        correctCount: input.correctCount,
        wrongCount: input.wrongCount,
        totalQuestions: section.questionCount,
        wrongPenaltyRatio: session.template.wrongPenaltyRatio,
      });
    } catch (error) {
      if (error instanceof MockExamValidationError) {
        throw ApiError.badRequest(error.code, error.message);
      }
      throw error;
    }

    return this.db.mockExamResult.upsert({
      where: {
        sessionId_studentId_sectionId: {
          sessionId,
          studentId: input.studentId,
          sectionId: input.sectionId,
        },
      },
      create: {
        sessionId,
        studentId: input.studentId,
        sectionId: input.sectionId,
        ...computed,
      },
      update: computed,
      include: { student: { include: { user: true } }, section: true },
    });
  }

  /** FR-MOCK-05 — Şube/kurum sıralaması. */
  async ranking(institutionId: string, sessionId: string) {
    const session = await this.db.mockExamSession.findFirst({
      where: { id: sessionId, institutionId },
      include: { template: { include: { sections: true } }, schoolClass: true },
    });
    if (!session) throw ApiError.notFound('SESSION_NOT_FOUND', 'Deneme oturumu bulunamadı');

    const results = await this.db.mockExamResult.findMany({
      where: { sessionId },
      include: { student: { include: { user: true } }, section: true },
    });

    const byStudent = new Map<
      string,
      {
        studentId: string;
        fullName: string;
        studentNumber: string;
        net: number;
        correct: number;
        wrong: number;
        blank: number;
        sections: Array<{ name: string; correct: number; wrong: number; blank: number; net: number }>;
      }
    >();

    for (const result of results) {
      const current = byStudent.get(result.studentId) ?? {
        studentId: result.studentId,
        fullName: result.student.user.fullName,
        studentNumber: result.student.studentNumber,
        net: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        sections: [],
      };
      current.net = round2(current.net + result.net);
      current.correct += result.correctCount;
      current.wrong += result.wrongCount;
      current.blank += result.blankCount;
      current.sections.push({
        name: result.section.name,
        correct: result.correctCount,
        wrong: result.wrongCount,
        blank: result.blankCount,
        net: result.net,
      });
      byStudent.set(result.studentId, current);
    }

    const rows = [...byStudent.values()].sort((a, b) => b.net - a.net).map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

    return {
      session: {
        id: session.id,
        name: session.name,
        examDate: session.examDate,
        templateName: session.template.name,
        className: session.schoolClass?.name ?? null,
        affectsFinalGrade: session.affectsFinalGrade,
      },
      rows,
    };
  }

  /** Öğrenci/veli — deneme geçmişi ve net gelişimi. */
  async studentResults(institutionId: string, studentId: string) {
    const student = await this.db.studentProfile.findFirst({
      where: { id: studentId, user: { institutionId } },
      include: { user: true, schoolClass: true },
    });
    if (!student) throw ApiError.notFound('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı');

    const results = await this.db.mockExamResult.findMany({
      where: { studentId, session: { institutionId } },
      include: {
        session: { include: { template: { include: { sections: true } }, schoolClass: true } },
        section: true,
      },
      orderBy: { session: { examDate: 'asc' } },
    });

    const bySession = new Map<string, typeof results>();
    for (const result of results) {
      const list = bySession.get(result.sessionId) ?? [];
      list.push(result);
      bySession.set(result.sessionId, list);
    }

    const history = [];

    for (const [sessionId, sessionResults] of bySession) {
      const session = sessionResults[0]!.session;
      const all = await this.db.mockExamResult.findMany({
        where: { sessionId },
        select: { studentId: true, net: true },
      });
      const totals = new Map<string, number>();
      for (const row of all) {
        totals.set(row.studentId, round2((totals.get(row.studentId) ?? 0) + row.net));
      }
      const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      const rank = sorted.findIndex(([id]) => id === studentId) + 1;
      const ownNet = round2(sessionResults.reduce((total, result) => total + result.net, 0));

      history.push({
        sessionId,
        sessionName: session.name,
        examDate: session.examDate,
        templateId: session.templateId,
        templateName: session.template.name,
        totalQuestions: session.template.sections.reduce(
          (total, section) => total + section.questionCount,
          0,
        ),
        className: session.schoolClass?.name ?? null,
        affectsFinalGrade: session.affectsFinalGrade,
        net: ownNet,
        rank,
        participants: sorted.length,
        sections: sessionResults.map((result) => ({
          sectionId: result.sectionId,
          name: result.section.name,
          correct: result.correctCount,
          wrong: result.wrongCount,
          blank: result.blankCount,
          net: result.net,
        })),
      });
    }

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        studentNumber: student.studentNumber,
        className: student.schoolClass?.name ?? null,
      },
      history,
    };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
