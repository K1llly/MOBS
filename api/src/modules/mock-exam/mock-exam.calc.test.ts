import { describe, expect, it } from 'vitest';
import { InstitutionType } from '@prisma/client';
import {
  MockExamValidationError,
  computeMockResult,
  isValidPenaltyRatio,
  resolveMockExamAffectsFinalGrade,
} from './mock-exam.calc';

describe('Deneme sınavı net hesabı (FR-MOCK-04)', () => {
  it('4 yanlış 1 doğru götürür, boş otomatik hesaplanır', () => {
    expect(
      computeMockResult({ correctCount: 20, wrongCount: 8, totalQuestions: 30, wrongPenaltyRatio: 4 }),
    ).toEqual({ correctCount: 20, wrongCount: 8, blankCount: 2, net: 18 });
  });

  it('3 yanlış 1 doğru götürür ve net 2 ondalık basamağa yuvarlanır', () => {
    expect(
      computeMockResult({ correctCount: 10, wrongCount: 7, totalQuestions: 20, wrongPenaltyRatio: 3 }).net,
    ).toBe(7.67);
  });

  it('katsayı 0 ise net yalnızca doğru sayısıdır', () => {
    expect(
      computeMockResult({ correctCount: 12, wrongCount: 5, totalQuestions: 20, wrongPenaltyRatio: 0 }),
    ).toMatchObject({ blankCount: 3, net: 12 });
  });

  it('doğru + yanlış soru sayısını aşarsa 400 QUESTION_COUNT_EXCEEDED döner', () => {
    expect(() =>
      computeMockResult({ correctCount: 25, wrongCount: 10, totalQuestions: 30, wrongPenaltyRatio: 4 }),
    ).toThrowError(expect.objectContaining({ status: 400, code: 'QUESTION_COUNT_EXCEEDED' }));
  });

  it('geçersiz katsayıyı reddeder', () => {
    expect(isValidPenaltyRatio(4)).toBe(true);
    expect(isValidPenaltyRatio(2)).toBe(false);
    expect(() =>
      computeMockResult({ correctCount: 1, wrongCount: 1, totalQuestions: 10, wrongPenaltyRatio: 2 }),
    ).toThrow(MockExamValidationError);
  });
});

describe('Kurum bazlı etki kilidi (FR-MOCK-03)', () => {
  it('dershanede etkili/etkisiz seçilebilir', () => {
    expect(resolveMockExamAffectsFinalGrade(InstitutionType.COURSE, true)).toBe(true);
    expect(resolveMockExamAffectsFinalGrade(InstitutionType.COURSE, false)).toBe(false);
    expect(resolveMockExamAffectsFinalGrade(InstitutionType.COURSE, undefined)).toBe(false);
  });

  it('okul tiplerinde true isteği 400 ile reddedilir', () => {
    for (const type of [InstitutionType.PRIMARY, InstitutionType.MIDDLE, InstitutionType.HIGH]) {
      expect(resolveMockExamAffectsFinalGrade(type, undefined)).toBe(false);
      expect(() => resolveMockExamAffectsFinalGrade(type, true)).toThrowError(
        expect.objectContaining({ code: 'MOCK_EXAM_CANNOT_AFFECT_OFFICIAL_GRADE' }),
      );
    }
  });

  it('üniversitede modül kapalıdır', () => {
    expect(resolveMockExamAffectsFinalGrade(InstitutionType.UNIVERSITY, false)).toBe(false);
    expect(() => resolveMockExamAffectsFinalGrade(InstitutionType.UNIVERSITY, true)).toThrowError(
      expect.objectContaining({ code: 'MOCK_EXAM_DISABLED' }),
    );
  });
});
