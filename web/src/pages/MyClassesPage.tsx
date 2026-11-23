import { useEffect, useState } from 'react';
import { api, ApiError, getStoredUser } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { SearchSelect } from '../components/SearchSelect';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';

export default function MyClassesPage() {
  const user = getStoredUser();
  const myCourses = useApi(() => api.teachers.myCourses(), []);
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const classes = [...new Map((myCourses.data ?? []).map((item) => [item.classId, item])).values()];

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0]!.classId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCourses.data, classId]);

  const detail = useApi(
    () => (classId ? api.classes.get(classId) : Promise.resolve(null)),
    [classId],
  );
  const candidates = useApi(
    () => (classId ? api.classes.candidates(classId) : Promise.resolve([])),
    [classId],
  );

  const addStudent = async () => {
    if (!classId || !candidateId) return;
    setError(null);
    setMessage(null);
    try {
      await api.classes.enroll(classId, candidateId);
      setCandidateId('');
      setMessage('Öğrenci şubeye eklendi.');
      detail.reload();
      candidates.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Öğrenci eklenemedi');
    }
  };

  const query = search.toLocaleLowerCase('tr-TR');
  const students = (detail.data?.students ?? []).filter((student) =>
    `${student.fullName} ${student.studentNumber}`.toLocaleLowerCase('tr-TR').includes(query),
  );

  return (
    <div className="space-y-4">
      <Card
        title="Sınıflarım / Derslerim"
        subtitle={`${user?.fullName ?? ''} · ders verdiğiniz şubeler`}
      >
        {myCourses.loading && <Loading />}
        {myCourses.error && <ErrorBox message={myCourses.error} />}
        {!myCourses.loading && classes.length === 0 && (
          <Empty>Size atanmış ders/şube yok. Yönetici ders ataması yapmalı.</Empty>
        )}
        <div className="flex flex-wrap gap-2">
          {classes.map((item) => (
            <button
              key={item.classId}
              type="button"
              onClick={() => {
                setClassId(item.classId);
                setSearch('');
                setCandidateId('');
              }}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                classId === item.classId
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="block font-semibold">{item.className}</span>
              <span className="text-xs text-slate-500">{item.name}</span>
            </button>
          ))}
        </div>
      </Card>

      {detail.data && (
        <Card
          title={`${detail.data.name} öğrencileri`}
          subtitle={`${detail.data.students.length}/${detail.data.capacity} kontenjan`}
          actions={
            <input
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              placeholder="İsim veya numara ara…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        >
          {error && <Alert>{error}</Alert>}
          {message && <Alert kind="success">{message}</Alert>}

          {students.length === 0 ? (
            <Empty>Eşleşen öğrenci yok.</Empty>
          ) : (
            <Table head={['No', 'Ad Soyad']}>
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="px-2 py-2 font-mono text-xs">{student.studentNumber}</td>
                  <td className="px-2 py-2">{student.fullName}</td>
                </tr>
              ))}
            </Table>
          )}

          <div className="mt-4 border-t border-slate-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold">Şubeye öğrenci ekle</h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <Field label="Öğrenci (isim veya numara ile ara)">
                  <SearchSelect
                    options={(candidates.data ?? []).map((student) => ({
                      id: student.id,
                      label: student.fullName,
                      hint: `${student.studentNumber}${student.className ? ` · ${student.className}` : ''}`,
                    }))}
                    value={candidateId}
                    onChange={setCandidateId}
                    placeholder="Öğrenci ara…"
                  />
                </Field>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={addStudent}
                disabled={!candidateId}
              >
                Şubeye Ekle
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Arama isim, numara veya mevcut şubeye göre yapılır; kontenjan doluysa ekleme engellenir.
            </p>
          </div>
        </Card>
      )}

      {detail.data && (
        <Card title="Dersler" subtitle="Bu şubede okutulan dersler">
          <Table head={['Ders', 'Saat', 'Öğretmen']}>
            {detail.data.courses.map((course) => (
              <tr key={course.id}>
                <td className="px-2 py-2 font-medium">{course.courseName}</td>
                <td className="px-2 py-2">{course.weeklyHours}</td>
                <td className="px-2 py-2">
                  {course.teacherName ?? '—'}
                  {course.teacherName === user?.fullName && (
                    <Badge tone="blue">siz</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
