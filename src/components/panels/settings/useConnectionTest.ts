import { useState } from 'react';
import { testConnection } from '@/src/services/ai';

export type TestStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Mengelola status & pesan error pengecekan koneksi per-provider.
 * Dipakai independen oleh Kredensial API (4 provider cloud) dan Ollama.
 */
export function useConnectionTest() {
  const [statuses, setStatuses] = useState<Record<string, TestStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const statusOf = (prov: string): TestStatus => statuses[prov] ?? 'idle';

  const runTest = async (prov: string, key: string, model: string) => {
    setStatuses(prev => ({ ...prev, [prov]: 'loading' }));
    setErrors(prev => ({ ...prev, [prov]: '' }));
    try {
      const ok = await testConnection(prov, key, model);
      setStatuses(prev => ({ ...prev, [prov]: ok ? 'success' : 'error' }));
      if (!ok) {
        setErrors(prev => ({ ...prev, [prov]: 'Koneksi gagal tanpa pesan error spesifik.' }));
      }
    } catch (error: any) {
      setStatuses(prev => ({ ...prev, [prov]: 'error' }));
      console.error('Connection test failed; sensitive details omitted.');
      const msg = error.rawMessage || error.message || String(error);
      setErrors(prev => ({ ...prev, [prov]: msg }));
    } finally {
      setTimeout(() => {
        setStatuses(prev => ({ ...prev, [prov]: 'idle' }));
      }, 6000); // 6 seconds to let user read the fail/success state
    }
  };

  return { statusOf, errors, runTest };
}
