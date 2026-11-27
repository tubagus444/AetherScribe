import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Loader2, ChevronDown, Check, AlertCircle, RefreshCw } from 'lucide-react';
import {
  fetchModelsForProvider,
  ProviderModel,
  ModelListProvider,
} from '@/src/services/ai/modelService';
import { cn } from '@/src/lib/utils';

interface Props {
  id?: string;
  descriptionId?: string;
  provider: ModelListProvider;
  value: string;
  onChange: (value: string) => void;
  apiKey?: string;
  placeholder?: string;
  allowServerKey?: boolean;
  lightTaskDefault?: string;
}

/**
 * Pemilih model seragam lintas-provider: dropdown searchable, lazy-load saat
 * dibuka, tetap mengizinkan ID model kustom. Menggantikan pola lama yang
 * berbeda-beda (tombol Google vs dropdown OpenRouter vs input polos).
 */
export function ModelSelect({ id, descriptionId, provider, value, onChange, apiKey, placeholder, allowServerKey, lightTaskDefault }: Props) {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const request = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const credential = apiKey?.trim();
  const lightTask = lightTaskDefault !== undefined;
  const keyMissing = !lightTask && !allowServerKey && provider !== 'openrouter' && !credential;
  const defaultLabel = lightTaskDefault ? `Default AetherScribe (${lightTaskDefault})` : 'Default AetherScribe';

  useEffect(() => {
    setModels([]);
    setLoaded(false);
    setIsLoading(false);
    setError(null);
    setIsOpen(false);
    setSearch('');
    return () => request.current?.abort();
  }, [provider, credential]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [isOpen]);

  const loadModels = async () => {
    if (keyMissing) {
      setError('Masukkan API key terlebih dahulu untuk melihat daftar model.');
      setLoaded(true);
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchModelsForProvider(provider, credential, { lightTask, signal: controller.signal });
      if (controller.signal.aborted) return;
      setModels(data);
      if (data.length === 0) {
        setError(lightTask ? 'Tidak ada model teks yang tersedia.' : 'Tidak ada model ditemukan, atau key tidak valid.');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Model listing failed; sensitive details omitted.');
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar model.');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        setLoaded(true);
      }
    }
  };

  const closePicker = () => {
    setIsOpen(false);
    setSearch('');
    trigger.current?.focus();
  };

  const selectModel = (model: string) => {
    onChange(model);
    closePicker();
  };

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
    !lightTask && !!search && !models.find((m) => m.id === search || m.name === search);

  return (
    <div
      ref={picker}
      className="relative w-full"
      onBlur={event => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
          setSearch('');
        }
      }}
      onKeyDown={(event) => {
        if (isOpen && event.key === 'Escape') {
          event.stopPropagation();
          closePicker();
        }
      }}
    >
      <button
        id={id}
        ref={trigger}
        type="button"
        aria-describedby={descriptionId}
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800"
      >
        <span className="min-w-0 text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200">
          {selectedLabel || (lightTask ? defaultLabel : placeholder || 'Pilih model...')}
        </span>
        <ChevronDown size={16} className={cn('text-slate-500 transition-transform shrink-0', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 flex max-h-72 w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 dark:border-slate-800">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder={lightTask ? 'Cari model...' : 'Cari atau ketik ID model...'}
              value={search}
              aria-label="Cari model"
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 min-w-0 flex-1 border-none bg-transparent text-sm text-slate-900 focus:ring-0 focus:outline-none dark:text-slate-100"
            />
            <button
              type="button"
              title="Muat ulang daftar model"
              disabled={isLoading}
              onClick={(e) => {
                e.stopPropagation();
                loadModels();
              }}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-slate-600 hover:text-indigo-600 dark:text-slate-400"
            >
              <RefreshCw size={13} className={cn(isLoading && 'animate-spin')} />
            </button>
          </div>

          {lightTask && (
            <button
              type="button"
              onClick={() => selectModel('')}
              className="flex min-h-11 w-full shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm font-medium hover:bg-indigo-50 dark:border-slate-800 dark:hover:bg-indigo-900/20"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{defaultLabel}</span>
              {!value && <Check size={12} className="text-indigo-600 shrink-0" />}
            </button>
          )}

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Memuat model...
              </div>
            ) : error ? (
              <div className="p-4 text-center" role="status">
                <AlertCircle size={20} className="mx-auto mb-2 text-amber-500 opacity-70" />
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 font-medium">{error}</p>
                {!keyMissing && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadModels();
                    }}
                    className="min-h-11 px-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
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
                  onClick={() => selectModel(m.id)}
                  className={cn(
                    'flex min-h-11 w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/20',
                    value === m.id && 'bg-indigo-50/50 dark:bg-indigo-900/10',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('font-medium truncate', value === m.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300')}>
                      {m.name}
                    </span>
                    {value === m.id && <Check size={12} className="text-indigo-600 shrink-0" />}
                  </div>
                  <span className="text-xs text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">
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
                onClick={() => selectModel(search.trim())}
                className="min-h-11 w-full px-2 text-left text-sm font-medium text-indigo-600 [overflow-wrap:anywhere] hover:underline dark:text-indigo-400"
              >
                Gunakan ID model kustom: "{search.trim()}"
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
