import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Loader2, ChevronDown, Check, AlertCircle, RefreshCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface OllamaModel {
  name: string;
  size: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  baseUrl: string;
}

export function OllamaModelSelect({ value, onChange, baseUrl }: Props) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/ollama-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ baseUrl })
      });
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.models) {
        setModels(data.models.map((m: any) => ({
          name: m.name,
          size: m.size || 0,
        })));
      } else {
        setError("Invalid response format.");
      }
    } catch (err: any) {
      console.error('Ollama model listing failed; sensitive details omitted.');
      setError(err.message || "Failed to load models. Check base URL.");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (baseUrl) {
      loadModels();
    }
  }, [loadModels, baseUrl]);

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
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between min-w-0"
        >
          <span className={cn("truncate", error && "text-red-500 dark:text-red-400")}>
            {isLoading ? 'Loading models...' : (error ? 'Failed to load models' : (selectedModel.name || 'Select a model...'))}
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
          onClick={loadModels}
          className="px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-md text-slate-500 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          title="Segarkan Model"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin text-indigo-500" />
          ) : (
            <RefreshCcw size={14} />
          )}
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl max-h-60 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none text-xs focus:ring-0 focus:outline-none text-slate-900 dark:text-slate-100"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {error ? (
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
                  Try again
                </button>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">
                No models found in Ollama instance.
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
                    "w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex flex-col gap-0.5 group transition-colors",
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
