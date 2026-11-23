import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { GRADE_TYPE_LABELS, type GradeType } from '../types';
import { Alert, Card, ErrorBox, Field, Loading, Table } from '../components/ui';

const EDITABLE_TYPES: GradeType[] = [
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

export default function WeightsPage() {
  const policies = useApi(() => api.gradePolicies.list(), []);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!policies.data) return;
    const map: Record<string, string> = {};
    for (const policy of policies.data) {
      if (!policy.courseId) map[policy.gradeType] = String(policy.weight);
    }
    setWeights(map);
  }, [policies.data]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const globals = Object.entries(weights)
        .filter(([, value]) => value !== '' && Number(value) > 0)
        .map(([gradeType, value]) => ({ gradeType, weight: Number(value) }));

      // Ders bazlı özel politikalar korunur.
      const courseSpecific = (policies.data ?? [])
        .filter((policy) => policy.courseId)
        .map((policy) => ({
          courseId: policy.courseId,
          gradeType: policy.gradeType,
          weight: policy.weight,
        }));

      await api.gradePolicies.replace([...courseSpecific, ...globals]);
      setMessage('Not ağırlıkları kaydedildi; karne hesapları bu politikayı kullanır.');
      policies.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Ağırlıklar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const courseSpecific = (policies.data ?? []).filter((policy) => policy.courseId);

  return (
    <div className="space-y-4">
      <Card
        title="Not ağırlık politikaları"
        subtitle="Varsayılan ağırlıklar tüm derslere uygulanır. Ağırlık verilmeyen türler basit ortalamaya katılır."
        actions={
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        }
      >
        {policies.loading && <Loading />}
        {policies.error && <ErrorBox message={policies.error} />}
        {error && <Alert>{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EDITABLE_TYPES.map((type) => (
            <Field key={type} label={GRADE_TYPE_LABELS[type]}>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input"
                value={weights[type] ?? ''}
                placeholder="0"
                onChange={(event) => setWeights({ ...weights, [type]: event.target.value })}
              />
            </Field>
          ))}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Örnek: Yazılı 2, Ders Etkinliği 1 → yazılı notu ortalamaya iki kat etki eder.
        </p>
      </Card>

      {courseSpecific.length > 0 && (
        <Card title="Ders bazlı özel politikalar" subtitle="Bu kayıtlar kaydetme sırasında korunur">
          <Table head={['Ders', 'Not türü', 'Ağırlık']}>
            {courseSpecific.map((policy) => (
              <tr key={policy.id}>
                <td className="px-2 py-2">{policy.courseName}</td>
                <td className="px-2 py-2">{GRADE_TYPE_LABELS[policy.gradeType]}</td>
                <td className="px-2 py-2 font-semibold">{policy.weight}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
