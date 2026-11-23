import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { STANDING_LABELS } from '../types';
import { ReportCardView } from '../components/ReportCardView';
import { SearchSelect } from '../components/SearchSelect';
import { Badge, Card, Empty, ErrorBox, Loading, Table } from '../components/ui';

export default function ReportCardPage() {
  const students = useApi(() => api.students.list(), []);
  const terms = useApi(() => api.terms(), []);
  const classes = useApi(() => api.classes.list(), []);

  const [studentId, setStudentId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [bulkRequested, setBulkRequested] = useState(false);

  useEffect(() => {
    if (!studentId && students.data && students.data.length > 0) setStudentId(students.data[0]!.id);
  }, [students.data, studentId]);

  useEffect(() => {
    if (!termId && terms.data && terms.data.length > 0) {
      setTermId(terms.data.find((term) => term.isActive)?.id ?? terms.data[0]!.id);
    }
  }, [terms.data, termId]);

  const report = useApi(
    () => (studentId ? api.grades.reportCard(studentId, termId || undefined) : Promise.resolve(null)),
    [studentId, termId],
  );

  const bulk = useApi(
    () =>
      bulkRequested
        ? api.reports.bulk(classId || undefined, termId || undefined)
        : Promise.resolve(null),
    [classId, termId, bulkRequested],
  );

  return (
    <div className="space-y-4">
      <Card
        title="Karne / Transkript Merkezi"
        subtitle="Tek öğrenci veya sınıfın tamamı; arama ile öğrenci seçin."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="">Tüm sınıflar</option>
              {(classes.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              value={termId}
              onChange={(event) => setTermId(event.target.value)}
            >
              {(terms.data ?? []).map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setBulkRequested(true);
                bulk.reload();
              }}
            >
              Sınıf Karneleri
            </button>
            <button type="button" className="btn-ghost" onClick={() => window.print()}>
              Yazdır
            </button>
            <div className="w-60">
              <SearchSelect
                options={(students.data ?? []).map((student) => ({
                  id: student.id,
                  label: student.fullName,
                  hint: `${student.studentNumber}${student.className ? ` · ${student.className}` : ''}`,
                }))}
                value={studentId}
                onChange={setStudentId}
                placeholder="Öğrenci ara…"
              />
            </div>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Karne, kurum profilindeki notlandırma stratejisine göre anlık hesaplanır. “Sınıf Karneleri”
          ile tüm sınıfın özetini alıp yazdırabilirsiniz.
        </p>
      </Card>

      {bulkRequested && (
        <Card title="Sınıf karne özeti" subtitle={bulk.data ? `${bulk.data.count} öğrenci` : undefined}>
          {bulk.loading && <Loading />}
          {bulk.error && <ErrorBox message={bulk.error} />}
          {bulk.data && bulk.data.rows.length === 0 && <Empty>Öğrenci yok.</Empty>}
          {bulk.data && bulk.data.rows.length > 0 && (
            <Table head={['No', 'Ad Soyad', 'Sınıf', 'Ortalama', 'Durum', 'Belge', 'Devamsızlık', '']}>
              {bulk.data.rows.map((row) => (
                <tr key={row.student.id} className="hover:bg-slate-50">
                  <td className="px-2 py-2 font-mono text-xs">{row.student.studentNumber}</td>
                  <td className="px-2 py-2 font-medium">{row.student.fullName}</td>
                  <td className="px-2 py-2 text-slate-600">{row.student.className ?? '—'}</td>
                  <td className="px-2 py-2 font-semibold">
                    {row.average === null ? '—' : row.average.toFixed(2)}
                  </td>
                  <td className="px-2 py-2">
                    <Badge
                      tone={
                        row.standing === 'PASSED'
                          ? 'green'
                          : row.standing === 'FAILED'
                            ? 'red'
                            : row.standing === 'RESPONSIBLE' || row.standing === 'COUNCIL_PENDING'
                              ? 'amber'
                              : 'blue'
                      }
                    >
                      {STANDING_LABELS[row.standing] ?? row.standing}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-xs">{row.certificate ?? '—'}</td>
                  <td className="px-2 py-2 text-xs">
                    {row.absence.unexcused} özürsüz / {row.absence.total}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-semibold text-slate-500 hover:text-brand-700 print:hidden"
                      onClick={() => setStudentId(row.student.id)}
                    >
                      Detay
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {report.loading && <Card><Loading /></Card>}
      {report.error && <Card><ErrorBox message={report.error} /></Card>}
      {report.data && <ReportCardView report={report.data} />}
    </div>
  );
}
