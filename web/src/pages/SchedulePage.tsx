import { useState } from 'react';
import { api, ApiError, getStoredUser } from '../lib/api';
import { useApi } from '../hooks/useApi';
import type { AutoFillResult } from '../types';
import { Alert, Badge, Card, Empty, ErrorBox, Loading } from '../components/ui';

const DAY_LABELS: Record<number, string> = {
  1: 'Pzt',
  2: 'Sal',
  3: 'Çar',
  4: 'Per',
  5: 'Cum',
  6: 'Cmt',
  7: 'Paz',
};

export default function SchedulePage({ dailyPeriodCount = 8 }: { dailyPeriodCount?: number }) {
  const user = getStoredUser();
  const isManager = user?.role === 'MANAGER';

  const schedule = useApi(() => api.schedule.get(), []);
  const [result, setResult] = useState<AutoFillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const autoFill = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const filled = await api.schedule.autoFill();
      setResult(filled);
      setMessage(`${filled.placedCount} ders saati yerleştirildi.`);
      schedule.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Otomatik doldurma başarısız');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!schedule.data?.plan) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.schedule.publish(schedule.data.plan.id);
      setMessage('Ders programı yayınlandı; öğretmen ve öğrencilere yansıdı.');
      schedule.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Program yayınlanamadı');
    } finally {
      setBusy(false);
    }
  };

  const slots = schedule.data?.slots ?? [];
  const maxPeriod = slots.reduce((max, slot) => Math.max(max, slot.period), dailyPeriodCount);
  const periods = Array.from({ length: maxPeriod }, (_, index) => index + 1);
  const days = [1, 2, 3, 4, 5];
  const byCell = new Map(slots.map((slot) => [`${slot.dayOfWeek}:${slot.period}`, slot]));

  return (
    <div className="space-y-4">
      <Card
        title="Hibrit ders programı"
        subtitle={
          schedule.data
            ? `${schedule.data.term.name}${schedule.data.plan ? ` · ${schedule.data.plan.name}` : ''}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {schedule.data?.plan && (
              <Badge tone={schedule.data.plan.status === 'PUBLISHED' ? 'green' : 'amber'}>
                {schedule.data.plan.status === 'PUBLISHED' ? 'Yayınlandı' : 'Taslak'}
              </Badge>
            )}
            {isManager && (
              <>
                <button type="button" className="btn-ghost" onClick={autoFill} disabled={busy}>
                  Otomatik Doldur
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={publish}
                  disabled={busy || !schedule.data?.plan || schedule.data.plan.status === 'PUBLISHED'}
                >
                  Yayınla
                </button>
              </>
            )}
          </div>
        }
      >
        {error && <Alert>{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}
        {schedule.loading && <Loading />}
        {schedule.error && <ErrorBox message={schedule.error} />}
        {!schedule.loading && slots.length === 0 && (
          <Empty>
            {isManager
              ? 'Henüz slot yok. "Otomatik Doldur" ile oluşturabilirsiniz.'
              : 'Yayınlanmış ders programı yok.'}
          </Empty>
        )}
      </Card>

      {slots.length > 0 && (
        <Card title="Haftalık program">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-2 py-2 text-slate-500">Saat</th>
                  {days.map((day) => (
                    <th key={day} className="border border-slate-200 bg-slate-50 px-2 py-2 text-slate-500">
                      {DAY_LABELS[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period}>
                    <td className="border border-slate-200 bg-slate-50 px-2 py-2 text-center font-semibold text-slate-500">
                      {period}
                    </td>
                    {days.map((day) => {
                      const slot = byCell.get(`${day}:${period}`);
                      return (
                        <td key={`${day}-${period}`} className="border border-slate-200 p-1 align-top">
                          {slot ? (
                            <div className="rounded-md bg-brand-50 px-2 py-1">
                              <p className="font-semibold text-brand-800">{slot.courseName}</p>
                              <p className="text-[11px] text-brand-700">{slot.className}</p>
                              <p className="text-[11px] text-slate-500">
                                {slot.teacherName ?? '—'}
                                {slot.roomName ? ` · ${slot.roomName}` : ''}
                              </p>
                              {slot.isPinned && <span className="text-[10px] text-amber-600">📌 kilitli</span>}
                            </div>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && result.unplaced.length > 0 && (
        <Card title="Yerleştirilemeyen bloklar" subtitle="FR-SCH-06 — program çökmez, neden raporlanır">
          <ul className="space-y-1 text-sm">
            {result.unplaced.map((item) => (
              <li key={item.blockId} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                <span>{item.label}</span>
                <Badge tone="amber">{item.reason}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
