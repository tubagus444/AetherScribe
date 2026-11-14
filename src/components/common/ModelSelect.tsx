import React, { useState, useMemo, useCallback } from 'react';
import { Search, Loader2, ChevronDown, Check, AlertCircle, RefreshCw } from 'lucide-react';
import {
  fetchModelsForProvider,
  ProviderModel,
  ModelListProvider,
} from '@/src/services/ai/modelService';
import { cn } from '@/src/lib/utils';

interface Props {
  provider: ModelListProvider;
  value: string;
  onChange: (value: string) => void;
  /** Wajib untuk google/groq/claude (listing model butuh key). OpenRouter tidak perlu. */
  apiKey?: string;
  placeholder?: string;
}

/** OpenRouter punya endpoint publik; provider lain butuh API key untuk listing. */
function needsKey(provider: ModelListProvider): boolean {
  return provider !== 'openrouter';
}

/**
 * Pemilih model seragam lintas-provider: dropdown searchable, lazy-load saat
 * dibuka, tetap mengizinkan ID model kustom. Menggantikan pola lama yang
 * berbeda-beda (tombol Google vs dropdown OpenRouter vs input polos).
 */
export function ModelSelect({ provider, value, onChange, apiKey, placeholder }: Props) {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const keyMissing = needsKey(provider) && !apiKey?.trim();

  const loadModels = useCallback(async () => {
    if (keyMissing) {
      setError('Masukkan API key terlebih dahulu untuk melihat daftar model.');
      setLoaded(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchModelsForProvider(provider, apiKey?.trim());
      setModels(data);
      if (data.length === 0) {
        setError('Tidak ada model ditemukan, atau key tidak valid.');
      }
    } catch (err: any) {
      console.error('Model listing failed; sensitive details omitted.');
      setError(err?.message || 'Gagal memuat daftar model.');
    } finally {
      setIsLoading(false);
      setLoaded(true);
    }
  }, [provider, apiKey, keyMissing]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !loaded && !isLoading) loadModels();
  };

  const filteredModels = useMemo(() => {
    if (!search) return models;
    const s = search.toLowerCase();
    return models.filter((m) => m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s));
  }, [models, search]);

  const selectedLabel = useMemo(() => {
    const found = models.find((m) => m.id === value);
    return found?.name || value;
  }, [models, value]);

  const showCustomOption =
    !!search && !models.find((m) => m.id === search || m.name === search);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between"
      >
        <span className="truncate text-slate-700 dark:text-slate-300">
          {selectedLabel || placeholder || 'Pilih model...'}
        </span>
        <ChevronDown size={14} className={cn('text-slate-400 transition-transform shrink-0', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl max-h-60 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Cari atau ketik ID model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none text-xs focus:ring-0 focus:outline-none text-slate-900 dark:text-slate-100 min-w-0"
            />
            <button
              type="button"
              title="Muat ulang daftar model"
              onClick={(e) => {
                e.stopPropagation();
                loadModels();
              }}
              className="text-slate-400 hover:text-indigo-500 shrink-0"
            >
              <RefreshCw size={13} className={cn(isLoading && 'animate-spin')} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Memuat model...
              </div>
            ) : error ? (
              <div className="p-4 text-center">
                <AlertCircle size={20} className="mx-auto mb-2 text-amber-500 opacity-70" />
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 font-medium">{error}</p>
                {!keyMissing && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadModels();
                    }}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    Coba lagi
                  </button>
                )}
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">
                {search ? 'Tidak ada model cocok.' : 'Belum ada model.'}
              </div>
            ) : (
              filteredModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex flex-col gap-0.5 transition-colors',
                    value === m.id && 'bg-indigo-50/50 dark:bg-indigo-900/10',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('font-medium truncate', value === m.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300')}>
                      {m.name}
                    </span>
                    {value === m.id && <Check size={12} className="text-indigo-600 shrink-0" />}
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                    {m.description ? `${m.id} — ${m.description}` : m.id}
                  </span>
                </button>
              ))
            )}
          </div>

          {showCustomOption && (
            <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => {
                  onChange(search.trim());
                  setIsOpen(false);
                  setSearch('');
                }}
                className="w-full text-left px-2 py-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline truncate"
              >
                Gunakan ID model kustom: "{search.trim()}"
              </button>
            </div>
          )}
        </div>
      )}

      {/* Klik di luar untuk menutup */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}
