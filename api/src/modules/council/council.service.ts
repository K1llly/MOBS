import { CouncilCaseStatus, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { resolveTerm } from '../../lib/rules';

export const createCouncilCaseSchema = z.object({
  studentId: z.string().min(1),
  termId: z.string().optional(),
  reason: z.string().min(3).max(500),
});

export const resolveCouncilCaseSchema = z.object({
  status: z.nativeEnum(CouncilCaseStatus).default(CouncilCaseStatus.RESOLVED),
  decision: z.string().min(3).max(500),
});

export class CouncilService {
  constructor(private readonly db: PrismaClient) {}

  async list(institutionId: string, status?: CouncilCaseStatus) {
    const cases = await this.db.councilCase.findMany({
      where: { institutionId, ...(status ? { status } : {}) },
      include: {
        student: { include: { user: true, schoolClass: true } },
        term: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return cases.map((item) => ({
      id: item.id,
      studentId: item.studentId,
      fullName: item.student.user.fullName,
      studentNumber: item.student.studentNumber,
      className: item.student.schoolClass?.name ?? null,
      termName: item.term.name,
      reason: item.reason,
      status: item.status,
      decision: item.decision,
      resolvedAt: item.resolvedAt,
      createdAt: item.createdAt,
    }));
  }

  async create(institutionId: string, input: z.infer<typeof createCouncilCaseSchema>) {
    const student = await this.db.studentProfile.findFirst({
      where: { id: input.studentId, user: { institutionId } },
    });
    if (!student) throw ApiError.notFound('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı');

    const term = await resolveTerm(this.db, institutionId, input.termId);

    const open = await this.db.councilCase.findFirst({
      where: {
        institutionId,
        studentId: input.studentId,
        termId: term.id,
        status: CouncilCaseStatus.OPEN,
      },
    });
    if (open) {
      throw ApiError.conflict('COUNCIL_CASE_EXISTS', 'Bu öğrenci için açık bir ŞÖK dosyası var');
    }

    return this.db.councilCase.create({
      data: {
        institutionId,
        studentId: input.studentId,
        termId: term.id,
        reason: input.reason,
        status: CouncilCaseStatus.OPEN,
      },
    });
  }

  async resolve(institutionId: string, caseId: string, input: z.infer<typeof resolveCouncilCaseSchema>) {
    const item = await this.db.councilCase.findFirst({
      where: { id: caseId, institutionId },
    });
    if (!item) throw ApiError.notFound('COUNCIL_CASE_NOT_FOUND', 'ŞÖK dosyası bulunamadı');

    await this.db.councilCase.update({
      where: { id: caseId },
      data: {
        status: input.status,
        decision: input.decision,
        resolvedAt: new Date(),
      },
    });

    return { id: caseId, status: input.status, decision: input.decision };
  }
}
