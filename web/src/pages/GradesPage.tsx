import { useEffect, useState } from 'react';
import { api, ApiError, getStoredUser } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { GRADE_TYPE_LABELS, type GradeType, type ReportCard } from '../types';
import { ReportCardView } from '../components/ReportCardView';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';
import { SearchSelect } from '../components/SearchSelect';

const GRADE_TYPES: GradeType[] = [
  'WRITTEN',
  'PERFORMANCE',
  'PROJECT',
  'QUIZ',
  'COURSE_EXAM',
  'MIDTERM',
  'FINAL',
  'MAKEUP',
  'LAB',
];

export default function GradesPage() {
  const user = getStoredUser();
  const isTeacher = user?.role === 'TEACHER';
  const isManager = user?.role === 'MANAGER';
  const canEdit = isTeacher;

  const students = useApi(() => api.students.list(), []);
  const myCourses = useApi(() => (isTeacher ? api.teachers.myCourses() : Promise.resolve([])), [isTeacher]);
  const allCourses = useApi(() => (isManager ? api.courses.list() : Promise.resolve([])), [isManager]);
  const terms = useApi(() => api.terms(), []);

  const [studentId, setStudentId] = useState('');
  const [termId, setTermId] = useState('');
  const [form, setForm] = useState({ courseId: '', type: 'WRITTEN' as GradeType, score: 80, weight: '' });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const courseOptions = isTeacher
    ? (myCourses.data ?? []).map((course) => ({
        id: course.id,
        name: `${course.name} · ${course.className}`,
      }))
    : (allCourses.data ?? []).map((course) => ({ id: course.id, name: course.name }));

  useEffect(() => {
    if (!studentId && students.data && students.data.length > 0) {
      setStudentId(students.data[0]!.id);
    }
  }, [students.data, studentId]);

  useEffect(() => {
    if (!termId && terms.data && terms.data.length > 0) {
      setTermId(terms.data.find((term) => term.isActive)?.id ?? terms.data[0]!.id);
    }
  }, [terms.data, termId]);

  useEffect(() => {
    if (isTeacher && courseOptions.length > 0 && !courseOptions.some((course) => course.id === form.courseId)) {
      setForm((current) => ({ ...current, courseId: courseOptions[0]!.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, myCourses.data]);

  const report = useApi<ReportCard | null>(
    () => (studentId ? api.grades.reportCard(studentId, termId || undefined) : Promise.resolve(null)),
    [studentId, termId],
  );

  const grades = useApi(
    () => (studentId ? api.grades.list(studentId, termId || undefined) : Promise.resolve([])),
    [studentId, termId],
  );

  const enter = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.grades.enter(studentId, {
        courseId: form.courseId,
        type: form.type,
        score: form.score,
        ...(form.weight ? { weight: Number(form.weight) } : {}),
        ...(termId ? { termId } : {}),
      });
      setMessage('Not kaydedildi.');
      report.reload();
      grades.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Not kaydedilemedi');
    }
  };

  const selectedStudent = (students.data ?? []).find((item) => item.id === studentId);

  return (
    <div className="space-y-4">
      <Card
        title="Öğrenci ve dönem"
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
        {students.loading || terms.loading ? (
          <Loading />
        ) : selectedStudent ? (
          <p className="text-sm text-slate-600">
            {selectedStudent.fullName} · {selectedStudent.className ?? 'şube yok'}
          </p>
        ) : (
          <Empty>Öğrenci bulunamadı.</Empty>
        )}
        {students.error && <ErrorBox message={students.error} />}
        {terms.error && <ErrorBox message={terms.error} />}
      </Card>

      {isManager && (
        <Alert kind="info">
          Not girişi yalnızca dersin öğretmeni tarafından yapılır. Yönetici; öğretmen ve öğrenci
          hesaplarını (kullanıcı adı/şifre) “Kullanıcılar & Atamalar” sayfasından oluşturur ve burada
          yalnızca sonuçları inceler.
        </Alert>
      )}

      {canEdit && (
        <Card
          title="Not girişi (öğretmen)"
          subtitle="Yalnızca size atanmış dersler listelenir; puan 0–100 aralığında olmalıdır."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="Ders">
              <select
                className="input"
                value={form.courseId}
                onChange={(event) => setForm({ ...form, courseId: event.target.value })}
              >
                <option value="">Seçin</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tür">
              <select
                className="input"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as GradeType })}
              >
                {GRADE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {GRADE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Puan">
              <input
                type="number"
                min={0}
                max={100}
                className="input"
                value={form.score}
                onChange={(event) => setForm({ ...form, score: Number(event.target.value) })}
              />
            </Field>
            <Field label="Ağırlık (opsiyonel)">
              <input
                type="number"
                min={0}
                step={0.5}
                className="input"
                value={form.weight}
                onChange={(event) => setForm({ ...form, weight: event.target.value })}
                placeholder="Politika"
              />
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-primary w-full"
                onClick={enter}
                disabled={!studentId || !form.courseId || form.score < 0 || form.score > 100}
              >
                Not Kaydet
              </button>
            </div>
          </div>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          {message && <div className="mt-3"><Alert kind="success">{message}</Alert></div>}
        </Card>
      )}

      {report.loading && <Card><Loading /></Card>}
      {report.error && <Card><ErrorBox message={report.error} /></Card>}
      {report.data && <ReportCardView report={report.data} />}

      <Card title="Ham not kayıtları" subtitle="Tür, puan ve ağırlık">
        {grades.loading && <Loading />}
        {grades.data && grades.data.length === 0 && <Empty>Bu dönem not kaydı yok.</Empty>}
        {grades.data && grades.data.length > 0 && (
          <Table head={['Ders', 'Tür', 'Puan', 'Ağırlık', 'Dönem']}>
            {grades.data.map((grade) => (
              <tr key={grade.id}>
                <td className="px-2 py-2 font-medium">{grade.courseName}</td>
                <td className="px-2 py-2">
                  <Badge>{GRADE_TYPE_LABELS[grade.type]}</Badge>
                </td>
                <td className="px-2 py-2 font-semibold">{grade.score}</td>
                <td className="px-2 py-2 text-slate-500">{grade.weight ?? 'politika'}</td>
                <td className="px-2 py-2 text-xs text-slate-500">{grade.termName}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
