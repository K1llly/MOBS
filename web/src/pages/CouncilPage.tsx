import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { ATTENDANCE_LABELS } from '../types';
import { Alert, Badge, Card, Empty, ErrorBox, Loading, Table } from '../components/ui';

export default function CouncilPage() {
  const classes = useApi(() => api.classes.list(), []);
  const [classId, setClassId] = useState('');
  const [tab, setTab] = useState<'risk' | 'cases'>('risk');
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const overview = useApi(() => api.attendance.overview(classId || undefined), [classId]);
  const cases = useApi(() => api.council.list(), []);

  const addCase = async (studentId: string, label: string) => {
    setError(null);
    setMessage(null);
    try {
      await api.council.create({
        studentId,
        reason: `Devamsızlık: ${label}`,
      });
      setMessage('Öğrenci ŞÖK gündemine eklendi.');
      cases.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'ŞÖK dosyası oluşturulamadı');
    }
  };

  const resolve = async (caseId: string) => {
    const decision = decisions[caseId]?.trim();
    if (!decision) return;
    setError(null);
    setMessage(null);
    try {
      await api.council.resolve(caseId, { status: 'RESOLVED', decision });
      setMessage('ŞÖK kararı kaydedildi.');
      cases.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Karar kaydedilemedi');
    }
  };

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}

      <Card
        title="Devamsızlık & ŞÖK"
        subtitle={
          overview.data
            ? `${overview.data.term.name} · sınır: ${overview.data.limits.unexcusedLimit} özürsüz / ${overview.data.limits.totalLimit} toplam`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <button
                type="button"
                className={tab === 'risk' ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setTab('risk')}
              >
                Devamsızlık riski
              </button>
              <button
                type="button"
                className={tab === 'cases' ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setTab('cases')}
              >
                ŞÖK dosyaları ({cases.data?.filter((item) => item.status === 'OPEN').length ?? 0})
              </button>
            </div>
            {tab === 'risk' && (
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
            )}
          </div>
        }
      >
        {tab === 'risk' && (
          <>
            {overview.loading && <Loading />}
            {overview.error && <ErrorBox message={overview.error} />}
            {overview.data && overview.data.rows.length === 0 && <Empty>Öğrenci yok.</Empty>}
            {overview.data && overview.data.rows.length > 0 && (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  {overview.data.summary.failed} öğrenci sınırı aştı, {overview.data.summary.warning}{' '}
                  öğrenci sınıra yakın.
                </p>
                <Table head={['No', 'Ad Soyad', 'Şube', 'Özürsüz', 'Toplam', 'Durum', 'İşlem']}>
                  {overview.data.rows.map((row) => (
                    <tr key={row.studentId}>
                      <td className="px-2 py-2 font-mono text-xs">{row.studentNumber}</td>
                      <td className="px-2 py-2 font-medium">{row.fullName}</td>
                      <td className="px-2 py-2 text-slate-600">{row.className ?? '—'}</td>
                      <td className="px-2 py-2">{row.unexcused}</td>
                      <td className="px-2 py-2">{row.total}</td>
                      <td className="px-2 py-2">
                        <Badge
                          tone={row.status === 'FAILED' ? 'red' : row.status === 'WARNING' ? 'amber' : 'green'}
                        >
                          {row.status === 'FAILED' ? 'Sınır aşıldı' : row.status === 'WARNING' ? 'Sınıra yakın' : 'Normal'}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right">
                        {row.status !== 'OK' && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-slate-500 hover:text-brand-700"
                            onClick={() =>
                              addCase(
                                row.studentId,
                                `${row.unexcused} özürsüz / ${row.total} toplam`,
                              )
                            }
                          >
                            ŞÖK'e Ekle
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </>
        )}

        {tab === 'cases' && (
          <>
            {cases.loading && <Loading />}
            {cases.error && <ErrorBox message={cases.error} />}
            {cases.data && cases.data.length === 0 && <Empty>ŞÖK dosyası yok.</Empty>}
            {cases.data && cases.data.length > 0 && (
              <div className="space-y-2">
                {cases.data.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {item.fullName}{' '}
                          <span className="text-xs text-slate-400">{item.studentNumber}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.className ?? '—'} · {item.termName} · {item.reason}
                        </p>
                      </div>
                      <Badge tone={item.status === 'OPEN' ? 'amber' : 'green'}>
                        {item.status === 'OPEN' ? 'Açık' : 'Karara bağlandı'}
                      </Badge>
                    </div>

                    {item.status === 'OPEN' ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          className="input max-w-md"
                          placeholder="Kurul kararı (ör. sorumlu geçti)"
                          value={decisions[item.id] ?? ''}
                          onChange={(event) =>
                            setDecisions({ ...decisions, [item.id]: event.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => resolve(item.id)}
                          disabled={!(decisions[item.id] ?? '').trim()}
                        >
                          Karara Bağla
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">
                        Karar: <span className="font-medium">{item.decision}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {overview.data && (
        <Card title="Devamsızlık kayıt özeti" subtitle={ATTENDANCE_LABELS.PRESENT + ' / yoklama durumları'}>
          <p className="text-sm text-slate-600">
            Özürsüz {overview.data.summary.failed + overview.data.summary.warning} öğrenci risk
            grubunda. Kayıtlar öğretmenlerin girdiği yoklamalardan otomatik hesaplanır.
          </p>
        </Card>
      )}
    </div>
  );
}
