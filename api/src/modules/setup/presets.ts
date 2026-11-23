import { GradeType, GradingStrategy, InstitutionType, Role } from '@prisma/client';

/** Kurum oluşturma aracının ürettiği özellik bayrakları. */
export const FEATURE_FLAGS = [
  'MOCK_EXAM',
  'DEVELOPMENT_REPORT',
  'NUMERIC_GRADING',
  'REPORT_CARD',
  'ADD_DROP',
  'PREREQUISITE_ENGINE',
  'ADVISOR_APPROVAL',
  'COUNCIL_CASE',
  'RESPONSIBILITY_EXAM',
  'HONOR_CERTIFICATE',
  'ATTENDANCE_CIRCUIT_BREAKER',
  'AUTO_SCHEDULING',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];

export type MockExamPolicy = 'CONFIGURABLE' | 'LOCKED_FALSE' | 'DISABLED';

export interface GradeLevelPreset {
  level: number;
  name: string;
}

export interface GradePolicyPreset {
  gradeType: GradeType;
  weight: number;
}

export interface InstitutionPreset {
  type: InstitutionType;
  gradingStrategy: GradingStrategy;
  gradeLevels: GradeLevelPreset[];
  roles: Role[];
  featureFlags: Record<FeatureFlagKey, boolean>;
  rules: Record<string, unknown>;
  gradePolicies: GradePolicyPreset[];
  mockExamPolicy: MockExamPolicy;
}

const baseFlags: Record<FeatureFlagKey, boolean> = {
  MOCK_EXAM: false,
  DEVELOPMENT_REPORT: false,
  NUMERIC_GRADING: false,
  REPORT_CARD: true,
  ADD_DROP: false,
  PREREQUISITE_ENGINE: false,
  ADVISOR_APPROVAL: false,
  COUNCIL_CASE: false,
  RESPONSIBILITY_EXAM: false,
  HONOR_CERTIFICATE: false,
  ATTENDANCE_CIRCUIT_BREAKER: false,
  AUTO_SCHEDULING: true,
};

const schoolGradeLevels = (from: number, to: number): GradeLevelPreset[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({
    level: from + index,
    name: `${from + index}. Sınıf`,
  }));

/**
 * Seviye 1 — Dershane / Dil Kursu / Etüt Merkezi.
 * Kur/grup yapısı, tek baraj puanı, deneme sınavı etkisi yöneticiye bırakılır.
 */
const coursePreset: InstitutionPreset = {
  type: InstitutionType.COURSE,
  gradingStrategy: GradingStrategy.COURSE_SIMPLE,
  gradeLevels: [{ level: 1, name: 'Kur 1' }],
  roles: [Role.MANAGER, Role.TEACHER, Role.STUDENT],
  featureFlags: {
    ...baseFlags,
    MOCK_EXAM: true,
    NUMERIC_GRADING: true,
    },
  rules: {
    coursePassingScore: 60,
    mockExamAffectsFinalGrade: 'CONFIGURABLE',
    absenceWarningThreshold: 3,
    retentionAllowed: false,
  },
  gradePolicies: [{ gradeType: GradeType.COURSE_EXAM, weight: 1 }],
  mockExamPolicy: 'CONFIGURABLE',
};

/** Seviye 2a — İlkokul (1–4): 0–100 puan ve yazılı sınav yok, gelişim raporu var. */
const primaryPreset: InstitutionPreset = {
  type: InstitutionType.PRIMARY,
  gradingStrategy: GradingStrategy.PRIMARY_DEVELOPMENT,
  gradeLevels: schoolGradeLevels(1, 4),
  roles: [Role.MANAGER, Role.TEACHER, Role.STUDENT],
  featureFlags: {
    ...baseFlags,
    MOCK_EXAM: true,
    DEVELOPMENT_REPORT: true,
    NUMERIC_GRADING: false,
    REPORT_CARD: true,
  },
  rules: {
    numericGradingAllowed: false,
    writtenExamAllowed: false,
    mockExamAffectsFinalGrade: 'LOCKED_FALSE',
    retentionAllowed: false,
  },
  gradePolicies: [],
  mockExamPolicy: 'LOCKED_FALSE',
};

/** Seviye 2b — Ortaokul (5–8): 0–100, Türkçe ≥ 70 / diğerleri ≥ 50, ŞÖK akışı. */
const middlePreset: InstitutionPreset = {
  type: InstitutionType.MIDDLE,
  gradingStrategy: GradingStrategy.MIDDLE_SCHOOL_MEB,
  gradeLevels: schoolGradeLevels(5, 8),
  roles: [Role.MANAGER, Role.TEACHER, Role.STUDENT],
  featureFlags: {
    ...baseFlags,
    MOCK_EXAM: true,
    NUMERIC_GRADING: true,
    COUNCIL_CASE: true,
    ATTENDANCE_CIRCUIT_BREAKER: true,
  },
  rules: {
    numericGradingAllowed: true,
    turkishPassingScore: 70,
    defaultPassingScore: 50,
    mockExamAffectsFinalGrade: 'LOCKED_FALSE',
    unexcusedAbsenceLimit: 10,
    totalAbsenceLimit: 30,
    retentionAllowed: false,
    councilCaseOnFailure: true,
  },
  gradePolicies: [
    { gradeType: GradeType.WRITTEN, weight: 2 },
    { gradeType: GradeType.PERFORMANCE, weight: 1 },
    { gradeType: GradeType.PROJECT, weight: 1 },
  ],
  mockExamPolicy: 'LOCKED_FALSE',
};

/** Seviye 2c — Lise (9–12): 50/70 ders geçme, sorumlu geçme 3/6, 10/30 devamsızlık. */
const highPreset: InstitutionPreset = {
  type: InstitutionType.HIGH,
  gradingStrategy: GradingStrategy.HIGH_SCHOOL_MEB,
  gradeLevels: schoolGradeLevels(9, 12),
  roles: [Role.MANAGER, Role.TEACHER, Role.STUDENT],
  featureFlags: {
    ...baseFlags,
    MOCK_EXAM: true,
    NUMERIC_GRADING: true,
    COUNCIL_CASE: true,
    RESPONSIBILITY_EXAM: true,
    HONOR_CERTIFICATE: true,
    ATTENDANCE_CIRCUIT_BREAKER: true,
  },
  rules: {
    numericGradingAllowed: true,
    coursePassAverage: 50,
    coursePassSecondTerm: 70,
    defaultPassingScore: 50,
    maxFailedCoursesForDirectPass: 1,
    maxResponsibleCoursesPerYear: 3,
    maxResponsibleCoursesTotal: 6,
    classRepetitionFailedCourses: 4,
    unexcusedAbsenceLimit: 10,
    totalAbsenceLimit: 30,
    honorThreshold: 85,
    thanksThreshold: 70,
    honorMaxUnexcusedAbsence: 5,
    semesterWeighting: 'WEEKLY_HOURS',
    mockExamAffectsFinalGrade: 'LOCKED_FALSE',
    barrierCourseRequiresResponsibility: true,
  },
  gradePolicies: [
    { gradeType: GradeType.WRITTEN, weight: 2 },
    { gradeType: GradeType.PERFORMANCE, weight: 1 },
    { gradeType: GradeType.PROJECT, weight: 1 },
  ],
  mockExamPolicy: 'LOCKED_FALSE',
};

/** Seviye 3 — Üniversite: AA–FF, AKTS/ön koşul, Ekle-Sil + danışman onayı. */
const universityPreset: InstitutionPreset = {
  type: InstitutionType.UNIVERSITY,
  gradingStrategy: GradingStrategy.UNIVERSITY_GPA,
  gradeLevels: [],
  roles: [Role.MANAGER, Role.TEACHER, Role.STUDENT],
  featureFlags: {
    ...baseFlags,
    MOCK_EXAM: false,
    NUMERIC_GRADING: false,
    REPORT_CARD: true,
    ADD_DROP: true,
    PREREQUISITE_ENGINE: true,
    ADVISOR_APPROVAL: true,
  },
  rules: {
    gradingSystem: 'AA_FF',
    relativeGradingAllowed: true,
    mockExamAffectsFinalGrade: 'DISABLED',
    maxEctsByCgpa: [
      { minCgpa: 0, maxEcts: 25 },
      { minCgpa: 2.0, maxEcts: 30 },
      { minCgpa: 3.0, maxEcts: 40 },
    ],
    makeUpOverridesFinal: true,
    addDropLockBySchedule: true,
  },
  gradePolicies: [
    { gradeType: GradeType.MIDTERM, weight: 0.4 },
    { gradeType: GradeType.PROJECT, weight: 0.1 },
    { gradeType: GradeType.LAB, weight: 0.1 },
    { gradeType: GradeType.FINAL, weight: 0.4 },
  ],
  mockExamPolicy: 'DISABLED',
};

export const PRESETS: Record<InstitutionType, InstitutionPreset> = {
  [InstitutionType.COURSE]: coursePreset,
  [InstitutionType.PRIMARY]: primaryPreset,
  [InstitutionType.MIDDLE]: middlePreset,
  [InstitutionType.HIGH]: highPreset,
  [InstitutionType.UNIVERSITY]: universityPreset,
};

export function getPreset(type: InstitutionType): InstitutionPreset {
  return PRESETS[type];
}

/**
 * FR-SETUP-03 — Kurum tipine aykırı kural kombinasyonlarını engeller.
 * Örn. ilkokulda 0–100 yazılı sınav, lisede AA–FF harf notu.
 */
export function validateRuleCompatibility(
  type: InstitutionType,
  overrides: { numericGrading?: boolean; letterGradeSystem?: boolean } = {},
): void {
  const preset = getPreset(type);

  if (overrides.numericGrading === true && preset.rules.numericGradingAllowed !== true) {
    throw new RuleCompatibilityError(
      'NUMERIC_GRADING_NOT_ALLOWED',
      `${type} kurum tipinde 0–100 sayısal puanlama kullanılamaz`,
    );
  }

  if (overrides.letterGradeSystem === true && type !== InstitutionType.UNIVERSITY) {
    throw new RuleCompatibilityError(
      'LETTER_GRADE_NOT_ALLOWED',
      'AA–FF harf notu yalnızca üniversite kurum tipinde kullanılabilir',
    );
  }
}

export class RuleCompatibilityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RuleCompatibilityError';
  }
}
