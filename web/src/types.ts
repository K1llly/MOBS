export type Role = 'MANAGER' | 'TEACHER' | 'STUDENT';

export type InstitutionType = 'COURSE' | 'PRIMARY' | 'MIDDLE' | 'HIGH' | 'UNIVERSITY';

export type MockExamPolicy = 'CONFIGURABLE' | 'LOCKED_FALSE' | 'DISABLED';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';

export type GradeType =
  | 'WRITTEN'
  | 'PERFORMANCE'
  | 'PROJECT'
  | 'QUIZ'
  | 'COURSE_EXAM'
  | 'MIDTERM'
  | 'FINAL'
  | 'MAKEUP'
  | 'LAB';

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

export interface ClassSummary {
  id: string;
  name: string;
  capacity: number;
  studentCount: number;
  courseCount: number;
  gradeLevel: number | null;
  homeRoom: string | null;
  isFull: boolean;
}

export interface ClassDetail {
  id: string;
  name: string;
  capacity: number;
  gradeLevel: number | null;
  homeRoom: string | null;
  courses: Array<{
    id: string;
    courseId: string;
    courseName: string;
    code: string;
    weeklyHours: number;
    blockPattern: number[];
    teacherId: string | null;
    teacherName: string | null;
  }>;
  students: Array<{ id: string; studentNumber: string; fullName: string }>;
}

export interface CourseSummary {
  id: string;
  code: string;
  name: string;
  weeklyHours: number;
  isBarrier: boolean;
  ects: number | null;
  credits: number | null;
  classCount: number;
  teachers: Array<{ id: string; fullName: string; branch: string | null }>;
}

export interface GradeLevelSummary {
  id: string;
  level: number;
  name: string;
}

export interface TermSummary {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  branch: string | null;
  studentNumber: string | null;
  classId: string | null;
  className: string | null;
}

export interface TeacherSummary {
  id: string;
  userId: string;
  fullName: string;
  branch: string | null;
  courseCount: number;
}

export interface StudentSummary {
  id: string;
  studentNumber: string;
  fullName: string;
  classId: string | null;
  className: string | null;
}

export interface GradeRow {
  id: string;
  courseId: string;
  courseName: string;
  termId: string;
  termName: string;
  type: GradeType;
  score: number;
  weight: number | null;
  createdAt: string;
}

export interface ReportCard {
  student: { id: string; fullName: string; studentNumber: string; className: string | null };
  term: { id: string; name: string; startDate: string; endDate: string };
  strategy: string;
  average: number | null;
  gpa?: number | null;
  totalCredits?: number;
  standing: string;
  certificate: string | null;
  failedCourses?: string[];
  responsibleCourses?: string[];
  councilReason?: string | null;
  developmentReport?: boolean;
  absence: {
    status: 'OK' | 'WARNING' | 'FAILED';
    unexcused: number;
    excused: number;
    total: number;
    reason?: string;
  };
  courses: Array<{
    courseId: string;
    courseName: string;
    weeklyHours?: number;
    isBarrier?: boolean;
    firstTerm?: number | null;
    secondTerm?: number | null;
    average?: number | null;
    passed?: boolean;
    letterGrade?: string | null;
    gpaPoint?: number | null;
    credits?: number;
    entries?: Array<{ type: GradeType; score: number }>;
  }>;
}

export interface MockTemplate {
  id: string;
  name: string;
  wrongPenaltyRatio: number;
  sessionCount: number;
  totalQuestions: number;
  sections: Array<{
    id: string;
    name: string;
    courseId: string | null;
    courseName: string | null;
    questionCount: number;
  }>;
}

export interface MockSession {
  id: string;
  name: string;
  examDate: string;
  status: 'PLANNED' | 'COMPLETED';
  templateId: string;
  templateName: string;
  wrongPenaltyRatio: number;
  totalQuestions: number;
  className: string | null;
  affectsFinalGrade: boolean;
  weightIfAffected: number | null;
  resultCount: number;
  sections: Array<{ id: string; name: string; questionCount: number }>;
}

export interface MockRanking {
  session: {
    id: string;
    name: string;
    examDate: string;
    templateName: string;
    className: string | null;
    affectsFinalGrade: boolean;
  };
  rows: Array<{
    studentId: string;
    fullName: string;
    studentNumber: string;
    net: number;
    correct: number;
    wrong: number;
    blank: number;
    rank: number;
    sections: Array<{ name: string; correct: number; wrong: number; blank: number; net: number }>;
  }>;
}

export interface MockHistory {
  student: { id: string; fullName: string; studentNumber: string; className: string | null };
  history: Array<{
    sessionId: string;
    sessionName: string;
    examDate: string;
    templateId: string;
    templateName: string;
    totalQuestions: number;
    className: string | null;
    affectsFinalGrade: boolean;
    net: number;
    rank: number;
    participants: number;
    sections: Array<{ sectionId: string; name: string; correct: number; wrong: number; blank: number; net: number }>;
  }>;
}

export interface ScheduleData {
  term: { id: string; name: string };
  plan: { id: string; name: string; status: 'DRAFT' | 'PUBLISHED' } | null;
  slots: Array<{
    id: string;
    dayOfWeek: number;
    period: number;
    isPinned: boolean;
    classId: string;
    className: string;
    courseId: string;
    courseName: string;
    teacherId: string | null;
    teacherName: string | null;
    roomName: string | null;
  }>;
}

export interface AutoFillResult {
  planId: string;
  planName: string;
  placedCount: number;
  unplaced: Array<{ blockId: string; classCourseId: string; label: string; reason: string }>;
}

export interface DashboardSummary {
  counts: { classes: number; students: number; teachers: number; courses: number; mockExamSessions: number };
  attendance: {
    limits: { unexcusedLimit: number; totalLimit: number };
    failed: number;
    warning: number;
    atRisk: AttendanceOverviewRow[];
  };
  council: { open: number };
  schedule: { published: boolean; planName: string | null };
  term: { id: string; name: string };
}

export interface AttendanceOverviewRow {
  studentId: string;
  fullName: string;
  studentNumber: string;
  classId: string | null;
  className: string | null;
  unexcused: number;
  excused: number;
  total: number;
  status: 'OK' | 'WARNING' | 'FAILED';
  reason?: string;
}

export interface AttendanceOverview {
  term: { id: string; name: string };
  limits: { unexcusedLimit: number; totalLimit: number };
  rows: AttendanceOverviewRow[];
  summary: { total: number; failed: number; warning: number };
}

export interface CouncilCase {
  id: string;
  studentId: string;
  fullName: string;
  studentNumber: string;
  className: string | null;
  termName: string;
  reason: string;
  status: 'OPEN' | 'RESOLVED' | 'CLOSED';
  decision: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface GradePolicy {
  id: string;
  courseId: string | null;
  courseName: string | null;
  gradeType: GradeType;
  weight: number;
}

export interface BulkReportRow {
  student: { id: string; fullName: string; studentNumber: string; className: string | null };
  average: number | null;
  standing: string;
  certificate: string | null;
  absence: { status: 'OK' | 'WARNING' | 'FAILED'; unexcused: number; excused: number; total: number };
  courseCount: number;
  failedCourses: string[];
}

export interface AttendanceSummary {
  student: { id: string; fullName: string; studentNumber: string; className: string | null };
  term: { id: string; name: string };
  summary: {
    status: 'OK' | 'WARNING' | 'FAILED';
    unexcused: number;
    excused: number;
    total: number;
    reason?: string;
    unexcusedLimit: number;
    totalLimit: number;
  };
  records: Array<{
    id: string;
    date: string;
    period: number;
    status: AttendanceStatus;
    courseName: string;
    note: string | null;
  }>;
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
};

export const GRADE_TYPE_LABELS: Record<GradeType, string> = {
  WRITTEN: 'Yazılı',
  PERFORMANCE: 'Ders Etkinliği',
  PROJECT: 'Proje',
  QUIZ: 'Kısa Sınav',
  COURSE_EXAM: 'Kur Sınavı',
  MIDTERM: 'Vize',
  FINAL: 'Final',
  MAKEUP: 'Bütünleme',
  LAB: 'Laboratuvar',
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Var',
  ABSENT: 'Özürsüz',
  EXCUSED: 'Özürlü',
  LATE: 'Geç',
};

export const STANDING_LABELS: Record<string, string> = {
  ACTIVE: 'Devam ediyor',
  PASSED: 'Geçti',
  RESPONSIBLE: 'Sorumlu geçti',
  FAILED: 'Kaldı',
  EXEMPT: 'Muaf',
  COUNCIL_PENDING: 'ŞÖK gündeminde',
};
