import React, { useRef } from 'react';
import { Plug, Save } from 'lucide-react';
import { ModelSelect } from '@/src/components/common/ModelSelect';
import type { useAISettings } from '@/src/components/panels/settings/useAISettings';
import { AIPreferences } from '@/src/components/panels/settings/sections/AIPreferences';
import { AdvancedAIOptimization } from '@/src/components/panels/settings/sections/AdvancedAIOptimization';
import { ApiCredentials, CloudProviderFields, PROVIDER_NAMES } from '@/src/components/panels/settings/sections/ApiCredentials';
import { OllamaConfig } from '@/src/components/panels/settings/sections/OllamaConfig';
import { isModelListProvider } from '@/src/services/ai/modelService';
import { getDefaultLightModelForProvider } from '@/src/services/ai/proxy';

export function AISettingsTab({ settings }: { settings: ReturnType<typeof useAISettings> }) {
  const { provider, isDirty, isSaved, saveError } = settings;
  const providerSelect = useRef<HTMLSelectElement>(null);
  const cloudProvider = isModelListProvider(provider) ? provider : undefined;
  const ollamaFields = <OllamaConfig
    ollamaEnabled={settings.ollamaEnabled}
    setOllamaEnabled={settings.setOllamaEnabled}
    ollamaBaseUrl={settings.ollamaBaseUrl}
    setOllamaBaseUrl={settings.setOllamaBaseUrl}
    model={settings.models.ollama}
    onModelChange={value => settings.setModels({ ...settings.models, ollama: value })}
  />;
  const selectOllama = () => {
    settings.setProvider('ollama');
    providerSelect.current?.focus();
  };

  return (
    <div className="space-y-5">
      {(isDirty || isSaved || saveError) && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div role="status" className="text-sm text-slate-600 dark:text-slate-300">
            {isDirty ? 'Ada perubahan yang belum disimpan.' : isSaved && 'Pengaturan AI tersimpan.'}
          </div>
          {isDirty && (
            <button type="button" onClick={settings.handleSave} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              <Save size={16} aria-hidden="true" />
              Simpan Pengaturan AI
            </button>
          )}
          {saveError && <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">{saveError}</p>}
        </div>
      )}

      <section aria-labelledby="primary-ai-provider-heading" className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <h3 id="primary-ai-provider-heading" className="flex items-center gap-2 text-base font-semibold">
          <Plug size={18} className="text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          Penyedia utama
        </h3>
        <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center sm:gap-5">
          <div>
            <label htmlFor="default-ai-provider" className="block text-sm font-medium">Penyedia AI</label>
            <p id="default-ai-provider-help" className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Setelah disimpan, pilihan ini dipakai saat kamu meminta bantuan AI tanpa memilih penyedia lain.
            </p>
          </div>
          <select
            ref={providerSelect}
            id="default-ai-provider"
            aria-describedby="default-ai-provider-help"
            value={provider}
            onChange={event => settings.setProvider(event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800"
          >
            {Object.entries(PROVIDER_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>

        {settings.localOnly && provider !== 'ollama' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>Mode lokal aktif. Pilih dan simpan Ollama untuk menggunakan AI.</p>
            <button type="button" onClick={selectOllama} className="min-h-11 font-semibold underline underline-offset-2">Pilih Ollama</button>
          </div>
        )}

        {cloudProvider && (
          <CloudProviderFields key={cloudProvider} provider={cloudProvider} settings={settings}>
            <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center sm:gap-5">
              <div>
                <label htmlFor="light-task-model" className="block text-sm font-medium">Model Tugas Ringan</label>
                <p id="light-task-description" className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Rangkuman dan ekstraksi entitas.</p>
              </div>
              <ModelSelect
                id="light-task-model"
                descriptionId="light-task-description"
                provider={cloudProvider}
                apiKey={settings.keys[cloudProvider]}
                value={settings.lightModels[cloudProvider]}
                onChange={value => settings.setLightModels({ ...settings.lightModels, [cloudProvider]: value })}
                lightTaskDefault={getDefaultLightModelForProvider(cloudProvider) ?? ''}
              />
            </div>
          </CloudProviderFields>
        )}

        {provider === 'ollama' && ollamaFields}
      </section>

      <AIPreferences {...settings} />
      <ApiCredentials settings={settings}>
        {provider !== 'ollama' && ollamaFields}
      </ApiCredentials>
      <AdvancedAIOptimization {...settings} onToggleInlineConsistencyAI={settings.toggleInlineConsistencyAI} />
    </div>
  );
}
