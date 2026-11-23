import type { ReportCard } from '../types';
import { STANDING_LABELS } from '../types';
import { Badge, Card, Table } from './ui';

const STANDING_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate' | 'blue'> = {
  PASSED: 'green',
  RESPONSIBLE: 'amber',
  FAILED: 'red',
  COUNCIL_PENDING: 'amber',
  ACTIVE: 'blue',
  EXEMPT: 'slate',
};

export function ReportCardView({ report }: { report: ReportCard }) {
  const absence = report.absence;
  const absenceTone = absence.status === 'FAILED' ? 'red' : absence.status === 'WARNING' ? 'amber' : 'green';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Öğrenci</p>
          <p className="mt-1 font-semibold">{report.student.fullName}</p>
          <p className="text-xs text-slate-500">
            {report.student.studentNumber} · {report.student.className ?? 'Şube yok'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            {report.strategy === 'UNIVERSITY_GPA' ? 'GPA' : 'Ortalama'}
          </p>
          <p className="mt-1 text-xl font-bold">
            {report.average === null || report.average === undefined ? '—' : report.average.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500">{report.term.name}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Durum</p>
          <p className="mt-2">
            <Badge tone={STANDING_TONE[report.standing] ?? 'slate'}>
              {STANDING_LABELS[report.standing] ?? report.standing}
            </Badge>
          </p>
          {report.certificate && (
            <p className="mt-2 text-xs text-slate-500">
              Belge: <span className="font-semibold text-slate-700">{report.certificate}</span>
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Devamsızlık</p>
          <p className="mt-1 font-semibold">
            {absence.unexcused} özürsüz · {absence.total} toplam
          </p>
          <p className="mt-1">
            <Badge tone={absenceTone}>
              {absence.status === 'OK' ? 'Sınır içinde' : absence.status === 'WARNING' ? 'Sınıra yakın' : 'Sınır aşıldı'}
            </Badge>
          </p>
        </div>
      </div>

      {report.councilReason && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{report.councilReason}</p>
      )}

      <Card title="Ders sonuçları" subtitle={`${report.courses.length} ders`}>
        {report.courses.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">Bu dönem için not kaydı yok.</p>
        ) : (
          <Table head={['Ders', '1. Dönem', '2. Dönem', 'Ortalama', 'Not', 'Durum']}>
            {report.courses.map((course) => (
              <tr key={course.courseId}>
                <td className="px-2 py-2 font-medium">
                  {course.courseName}
                  {course.isBarrier && <span className="ml-1 text-xs text-amber-600">(baraj)</span>}
                </td>
                <td className="px-2 py-2 text-slate-600">{format(course.firstTerm)}</td>
                <td className="px-2 py-2 text-slate-600">{format(course.secondTerm)}</td>
                <td className="px-2 py-2 font-semibold">{format(course.average)}</td>
                <td className="px-2 py-2">{course.letterGrade ?? '—'}</td>
                <td className="px-2 py-2">
                  {course.passed === undefined ? (
                    <span className="text-xs text-slate-400">Gelişim</span>
                  ) : (
                    <Badge tone={course.passed ? 'green' : 'red'}>{course.passed ? 'Geçti' : 'Kaldı'}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {report.developmentReport && (
        <Card title="Gelişim ve kazanım kayıtları" subtitle="İlkokulda sayısal puan yerine süreç odaklı değerlendirme">
          <div className="grid gap-3 sm:grid-cols-2">
            {report.courses.map((course) => (
              <div key={course.courseId} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium">{course.courseName}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(course.entries ?? []).length === 0 && (
                    <span className="text-xs text-slate-400">Kayıt yok</span>
                  )}
                  {(course.entries ?? []).map((entry, index) => (
                    <Badge key={`${course.courseId}-${index}`} tone="blue">
                      {entry.type}: {entry.score}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function format(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(2);
}
