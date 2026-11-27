import { useEffect, useRef, useState } from 'react';
import { testConnection } from '@/src/services/ai';

export type TestStatus = 'idle' | 'loading' | 'success' | 'error';

/** A result applies to the credentials, model, and address captured for that test. */
export function useConnectionTest(provider: string, key: string, model: string, ollamaBaseUrl?: string) {
  const [status, setStatus] = useState<TestStatus>('idle');
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    setStatus('idle');
    setError('');
    return () => { requestId.current += 1; };
  }, [provider, key, model, ollamaBaseUrl]);

  const runTest = async () => {
    const id = ++requestId.current;
    setStatus('loading');
    setError('');
    try {
      const ok = await testConnection(provider, key, model, ollamaBaseUrl);
      if (id !== requestId.current) return;
      setStatus(ok ? 'success' : 'error');
      if (!ok) setError('Penyedia tidak mengembalikan respons teks.');
    } catch (cause) {
      if (id !== requestId.current) return;
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Uji koneksi gagal.');
    }
  };

  return { status, error, runTest };
}
