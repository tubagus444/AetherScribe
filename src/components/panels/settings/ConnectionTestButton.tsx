import React from 'react';
import { Check, RefreshCcw, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { TestStatus } from '@/src/components/panels/settings/useConnectionTest';

interface Props {
  status: TestStatus;
  disabled?: boolean;
  onClick: () => void;
}

/** Tombol "Cek Koneksi" dengan ikon & warna per-status. Dipakai Kredensial API & Ollama. */
export function ConnectionTestButton({ status, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || status === 'loading'}
      title="Uji koneksi"
      className={cn(
        "flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60",
        status === 'idle' && "bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700",
        status === 'loading' && "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700",
        status === 'success' && "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-200 dark:border-emerald-900/50",
        status === 'error' && "bg-red-50 dark:bg-red-900/20 text-red-600 border-red-200 dark:border-red-900/50"
      )}
    >
      {status === 'loading' && <Loader2 size={16} className="animate-spin" />}
      {status === 'success' && <Check size={16} />}
      {status === 'error' && <XCircle size={16} />}
      {status === 'idle' && <RefreshCcw size={14} />}
      <span className="text-sm font-medium">
        {status === 'idle' && 'Uji koneksi'}
        {status === 'loading' && 'Menguji…'}
        {status === 'success' && 'Koneksi berhasil'}
        {status === 'error' && 'Uji ulang koneksi'}
      </span>
    </button>
  );
}
