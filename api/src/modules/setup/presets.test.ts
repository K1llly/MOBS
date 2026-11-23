import { describe, expect, it } from 'vitest';
import { GradingStrategy, InstitutionType } from '@prisma/client';
import {
  FEATURE_FLAGS,
  PRESETS,
  getPreset,
  validateRuleCompatibility,
  RuleCompatibilityError,
} from './presets';

describe('Preset Engine', () => {
  it('her kurum tipi için eksiksiz bir preset üretir', () => {
    for (const type of Object.values(InstitutionType)) {
      const preset = getPreset(type);
      expect(preset.type).toBe(type);
      expect(Object.keys(preset.featureFlags)).toHaveLength(FEATURE_FLAGS.length);
      expect(preset.rules).toBeTypeOf('object');
    }
  });

  it('kurum tipini doğru notlandırma stratejisine eşler', () => {
    expect(PRESETS.COURSE.gradingStrategy).toBe(GradingStrategy.COURSE_SIMPLE);
    expect(PRESETS.PRIMARY.gradingStrategy).toBe(GradingStrategy.PRIMARY_DEVELOPMENT);
    expect(PRESETS.MIDDLE.gradingStrategy).toBe(GradingStrategy.MIDDLE_SCHOOL_MEB);
    expect(PRESETS.HIGH.gradingStrategy).toBe(GradingStrategy.HIGH_SCHOOL_MEB);
    expect(PRESETS.UNIVERSITY.gradingStrategy).toBe(GradingStrategy.UNIVERSITY_GPA);
  });

  it('ilkokulda sayısal puanlama ve yazılı sınav kapalı, gelişim raporu açıktır', () => {
    const preset = PRESETS.PRIMARY;
    expect(preset.featureFlags.NUMERIC_GRADING).toBe(false);
    expect(preset.featureFlags.DEVELOPMENT_REPORT).toBe(true);
    expect(preset.rules.writtenExamAllowed).toBe(false);
    expect(preset.rules.retentionAllowed).toBe(false);
    expect(preset.gradeLevels.map((level) => level.level)).toEqual([1, 2, 3, 4]);
  });

  it('ortaokulda Türkçe 70 / diğer dersler 50 barajı ve ŞÖK akışı tanımlıdır', () => {
    const preset = PRESETS.MIDDLE;
    expect(preset.rules.turkishPassingScore).toBe(70);
    expect(preset.rules.defaultPassingScore).toBe(50);
    expect(preset.featureFlags.COUNCIL_CASE).toBe(true);
    expect(preset.gradeLevels.map((level) => level.level)).toEqual([5, 6, 7, 8]);
  });

  it('lisede 50/70 kuralı, 3/6 sorumluluk ve 10/30 devamsızlık tanımlıdır', () => {
    const preset = PRESETS.HIGH;
    expect(preset.rules.coursePassAverage).toBe(50);
    expect(preset.rules.coursePassSecondTerm).toBe(70);
    expect(preset.rules.maxResponsibleCoursesPerYear).toBe(3);
    expect(preset.rules.maxResponsibleCoursesTotal).toBe(6);
    expect(preset.rules.unexcusedAbsenceLimit).toBe(10);
    expect(preset.rules.totalAbsenceLimit).toBe(30);
  });

  it('okul tiplerinde deneme sınavı karneye etkisiz kilitlidir', () => {
    for (const type of [InstitutionType.PRIMARY, InstitutionType.MIDDLE, InstitutionType.HIGH]) {
      expect(getPreset(type).mockExamPolicy).toBe('LOCKED_FALSE');
      expect(getPreset(type).rules.mockExamAffectsFinalGrade).toBe('LOCKED_FALSE');
    }
    expect(getPreset(InstitutionType.COURSE).mockExamPolicy).toBe('CONFIGURABLE');
    expect(getPreset(InstitutionType.UNIVERSITY).mockExamPolicy).toBe('DISABLED');
  });

  it('üniversitede AA–FF, AKTS ve Ekle-Sil modülleri açıktır', () => {
    const preset = PRESETS.UNIVERSITY;
    expect(preset.rules.gradingSystem).toBe('AA_FF');
    expect(preset.featureFlags.ADD_DROP).toBe(true);
    expect(preset.featureFlags.PREREQUISITE_ENGINE).toBe(true);
    expect(preset.featureFlags.ADVISOR_APPROVAL).toBe(true);
    expect(preset.featureFlags.PARENT_PORTAL).toBe(false);
  });

  it('ilkokulda sayısal puanlama zorlanırsa uyumsuzluk hatası verir (FR-SETUP-03)', () => {
    expect(() => validateRuleCompatibility(InstitutionType.PRIMARY, { numericGrading: true })).toThrow(
      RuleCompatibilityError,
    );
    expect(() => validateRuleCompatibility(InstitutionType.MIDDLE, { numericGrading: true })).not.toThrow();
  });

  it('AA–FF harf notu yalnızca üniversitede kullanılabilir', () => {
    expect(() => validateRuleCompatibility(InstitutionType.HIGH, { letterGradeSystem: true })).toThrow(
      /AA–FF/,
    );
    expect(() => validateRuleCompatibility(InstitutionType.UNIVERSITY, { letterGradeSystem: true })).not.toThrow();
  });
});
