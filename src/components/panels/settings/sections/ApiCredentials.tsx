import React from 'react';
import { Save, Check, Key } from 'lucide-react';
import { ModelSelect } from '@/src/components/common/ModelSelect';
import { ConnectionTestButton } from '@/src/components/panels/settings/ConnectionTestButton';
import { ConnectionTestError } from '@/src/components/panels/settings/ConnectionTestError';
import { useConnectionTest } from '@/src/components/panels/settings/useConnectionTest';
import type { ProviderKeys, ProviderModels } from '@/src/components/panels/settings/useAISettings';
import type { CredentialMode } from '@/src/services/ai/credentialStore';

interface Props {
  keys: ProviderKeys;
  setKeys: (v: ProviderKeys) => void;
  models: ProviderModels;
  setModels: (v: ProviderModels) => void;
  isSaved: boolean;
  onSave: () => void;
  credentialMode: CredentialMode;
  setCredentialMode: (mode: CredentialMode) => void;
  saveError: string;
  onClear: () => void;
}

const PROVIDERS = [
  { id: 'google', name: 'Google AI Studio', placeholder: 'AIzaSy...', modelHint: 'Cth: gemini-3.5-flash' },
  { id: 'groq', name: 'Groq Cloud', placeholder: 'gsk_...', modelHint: 'Cth: llama-3.3-70b-versatile' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...', modelHint: 'Pilih model...' },
  { id: 'claude', name: 'Claude (Anthropic)', placeholder: 'sk-ant-...', modelHint: 'Cth: claude-opus-4-8' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', modelHint: 'Cth: gpt-4o-mini' },
  { id: 'huggingface', name: 'Hugging Face', placeholder: 'hf_...', modelHint: 'Cth: meta-llama/Llama-3.3-70B-Instruct' },
] as const;

export function ApiCredentials({ keys, setKeys, models, setModels, isSaved, onSave, credentialMode, setCredentialMode, saveError, onClear }: Props) {
  const { statusOf, errors, runTest } = useConnectionTest();

  const handleTest = (prov: string) => {
    const key = keys[prov as keyof ProviderKeys]?.trim();
    if (!key) return;
    const model = models[prov as keyof ProviderModels]?.trim();
    runTest(prov, key, model);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-indigo-500" />
          <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">Kredensial API</h3>
        </div>
        <button
          onClick={onSave}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm active:scale-95"
        >
          {isSaved ? <Check size={16} /> : <Save size={16} />}
          {isSaved ? 'Tersimpan!' : 'Simpan Kredensial'}
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <label className="block font-medium" htmlFor="credential-storage">Penyimpanan API key</label>
        <select id="credential-storage" value={credentialMode} onChange={event => setCredentialMode(event.target.value as CredentialMode)} className="rounded border p-2 bg-background">
          <option value="session">Selama sesi tab ini</option>
          <option value="persistent">Ingat di browser ini</option>
        </select>
        <p className="text-xs text-slate-500">Pilihan berlaku setelah Simpan Kredensial. Mode sesi menghapus salinan permanen dan mempertahankan key di tab ini. Reload tetap menyimpan sesi; browser dapat memulihkannya saat memulihkan tab.</p>
        <p className="text-xs text-slate-500">Key di browser tidak dienkripsi. Situs ini dan siapa pun yang dapat mengakses profil browser dapat membacanya. Pilih Ingat di browser ini hanya pada perangkat pribadi.</p>
        <button type="button" onClick={onClear} className="text-red-600 underline">Hapus semua API key dari browser ini</button>
        <p className="text-xs text-slate-500">Hapus langsung membersihkan key tersimpan dan isian di tab ini. Tab lain mungkin masih memiliki sesi atau isian sendiri. Key di .env server dan request yang sedang berlangsung, termasuk retry, tidak dibatalkan.</p>
        {saveError && <p role="alert" className="text-red-600">{saveError}</p>}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60">
        {PROVIDERS.map((item) => (
          <div key={item.id} className="p-5 flex flex-col md:flex-row md:items-start gap-4">
            <div className="md:w-1/3">
              <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                {item.name}
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {item.id === 'google' ? 'Direkomendasikan demi performa Lore yang lebih baik.' : 'Pengaturan penyedia lain.'}
              </p>
            </div>

            <div className="md:w-2/3 flex flex-col gap-2">
              <div className="flex gap-2">
                 <input
                   aria-label={`API key ${item.name}`}
                   type="password"
                   value={keys[item.id as keyof ProviderKeys]}
                   onChange={(e) => setKeys({...keys, [item.id]: e.target.value})}
                   placeholder={`Kunci: ${item.placeholder}`}
                   className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
                 />
                 <ConnectionTestButton
                   status={statusOf(item.id)}
                   disabled={!keys[item.id as keyof ProviderKeys]}
                   onClick={() => handleTest(item.id)}
                 />
              </div>

              <div className="w-full">
                <ModelSelect
                  provider={item.id}
                  value={models[item.id as keyof ProviderModels]}
                  onChange={(val) => setModels({ ...models, [item.id]: val })}
                  apiKey={keys[item.id as keyof ProviderKeys]}
                  placeholder={item.modelHint}
                />
              </div>

              <ConnectionTestError message={errors[item.id]} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
