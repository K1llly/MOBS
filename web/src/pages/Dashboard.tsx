import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getStoredUser } from '../lib/api';
import { menuFor } from '../lib/menu';
import {
  INSTITUTION_LABELS,
  ROLE_LABELS,
  type SetupStatus,
} from '../types';
import AttendancePage from './AttendancePage';
import AvailabilityPage from './AvailabilityPage';
import ClassesPage from './ClassesPage';
import GradesPage from './GradesPage';
import MockExamsPage from './MockExamsPage';
import ReportCardPage from './ReportCardPage';
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
  const flags = status.featureFlags ?? {};
  const enabled = Object.entries(flags)
    .filter(([, value]) => value)
    .map(([key]) => key);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
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
        <article className="card">
          <p className="text-xs font-semibold uppercase text-slate-400">Aktif modül</p>
          <p className="mt-1 text-lg font-semibold">{enabled.length}</p>
          <p className="text-sm text-slate-500">Feature flag ile açık</p>
        </article>
      </section>

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
