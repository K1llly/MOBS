import { GradingStrategy, GradeType } from '@prisma/client';

/** 0–100 aralığı dışındaki puanlar API'de 400 ile reddedilir. */
export function assertScore(score: number): void {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError('Puan 0 ile 100 arasında olmalıdır');
  }
}

export interface GradeEntry {
  type: GradeType;
  score: number;
  /** Ders bazlı geçersiz kılma; verilmezse kurum politikası kullanılır. */
  weight?: number | null;
}

export type WeightPolicy = Partial<Record<GradeType, number>>;

/**
 * Ağırlıklı ortalama. Ağırlık tanımlı değilse basit ortalama döner.
 * Sonuç 2 ondalık basamağa yuvarlanır (MEB karne uyumu).
 */
export function computeWeightedAverage(entries: GradeEntry[], policy: WeightPolicy = {}): number {
  if (entries.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;

  for (const entry of entries) {
    assertScore(entry.score);
    const weight = entry.weight ?? policy[entry.type] ?? 1;
    if (weight <= 0) continue;
    weightedSum += entry.score * weight;
    weightSum += weight;
  }

  if (weightSum === 0) {
    const simple = entries.reduce((total, entry) => total + entry.score, 0) / entries.length;
    return round2(simple);
  }

  return round2(weightedSum / weightSum);
}

export interface CourseTermGrades {
  courseName: string;
  isBarrier?: boolean;
  firstTerm?: number | null;
  secondTerm?: number | null;
}

export interface CourseResult {
  courseName: string;
  isBarrier: boolean;
  average: number | null;
  passed: boolean;
  /** Baraj dersten kalındığında her durumda sorumluluk doğar. */
  requiresResponsibility: boolean;
}

/** MIDDLE_SCHOOL_MEB — Türkçe ≥ 70, diğer dersler ≥ 50. */
export function middleSchoolCourseResult(
  course: CourseTermGrades,
  rules: { turkishPassingScore?: number; defaultPassingScore?: number } = {},
): CourseResult {
  const turkish = rules.turkishPassingScore ?? 70;
  const others = rules.defaultPassingScore ?? 50;
  const average = termAverage(course.firstTerm, course.secondTerm);
  const threshold = course.isBarrier ? turkish : others;

  return {
    courseName: course.courseName,
    isBarrier: Boolean(course.isBarrier),
    average,
    passed: average !== null && average >= threshold,
    requiresResponsibility: false,
  };
}

/**
 * HIGH_SCHOOL_MEB ders geçme kuralı:
 * (1. Dönem + 2. Dönem) / 2 ≥ 50 VEYA 2. dönem ≥ 70.
 */
export function highSchoolCourseResult(
  course: CourseTermGrades,
  rules: { coursePassAverage?: number; coursePassSecondTerm?: number } = {},
): CourseResult {
  const passAverage = rules.coursePassAverage ?? 50;
  const passSecond = rules.coursePassSecondTerm ?? 70;
  const average = termAverage(course.firstTerm, course.secondTerm);

  const passedByAverage = average !== null && average >= passAverage;
  const passedBySecondTerm =
    course.secondTerm !== null &&
    course.secondTerm !== undefined &&
    course.secondTerm >= passSecond;

  const passed = passedByAverage || passedBySecondTerm;

  return {
    courseName: course.courseName,
    isBarrier: Boolean(course.isBarrier),
    average,
    passed,
    requiresResponsibility: !passed && Boolean(course.isBarrier),
  };
}

export type HighSchoolOutcome = 'PASSED_DIRECT' | 'PASSED_RESPONSIBLE' | 'FAILED';

export interface HighSchoolClassEvaluation {
  outcome: HighSchoolOutcome;
  failedCourses: string[];
  responsibleCourses: string[];
  weakCourseCount: number;
  barrierFailures: string[];
}

/**
 * HIGH_SCHOOL_MEB sınıf geçme kuralları:
 *  - Doğrudan geçme: tüm dersler başarılı ya da en fazla 1 zayıf.
 *  - Sorumlu geçme: en fazla 3 zayıf ders, alt sınıflarla toplam sorumlu ≤ 6.
 *  - Sınıf tekrarı: 4+ zayıf ders veya toplam 6'dan fazla sorumlu ders.
 */
export function evaluateHighSchoolClass(
  courses: CourseResult[],
  options: { maxFailedForDirectPass?: number; maxResponsiblePerYear?: number; maxResponsibleTotal?: number; previousResponsibleCount?: number } = {},
): HighSchoolClassEvaluation {
  const maxDirect = options.maxFailedForDirectPass ?? 1;
  const maxPerYear = options.maxResponsiblePerYear ?? 3;
  const maxTotal = options.maxResponsibleTotal ?? 6;
  const previous = options.previousResponsibleCount ?? 0;

  const failed = courses.filter((course) => !course.passed);
  const barrierFailures = failed.filter((course) => course.isBarrier).map((course) => course.courseName);
  const failedCourses = failed.map((course) => course.courseName);

  if (failedCourses.length === 0) {
    return {
      outcome: 'PASSED_DIRECT',
      failedCourses,
      responsibleCourses: [],
      weakCourseCount: 0,
      barrierFailures,
    };
  }

  if (failedCourses.length <= maxDirect) {
    return {
      outcome: 'PASSED_DIRECT',
      failedCourses,
      responsibleCourses: failedCourses,
      weakCourseCount: failedCourses.length,
      barrierFailures,
    };
  }

  const totalResponsible = previous + failedCourses.length;
  if (failedCourses.length >= 4 || totalResponsible > maxTotal || failedCourses.length > maxPerYear) {
    return {
      outcome: 'FAILED',
      failedCourses,
      responsibleCourses: [],
      weakCourseCount: failedCourses.length,
      barrierFailures,
    };
  }

  return {
    outcome: 'PASSED_RESPONSIBLE',
    failedCourses,
    responsibleCourses: failedCourses,
    weakCourseCount: failedCourses.length,
    barrierFailures,
  };
}

export type AbsenceStatus = 'OK' | 'WARNING' | 'FAILED';

/** Lise devamsızlık kesicisi: özürsüz 10 veya toplam 30 gün aşılırsa doğrudan kalır. */
export function evaluateAbsence(
  input: { unexcused: number; excused?: number },
  limits: { unexcusedLimit?: number; totalLimit?: number; warningRatio?: number } = {},
): { status: AbsenceStatus; unexcused: number; total: number; reason?: string } {
  const unexcusedLimit = limits.unexcusedLimit ?? 10;
  const totalLimit = limits.totalLimit ?? 30;
  const warningRatio = limits.warningRatio ?? 0.8;

  const total = input.unexcused + (input.excused ?? 0);

  if (input.unexcused > unexcusedLimit) {
    return {
      status: 'FAILED',
      unexcused: input.unexcused,
      total,
      reason: `Özürsüz devamsızlık sınırı aşıldı (${input.unexcused}/${unexcusedLimit})`,
    };
  }

  if (total > totalLimit) {
    return {
      status: 'FAILED',
      unexcused: input.unexcused,
      total,
      reason: `Toplam devamsızlık sınırı aşıldı (${total}/${totalLimit})`,
    };
  }

  const nearLimit =
    input.unexcused >= unexcusedLimit * warningRatio || total >= totalLimit * warningRatio;

  return {
    status: nearLimit ? 'WARNING' : 'OK',
    unexcused: input.unexcused,
    total,
  };
}

export type CertificateType = 'TAKDIR' | 'TESEKKUR' | null;

/** Takdir/Teşekkür belgesi: zayıf ders yok ve özürsüz devamsızlık ≤ 5. */
export function evaluateCertificate(
  input: { average: number; hasWeakCourse: boolean; unexcusedAbsence: number },
  rules: { honorThreshold?: number; thanksThreshold?: number; maxUnexcused?: number } = {},
): CertificateType {
  const honor = rules.honorThreshold ?? 85;
  const thanks = rules.thanksThreshold ?? 70;
  const maxUnexcused = rules.maxUnexcused ?? 5;

  if (input.hasWeakCourse || input.unexcusedAbsence > maxUnexcused) return null;
  if (input.average >= honor) return 'TAKDIR';
  if (input.average >= thanks) return 'TESEKKUR';
  return null;
}

export interface LetterGrade {
  letter: string;
  min: number;
  gpaPoint: number;
}

export const DEFAULT_LETTER_SCALE: LetterGrade[] = [
  { letter: 'AA', min: 90, gpaPoint: 4.0 },
  { letter: 'BA', min: 85, gpaPoint: 3.5 },
  { letter: 'BB', min: 80, gpaPoint: 3.0 },
  { letter: 'CB', min: 75, gpaPoint: 2.5 },
  { letter: 'CC', min: 70, gpaPoint: 2.0 },
  { letter: 'DC', min: 65, gpaPoint: 1.5 },
  { letter: 'DD', min: 60, gpaPoint: 1.0 },
  { letter: 'FD', min: 50, gpaPoint: 0.5 },
  { letter: 'FF', min: 0, gpaPoint: 0.0 },
];

/** Üniversite harf notu (mutlak ölçek). Bağıl/çan eğrisi ayrı bir strateji olarak eklenebilir. */
export function letterGradeOf(score: number, scale: LetterGrade[] = DEFAULT_LETTER_SCALE): LetterGrade {
  assertScore(score);
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((entry) => score >= entry.min) ?? sorted[sorted.length - 1];
}

export interface CourseCreditResult {
  letter: string;
  gpaPoint: number;
  credits: number;
}

/** GPA = Σ(kredi × katsayı) / Σkredi */
export function computeGpa(courses: CourseCreditResult[]): number {
  const credits = courses.reduce((total, course) => total + course.credits, 0);
  if (credits === 0) return 0;
  const points = courses.reduce((total, course) => total + course.gpaPoint * course.credits, 0);
  return round2(points / credits);
}

/** CGPA: önceki dönemlerin kredili ortalaması ile birleştirilir. */
export function computeCgpa(
  previous: { gpa: number; credits: number } | null,
  current: { gpa: number; credits: number },
): number {
  const prevCredits = previous?.credits ?? 0;
  const totalCredits = prevCredits + current.credits;
  if (totalCredits === 0) return 0;
  const totalPoints = (previous?.gpa ?? 0) * prevCredits + current.gpa * current.credits;
  return round2(totalPoints / totalCredits);
}

/**
 * Strateji yönlendiricisi. Kodda `if (kurum === "lise")` yerine kurum profilindeki
 * strateji ilgili hesaplayıcıyı seçer.
 */
export function strategyOf(strategy: GradingStrategy): {
  supportsNumericGrades: boolean;
  supportsLetterGrades: boolean;
  supportsDevelopmentReport: boolean;
} {
  switch (strategy) {
    case GradingStrategy.PRIMARY_DEVELOPMENT:
      return { supportsNumericGrades: false, supportsLetterGrades: false, supportsDevelopmentReport: true };
    case GradingStrategy.UNIVERSITY_GPA:
      return { supportsNumericGrades: false, supportsLetterGrades: true, supportsDevelopmentReport: false };
    case GradingStrategy.COURSE_SIMPLE:
    case GradingStrategy.MIDDLE_SCHOOL_MEB:
    case GradingStrategy.HIGH_SCHOOL_MEB:
      return { supportsNumericGrades: true, supportsLetterGrades: false, supportsDevelopmentReport: false };
    default:
      return { supportsNumericGrades: false, supportsLetterGrades: false, supportsDevelopmentReport: false };
  }
}

function termAverage(first?: number | null, second?: number | null): number | null {
  if (first === null || first === undefined) {
    if (second === null || second === undefined) return null;
    return round2(second);
  }
  if (second === null || second === undefined) return round2(first);
  return round2((first + second) / 2);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
