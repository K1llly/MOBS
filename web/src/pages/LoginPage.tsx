import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, storeSession } from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api.login(username, password);
      storeSession(response);
      navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Giriş yapılamadı');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">MOBS</p>
        <h1 className="mt-1 text-2xl font-bold">Giriş yap</h1>
        <p className="mt-1 text-sm text-slate-600">Kurum hesabınızla oturum açın.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="username">
              Kullanıcı adı
            </label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Şifre
            </label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-6 w-full" disabled={loading}>
          {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}
