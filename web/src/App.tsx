import { Navigate, Route, Routes } from 'react-router-dom';
import { useSetupStatus } from './hooks/useSetupStatus';
import { getToken } from './lib/api';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import SetupWizard from './pages/SetupWizard';

export default function App() {
  const { status, loading, error } = useSetupStatus();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Sistem durumu kontrol ediliyor…
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <h1 className="text-lg font-semibold text-slate-900">API'ye ulaşılamadı</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <p className="mt-4 text-xs text-slate-400">API çalışıyor mu? (http://localhost:3000/health)</p>
        </div>
      </div>
    );
  }

  const home = !status.isInitialized ? '/setup' : getToken() ? '/dashboard' : '/login';

  return (
    <Routes>
      <Route
        path="/setup"
        element={status.isInitialized ? <Navigate to="/login" replace /> : <SetupWizard />}
      />
      <Route
        path="/login"
        element={status.isInitialized ? <LoginPage /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/dashboard/*"
        element={getToken() ? <Dashboard status={status} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
