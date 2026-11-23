import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../hooks/useApi';
import type { ClassDetail } from '../types';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';

export default function ClassesPage() {
  const classes = useApi(() => api.classes.list());
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', capacity: 30, gradeLevel: 9 });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.classes.create({
        name: form.name.trim(),
        capacity: form.capacity,
        ...(form.gradeLevel > 0 ? { gradeLevel: form.gradeLevel } : {}),
      });
      setForm({ name: '', capacity: 30, gradeLevel: 9 });
      setMessage('Şube oluşturuldu.');
      classes.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Şube oluşturulamadı');
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Sınıf / Şube" subtitle="Kontenjan ve doluluk">
        {classes.loading && <Loading />}
        {classes.error && <ErrorBox message={classes.error} />}
        {classes.data && classes.data.length === 0 && <Empty>Henüz şube yok.</Empty>}
        {classes.data && classes.data.length > 0 && (
          <Table head={['Şube', 'Kademe', 'Doluluk', 'Ders']}>
            {classes.data.map((item) => (
              <tr
                key={item.id}
                className={`cursor-pointer hover:bg-slate-50 ${selected === item.id ? 'bg-brand-50' : ''}`}
                onClick={() => setSelected(item.id)}
              >
                <td className="px-2 py-2 font-medium">{item.name}</td>
                <td className="px-2 py-2 text-slate-600">{item.gradeLevel ?? '—'}</td>
                <td className="px-2 py-2">
                  <Badge tone={item.isFull ? 'red' : 'green'}>
                    {item.studentCount}/{item.capacity}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-slate-600">{item.courseCount}</td>
              </tr>
            ))}
          </Table>
        )}

        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold">Yeni şube</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Field label="Ad">
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="10-C"
              />
            </Field>
            <Field label="Kontenjan">
              <input
                type="number"
                className="input"
                min={1}
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })}
              />
            </Field>
            <Field label="Kademe">
              <input
                type="number"
                className="input"
                min={0}
                value={form.gradeLevel}
                onChange={(event) => setForm({ ...form, gradeLevel: Number(event.target.value) })}
              />
            </Field>
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={create}
            disabled={form.name.trim().length < 2}
          >
            Şube Ekle
          </button>
          {message && <div className="mt-3"><Alert kind="success">{message}</Alert></div>}
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
        </div>
      </Card>

      {selected ? (
        <ClassPanel classId={selected} onChanged={classes.reload} />
      ) : (
        <Card title="Şube detayı" subtitle="Ders ve öğrenci atamaları için soldan bir şube seçin">
          <Empty>Seçili şube yok.</Empty>
        </Card>
      )}
    </div>
  );
}

function ClassPanel({ classId, onChanged }: { classId: string; onChanged: () => void }) {
  const detail = useApi(() => api.classes.get(classId), [classId]);
  const courses = useApi(() => api.courses.list(), []);
  const teachers = useApi(() => api.teachers.list(), []);
  const students = useApi(() => api.students.list(), []);
  const [assign, setAssign] = useState({ courseId: '', teacherId: '', weeklyHours: 2 });
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      detail.reload();
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'İşlem tamamlanamadı');
    }
  };

  if (detail.loading) return <Card><Loading /></Card>;
  if (detail.error) return <Card><ErrorBox message={detail.error} /></Card>;
  if (!detail.data) return null;

  const data: ClassDetail = detail.data;
  const enrolled = new Set(data.students.map((student) => student.id));

  return (
    <div className="space-y-4">
      <Card
        title={`${data.name} · ${data.students.length}/${data.capacity}`}
        subtitle={data.homeRoom ? `Derslik: ${data.homeRoom}` : 'Derslik atanmamış'}
      >
        {error && <Alert>{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}

        <h3 className="mt-4 text-sm font-semibold">Dersler</h3>
        {data.courses.length === 0 ? (
          <Empty>Bu şubeye ders atanmamış.</Empty>
        ) : (
          <Table head={['Ders', 'Saat', 'Öğretmen']}>
            {data.courses.map((course) => (
              <tr key={course.id}>
                <td className="px-2 py-2 font-medium">{course.courseName}</td>
                <td className="px-2 py-2 text-slate-600">{course.weeklyHours}</td>
                <td className="px-2 py-2 text-slate-600">{course.teacherName ?? '—'}</td>
              </tr>
            ))}
          </Table>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Field label="Ders">
            <select
              className="input"
              value={assign.courseId}
              onChange={(event) => setAssign({ ...assign, courseId: event.target.value })}
            >
              <option value="">Seçin</option>
              {(courses.data ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Öğretmen">
            <select
              className="input"
              value={assign.teacherId}
              onChange={(event) => setAssign({ ...assign, teacherId: event.target.value })}
            >
              <option value="">—</option>
              {(teachers.data ?? []).map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Haftalık saat">
            <input
              type="number"
              min={1}
              className="input"
              value={assign.weeklyHours}
              onChange={(event) => setAssign({ ...assign, weeklyHours: Number(event.target.value) })}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!assign.courseId}
              onClick={() =>
                run(
                  () =>
                    api.classes.assignCourse(classId, {
                      courseId: assign.courseId,
                      teacherId: assign.teacherId || undefined,
                      weeklyHours: assign.weeklyHours,
                    }),
                  'Ders atandı.',
                )
              }
            >
              Ders Ata
            </button>
          </div>
        </div>
      </Card>

      <Card title="Öğrenciler" subtitle="Kapasite doluysa atama 409 ile engellenir">
        {data.students.length === 0 ? (
          <Empty>Şubede öğrenci yok.</Empty>
        ) : (
          <Table head={['No', 'Ad Soyad']}>
            {data.students.map((student) => (
              <tr key={student.id}>
                <td className="px-2 py-2 font-mono text-xs">{student.studentNumber}</td>
                <td className="px-2 py-2">{student.fullName}</td>
              </tr>
            ))}
          </Table>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <Field label="Öğrenci">
              <select
                className="input"
                value={enrollStudentId}
                onChange={(event) => setEnrollStudentId(event.target.value)}
              >
                <option value="">Seçin</option>
                {(students.data ?? [])
                  .filter((student) => !enrolled.has(student.id))
                  .map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.studentNumber} · {student.fullName}
                      {student.className ? ` (${student.className})` : ''}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!enrollStudentId}
            onClick={() =>
              run(async () => {
                await api.classes.enroll(classId, enrollStudentId);
                setEnrollStudentId('');
              }, 'Öğrenci şubeye eklendi.')
            }
          >
            Şubeye Ekle
          </button>
        </div>
      </Card>
    </div>
  );
}
