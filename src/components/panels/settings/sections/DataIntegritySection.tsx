import React, { useState } from 'react';
import { auditProjectIntegrity, type IntegrityIssue } from '@/src/services/integrityAudit';

const reasonLabels: Record<IntegrityIssue['reason'], string> = {
  invalid: 'ID tidak valid',
  missing: 'Target tidak ditemukan',
  'cross-project': 'Target berada di proyek lain',
};

export function DataIntegritySection() {
  const [issues, setIssues] = useState<IntegrityIssue[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  const check = async () => {
    setChecking(true);
    setError(false);
    setIssues(null);
    setVisibleCount(50);
    try {
      setIssues(await auditProjectIntegrity());
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
      <h3 className="text-sm font-semibold">Pemeriksaan Relasi Data</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">Periksa tautan antar-record di semua proyek. Pemeriksaan ini hanya membaca data.</p>
      <button type="button" onClick={check} disabled={checking} className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50 dark:bg-indigo-900/20 dark:text-indigo-300">
        {checking ? 'Memeriksa relasi…' : 'Periksa Relasi Data'}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">Pemeriksaan gagal. Coba lagi.</p>}
      {issues && (
        <p role="status" className="text-sm">{issues.length ? `${issues.length} masalah relasi ditemukan.` : 'Tidak ada masalah relasi yang ditemukan.'}</p>
      )}
      {!!issues?.length && (
        <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm text-slate-600 dark:text-slate-400">
          {issues.slice(0, visibleCount).map(({ table, recordId, field, reason }) => (
            <li key={`${table}:${recordId}:${field}`}>{table} #{recordId ?? '?'} · {field} · {reasonLabels[reason]}</li>
          ))}
        </ul>
      )}
      {issues && issues.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount(count => count + 50)} className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
          Tampilkan lebih banyak
        </button>
      )}
    </section>
  );
}
