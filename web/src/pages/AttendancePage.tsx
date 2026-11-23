import { useEffect, useState } from 'react';
import { api, ApiError, getStoredUser } from '../lib/api';
import { useApi } from '../hooks/useApi';
import {
  ATTENDANCE_LABELS,
  type AttendanceStatus,
  type AttendanceSummary,
} from '../types';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';

const STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'EXCUSED', 'LATE'];

export default function AttendancePage() {
  const user = getStoredUser();
  const isStudentSide = user?.role === 'STUDENT';

  return isStudentSide ? <StudentAttendance /> : <TeacherAttendance />;
}

function StudentAttendance() {
  const students = useApi(() => api.students.list(), []);
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    if (!studentId && students.data && students.data.length > 0) setStudentId(students.data[0]!.id);
  }, [students.data, studentId]);

  const summary = useApi<AttendanceSummary | null>(
    () => (studentId ? api.attendance.summary(studentId) : Promise.resolve(null)),
    [studentId],
  );

  return (
    <div className="space-y-4">
      <Card
        title="Devamsızlık"
        actions={
          <select
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
          >
            {(students.data ?? []).map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName}
              </option>
            ))}
          </select>
        }
      >
        {summary.loading && <Loading />}
        {summary.error && <ErrorBox message={summary.error} />}
        {summary.data && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Özürsüz" value={`${summary.data.summary.unexcused} / ${summary.data.summary.unexcusedLimit}`} />
            <Stat label="Toplam" value={`${summary.data.summary.total} / ${summary.data.summary.totalLimit}`} />
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase text-slate-400">Durum</p>
              <p className="mt-2">
                <Badge
                  tone={
                    summary.data.summary.status === 'FAILED'
                      ? 'red'
                      : summary.data.summary.status === 'WARNING'
                        ? 'amber'
                        : 'green'
                  }
                >
                  {summary.data.summary.status === 'FAILED'
                    ? 'Sınır aşıldı'
                    : summary.data.summary.status === 'WARNING'
                      ? 'Sınıra yakın'
                      : 'Sınır içinde'}
                </Badge>
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card title="Devamsızlık kayıtları" subtitle="Son 200 kayıt">
        {summary.data && summary.data.records.length === 0 && <Empty>Kayıt yok.</Empty>}
        {summary.data && summary.data.records.length > 0 && (
          <Table head={['Tarih', 'Saat', 'Ders', 'Durum']}>
            {summary.data.records.map((record) => (
              <tr key={record.id}>
                <td className="px-2 py-2">{new Date(record.date).toLocaleDateString('tr-TR')}</td>
                <td className="px-2 py-2 text-slate-500">{record.period}</td>
                <td className="px-2 py-2">{record.courseName}</td>
                <td className="px-2 py-2">
                  <Badge tone={record.status === 'ABSENT' ? 'red' : record.status === 'EXCUSED' ? 'amber' : 'green'}>
                    {ATTENDANCE_LABELS[record.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function TeacherAttendance() {
  const classes = useApi(() => api.classes.list(), []);
  const [classId, setClassId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState(1);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!classId && classes.data && classes.data.length > 0) setClassId(classes.data[0]!.id);
  }, [classes.data, classId]);

  const detail = useApi(
    () => (classId ? api.classes.get(classId) : Promise.resolve(null)),
    [classId],
  );

  useEffect(() => {
    if (!courseId && detail.data && detail.data.courses.length > 0) {
      setCourseId(detail.data.courses[0]!.id);
    }
  }, [detail.data, courseId]);

  const save = async () => {
    if (!detail.data || !courseId) return;
    setError(null);
    setMessage(null);
    try {
      await api.attendance.bulk(
        detail.data.students.map((student) => ({
          studentId: student.id,
          classCourseId: courseId,
          date: new Date(`${date}T00:00:00.000Z`).toISOString(),
          period,
          status: statuses[student.id] ?? 'PRESENT',
        })),
      );
      setMessage(`${detail.data.students.length} öğrenci için yoklama kaydedildi.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Yoklama kaydedilemedi');
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="Yoklama"
        actions={
          <select
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setCourseId('');
              setStatuses({});
            }}
          >
            {(classes.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        }
      >
        {detail.loading && <Loading />}
        {detail.error && <ErrorBox message={detail.error} />}
        {detail.data && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ders">
              <select className="input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                {detail.data.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.courseName} {course.teacherName ? `· ${course.teacherName}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tarih">
              <input type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="Ders saati">
              <input
                type="number"
                min={1}
                max={12}
                className="input"
                value={period}
                onChange={(event) => setPeriod(Number(event.target.value))}
              />
            </Field>
          </div>
        )}
        {detail.data && detail.data.courses.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Bu şubeye önce ders atanmalı.</p>
        )}
      </Card>

      {detail.data && detail.data.students.length > 0 && (
        <Card
          title={`${detail.data.name} öğrencileri`}
          subtitle="Varsayılan: Var; isim veya numara ile arayın"
          actions={
            <input
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              placeholder="İsim veya numara ara…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        >
          <Table head={['No', 'Ad Soyad', 'Durum']}>
            {detail.data.students
              .filter((student) =>
                `${student.fullName} ${student.studentNumber}`
                  .toLocaleLowerCase('tr-TR')
                  .includes(search.toLocaleLowerCase('tr-TR')),
              )
              .map((student) => (
              <tr key={student.id}>
                <td className="px-2 py-2 font-mono text-xs">{student.studentNumber}</td>
                <td className="px-2 py-2">{student.fullName}</td>
                <td className="px-2 py-2">
                  <select
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    value={statuses[student.id] ?? 'PRESENT'}
                    onChange={(event) =>
                      setStatuses({ ...statuses, [student.id]: event.target.value as AttendanceStatus })
                    }
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ATTENDANCE_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </Table>
          <button type="button" className="btn-primary mt-4" onClick={save} disabled={!courseId}>
            Yoklamayı Kaydet
          </button>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          {message && <div className="mt-3"><Alert kind="success">{message}</Alert></div>}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
