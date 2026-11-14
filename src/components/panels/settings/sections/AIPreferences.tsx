import { CLOUD_PROVIDERS } from '@/src/services/ai/providerPolicy';
import React from 'react';
import { Shield } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { ContextDepth } from '@/src/types';

interface Props {
  localOnly: boolean; setLocalOnly: (value: boolean) => void;
  allowedFallbacks: string[]; setAllowedFallbacks: (value: string[]) => void;
  provider: string;
  setProvider: (v: string) => void;
  contextDepth: ContextDepth;
  setContextDepth: (v: ContextDepth) => void;
}

export function AIPreferences({ provider, setProvider, contextDepth, setContextDepth, localOnly, setLocalOnly, allowedFallbacks, setAllowedFallbacks }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-indigo-500" />
          <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">Preferensi</h3>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Penyedia AI Default
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Pilih AI mana yang berjalan secara default.
          </p>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
          >
            <option value="google">Google AI Studio (Gemini)</option>
            <option value="groq">Groq Cloud</option>
            <option value="openrouter">OpenRouter</option>
            <option value="claude">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
            <option value="huggingface">Hugging Face</option>
            <option value="ollama">Ollama (Lokal)</option>
          </select>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Kedalaman Konteks
            </label>
            <span className={cn(
              "text-[9px] font-bold uppercase py-0.5 px-2 rounded-full",
              contextDepth === 'minimal' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
              contextDepth === 'balanced' && "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
              contextDepth === 'deep' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {contextDepth === 'minimal' ? 'Eco Mode' : contextDepth === 'balanced' ? 'Optimal' : 'Power Mode'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex-1">
            {contextDepth === 'minimal' && "Token rendah. Menjaga aturan, mengabaikan dunia."}
            {contextDepth === 'balanced' && "Pencocokan cerdas. Otomatis memilih dunia."}
            {contextDepth === 'deep' && "Token besar. Menggunakan kedetailan maksimum."}
          </p>
          <select
            value={contextDepth}
            onChange={(e) => setContextDepth(e.target.value as ContextDepth)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
          >
            <option value="minimal">Minimal (Termurah)</option>
            <option value="balanced">Seimbang (Direkomendasikan)</option>
            <option value="deep">Mendalam (Detail Terkaya)</option>
          </select>
        </div>
      </div>
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={localOnly} onChange={e => setLocalOnly(e.target.checked)} />Hanya AI lokal (Ollama)</label>
        <p className="text-xs text-slate-500">Mode lokal memblokir semua inferensi cloud, termasuk pilihan provider per aksi. Pilih Ollama sebagai penyedia utama saat mode ini aktif. Izin ini langsung tersimpan. Request yang sudah dikirim tidak dapat ditarik kembali.</p>
        <fieldset disabled={localOnly} className="space-y-2">
          <legend className="text-sm font-semibold">Izinkan provider cadangan</legend>
          <p className="text-xs text-slate-500">Jika provider utama gagal, konteks naskah dapat dikirim ke provider yang dicentang dan memiliki API key. Default: tidak ada fallback lintas-provider.</p>
          {CLOUD_PROVIDERS.map(p => <label key={p} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={allowedFallbacks.includes(p)} onChange={e => setAllowedFallbacks(e.target.checked ? [...allowedFallbacks, p] : allowedFallbacks.filter(value => value !== p))} />{p}</label>)}
        </fieldset>
      </div>
    </section>
  );
}
