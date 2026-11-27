import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Loader2, ChevronDown, Check, AlertCircle, RefreshCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { fetchOllamaModels, NO_OLLAMA_MODELS } from '@/src/services/ai/ollamaModels';

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  baseUrl: string;
}

export function OllamaModelSelect({ id, value, onChange, baseUrl }: Props) {
  const [models, setModels] = useState<Awaited<ReturnType<typeof fetchOllamaModels>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const request = useRef<AbortController | null>(null);

  const loadModels = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const available = await fetchOllamaModels(baseUrl, controller.signal);
      if (!controller.signal.aborted) setModels(available);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Gagal memuat model Ollama.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoaded(true);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    setModels([]);
    setLoaded(false);
    setIsLoading(false);
    setIsOpen(false);
    setSearch('');
    setError(null);
    return () => request.current?.abort();
  }, [baseUrl]);

  const filteredModels = useMemo(() => {
    if (!search) return models;
    const s = search.toLowerCase();
    return models.filter(m => m.name.toLowerCase().includes(s));
  }, [models, search]);

  const selectedModel = useMemo(() => 
    models.find(m => m.name === value) || { name: value, size: 0 }, 
  [models, value]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '';
    const gb = bytes / 1024 / 1024 / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <div className="relative w-full">
      <div className="flex gap-2">
        <button
          id={id}
          type="button"
          aria-expanded={isOpen}
          disabled={!baseUrl}
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen && !loaded && !isLoading) void loadModels();
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800"
        >
          <span className={cn("min-w-0 [overflow-wrap:anywhere]", error && "text-red-700 dark:text-red-400")}>
            {selectedModel.name || 'Pilih model…'}
          </span>
          {isLoading ? (
            <Loader2 size={14} className="animate-spin text-slate-400 shrink-0 ml-2" />
          ) : error ? (
            <AlertCircle size={14} className="text-red-500 shrink-0 ml-2" />
          ) : (
            <ChevronDown size={14} className={cn("text-slate-400 transition-transform shrink-0 ml-2", isOpen && "rotate-180")} />
          )}
        </button>
        <button
          type="button"
          disabled={!baseUrl || isLoading}
          onClick={() => void loadModels()}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          title="Segarkan Model"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin text-indigo-500" />
          ) : (
            <RefreshCcw size={14} />
          )}
        </button>
      </div>

      {!isOpen && loaded && (error || models.length === 0) && (
        <p role="status" className="mt-1 text-xs text-slate-600 dark:text-slate-300">{error || NO_OLLAMA_MODELS}</p>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl max-h-60 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              type="text"
              placeholder="Cari model…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none text-xs focus:ring-0 focus:outline-none text-slate-900 dark:text-slate-100"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {isLoading ? (
              <p role="status" className="p-4 text-center text-xs text-slate-500">Memuat model…</p>
            ) : error ? (
              <div className="p-4 text-center">
                <AlertCircle size={20} className="mx-auto mb-2 text-red-500 opacity-50" />
                <p className="text-xs text-red-600 dark:text-red-400 mb-2 font-medium">
                  {error}
                </p>
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
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">
                {models.length === 0 ? NO_OLLAMA_MODELS : 'Tidak ada model yang cocok.'}
              </div>
            ) : (
              filteredModels.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => {
                    onChange(m.name);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    "flex min-h-11 w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/20",
                    value === m.name && "bg-indigo-50/50 dark:bg-indigo-900/10"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("font-medium", value === m.name ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300")}>
                      {m.name}
                    </span>
                    {value === m.name && <Check size={12} className="text-indigo-600" />}
                  </div>
                  {m.size > 0 && <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {formatSize(m.size)}
                  </span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      
      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-transparent" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
