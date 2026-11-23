import { InstitutionType } from '@prisma/client';

export const WRONG_PENALTY_RATIOS = [0, 3, 4] as const;
export type WrongPenaltyRatio = (typeof WRONG_PENALTY_RATIOS)[number];

export class MockExamValidationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MockExamValidationError';
  }
}

export interface MockResultInput {
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  wrongPenaltyRatio: number;
}

export interface MockResultComputation {
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  net: number;
}

/**
 * FR-MOCK-04 — Boş ve net otomatik hesaplanır.
 *   Boş = Toplam - (Doğru + Yanlış)
 *   Net = Doğru - (Yanlış / katsayı)   [katsayı 0 ise Net = Doğru]
 */
export function computeMockResult(input: MockResultInput): MockResultComputation {
  const { correctCount, wrongCount, totalQuestions, wrongPenaltyRatio } = input;

  if (!Number.isInteger(correctCount) || !Number.isInteger(wrongCount) || correctCount < 0 || wrongCount < 0) {
    throw new MockExamValidationError(400, 'INVALID_COUNTS', 'Doğru ve yanlış sayıları negatif olamaz');
  }

  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) {
    throw new MockExamValidationError(400, 'INVALID_QUESTION_COUNT', 'Şablondaki soru sayısı pozitif olmalıdır');
  }

  if (correctCount + wrongCount > totalQuestions) {
    throw new MockExamValidationError(
      400,
      'QUESTION_COUNT_EXCEEDED',
      `Doğru + yanlış toplam soru sayısını aşamaz (${correctCount} + ${wrongCount} > ${totalQuestions})`,
    );
  }

  if (!isValidPenaltyRatio(wrongPenaltyRatio)) {
    throw new MockExamValidationError(
      400,
      'INVALID_PENALTY_RATIO',
      'Yanlış götürme katsayısı 0, 3 veya 4 olmalıdır',
    );
  }

  const blankCount = totalQuestions - (correctCount + wrongCount);
  const net =
    wrongPenaltyRatio === 0
      ? correctCount
      : round2(correctCount - wrongCount / wrongPenaltyRatio);

  return { correctCount, wrongCount, blankCount, net };
}

export function isValidPenaltyRatio(value: number): value is WrongPenaltyRatio {
  return (WRONG_PENALTY_RATIOS as readonly number[]).includes(value);
}

/**
 * FR-MOCK-03 — Kurum bazlı etki kilidi.
 * Okul tiplerinde deneme sınavı resmi karneye asla etki etmez; true istek 400 döner.
 */
export function resolveMockExamAffectsFinalGrade(
  institutionType: InstitutionType,
  requested: boolean | undefined,
): boolean {
  const affects = requested ?? false;

  switch (institutionType) {
    case InstitutionType.COURSE:
      return affects;
    case InstitutionType.UNIVERSITY:
      if (affects) {
        throw new MockExamValidationError(
          400,
          'MOCK_EXAM_DISABLED',
          'Üniversite kurum tipinde deneme sınavı modülü varsayılan olarak kapalıdır',
        );
      }
      return false;
    case InstitutionType.PRIMARY:
    case InstitutionType.MIDDLE:
    case InstitutionType.HIGH:
      if (affects) {
        throw new MockExamValidationError(
          400,
          'MOCK_EXAM_CANNOT_AFFECT_OFFICIAL_GRADE',
          'Okul kurumlarında deneme sınavı resmi karne veya sınıf geçme hesabına etki edemez',
        );
      }
      return false;
    default:
      return false;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
