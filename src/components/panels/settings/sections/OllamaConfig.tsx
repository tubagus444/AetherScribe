import React from 'react';
import { OllamaModelSelect } from '@/src/components/common/OllamaModelSelect';
import { ConnectionTestButton } from '@/src/components/panels/settings/ConnectionTestButton';
import { ConnectionTestError } from '@/src/components/panels/settings/ConnectionTestError';
import { useConnectionTest } from '@/src/components/panels/settings/useConnectionTest';
import { getModelForProvider } from '@/src/services/ai/proxy';

interface Props {
  ollamaEnabled: boolean;
  setOllamaEnabled: (v: boolean) => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
}

export function OllamaConfig({
  ollamaEnabled, setOllamaEnabled,
  ollamaBaseUrl, setOllamaBaseUrl,
  model, onModelChange,
}: Props) {
  const testedModel = model.trim() || getModelForProvider('ollama');
  const baseUrl = ollamaBaseUrl.trim();
  const { status, error, runTest } = useConnectionTest('ollama', '', testedModel, baseUrl);

  return (
    <div className="space-y-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-indigo-600" checked={ollamaEnabled} onChange={event => setOllamaEnabled(event.target.checked)} />
        Aktifkan Ollama
      </label>
      <p className="text-xs text-slate-500 dark:text-slate-400">Jalankan Ollama dan pasang model di perangkat ini. Ollama memakai model utama untuk tugas ringan.</p>
      <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center sm:gap-5">
        <label htmlFor="ollama-base-url" className="text-sm font-medium">Alamat Ollama</label>
        <input
          id="ollama-base-url"
          type="text"
          value={ollamaBaseUrl}
          onChange={event => setOllamaBaseUrl(event.target.value)}
          placeholder="http://localhost:11434"
          disabled={!ollamaEnabled}
          className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
        />
      </div>
      {ollamaEnabled && (
        <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center sm:gap-5">
          <label htmlFor="ollama-main-model" className="text-sm font-medium">Model utama</label>
          <OllamaModelSelect id="ollama-main-model" value={model} onChange={onModelChange} baseUrl={baseUrl} />
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <p className="min-w-0 text-sm text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">Menguji model utama <strong>{testedModel}</strong>.</p>
        <ConnectionTestButton
          status={status}
          disabled={!ollamaEnabled || !baseUrl}
          onClick={runTest}
        />
      </div>
      <ConnectionTestError message={error} />
    </div>
  );
}
