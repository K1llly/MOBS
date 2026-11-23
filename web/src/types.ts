export type Role = 'MANAGER' | 'TEACHER' | 'STUDENT' | 'PARENT';

export type InstitutionType = 'COURSE' | 'PRIMARY' | 'MIDDLE' | 'HIGH' | 'UNIVERSITY';

export type MockExamPolicy = 'CONFIGURABLE' | 'LOCKED_FALSE' | 'DISABLED';

export interface PresetSummary {
  type: InstitutionType;
  gradingStrategy: string;
  gradeLevels: string[];
  roles: Role[];
  mockExamPolicy: MockExamPolicy;
  enabledModules: string[];
}

export interface SetupStatus {
  isInitialized: boolean;
  institution?: {
    id: string;
    name: string;
    type: InstitutionType;
    gradingStrategy: string;
    dailyPeriodCount: number;
  };
  featureFlags?: Record<string, boolean>;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  institutionId: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const INSTITUTION_LABELS: Record<InstitutionType, string> = {
  COURSE: 'Dershane / Kurs',
  PRIMARY: 'İlkokul (1–4)',
  MIDDLE: 'Ortaokul (5–8)',
  HIGH: 'Lise (9–12)',
  UNIVERSITY: 'Üniversite',
};

export const ROLE_LABELS: Record<Role, string> = {
  MANAGER: 'Yönetici',
  TEACHER: 'Öğretmen',
  STUDENT: 'Öğrenci',
  PARENT: 'Veli',
};
