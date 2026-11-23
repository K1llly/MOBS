import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { SetupStatus } from '../types';

export function useSetupStatus() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .setupStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  return { status, error, loading: status === null && error === null };
}
