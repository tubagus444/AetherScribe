import React, { useEffect, useState } from 'react';

type PersistenceStatus = 'checking' | 'available' | 'requesting' | 'granted' | 'denied' | 'unavailable';

const messages: Record<PersistenceStatus, string> = {
  checking: 'Memeriksa status perlindungan penyimpanan…',
  available: 'Penyimpanan dapat dibersihkan oleh peramban saat ruang perangkat menipis.',
  requesting: 'Meminta perlindungan penyimpanan…',
  granted: 'Peramban memberi perlindungan dari pembersihan otomatis saat ruang perangkat menipis.',
  denied: 'Peramban menolak permintaan. Anda tetap bisa menulis dan membuat cadangan.',
  unavailable: 'Perlindungan penyimpanan tidak tersedia di peramban ini. Anda tetap bisa menulis dan membuat cadangan.',
};

export function StoragePersistenceSection() {
  const [status, setStatus] = useState<PersistenceStatus>('checking');

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const storage = navigator.storage;
        const persisted = await storage?.persisted?.();
        if (active) setStatus(persisted ? 'granted' : storage?.persist ? 'available' : 'unavailable');
      } catch {
        if (active) setStatus('unavailable');
      }
    }
    void check();
    return () => { active = false; };
  }, []);

  const request = async () => {
    setStatus('requesting');
    try {
      const granted = await navigator.storage.persist();
      setStatus(granted ? 'granted' : 'denied');
    } catch {
      setStatus('unavailable');
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Perlindungan Penyimpanan Peramban</h3>
      <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{messages[status]}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">Simpan cadangan eksternal untuk pemulihan jika data peramban dihapus atau perangkat hilang.</p>
      {(status === 'available' || status === 'denied' || status === 'requesting') && (
        <button type="button" onClick={request} disabled={status === 'requesting'} className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50 dark:bg-indigo-900/20 dark:text-indigo-300">
          Minta Perlindungan Penyimpanan
        </button>
      )}
    </section>
  );
}
