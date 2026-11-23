import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { ROLE_LABELS, type Role } from '../types';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';

const ROLES: Role[] = ['MANAGER', 'TEACHER', 'STUDENT'];

export default function UsersPage() {
  const users = useApi(() => api.users.list(), []);
  const classes = useApi(() => api.classes.list(), []);

  const [filter, setFilter] = useState<'ALL' | Role>('ALL');
  const [form, setForm] = useState({
    role: 'STUDENT' as Role,
    fullName: '',
    username: '',
    password: '',
    branch: '',
    studentNumber: '',
    classId: '',
  });
  const [search, setSearch] = useState('');
  const [resetTarget, setResetTarget] = useState<{ id: string; fullName: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
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
              ...(form.studentNumber.trim() ? { studentNumber: form.studentNumber.trim() } : {}),
              classId: form.classId || undefined,
            }
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

  const resetPassword = async () => {
    if (!resetTarget) return;
    setError(null);
    setMessage(null);
    try {
      const result = await api.users.resetPassword(resetTarget.id, newPassword);
      setMessage(`${result.username} için şifre güncellendi.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Şifre güncellenemedi');
    }
  };

  const query = search.trim().toLocaleLowerCase('tr-TR');
  const rows = (users.data ?? [])
    .filter((user) => filter === 'ALL' || user.role === filter)
    .filter(
      (user) =>
        !query ||
        `${user.fullName} ${user.username} ${user.studentNumber ?? ''}`
          .toLocaleLowerCase('tr-TR')
          .includes(query),
    );

  return (
    <div className="space-y-4">
      <Card
        title="Kullanıcılar"
        subtitle="İsim, kullanıcı adı veya öğrenci numarasıyla arayın; şifreleri burada yönetin."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              placeholder="İsim / kullanıcı adı / numara ara…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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
          </div>
        }
      >
        {error && <Alert>{error}</Alert>}
        {users.loading && <Loading />}
        {users.error && <ErrorBox message={users.error} />}
        {!users.loading && rows.length === 0 && <Empty>Bu filtrede kullanıcı yok.</Empty>}
        {rows.length > 0 && (
          <Table head={['Ad Soyad', 'Kullanıcı adı', 'Rol', 'Detay', 'Durum', 'İşlem']}>
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
                  {user.role === 'MANAGER' && '—'}
                </td>
                <td className="px-2 py-2">
                  <Badge tone={user.isActive ? 'green' : 'red'}>{user.isActive ? 'Aktif' : 'Pasif'}</Badge>
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {user.role !== 'MANAGER' && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-500 hover:text-amber-700"
                        onClick={() =>
                          setResetTarget({
                            id: user.id,
                            fullName: user.fullName,
                            username: user.username,
                          })
                        }
                      >
                        Şifre Sıfırla
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs font-semibold text-slate-500 hover:text-brand-700"
                      onClick={() => toggle(user.id, !user.isActive)}
                    >
                      {user.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {message && <Alert kind="success">{message}</Alert>}

      {resetTarget && (
        <Card
          title={`Şifre sıfırla · ${resetTarget.fullName}`}
          subtitle="Eski şifre görüntülenmez; öğrenci/öğretmen için yeni şifreyi siz belirlersiniz."
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <Field label="Yeni şifre (en az 8 karakter)">
                <input
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={resetPassword}
              disabled={newPassword.length < 8}
            >
              Şifreyi Kaydet
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setResetTarget(null);
                setNewPassword('');
              }}
            >
              İptal
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Kullanıcı: @{resetTarget.username} · yeni şifre kaydedildikten sonra eski şifre geçersiz olur.
          </p>
        </Card>
      )}

      <Card title="Yeni kullanıcı" subtitle="Yönetici; yönetici, öğretmen ve öğrenci hesaplarını kullanıcı adı/şifre ile burada oluşturur">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={form.role === 'MANAGER' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setForm({ ...form, role: 'MANAGER' })}
          >
            + Yönetici Ekle
          </button>
          <button
            type="button"
            className={form.role === 'TEACHER' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setForm({ ...form, role: 'TEACHER' })}
          >
            + Öğretmen Ekle
          </button>
          <button
            type="button"
            className={form.role === 'STUDENT' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setForm({ ...form, role: 'STUDENT' })}
          >
            + Öğrenci Ekle
          </button>
        </div>
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
              <Field label="Öğrenci numarası" hint="Boş bırakılırsa otomatik üretilir: YY + kademe(2) + sıra(4) → 26090001">
                <input
                  className="input"
                  value={form.studentNumber}
                  placeholder="Otomatik (örn. 26090001)"
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm({
                      ...form,
                      studentNumber: value,
                      username:
                        form.username === '' || form.username === form.studentNumber
                          ? value
                          : form.username,
                    });
                  }}
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

        </div>

        <button
          type="button"
          className="btn-primary mt-4"
          onClick={create}
          disabled={
            form.fullName.trim().length < 3 ||
            form.username.trim().length < 3 ||
            form.password.length < 8
          }
        >
          Kullanıcı Ekle
        </button>
      </Card>
    </div>
  );
}
