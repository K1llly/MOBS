import { GradeType, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';

export const replacePoliciesSchema = z.object({
  policies: z
    .array(
      z.object({
        courseId: z.string().nullable().optional(),
        gradeType: z.nativeEnum(GradeType),
        weight: z.number().positive().max(10),
      }),
    )
    .max(100),
});

export class GradingPolicyService {
  constructor(private readonly db: PrismaClient) {}

  async list(institutionId: string) {
    const rows = await this.db.gradeWeightPolicy.findMany({
      where: { institutionId },
      orderBy: [{ courseId: 'asc' }, { gradeType: 'asc' }],
    });

    const courseIds = rows.map((row) => row.courseId).filter((id): id is string => Boolean(id));
    const courses = courseIds.length
      ? await this.db.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const courseMap = new Map(courses.map((course) => [course.id, course]));

    return rows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      courseName: row.courseId ? (courseMap.get(row.courseId)?.name ?? '—') : null,
      gradeType: row.gradeType,
      weight: row.weight,
    }));
  }

  /** Politikayı bütün olarak değiştirir (kısmi güncelleme yerine replace). */
  async replace(institutionId: string, input: z.infer<typeof replacePoliciesSchema>) {
    const seen = new Set<string>();
    for (const policy of input.policies) {
      const key = `${policy.courseId ?? 'GLOBAL'}:${policy.gradeType}`;
      if (seen.has(key)) {
        throw ApiError.badRequest('DUPLICATE_POLICY', 'Aynı ders/tür için birden fazla ağırlık gönderilemez');
      }
      seen.add(key);

      if (policy.courseId) {
        const course = await this.db.course.findFirst({
          where: { id: policy.courseId, institutionId },
        });
        if (!course) throw ApiError.notFound('COURSE_NOT_FOUND', 'Ders bulunamadı');
      }
    }

    await this.db.$transaction(async (tx) => {
      await tx.gradeWeightPolicy.deleteMany({ where: { institutionId } });
      if (input.policies.length > 0) {
        await tx.gradeWeightPolicy.createMany({
          data: input.policies.map((policy) => ({
            institutionId,
            courseId: policy.courseId ?? null,
            gradeType: policy.gradeType,
            weight: policy.weight,
          })),
        });
      }
    });

    return this.list(institutionId);
  }
}
