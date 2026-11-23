import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../hooks/useApi';
import type { CourseSummary } from '../types';
import { SearchSelect } from '../components/SearchSelect';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';

export default function CoursesPage() {
  const courses = useApi(() => api.courses.list(), []);
  const teachers = useApi(() => api.teachers.list(), []);

  const [selected, setSelected] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState('');
  const [form, setForm] = useState({ code: '', name: '', weeklyHours: 2, isBarrier: false });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCourse: CourseSummary | undefined = (courses.data ?? []).find(
    (course) => course.id === selected,
  );

  useEffect(() => {
    setTeacherId('');
  }, [selected]);

  const createCourse = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.courses.create({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        weeklyHours: form.weeklyHours,
        isBarrier: form.isBarrier,
      });
      setForm({ code: '', name: '', weeklyHours: 2, isBarrier: false });
      setMessage('Ders oluşturuldu. Şimdi öğretmen atayabilirsiniz.');
      courses.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Ders oluşturulamadı');
    }
  };

  const assignTeacher = async () => {
    if (!selected) return;
    setError(null);
    setMessage(null);
    try {
      await api.courses.assignTeacher(selected, teacherId);
      setTeacherId('');
      setMessage('Öğretmen derse atandı.');
      courses.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Öğretmen atanamadı');
    }
  };

  const removeTeacher = async (id: string) => {
    if (!selected) return;
    setError(null);
    setMessage(null);
    try {
      await api.courses.removeTeacher(selected, id);
      setMessage('Öğretmen dersten çıkarıldı.');
      courses.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Öğretmen çıkarılamadı');
    }
  };

  const assignableTeachers = (teachers.data ?? []).filter(
    (teacher) => !(selectedCourse?.teachers ?? []).some((assigned) => assigned.id === teacher.id),
  );

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}

      <Card title="Dersler" subtitle="Ders oluşturun, ardından branşına göre öğretmen atayın">
        {courses.loading && <Loading />}
        {courses.error && <ErrorBox message={courses.error} />}
        {courses.data && courses.data.length === 0 && <Empty>Henüz ders yok.</Empty>}
        {courses.data && courses.data.length > 0 && (
          <Table head={['Ders', 'Saat', 'Baraj', 'Öğretmenler', 'Şube']}>
            {courses.data.map((course) => (
              <tr
                key={course.id}
                className={`cursor-pointer hover:bg-slate-50 ${selected === course.id ? 'bg-brand-50' : ''}`}
                onClick={() => setSelected(course.id)}
              >
                <td className="px-2 py-2">
                  <p className="font-medium">{course.name}</p>
                  <p className="font-mono text-xs text-slate-400">{course.code}</p>
                </td>
                <td className="px-2 py-2">{course.weeklyHours}</td>
                <td className="px-2 py-2">{course.isBarrier ? <Badge tone="amber">Baraj</Badge> : '—'}</td>
                <td className="px-2 py-2">
                  {course.teachers.length === 0 ? (
                    <Badge tone="red">Atanmadı</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {course.teachers.map((teacher) => (
                        <Badge key={teacher.id} tone="blue">
                          {teacher.fullName}
                          {teacher.branch ? ` · ${teacher.branch}` : ''}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-slate-600">{course.classCount}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={selectedCourse ? `${selectedCourse.name} · öğretmen atama` : 'Öğretmen atama'}>
          {!selectedCourse ? (
            <Empty>Öğretmen atamak için yukarıdan bir ders seçin.</Empty>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Aynı derse birden fazla öğretmen atayabilirsiniz. Sınıf-ders atamasında yalnızca bu
                havuzdaki öğretmenler seçilebilir.
              </p>

              {selectedCourse.teachers.length === 0 ? (
                <Empty>Bu derse henüz öğretmen atanmadı.</Empty>
              ) : (
                <ul className="mt-3 space-y-1">
                  {selectedCourse.teachers.map((teacher) => (
                    <li
                      key={teacher.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium">{teacher.fullName}</span>
                        {teacher.branch && (
                          <span className="ml-2 text-xs text-slate-400">{teacher.branch}</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-400 hover:text-red-600"
                        onClick={() => removeTeacher(teacher.id)}
                      >
                        Çıkar
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Field label="Öğretmen (isim veya branş ile ara)">
                    <SearchSelect
                      options={assignableTeachers.map((teacher) => ({
                        id: teacher.id,
                        label: teacher.fullName,
                        hint: teacher.branch ?? undefined,
                      }))}
                      value={teacherId}
                      onChange={setTeacherId}
                      placeholder="Matematik yazın…"
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={assignTeacher}
                  disabled={!teacherId}
                >
                  Derse Ata
                </button>
              </div>
            </>
          )}
        </Card>

        <Card title="Yeni ders" subtitle="Ders kataloğuna eklenir; sınıflara ayrıca atanır">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ders kodu">
              <input
                className="input"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                placeholder="MAT"
              />
            </Field>
            <Field label="Ders adı">
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Matematik"
              />
            </Field>
            <Field label="Haftalık saat">
              <input
                type="number"
                min={1}
                max={40}
                className="input"
                value={form.weeklyHours}
                onChange={(event) => setForm({ ...form, weeklyHours: Number(event.target.value) })}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.isBarrier}
                onChange={(event) => setForm({ ...form, isBarrier: event.target.checked })}
              />
              Baraj ders (Türkçe / Edebiyat)
            </label>
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={createCourse}
            disabled={form.code.trim().length < 2 || form.name.trim().length < 2}
          >
            Ders Ekle
          </button>
        </Card>
      </div>
    </div>
  );
}
