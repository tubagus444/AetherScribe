import React from 'react';
import { Shield } from 'lucide-react';
import { CLOUD_PROVIDERS } from '@/src/services/ai/providerPolicy';
import { PROVIDER_NAMES } from '@/src/components/panels/settings/sections/ApiCredentials';
import type { ContextDepth } from '@/src/types';

interface Props {
  localOnly: boolean;
  setLocalOnly: (value: boolean) => void;
  allowedFallbacks: string[];
  setAllowedFallbacks: (value: string[]) => void;
  contextDepth: ContextDepth;
  setContextDepth: (value: ContextDepth) => void;
}

const contextDescriptions: Record<ContextDepth, string> = {
  minimal: 'Hemat token dengan konteks yang lebih ringkas.',
  balanced: 'Pilih lore yang relevan dengan permintaan.',
  deep: 'Sertakan detail lebih lengkap dengan pemakaian token lebih besar.',
};

export function AIPreferences({ contextDepth, setContextDepth, localOnly, setLocalOnly, allowedFallbacks, setAllowedFallbacks }: Props) {
  return (
    <section aria-labelledby="ai-preferences-heading" className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <h3 id="ai-preferences-heading" className="flex items-center gap-2 text-base font-semibold">
        <Shield size={18} className="text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        Preferensi
      </h3>
      <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center sm:gap-5">
        <div>
          <label htmlFor="ai-context-depth" className="block text-sm font-medium">Kedalaman Konteks</label>
          <p id="ai-context-help" className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{contextDescriptions[contextDepth]}</p>
        </div>
        <select
          id="ai-context-depth"
          aria-describedby="ai-context-help"
          value={contextDepth}
          onChange={event => setContextDepth(event.target.value as ContextDepth)}
          className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="minimal">Minimal (Termurah)</option>
          <option value="balanced">Seimbang (Direkomendasikan)</option>
          <option value="deep">Mendalam (Detail Terkaya)</option>
        </select>
      </div>
      <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
        <div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-indigo-600"
              aria-describedby="ai-local-only-help"
              checked={localOnly}
              onChange={event => setLocalOnly(event.target.checked)}
            />
            Hanya AI lokal (Ollama)
          </label>
          <p id="ai-local-only-help" className="text-xs text-slate-600 dark:text-slate-400">
            <strong>Berlaku langsung.</strong> Mode ini memblokir inferensi cloud. Permintaan yang sudah dikirim dapat berlanjut.
          </p>
        </div>
        <details className="rounded-lg border border-slate-200 px-3 dark:border-slate-700">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Penyedia cadangan
            <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-400">
              {localOnly ? 'Nonaktif selama mode lokal' : `${allowedFallbacks.length} diizinkan`}
            </span>
          </summary>
          <fieldset disabled={localOnly} className="space-y-2 pb-3">
            <legend className="sr-only">Izinkan penyedia cadangan</legend>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              <strong>Berlaku langsung.</strong> Jika penyedia utama gagal, konteks naskah dapat dikirim ke penyedia yang kamu izinkan dan memiliki API key.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CLOUD_PROVIDERS.map(provider => (
                <label key={provider} className="flex min-h-11 items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-indigo-600"
                    checked={allowedFallbacks.includes(provider)}
                    onChange={event => setAllowedFallbacks(event.target.checked
                      ? [...allowedFallbacks, provider]
                      : allowedFallbacks.filter(value => value !== provider))}
                  />
                  {PROVIDER_NAMES[provider]}
                </label>
              ))}
            </div>
          </fieldset>
        </details>
      </div>
    </section>
  );
}
