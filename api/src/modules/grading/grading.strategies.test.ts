import { describe, expect, it } from 'vitest';
import { GradingStrategy, GradeType } from '@prisma/client';
import {
  DEFAULT_LETTER_SCALE,
  computeCgpa,
  computeGpa,
  computeWeightedAverage,
  evaluateAbsence,
  evaluateCertificate,
  evaluateHighSchoolClass,
  highSchoolCourseResult,
  letterGradeOf,
  middleSchoolCourseResult,
  strategyOf,
} from './grading.strategies';

describe('Ağırlıklı ortalama', () => {
  it('kurum politikasındaki ağırlıkları uygular', () => {
    const average = computeWeightedAverage(
      [
        { type: GradeType.WRITTEN, score: 80 },
        { type: GradeType.PERFORMANCE, score: 100 },
      ],
      { [GradeType.WRITTEN]: 2, [GradeType.PERFORMANCE]: 1 },
    );
    expect(average).toBe(86.67);
  });

  it('ders bazlı ağırlık politikayı geçersiz kılar', () => {
    const average = computeWeightedAverage(
      [
        { type: GradeType.WRITTEN, score: 40, weight: 3 },
        { type: GradeType.WRITTEN, score: 100, weight: 1 },
      ],
      { [GradeType.WRITTEN]: 1 },
    );
    expect(average).toBe(55);
  });

  it('ağırlık yoksa basit ortalama döner ve puan aralığını doğrular', () => {
    expect(computeWeightedAverage([{ type: GradeType.WRITTEN, score: 70 }, { type: GradeType.WRITTEN, score: 90 }])).toBe(80);
    expect(() => computeWeightedAverage([{ type: GradeType.WRITTEN, score: 120 }])).toThrow(RangeError);
    expect(computeWeightedAverage([])).toBe(0);
  });
});

describe('Ortaokul ders geçme barajı', () => {
  it('Türkçe için 70, diğer dersler için 50 barajı uygular', () => {
    expect(middleSchoolCourseResult({ courseName: 'Türkçe', isBarrier: true, firstTerm: 60, secondTerm: 85 }).passed).toBe(true);
    expect(middleSchoolCourseResult({ courseName: 'Türkçe', isBarrier: true, firstTerm: 60, secondTerm: 75 }).passed).toBe(false);
    expect(middleSchoolCourseResult({ courseName: 'Matematik', firstTerm: 45, secondTerm: 55 }).passed).toBe(true);
    expect(middleSchoolCourseResult({ courseName: 'Matematik', firstTerm: 40, secondTerm: 40 }).passed).toBe(false);
  });
});

describe('Lise ders geçme kuralı (50 veya 70)', () => {
  it('yıl sonu ortalaması 50 ise geçer', () => {
    expect(highSchoolCourseResult({ courseName: 'Fizik', firstTerm: 40, secondTerm: 60 }).passed).toBe(true);
  });

  it('ortalama 50 altında olsa da 2. dönem 70 ise geçer', () => {
    expect(highSchoolCourseResult({ courseName: 'Fizik', firstTerm: 20, secondTerm: 70 }).passed).toBe(true);
  });

  it('baraj dersten kalınca sorumluluk doğar', () => {
    const result = highSchoolCourseResult({
      courseName: 'Türk Dili ve Edebiyatı',
      isBarrier: true,
      firstTerm: 40,
      secondTerm: 45,
    });
    expect(result.passed).toBe(false);
    expect(result.requiresResponsibility).toBe(true);
  });

  it('tek dönem notu varsa onu kullanır', () => {
    expect(highSchoolCourseResult({ courseName: 'Kimya', secondTerm: 55 }).average).toBe(55);
    expect(highSchoolCourseResult({ courseName: 'Kimya' }).average).toBeNull();
  });
});

describe('Lise sınıf geçme / sorumluluk / kalma', () => {
  const failedCourse = (name: string, isBarrier = false) => ({
    courseName: name,
    isBarrier,
    average: 30,
    passed: false,
    requiresResponsibility: isBarrier,
  });

  it('tüm dersler başarılıysa doğrudan geçer', () => {
    const outcome = evaluateHighSchoolClass([
      { courseName: 'Matematik', isBarrier: false, average: 80, passed: true, requiresResponsibility: false },
    ]);
    expect(outcome.outcome).toBe('PASSED_DIRECT');
    expect(outcome.weakCourseCount).toBe(0);
  });

  it('en fazla 1 zayıf dersle doğrudan geçer', () => {
    const outcome = evaluateHighSchoolClass([failedCourse('Fizik')]);
    expect(outcome.outcome).toBe('PASSED_DIRECT');
  });

  it('2-3 zayıf derste sorumlu geçer', () => {
    expect(evaluateHighSchoolClass([failedCourse('Fizik'), failedCourse('Kimya')]).outcome).toBe(
      'PASSED_RESPONSIBLE',
    );
    expect(
      evaluateHighSchoolClass([failedCourse('Fizik'), failedCourse('Kimya'), failedCourse('Biyoloji')]).outcome,
    ).toBe('PASSED_RESPONSIBLE');
  });

  it('4 zayıf derste sınıf tekrarı olur', () => {
    const outcome = evaluateHighSchoolClass([
      failedCourse('Fizik'),
      failedCourse('Kimya'),
      failedCourse('Biyoloji'),
      failedCourse('Matematik'),
    ]);
    expect(outcome.outcome).toBe('FAILED');
  });

  it('alt sınıflardan gelen sorumluluklarla toplam 6 aşılırsa kalır', () => {
    const outcome = evaluateHighSchoolClass([failedCourse('Fizik'), failedCourse('Kimya')], {
      previousResponsibleCount: 5,
    });
    expect(outcome.outcome).toBe('FAILED');
  });

  it('baraj ders başarısızlığını raporlar', () => {
    const outcome = evaluateHighSchoolClass([failedCourse('Türk Dili ve Edebiyatı', true)]);
    expect(outcome.barrierFailures).toContain('Türk Dili ve Edebiyatı');
  });
});

describe('Devamsızlık kesicisi ve belgeler', () => {
  it('özürsüz 10 gün aşılırsa notlar ne olursa olsun kalır', () => {
    const result = evaluateAbsence({ unexcused: 11, excused: 0 });
    expect(result.status).toBe('FAILED');
    expect(result.reason).toContain('Özürsüz');
  });

  it('toplam 30 gün aşılırsa kalır', () => {
    expect(evaluateAbsence({ unexcused: 5, excused: 26 }).status).toBe('FAILED');
  });

  it('sınıra yaklaşınca uyarı verir', () => {
    expect(evaluateAbsence({ unexcused: 8 }).status).toBe('WARNING');
    expect(evaluateAbsence({ unexcused: 2 }).status).toBe('OK');
  });

  it('Takdir 85+, Teşekkür 70+ ve zayıf ders yoksa verilir', () => {
    expect(evaluateCertificate({ average: 90, hasWeakCourse: false, unexcusedAbsence: 2 })).toBe('TAKDIR');
    expect(evaluateCertificate({ average: 75, hasWeakCourse: false, unexcusedAbsence: 2 })).toBe('TESEKKUR');
    expect(evaluateCertificate({ average: 95, hasWeakCourse: true, unexcusedAbsence: 2 })).toBeNull();
    expect(evaluateCertificate({ average: 95, hasWeakCourse: false, unexcusedAbsence: 6 })).toBeNull();
    expect(evaluateCertificate({ average: 60, hasWeakCourse: false, unexcusedAbsence: 1 })).toBeNull();
  });
});

describe('Üniversite harf notu ve GPA', () => {
  it('AA–FF ölçeğini uygular', () => {
    expect(letterGradeOf(95).letter).toBe('AA');
    expect(letterGradeOf(85).letter).toBe('BA');
    expect(letterGradeOf(70).letter).toBe('CC');
    expect(letterGradeOf(49).letter).toBe('FF');
    expect(letterGradeOf(90, DEFAULT_LETTER_SCALE).gpaPoint).toBe(4);
  });

  it('kredi ağırlıklı GPA hesaplar', () => {
    expect(
      computeGpa([
        { letter: 'AA', gpaPoint: 4, credits: 6 },
        { letter: 'CC', gpaPoint: 2, credits: 4 },
      ]),
    ).toBe(3.2);
    expect(computeGpa([])).toBe(0);
  });

  it('CGPA önceki dönem kredileriyle birleştirir', () => {
    expect(computeCgpa({ gpa: 3, credits: 30 }, { gpa: 4, credits: 30 })).toBe(3.5);
    expect(computeCgpa(null, { gpa: 3.5, credits: 30 })).toBe(3.5);
  });
});

describe('Strateji yönlendiricisi', () => {
  it('her strateji için desteklenen özellikleri döner', () => {
    expect(strategyOf(GradingStrategy.PRIMARY_DEVELOPMENT).supportsDevelopmentReport).toBe(true);
    expect(strategyOf(GradingStrategy.PRIMARY_DEVELOPMENT).supportsNumericGrades).toBe(false);
    expect(strategyOf(GradingStrategy.UNIVERSITY_GPA).supportsLetterGrades).toBe(true);
    expect(strategyOf(GradingStrategy.HIGH_SCHOOL_MEB).supportsNumericGrades).toBe(true);
    expect(strategyOf(GradingStrategy.COURSE_SIMPLE).supportsNumericGrades).toBe(true);
  });
});
