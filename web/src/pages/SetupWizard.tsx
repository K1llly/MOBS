import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import {
  INSTITUTION_LABELS,
  type InstitutionType,
  type PresetSummary,
} from '../types';

const STEPS = ['Kurum Tipi', 'Kural Önizleme', 'Kurum Profili & Yönetici'];

const MOCK_POLICY_LABEL = {
  CONFIGURABLE: 'Etkili / etkisiz seçilebilir',
  LOCKED_FALSE: 'Karneye etkisiz (kilitli)',
  DISABLED: 'Kapalı',
} as const;

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [institutionType, setInstitutionType] = useState<InstitutionType>('HIGH');
  const [profile, setProfile] = useState({
    institutionName: '',
    yearName: '2026-2027',
    startDate: '2026-09-15',
    endDate: '2027-06-30',
    dailyPeriodCount: 8,
  });
  const [admin, setAdmin] = useState({
    fullName: '',
    username: '',
    password: '',
    passwordConfirm: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .setupPresets()
      .then((result) => setPresets(result.presets))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const selected = presets.find((preset) => preset.type === institutionType);
  const passwordsMatch = admin.password.length >= 8 && admin.password === admin.passwordConfirm;
  const accountReady =
    admin.fullName.trim().length >= 3 && admin.username.trim().length >= 3 && passwordsMatch;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.initialize({
        institutionType,
        institutionName: profile.institutionName,
        dailyPeriodCount: profile.dailyPeriodCount,
        academicYear: {
          name: profile.yearName,
          startDate: new Date(profile.startDate).toISOString(),
          endDate: new Date(profile.endDate).toISOString(),
        },
        admin: {
          fullName: admin.fullName,
          username: admin.username,
          password: admin.password,
        },
      });
      window.location.href = '/login';
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Kurulum tamamlanamadı');
      setSubmitting(false);
    }
  };

  const canContinue =
    step === 0
      ? Boolean(selected)
      : step === 2
        ? profile.institutionName.trim().length >= 2 && accountReady
        : true;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-10">
      <header className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">MOBS Kurulum</p>
        <h1 className="mt-1 text-3xl font-bold">Kurum Oluşturma Sihirbazı</h1>
        <p className="mt-2 text-slate-600">
          Kurumunuzun kurallarını, modüllerini ve ilk yönetici hesabını tanımlayın.
        </p>
      </header>

      <ol className="mb-6 grid grid-cols-3 gap-3">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-lg border px-3 py-2 text-center text-sm font-medium ${
              index === step
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : index < step
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="card">
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold">Kurum tipini seçin</h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">
              Seçime göre yönetmelik kuralları ve modüller otomatik yüklenir.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {presets.map((preset) => (
                <button
                  key={preset.type}
                  type="button"
                  onClick={() => setInstitutionType(preset.type)}
                  className={`rounded-xl border p-4 text-left transition ${
                    institutionType === preset.type
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="block font-semibold">{INSTITUTION_LABELS[preset.type]}</span>
                  <span className="mt-1 block text-xs text-slate-500">{preset.gradingStrategy}</span>
                  <span className="mt-2 block text-xs text-slate-500">
                    Deneme: {MOCK_POLICY_LABEL[preset.mockExamPolicy]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && selected && (
          <div>
            <h2 className="text-lg font-semibold">Otomatik kural seti önizlemesi</h2>
            <p className="mt-1 text-sm text-slate-600">
              Bu ayarlar kurulum tamamlandığında tek bir transaction ile veritabanına yazılır.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Notlandırma stratejisi</dt>
                <dd className="font-mono text-sm">{selected.gradingStrategy}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Aktif roller</dt>
                <dd className="text-sm">{selected.roles.join(', ')}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Sınıf kademeleri</dt>
                <dd className="text-sm">
                  {selected.gradeLevels.length > 0 ? selected.gradeLevels.join(', ') : 'Kademe tanımı yok'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Deneme sınavı</dt>
                <dd className="text-sm">{MOCK_POLICY_LABEL[selected.mockExamPolicy]}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-slate-400">Açılacak modüller</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.enabledModules.map((module) => (
                  <span
                    key={module}
                    className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                  >
                    {module}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold">Kurum profili ve ilk yönetici</h2>
            <p className="mt-1 text-sm text-slate-600">
              Kurulum onaylandığında sihirbaz kalıcı olarak kilitlenir ve bu hesapla giriş yapılır.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="institutionName">
                  Kurum adı
                </label>
                <input
                  id="institutionName"
                  className="input"
                  value={profile.institutionName}
                  onChange={(event) => setProfile({ ...profile, institutionName: event.target.value })}
                  placeholder="Örn. Ankara Bilim Koleji"
                />
              </div>
              <div>
                <label className="label" htmlFor="yearName">
                  Eğitim yılı
                </label>
                <input
                  id="yearName"
                  className="input"
                  value={profile.yearName}
                  onChange={(event) => setProfile({ ...profile, yearName: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="dailyPeriodCount">
                  Günlük ders saati
                </label>
                <input
                  id="dailyPeriodCount"
                  type="number"
                  min={4}
                  max={12}
                  className="input"
                  value={profile.dailyPeriodCount}
                  onChange={(event) =>
                    setProfile({ ...profile, dailyPeriodCount: Number(event.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="startDate">
                  Dönem başlangıcı
                </label>
                <input
                  id="startDate"
                  type="date"
                  className="input"
                  value={profile.startDate}
                  onChange={(event) => setProfile({ ...profile, startDate: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="endDate">
                  Dönem bitişi
                </label>
                <input
                  id="endDate"
                  type="date"
                  className="input"
                  value={profile.endDate}
                  onChange={(event) => setProfile({ ...profile, endDate: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-800">İlk yönetici hesabı</h3>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                Bu kurum için MANAGER rolünde oluşturulacak kullanıcı adı ve şifre.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="adminName">
                    Ad soyad
                  </label>
                  <input
                    id="adminName"
                    className="input"
                    value={admin.fullName}
                    onChange={(event) => setAdmin({ ...admin, fullName: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="adminUsername">
                    Kullanıcı adı
                  </label>
                  <input
                    id="adminUsername"
                    className="input"
                    autoComplete="username"
                    value={admin.username}
                    onChange={(event) => setAdmin({ ...admin, username: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="adminPassword">
                    Şifre (en az 8 karakter)
                  </label>
                  <input
                    id="adminPassword"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={admin.password}
                    onChange={(event) => setAdmin({ ...admin, password: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="adminPasswordConfirm">
                    Şifre tekrar
                  </label>
                  <input
                    id="adminPasswordConfirm"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={admin.passwordConfirm}
                    onChange={(event) => setAdmin({ ...admin, passwordConfirm: event.target.value })}
                  />
                  {admin.passwordConfirm.length > 0 && !passwordsMatch && (
                    <p className="mt-1 text-xs text-red-600">Şifreler eşleşmiyor (en az 8 karakter).</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
          >
            Geri
          </button>
          {step < 2 ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setStep((current) => current + 1)}
              disabled={!canContinue}
            >
              İleri
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={submit} disabled={!canContinue || submitting}>
              {submitting ? 'Kuruluyor…' : 'Kurulumu Tamamla'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
