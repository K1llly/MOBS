import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { Alert, Card, ErrorBox, Loading } from '../components/ui';

type Availability = 'AVAILABLE' | 'PREFER_NOT' | 'UNAVAILABLE';

const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Pazartesi' },
  { value: 2, label: 'Salı' },
  { value: 3, label: 'Çarşamba' },
  { value: 4, label: 'Perşembe' },
  { value: 5, label: 'Cuma' },
];

const PERIODS = Array.from({ length: 8 }, (_, index) => index + 1);

const CYCLE: Record<Availability, Availability> = {
  AVAILABLE: 'PREFER_NOT',
  PREFER_NOT: 'UNAVAILABLE',
  UNAVAILABLE: 'AVAILABLE',
};

const STYLES: Record<Availability, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PREFER_NOT: 'bg-amber-50 text-amber-700 border-amber-200',
  UNAVAILABLE: 'bg-red-50 text-red-700 border-red-200',
};

const LABELS: Record<Availability, string> = {
  AVAILABLE: 'Müsait',
  PREFER_NOT: 'Tercih etmem',
  UNAVAILABLE: 'Müsait değil',
};

export default function AvailabilityPage() {
  const me = useApi(() => api.teachers.availability.me(), []);
  const [grid, setGrid] = useState<Record<string, Availability>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me.data) return;
    const next: Record<string, Availability> = {};
    for (const slot of me.data.slots) {
      next[`${slot.dayOfWeek}:${slot.period}`] = slot.status;
    }
    setGrid(next);
  }, [me.data]);

  const cycle = (day: number, period: number) => {
    const key = `${day}:${period}`;
    const current = grid[key] ?? 'AVAILABLE';
    setGrid({ ...grid, [key]: CYCLE[current] });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const slots = DAYS.flatMap((day) =>
        PERIODS.map((period) => ({
          dayOfWeek: day.value,
          period,
          status: grid[`${day.value}:${period}`] ?? ('AVAILABLE' as Availability),
        })),
      );
      await api.teachers.availability.setMe(slots);
      setMessage('Müsaitlik kaydedildi; otomatik ders programı bunu dikkate alacak.');
      me.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Müsaitlik kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="Müsaitlik ve saat tercihleri"
        subtitle="Hücreye tıklayarak durumu değiştirin: Müsait → Tercih etmem → Müsait değil"
        actions={
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        }
      >
        {me.loading && <Loading />}
        {me.error && <ErrorBox message={me.error} />}
        {error && <Alert>{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}

        {me.data && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-2 py-2 text-slate-500">Gün</th>
                  {PERIODS.map((period) => (
                    <th key={period} className="border border-slate-200 bg-slate-50 px-2 py-2 text-slate-500">
                      {period}. saat
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day.value}>
                    <td className="whitespace-nowrap border border-slate-200 bg-slate-50 px-2 py-2 font-medium text-slate-600">
                      {day.label}
                    </td>
                    {PERIODS.map((period) => {
                      const status = grid[`${day.value}:${period}`] ?? 'AVAILABLE';
                      return (
                        <td key={period} className="border border-slate-200 p-1">
                          <button
                            type="button"
                            onClick={() => cycle(day.value, period)}
                            className={`h-8 w-full rounded-md border text-[10px] font-semibold ${STYLES[status]}`}
                            title={LABELS[status]}
                          >
                            {LABELS[status]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
