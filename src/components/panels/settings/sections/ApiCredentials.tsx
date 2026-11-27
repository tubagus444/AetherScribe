import React from 'react';
import { ModelSelect } from '@/src/components/common/ModelSelect';
import { ConnectionTestButton } from '@/src/components/panels/settings/ConnectionTestButton';
import { ConnectionTestError } from '@/src/components/panels/settings/ConnectionTestError';
import { useConnectionTest } from '@/src/components/panels/settings/useConnectionTest';
import { KEY_PROVIDERS, type CredentialMode, type KeyProvider } from '@/src/services/ai/credentialStore';
import { getModelForProvider } from '@/src/services/ai/proxy';
import type { useAISettings } from '@/src/components/panels/settings/useAISettings';

export const PROVIDER_NAMES: Record<KeyProvider | 'ollama', string> = {
  google: 'Google AI Studio (Gemini)',
  groq: 'Groq Cloud',
  openrouter: 'OpenRouter',
  claude: 'Claude (Anthropic)',
  huggingface: 'Hugging Face',
  openai: 'OpenAI',
  ollama: 'Ollama (Lokal)',
};

type Settings = ReturnType<typeof useAISettings>;

export function CloudProviderFields({ provider, settings, children }: {
  provider: KeyProvider;
  settings: Settings;
  children?: React.ReactNode;
}) {
  const { keys, setKeys, models, setModels, localOnly } = settings;
  const key = keys[provider];
  const model = models[provider];
  const testedModel = model.trim() || getModelForProvider(provider);
  const { status, error, runTest } = useConnectionTest(provider, key.trim(), testedModel);

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center sm:gap-5">
        <div>
          <label htmlFor={`api-key-${provider}`} className="block text-sm font-medium">
            API key <span className="sr-only">{PROVIDER_NAMES[provider]}</span>
          </label>
          <p id={`api-key-help-${provider}`} className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Boleh kosong jika sudah ada kunci di server.</p>
        </div>
        <input
          id={`api-key-${provider}`}
          aria-describedby={`api-key-help-${provider}`}
          type="password"
          autoComplete="off"
          value={key}
          onChange={event => setKeys({ ...keys, [provider]: event.target.value })}
          placeholder="Masukkan API key"
          className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800"
        />
      </div>
      <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center sm:gap-5">
          <div>
            <label htmlFor={`main-model-${provider}`} className="block text-sm font-medium">Model utama</label>
            <p id={`main-model-help-${provider}`} className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Untuk chat dan tulis ulang.</p>
          </div>
          <ModelSelect
            id={`main-model-${provider}`}
            descriptionId={`main-model-help-${provider}`}
            provider={provider}
            value={model}
            onChange={value => setModels({ ...models, [provider]: value })}
            apiKey={key}
            allowServerKey
            placeholder={`Default (${getModelForProvider(provider)})`}
          />
        </div>
        {children}
      </div>
      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <p className="min-w-0 text-sm text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">
            {localOnly ? 'Uji cloud dijeda selama mode lokal aktif.' : <>Menguji model utama <strong>{testedModel}</strong>.</>}
          </p>
          <ConnectionTestButton status={status} disabled={localOnly} onClick={runTest} />
        </div>
        <ConnectionTestError message={error} />
      </div>
    </div>
  );
}

export function ApiCredentials({ settings, children }: { settings: Settings; children?: React.ReactNode }) {
  const { provider, credentialMode, setCredentialMode, handleClearCredentials } = settings;
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold">Penyedia lain dan penyimpanan API key</summary>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="credential-storage">Penyimpanan API key</label>
          <select id="credential-storage" value={credentialMode} onChange={event => setCredentialMode(event.target.value as CredentialMode)} className="max-w-full rounded border bg-background p-2 text-sm">
            <option value="session">Selama sesi tab ini</option>
            <option value="persistent">Ingat di browser ini</option>
          </select>
          <p className="text-xs text-slate-500 dark:text-slate-400">Pilihan berlaku setelah Simpan Pengaturan AI. Mode sesi menghapus salinan permanen. Peramban bisa memulihkan sesi saat tab dibuka kembali.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Key di browser tidak dienkripsi. Situs ini dan siapa pun yang dapat mengakses profil browser dapat membacanya. Pilih Ingat di browser ini hanya pada perangkat pribadi.</p>
          <button type="button" onClick={handleClearCredentials} className="text-sm text-red-600 underline dark:text-red-400">Hapus semua API key dari browser ini</button>
          <p className="text-xs text-slate-500 dark:text-slate-400">Berlaku langsung pada key tersimpan dan isian di tab ini. Key dari server dan tab lain bisa tetap tersedia. Permintaan yang sedang berjalan dapat berlanjut.</p>
        </div>
        {KEY_PROVIDERS.filter(item => item !== provider).map(item => (
          <details key={item} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-medium">{PROVIDER_NAMES[item]}</summary>
            <div className="mt-3">
              <CloudProviderFields provider={item} settings={settings} />
            </div>
          </details>
        ))}
        {children && (
          <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-medium">{PROVIDER_NAMES.ollama}</summary>
            <div className="mt-3">{children}</div>
          </details>
        )}
      </div>
    </details>
  );
}
