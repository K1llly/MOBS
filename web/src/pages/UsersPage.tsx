import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { ROLE_LABELS, type Role } from '../types';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';

const ROLES: Role[] = ['MANAGER', 'TEACHER', 'STUDENT', 'PARENT'];

export default function UsersPage() {
  const users = useApi(() => api.users.list(), []);
  const classes = useApi(() => api.classes.list(), []);
  const students = useApi(() => api.students.list(), []);

  const [filter, setFilter] = useState<'ALL' | Role>('ALL');
  const [form, setForm] = useState({
    role: 'STUDENT' as Role,
    fullName: '',
    username: '',
    password: '',
    branch: '',
    studentNumber: '',
    classId: '',
    childrenIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.users.create({
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        ...(form.role === 'TEACHER' ? { branch: form.branch || undefined } : {}),
        ...(form.role === 'STUDENT'
          ? {
              studentNumber: form.studentNumber.trim(),
              classId: form.classId || undefined,
            }
          : {}),
        ...(form.role === 'PARENT' && form.childrenIds.length > 0
          ? { childrenIds: form.childrenIds }
          : {}),
      });
      setForm({
        role: form.role,
        fullName: '',
        username: '',
        password: '',
        branch: '',
        studentNumber: '',
        classId: '',
        childrenIds: [],
      });
      setMessage('Kullanıcı oluşturuldu.');
      users.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Kullanıcı oluşturulamadı');
    }
  };

  const toggle = async (id: string, isActive: boolean) => {
    setError(null);
    try {
      await api.users.setStatus(id, isActive);
      users.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Durum güncellenemedi');
    }
  };

  const rows = (users.data ?? []).filter((user) => filter === 'ALL' || user.role === filter);

  return (
    <div className="space-y-4">
      <Card
        title="Kullanıcılar"
        subtitle="Kullanıcı adı ve şifre burada belirlenir; öğrenci/öğretmen profilleri otomatik oluşturulur."
        actions={
          <div className="flex gap-1">
            {(['ALL', ...ROLES] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setFilter(role)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  filter === role ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {role === 'ALL' ? 'Tümü' : ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        }
      >
        {error && <Alert>{error}</Alert>}
        {users.loading && <Loading />}
        {users.error && <ErrorBox message={users.error} />}
        {!users.loading && rows.length === 0 && <Empty>Bu filtrede kullanıcı yok.</Empty>}
        {rows.length > 0 && (
          <Table head={['Ad Soyad', 'Kullanıcı adı', 'Rol', 'Detay', 'Durum', '']}>
            {rows.map((user) => (
              <tr key={user.id}>
                <td className="px-2 py-2 font-medium">{user.fullName}</td>
                <td className="px-2 py-2 font-mono text-xs">@{user.username}</td>
                <td className="px-2 py-2">
                  <Badge tone={user.role === 'MANAGER' ? 'blue' : 'slate'}>{ROLE_LABELS[user.role]}</Badge>
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {user.role === 'STUDENT' && `${user.studentNumber ?? '—'} · ${user.className ?? 'şube yok'}`}
                  {user.role === 'TEACHER' && (user.branch ?? 'branş yok')}
                  {user.role === 'PARENT' && `${user.children.length} öğrenci`}
                  {user.role === 'MANAGER' && '—'}
                </td>
                <td className="px-2 py-2">
                  <Badge tone={user.isActive ? 'green' : 'red'}>{user.isActive ? 'Aktif' : 'Pasif'}</Badge>
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-500 hover:text-brand-700"
                    onClick={() => toggle(user.id, !user.isActive)}
                  >
                    {user.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {message && <Alert kind="success">{message}</Alert>}

      <Card title="Yeni kullanıcı" subtitle="Yönetici dahil tüm roller için kullanıcı adı ve şifre burada ayarlanır">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Rol">
            <select
              className="input"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ad soyad">
            <input
              className="input"
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            />
          </Field>
          <Field label="Kullanıcı adı">
            <input
              className="input"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
          </Field>
          <Field label="Şifre (en az 8 karakter)">
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </Field>

          {form.role === 'TEACHER' && (
            <Field label="Branş">
              <input
                className="input"
                value={form.branch}
                onChange={(event) => setForm({ ...form, branch: event.target.value })}
              />
            </Field>
          )}

          {form.role === 'STUDENT' && (
            <>
              <Field label="Öğrenci numarası">
                <input
                  className="input"
                  value={form.studentNumber}
                  onChange={(event) => setForm({ ...form, studentNumber: event.target.value })}
                />
              </Field>
              <Field label="Şube">
                <select
                  className="input"
                  value={form.classId}
                  onChange={(event) => setForm({ ...form, classId: event.target.value })}
                >
                  <option value="">—</option>
                  {(classes.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.studentCount}/{item.capacity})
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {form.role === 'PARENT' && (
            <div className="sm:col-span-2 xl:col-span-3">
              <Field label="Bağlı öğrenciler">
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {(students.data ?? []).length === 0 && (
                    <p className="text-xs text-slate-400">Öğrenci yok.</p>
                  )}
                  {(students.data ?? []).map((student) => (
                    <label key={student.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.childrenIds.includes(student.id)}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            childrenIds: event.target.checked
                              ? [...form.childrenIds, student.id]
                              : form.childrenIds.filter((id) => id !== student.id),
                          })
                        }
                      />
                      {student.fullName} ({student.studentNumber})
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-primary mt-4"
          onClick={create}
          disabled={
            form.fullName.trim().length < 3 ||
            form.username.trim().length < 3 ||
            form.password.length < 8 ||
            (form.role === 'STUDENT' && form.studentNumber.trim().length === 0)
          }
        >
          Kullanıcı Ekle
        </button>
      </Card>
    </div>
  );
}
