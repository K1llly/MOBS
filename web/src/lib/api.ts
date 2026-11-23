import type {
  AuthUser,
  AttendanceStatus,
  AttendanceSummary,
  AutoFillResult,
  ClassDetail,
  ClassSummary,
  CourseSummary,
  GradeRow,
  GradeType,
  LoginResponse,
  MockHistory,
  MockRanking,
  MockSession,
  MockTemplate,
  PresetSummary,
  ReportCard,
  ScheduleData,
  SetupStatus,
  StudentSummary,
  TeacherSummary,
  TermSummary,
  UserSummary,
} from '../types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

const TOKEN_KEY = 'mobs.token';
const USER_KEY = 'mobs.user';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeSession(response: LoginResponse): void {
  localStorage.setItem(TOKEN_KEY, response.token);
  localStorage.setItem(USER_KEY, JSON.stringify(response.user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => ({}))) as {
    error?: { code: string; message: string; details?: unknown };
  };

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN_ERROR',
      body.error?.message ?? 'Beklenmeyen bir hata oluştu',
      body.error?.details,
    );
  }

  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, payload?: unknown) =>
  request<T>(path, {
    method: 'POST',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
const put = <T>(path: string, payload: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(payload) });
const patch = <T>(path: string, payload: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(payload) });

export const api = {
  setupStatus: () => get<SetupStatus>('/setup/status'),
  setupPresets: () => get<{ presets: PresetSummary[] }>('/setup/presets'),
  initialize: (payload: unknown) =>
    post<{ institutionId: string; adminUsername: string }>('/setup/initialize', payload),
  login: (username: string, password: string) =>
    post<LoginResponse>('/auth/login', { username, password }),
  me: () => get<AuthUser>('/auth/me'),

  terms: () => get<TermSummary[]>('/terms'),

  classes: {
    list: () => get<ClassSummary[]>('/classes'),
    get: (id: string) => get<ClassDetail>(`/classes/${id}`),
    create: (payload: { name: string; capacity: number; gradeLevel?: number }) =>
      post<ClassSummary>('/classes', payload),
    enroll: (classId: string, studentId: string) =>
      post<unknown>(`/classes/${classId}/students`, { studentId }),
    assignCourse: (
      classId: string,
      payload: { courseId: string; teacherId?: string; weeklyHours?: number },
    ) => post<unknown>(`/classes/${classId}/courses`, payload),
  },

  courses: {
    list: () => get<CourseSummary[]>('/courses'),
    create: (payload: {
      code: string;
      name: string;
      weeklyHours: number;
      isBarrier: boolean;
      ects?: number;
      credits?: number;
    }) => post<CourseSummary>('/courses', payload),
  },

  users: {
    list: (role?: string) =>
      get<UserSummary[]>(`/users${role ? `?role=${encodeURIComponent(role)}` : ''}`),
    create: (payload: {
      username: string;
      password: string;
      fullName: string;
      role: string;
      branch?: string;
      studentNumber?: string;
      classId?: string;
      childrenIds?: string[];
    }) => post<unknown>('/users', payload),
    setStatus: (id: string, isActive: boolean) =>
      patch<unknown>(`/users/${id}/status`, { isActive }),
  },

  teachers: {
    list: () => get<TeacherSummary[]>('/teachers'),
    availability: {
      me: () =>
        get<{
          teacherId: string;
          fullName: string;
          slots: Array<{ dayOfWeek: number; period: number; status: 'AVAILABLE' | 'PREFER_NOT' | 'UNAVAILABLE' }>;
        }>('/teachers/me/availability'),
      setMe: (
        slots: Array<{
          dayOfWeek: number;
          period: number;
          status: 'AVAILABLE' | 'PREFER_NOT' | 'UNAVAILABLE';
        }>,
      ) => put<unknown>('/teachers/me/availability', { slots }),
    },
  },

  students: {
    list: (classId?: string) =>
      get<StudentSummary[]>(`/students${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`),
  },

  grades: {
    list: (studentId: string, termId?: string) =>
      get<GradeRow[]>(
        `/students/${studentId}/grades${termId ? `?termId=${encodeURIComponent(termId)}` : ''}`,
      ),
    reportCard: (studentId: string, termId?: string) =>
      get<ReportCard>(
        `/students/${studentId}/report-card${termId ? `?termId=${encodeURIComponent(termId)}` : ''}`,
      ),
    enter: (
      studentId: string,
      payload: { courseId: string; type: GradeType; score: number; weight?: number; termId?: string },
    ) => post<GradeRow>(`/students/${studentId}/grades`, payload),
  },

  attendance: {
    bulk: (
      records: Array<{
        studentId: string;
        classCourseId: string;
        date: string;
        period: number;
        status: AttendanceStatus;
        note?: string;
      }>,
    ) => post<{ saved: number }>('/attendance/bulk', { records }),
    summary: (studentId: string) => get<AttendanceSummary>(`/students/${studentId}/attendance`),
  },

  mockExams: {
    templates: () => get<MockTemplate[]>('/mock-exams/templates'),
    createTemplate: (payload: {
      name: string;
      wrongPenaltyRatio: number;
      sections: Array<{ name: string; questionCount: number }>;
    }) => post<MockTemplate>('/mock-exams/templates', payload),
    sessions: () => get<MockSession[]>('/mock-exams/sessions'),
    createSession: (payload: {
      templateId: string;
      name: string;
      examDate: string;
      schoolClassId?: string;
      affectsFinalGrade?: boolean;
      weightIfAffected?: number;
    }) => post<MockSession>('/mock-exams/sessions', payload),
    enterResult: (
      sessionId: string,
      payload: { studentId: string; sectionId: string; correctCount: number; wrongCount: number },
    ) => post<unknown>(`/mock-exams/sessions/${sessionId}/results`, payload),
    ranking: (sessionId: string) =>
      get<MockRanking>(`/mock-exams/sessions/${sessionId}/ranking`),
    student: (studentId: string) => get<MockHistory>(`/students/${studentId}/mock-exams`),
  },

  schedule: {
    get: () => get<ScheduleData>('/schedule'),
    autoFill: () => post<AutoFillResult>('/schedule/auto-fill', {}),
    publish: (planId: string) => post<unknown>('/schedule/publish', { planId }),
    pin: (slotId: string, isPinned: boolean) =>
      patch<unknown>(`/schedule/slots/${slotId}/pin`, { isPinned }),
  },
};
