import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, clearSession, getStoredUser } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { menuFor } from '../lib/menu';
import { Badge } from '../components/ui';
import {
  INSTITUTION_LABELS,
  ROLE_LABELS,
  STANDING_LABELS,
  type SetupStatus,
} from '../types';
import AttendancePage from './AttendancePage';
import AvailabilityPage from './AvailabilityPage';
import ClassesPage from './ClassesPage';
import CoursesPage from './CoursesPage';
import GradesPage from './GradesPage';
import MockExamsPage from './MockExamsPage';
import MyClassesPage from './MyClassesPage';
import CouncilPage from './CouncilPage';
import ReportCardPage from './ReportCardPage';
import WeightsPage from './WeightsPage';
import SchedulePage from './SchedulePage';
import UsersPage from './UsersPage';

interface DashboardProps {
  status: SetupStatus;
}

export default function Dashboard({ status }: DashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user] = useState(getStoredUser);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const flags = status.featureFlags ?? {};
  const menu = menuFor(user.role, flags);
  const active = menu.find((item) => location.pathname === item.path) ?? menu[0];

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">MOBS</p>
          <p className="mt-1 truncate text-sm font-semibold">{status.institution?.name}</p>
          <p className="text-xs text-slate-500">
            {status.institution ? INSTITUTION_LABELS[status.institution.type] : ''}
          </p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {menu.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                active.path === item.path
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold">{active.label}</h1>
            <p className="text-xs text-slate-500">Ders programı: {status.institution?.dailyPeriodCount} ders saati</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <p className="text-sm font-medium">{user.fullName}</p>
            <p className="text-xs text-slate-500">
              {ROLE_LABELS[user.role]} · @{user.username}
            </p>
            <button
              type="button"
              onClick={logout}
              className="text-xs font-semibold text-slate-400 underline-offset-2 transition hover:text-red-600 hover:underline"
            >
              Çıkış Yap
            </button>
          </div>
        </header>

        <main className="flex-1 p-6">
          {active.path === '/dashboard' ? (
            <Overview status={status} />
          ) : active.path === '/dashboard/classes' ? (
            <ClassesPage />
          ) : active.path === '/dashboard/courses' ? (
            <CoursesPage />
          ) : active.path === '/dashboard/my-classes' ? (
            <MyClassesPage />
          ) : active.path === '/dashboard/users' ? (
            <UsersPage />
          ) : active.path === '/dashboard/grading' || active.path === '/dashboard/grades' ? (
            <GradesPage />
          ) : active.path === '/dashboard/mock-exams' || active.path === '/dashboard/mock-results' ? (
            <MockExamsPage institutionType={status.institution?.type} />
          ) : active.path === '/dashboard/schedule' ? (
            <SchedulePage dailyPeriodCount={status.institution?.dailyPeriodCount} />
          ) : active.path === '/dashboard/availability' ? (
            <AvailabilityPage />
          ) : active.path === '/dashboard/attendance' ? (
            <AttendancePage />
          ) : active.path === '/dashboard/council' ? (
            <CouncilPage />
          ) : active.path === '/dashboard/weights' ? (
            <WeightsPage />
          ) : active.path === '/dashboard/report-card' || active.path === '/dashboard/reports' ? (
            <ReportCardPage />
          ) : (
            <section className="card">
              <h2 className="text-base font-semibold">{active.label}</h2>
              <p className="mt-2 text-sm text-slate-600">
                Bu modülün ekranı Sprint 3'te ilgili user story kapsamında tamamlanacaktır. API sözleşmesi ve
                veri modeli hazırdır.
              </p>
              <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-slate-700">Rol:</span> {ROLE_LABELS[user.role]}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Kurum tipi:</span>{' '}
                  {status.institution ? INSTITUTION_LABELS[status.institution.type] : '—'}
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Overview({ status }: DashboardProps) {
  const user = getStoredUser();
  const navigate = useNavigate();
  const role = user?.role;

  const summary = useApi(
    () => (role === 'MANAGER' ? api.dashboard.summary() : Promise.resolve(null)),
    [role],
  );

  const self = useApi(
    () =>
      role === 'STUDENT'
        ? api.students.list().then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
    [role],
  );
  const selfId = self.data?.id;
  const report = useApi(
    () => (selfId ? api.grades.reportCard(selfId) : Promise.resolve(null)),
    [selfId],
  );
  const attendance = useApi(
    () => (selfId ? api.attendance.summary(selfId) : Promise.resolve(null)),
    [selfId],
  );
  const mockHistory = useApi(
    () => (selfId ? api.mockExams.student(selfId) : Promise.resolve(null)),
    [selfId],
  );

  const myCourses = useApi(
    () => (role === 'TEACHER' ? api.teachers.myCourses() : Promise.resolve([])),
    [role],
  );
  const mySchedule = useApi(
    () => (role === 'TEACHER' ? api.schedule.get() : Promise.resolve(null)),
    [role],
  );

  const flags = status.featureFlags ?? {};
  const enabled = Object.entries(flags)
    .filter(([, value]) => value)
    .map(([key]) => key);

  const uniqueClasses = new Set((myCourses.data ?? []).map((course) => course.classId));
  const today = new Date().getDay() || 7;
  const todaySlots = (mySchedule.data?.slots ?? []).filter((slot) => slot.dayOfWeek === today);
  const lastMock = mockHistory.data?.history[mockHistory.data.history.length - 1];

  return (
    <div className="space-y-6">
      {role === 'MANAGER' && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="card">
              <p className="text-xs font-semibold uppercase text-slate-400">Kurum</p>
              <p className="mt-1 text-lg font-semibold">{status.institution?.name}</p>
              <p className="text-sm text-slate-500">
                {status.institution ? INSTITUTION_LABELS[status.institution.type] : ''}
              </p>
            </article>
            <article className="card">
              <p className="text-xs font-semibold uppercase text-slate-400">Notlandırma</p>
              <p className="mt-1 font-mono text-sm">{status.institution?.gradingStrategy}</p>
              <p className="text-sm text-slate-500">Strateji deseni ile yönetilir</p>
            </article>
            {summary.data && (
              <>
                <article className="card">
                  <p className="text-xs font-semibold uppercase text-slate-400">Öğrenci / Öğretmen</p>
                  <p className="mt-1 text-lg font-semibold">
                    {summary.data.counts.students} / {summary.data.counts.teachers}
                  </p>
                  <p className="text-sm text-slate-500">
                    {summary.data.counts.classes} şube · {summary.data.counts.courses} ders
                  </p>
                </article>
                <article className="card">
                  <p className="text-xs font-semibold uppercase text-slate-400">Devamsızlık riski</p>
                  <p className="mt-1 text-lg font-semibold text-amber-700">
                    {summary.data.attendance.failed} / {summary.data.attendance.warning}
                  </p>
                  <p className="text-sm text-slate-500">sınır aşan / sınıra yakın</p>
                </article>
              </>
            )}
          </section>

          {summary.data && (
            <section className="grid gap-4 xl:grid-cols-2">
              <div className="card">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Devamsızlık uyarıları</h2>
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-600"
                    onClick={() => navigate('/dashboard/council')}
                  >
                    ŞÖK yönetimi →
                  </button>
                </div>
                {summary.data.attendance.atRisk.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Risk grubunda öğrenci yok.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 text-sm">
                    {summary.data.attendance.atRisk.map((row) => (
                      <li key={row.studentId} className="flex items-center justify-between py-2">
                        <span>
                          {row.fullName}
                          <span className="ml-2 text-xs text-slate-400">{row.className ?? '—'}</span>
                        </span>
                        <Badge tone={row.status === 'FAILED' ? 'red' : 'amber'}>
                          {row.unexcused} özürsüz / {row.total}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <h2 className="text-base font-semibold">Durum özeti</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Açık ŞÖK dosyası</dt>
                    <dd className="font-semibold">{summary.data.council.open}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Ders programı</dt>
                    <dd className="font-semibold">
                      {summary.data.schedule.published ? 'Yayınlandı' : 'Taslak / yok'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Deneme oturumu</dt>
                    <dd className="font-semibold">{summary.data.counts.mockExamSessions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Dönem</dt>
                    <dd className="font-semibold">{summary.data.term.name}</dd>
                  </div>
                </dl>
              </div>
            </section>
          )}
        </>
      )}

      {role === 'STUDENT' && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Ortalamam</p>
            <p className="mt-1 text-lg font-semibold">
              {report.data?.average === null || report.data?.average === undefined
                ? '—'
                : report.data.average.toFixed(2)}
            </p>
            <p className="text-sm text-slate-500">
              {report.data ? (STANDING_LABELS[report.data.standing] ?? report.data.standing) : 'Yükleniyor…'}
            </p>
          </article>
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Devamsızlığım</p>
            <p className="mt-1 text-lg font-semibold">
              {attendance.data
                ? `${attendance.data.summary.unexcused} özürsüz / ${attendance.data.summary.total}`
                : '—'}
            </p>
            <p className="text-sm text-slate-500">
              {attendance.data
                ? `Sınır: ${attendance.data.summary.unexcusedLimit} / ${attendance.data.summary.totalLimit}`
                : 'Yükleniyor…'}
            </p>
          </article>
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Son deneme</p>
            <p className="mt-1 text-lg font-semibold">
              {lastMock ? `${lastMock.net} net` : '—'}
            </p>
            <p className="text-sm text-slate-500">
              {lastMock ? `${lastMock.rank}. / ${lastMock.participants}` : 'Deneme sonucu yok'}
            </p>
          </article>
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Belge</p>
            <p className="mt-1 text-lg font-semibold">{report.data?.certificate ?? '—'}</p>
            <p className="text-sm text-slate-500">Dönem sonu değerlendirmesi</p>
          </article>
        </section>
      )}

      {role === 'TEACHER' && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Derslerim</p>
            <p className="mt-1 text-lg font-semibold">{myCourses.data?.length ?? 0}</p>
            <p className="text-sm text-slate-500">{uniqueClasses.size} şube</p>
          </article>
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Bugün</p>
            <p className="mt-1 text-lg font-semibold">{todaySlots.length} ders saati</p>
            <p className="text-sm text-slate-500">Haftalık toplam: {mySchedule.data?.slots.length ?? 0}</p>
          </article>
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Kurum</p>
            <p className="mt-1 text-lg font-semibold">{status.institution?.name}</p>
            <p className="text-sm text-slate-500">
              {status.institution ? INSTITUTION_LABELS[status.institution.type] : ''}
            </p>
          </article>
          <article className="card">
            <p className="text-xs font-semibold uppercase text-slate-400">Aktif modül</p>
            <p className="mt-1 text-lg font-semibold">{enabled.length}</p>
            <p className="text-sm text-slate-500">Feature flag ile açık</p>
          </article>
        </section>
      )}

      {role === 'TEACHER' && todaySlots.length > 0 && (
        <section className="card">
          <h2 className="text-base font-semibold">Bugünkü program</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {todaySlots.map((slot) => (
              <li key={slot.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-semibold">{slot.period}. saat</span> · {slot.courseName}
                </span>
                <span className="text-xs text-slate-500">{slot.className}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="text-base font-semibold">Aktif modüller</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {enabled.length === 0 && <p className="text-sm text-slate-500">Henüz aktif modül yok.</p>}
          {enabled.map((module) => (
            <span
              key={module}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
            >
              {module}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
