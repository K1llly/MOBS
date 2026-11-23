import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { ReportCardView } from '../components/ReportCardView';
import { Card, Empty, ErrorBox, Loading } from '../components/ui';
import { SearchSelect } from '../components/SearchSelect';

export default function ReportCardPage() {
  const students = useApi(() => api.students.list(), []);
  const terms = useApi(() => api.terms(), []);
  const [studentId, setStudentId] = useState('');
  const [termId, setTermId] = useState('');

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

  return (
    <div className="space-y-4">
      <Card
        title="Karne / Transkript Merkezi"
        actions={
          <div className="flex flex-wrap gap-2">
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
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Karne, kurum profilindeki notlandırma stratejisine göre anlık hesaplanır.
        </p>
      </Card>

      {report.loading && <Card><Loading /></Card>}
      {report.error && <Card><ErrorBox message={report.error} /></Card>}
      {!report.loading && !report.error && !report.data && (
        <Card><Empty>Görüntülenecek öğrenci yok.</Empty></Card>
      )}
      {report.data && <ReportCardView report={report.data} />}
    </div>
  );
}
