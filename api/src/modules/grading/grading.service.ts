import { GradeType, Role, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import type { AuthPayload } from '../../lib/jwt';
import { getInstitution, loadRules, resolveTerm, ruleNumber, type Rules } from '../../lib/rules';
import {
  assertScore,
  computeGpa,
  computeWeightedAverage,
  evaluateAbsence,
  evaluateCertificate,
  evaluateHighSchoolClass,
  highSchoolCourseResult,
  letterGradeOf,
  middleSchoolCourseResult,
  type CourseResult,
  type GradeEntry,
  type WeightPolicy,
} from './grading.strategies';

export const gradeInputSchema = z.object({
  courseId: z.string().min(1),
  termId: z.string().optional(),
  type: z.nativeEnum(GradeType),
  score: z.number().min(0, 'Puan 0–100 aralığında olmalıdır').max(100, 'Puan 0–100 aralığında olmalıdır'),
  weight: z.number().positive().max(10).optional(),
});

export class GradingService {
  constructor(private readonly db: PrismaClient) {}

  /** US-03 — Sınav notu girişi. */
  async enterGrade(actor: AuthPayload, studentId: string, input: z.infer<typeof gradeInputSchema>) {
    const institution = await getInstitution(this.db, actor.institutionId);

    if (institution.gradingStrategy === 'PRIMARY_DEVELOPMENT') {
      throw ApiError.badRequest(
        'NUMERIC_GRADING_NOT_ALLOWED',
        'İlkokulda 0–100 sayısal puan girişi yapılamaz; gelişim raporu kullanılır',
      );
    }

    const student = await this.db.studentProfile.findFirst({
      where: { id: studentId, user: { institutionId: actor.institutionId } },
    });
    if (!student) throw ApiError.notFound('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı');

    const course = await this.db.course.findFirst({
      where: { id: input.courseId, institutionId: actor.institutionId },
    });
    if (!course) throw ApiError.notFound('COURSE_NOT_FOUND', 'Ders bulunamadı');

    if (actor.role === Role.TEACHER) {
      await this.assertTeacherOwnsCourse(actor, course.id, student.schoolClassId);
    }

    const term = await resolveTerm(this.db, actor.institutionId, input.termId);

    try {
      assertScore(input.score);
    } catch {
      throw ApiError.badRequest('SCORE_OUT_OF_RANGE', 'Puan 0 ile 100 arasında olmalıdır');
    }

    return this.db.grade.create({
      data: {
        studentId,
        courseId: course.id,
        termId: term.id,
        type: input.type,
        score: input.score,
        weight: input.weight,
        enteredById: actor.sub,
      },
      include: { course: true, term: true },
    });
  }

  async listGrades(actor: AuthPayload, studentId: string, termId?: string) {
    await this.assertReadable(actor, studentId);

    const grades = await this.db.grade.findMany({
      where: {
        studentId,
        ...(termId ? { termId } : {}),
        term: { academicYear: { institutionId: actor.institutionId } },
      },
      include: { course: true, term: true },
      orderBy: [{ term: { startDate: 'asc' } }, { createdAt: 'asc' }],
    });

    return grades.map((grade) => ({
      id: grade.id,
      courseId: grade.courseId,
      courseName: grade.course.name,
      termId: grade.termId,
      termName: grade.term.name,
      type: grade.type,
      score: grade.score,
      weight: grade.weight,
      createdAt: grade.createdAt,
    }));
  }

  /** US-04 — Strateji tabanlı karne / transkript. */
  async reportCard(actor: AuthPayload, studentId: string, termId?: string) {
    const student = await this.assertReadable(actor, studentId);
    const institution = await getInstitution(this.db, actor.institutionId);
    const rules = await loadRules(this.db, actor.institutionId);
    const term = await resolveTerm(this.db, actor.institutionId, termId);

    const terms = await this.db.term.findMany({
      where: { academicYearId: term.academicYearId },
      orderBy: { startDate: 'asc' },
    });
    const firstTerm = terms[0];
    const secondTerm = terms[1];

    const grades = await this.db.grade.findMany({
      where: { studentId, term: { academicYearId: term.academicYearId } },
      include: { course: true },
    });

    const policies = await this.db.gradeWeightPolicy.findMany({
      where: { institutionId: actor.institutionId },
    });

    const absence = await this.absenceSummary(studentId, term.startDate, term.endDate, rules);

    const byCourse = new Map<string, typeof grades>();
    for (const grade of grades) {
      const list = byCourse.get(grade.courseId) ?? [];
      list.push(grade);
      byCourse.set(grade.courseId, list);
    }

    const weeklyHours = new Map(
      (
        await this.db.classCourse.findMany({
          where: { schoolClassId: student.schoolClassId ?? undefined },
          select: { courseId: true, weeklyHours: true },
        })
      ).map((item) => [item.courseId, item.weeklyHours]),
    );

    const courseResults: Array<Record<string, unknown>> = [];

    for (const [courseId, courseGrades] of byCourse) {
      const course = courseGrades[0]!.course;
      const policy = buildPolicy(policies, courseId);
      const firstEntries = courseGrades.filter((g) => g.termId === firstTerm?.id);
      const secondEntries = courseGrades.filter((g) => g.termId === secondTerm?.id);
      const firstAvg = firstEntries.length
        ? computeWeightedAverage(toEntries(firstEntries), policy)
        : null;
      const secondAvg = secondEntries.length
        ? computeWeightedAverage(toEntries(secondEntries), policy)
        : null;

      const hours = weeklyHours.get(courseId) ?? course.weeklyHours ?? 2;

      if (institution.gradingStrategy === 'PRIMARY_DEVELOPMENT') {
        courseResults.push({
          courseId,
          courseName: course.name,
          weeklyHours: hours,
          entries: courseGrades.map((grade) => ({ type: grade.type, score: grade.score })),
        });
        continue;
      }

      if (institution.gradingStrategy === 'UNIVERSITY_GPA') {
        const average = computeUniversityAverage(courseGrades, policy);
        const letter = average === null ? null : letterGradeOf(average);
        courseResults.push({
          courseId,
          courseName: course.name,
          credits: course.credits ?? course.ects ?? 3,
          average,
          letterGrade: letter?.letter ?? null,
          gpaPoint: letter?.gpaPoint ?? null,
          passed: letter ? letter.gpaPoint > 0 : false,
        });
        continue;
      }

      let result: CourseResult;
      if (institution.gradingStrategy === 'MIDDLE_SCHOOL_MEB') {
        result = middleSchoolCourseResult(
          {
            courseName: course.name,
            isBarrier: isTurkish(course.name, course.isBarrier),
            firstTerm: firstAvg,
            secondTerm: secondAvg,
          },
          {
            turkishPassingScore: ruleNumber(rules, 'turkishPassingScore', 70),
            defaultPassingScore: ruleNumber(rules, 'defaultPassingScore', 50),
          },
        );
      } else if (institution.gradingStrategy === 'HIGH_SCHOOL_MEB') {
        result = highSchoolCourseResult(
          {
            courseName: course.name,
            isBarrier: isBarrierCourse(course.name, course.isBarrier),
            firstTerm: firstAvg,
            secondTerm: secondAvg,
          },
          {
            coursePassAverage: ruleNumber(rules, 'coursePassAverage', 50),
            coursePassSecondTerm: ruleNumber(rules, 'coursePassSecondTerm', 70),
          },
        );
      } else {
        const average = firstAvg === null && secondAvg === null ? null : averageOf(firstAvg, secondAvg);
        const passScore = ruleNumber(rules, 'coursePassingScore', 60);
        result = {
          courseName: course.name,
          isBarrier: false,
          average,
          passed: average !== null && average >= passScore,
          requiresResponsibility: false,
        };
      }

      courseResults.push({
        courseId,
        courseName: course.name,
        weeklyHours: hours,
        isBarrier: result.isBarrier,
        firstTerm: firstAvg,
        secondTerm: secondAvg,
        average: result.average,
        passed: result.passed,
      });
    }

    const summary = summarize(institution.gradingStrategy, courseResults, rules, absence);

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        studentNumber: student.studentNumber,
        className: student.schoolClass?.name ?? null,
      },
      term: {
        id: term.id,
        name: term.name,
        startDate: term.startDate,
        endDate: term.endDate,
      },
      strategy: institution.gradingStrategy,
      ...summary,
      absence,
      courses: courseResults,
    };
  }

  private async absenceSummary(
    studentId: string,
    startDate: Date,
    endDate: Date,
    rules: Rules,
  ) {
    const [unexcused, excused] = await Promise.all([
      this.db.attendanceRecord.count({
        where: { studentId, status: 'ABSENT', date: { gte: startDate, lte: endDate } },
      }),
      this.db.attendanceRecord.count({
        where: { studentId, status: 'EXCUSED', date: { gte: startDate, lte: endDate } },
      }),
    ]);

    const result = evaluateAbsence(
      { unexcused, excused },
      {
        unexcusedLimit: ruleNumber(rules, 'unexcusedAbsenceLimit', 10),
        totalLimit: ruleNumber(rules, 'totalAbsenceLimit', 30),
      },
    );

    return { ...result, excused };
  }

  private async assertReadable(actor: AuthPayload, studentId: string) {
    const student = await this.db.studentProfile.findFirst({
      where: { id: studentId, user: { institutionId: actor.institutionId } },
      include: { user: true, schoolClass: { include: { classCourses: true } } },
    });
    if (!student) throw ApiError.notFound('STUDENT_NOT_FOUND', 'Öğrenci bulunamadı');

    if (actor.role === Role.STUDENT && student.userId !== actor.sub) {
      throw ApiError.forbidden('STUDENT_SCOPE', 'Yalnızca kendi kayıtlarınızı görebilirsiniz');
    }

    if (actor.role === Role.TEACHER) {
      const teacher = await this.db.teacherProfile.findUnique({ where: { userId: actor.sub } });
      const owns = teacher
        ? await this.db.classCourse.findFirst({
            where: { teacherId: teacher.id, schoolClassId: student.schoolClassId ?? undefined },
          })
        : null;
      if (!owns) throw ApiError.forbidden('TEACHER_SCOPE', 'Bu öğrencinin şubesinde dersiniz yok');
    }

    return student;
  }

  private async assertTeacherOwnsCourse(
    actor: AuthPayload,
    courseId: string,
    classId: string | null,
  ) {
    if (!classId) {
      throw ApiError.forbidden('TEACHER_SCOPE', 'Öğrenci bir şubeye kayıtlı değil');
    }

    const teacher = await this.db.teacherProfile.findUnique({ where: { userId: actor.sub } });
    if (!teacher) throw ApiError.forbidden('TEACHER_SCOPE', 'Öğretmen profili bulunamadı');

    const owns = await this.db.classCourse.findFirst({
      where: { teacherId: teacher.id, courseId, schoolClassId: classId },
    });

    if (!owns) {
      throw ApiError.forbidden('TEACHER_SCOPE', 'Bu derse atanmış öğretmen değilsiniz');
    }
  }
}

function toEntries(grades: Array<{ type: GradeType; score: number; weight: number | null }>): GradeEntry[] {
  return grades.map((grade) => ({ type: grade.type, score: grade.score, weight: grade.weight }));
}

function buildPolicy(
  policies: Array<{ courseId: string | null; gradeType: GradeType; weight: number }>,
  courseId: string,
): WeightPolicy {
  const policy: WeightPolicy = {};
  for (const item of policies) {
    if (item.courseId === null) policy[item.gradeType] = item.weight;
  }
  for (const item of policies) {
    if (item.courseId === courseId) policy[item.gradeType] = item.weight;
  }
  return policy;
}

function computeUniversityAverage(
  grades: Array<{ type: GradeType; score: number }>,
  policy: WeightPolicy,
): number | null {
  const effective = grades.filter((grade) => {
    // Bütünleme girildiyse final geçersiz sayılır.
    if (grade.type === GradeType.FINAL && grades.some((entry) => entry.type === GradeType.MAKEUP)) {
      return false;
    }
    return true;
  });

  if (effective.length === 0) return null;
  return computeWeightedAverage(
    effective.map((grade) => ({ type: grade.type, score: grade.score })),
    { ...policy, ...(effective.some((g) => g.type === GradeType.MAKEUP) ? { MAKEUP: policy.FINAL ?? 0.4 } : {}) },
  );
}

function averageOf(first: number | null, second: number | null): number {
  if (first === null) return second ?? 0;
  if (second === null) return first;
  return Math.round(((first + second) / 2 + Number.EPSILON) * 100) / 100;
}

function isTurkish(name: string, flag: boolean): boolean {
  return flag || /türkçe|türk dili/i.test(name);
}

function isBarrierCourse(name: string, flag: boolean): boolean {
  return flag || /edebiyat|türk dili|türkçe/i.test(name);
}

function summarize(
  strategy: string,
  courses: Array<Record<string, unknown>>,
  rules: Rules,
  absence: { status: 'OK' | 'WARNING' | 'FAILED'; unexcused: number; total: number },
) {
  if (strategy === 'PRIMARY_DEVELOPMENT') {
    return {
      average: null,
      standing: 'ACTIVE',
      certificate: null,
      developmentReport: true,
    };
  }

  if (strategy === 'UNIVERSITY_GPA') {
    const gpaCourses = courses
      .filter((course) => typeof course.average === 'number')
      .map((course) => ({
        letter: String(course.letterGrade ?? 'FF'),
        gpaPoint: Number(course.gpaPoint ?? 0),
        credits: Number(course.credits ?? 0),
      }));
    const credits = gpaCourses.reduce((total, course) => total + course.credits, 0);
    return {
      average: gpaCourses.length ? computeGpa(gpaCourses) : null,
      gpa: gpaCourses.length ? computeGpa(gpaCourses) : null,
      totalCredits: credits,
      standing: 'ACTIVE',
      certificate: null,
    };
  }

  if (strategy === 'COURSE_SIMPLE') {
    const scored = courses.filter((course) => typeof course.average === 'number');
    const average = scored.length
      ? Math.round(
          (scored.reduce((total, course) => total + Number(course.average), 0) / scored.length +
            Number.EPSILON) *
            100,
        ) / 100
      : null;
    const passed = average !== null && average >= ruleNumber(rules, 'coursePassingScore', 60);
    return {
      average,
      standing: average === null ? 'ACTIVE' : passed ? 'PASSED' : 'FAILED',
      certificate: null,
    };
  }

  // MEB okul stratejileri: haftalık ders saati ağırlıklı yıl sonu ortalaması
  const scored = courses.filter((course) => typeof course.average === 'number');
  const totalHours = scored.reduce((total, course) => total + Number(course.weeklyHours ?? 2), 0);
  const average = totalHours
    ? Math.round(
        (scored.reduce(
          (total, course) => total + Number(course.average) * Number(course.weeklyHours ?? 2),
          0,
        ) /
          totalHours +
          Number.EPSILON) *
          100,
      ) / 100
    : null;

  const courseResults: CourseResult[] = courses.map((course) => ({
    courseName: String(course.courseName),
    isBarrier: Boolean(course.isBarrier),
    average: typeof course.average === 'number' ? course.average : null,
    passed: Boolean(course.passed),
    requiresResponsibility: Boolean(course.isBarrier) && !course.passed,
  }));

  if (strategy === 'MIDDLE_SCHOOL_MEB') {
    const failed = courseResults.filter((course) => !course.passed);
    const councilRequired = failed.length > 0 || absence.status === 'FAILED';
    return {
      average,
      standing: councilRequired ? 'COUNCIL_PENDING' : 'PASSED',
      certificate: null,
      councilReason: councilRequired
        ? absence.status === 'FAILED'
          ? 'Devamsızlık sınırı aşıldı'
          : `${failed.length} dersten baraj altında kalındı`
        : null,
    };
  }

  const outcome = evaluateHighSchoolClass(courseResults, {
    maxFailedForDirectPass: ruleNumber(rules, 'maxFailedCoursesForDirectPass', 1),
    maxResponsiblePerYear: ruleNumber(rules, 'maxResponsibleCoursesPerYear', 3),
    maxResponsibleTotal: ruleNumber(rules, 'maxResponsibleCoursesTotal', 6),
  });

  const standing =
    absence.status === 'FAILED'
      ? 'FAILED'
      : outcome.outcome === 'PASSED_DIRECT'
        ? 'PASSED'
        : outcome.outcome === 'PASSED_RESPONSIBLE'
          ? 'RESPONSIBLE'
          : 'FAILED';

  const certificate =
    average === null
      ? null
      : evaluateCertificate(
          {
            average,
            hasWeakCourse: courseResults.some((course) => !course.passed),
            unexcusedAbsence: absence.unexcused,
          },
          {
            honorThreshold: ruleNumber(rules, 'honorThreshold', 85),
            thanksThreshold: ruleNumber(rules, 'thanksThreshold', 70),
            maxUnexcused: ruleNumber(rules, 'honorMaxUnexcusedAbsence', 5),
          },
        );

  return {
    average,
    standing,
    certificate,
    failedCourses: outcome.failedCourses,
    responsibleCourses: outcome.responsibleCourses,
  };
}
