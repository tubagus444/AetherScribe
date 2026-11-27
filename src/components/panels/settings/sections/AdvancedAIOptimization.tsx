import React from 'react';
import { DEFAULT_REWRITE_TEMPERATURE, type ClaudeCacheTtl } from '@/src/lib/aiTuning';

interface Props {
  maxLoreChars: string;
  setMaxLoreChars: (v: string) => void;
  cacheTtl: ClaudeCacheTtl;
  setCacheTtl: (v: ClaudeCacheTtl) => void;
  rewriteTemp: string;
  setRewriteTemp: (v: string) => void;
  inlineConsistencyAI: boolean;
  onToggleInlineConsistencyAI: () => void;
}

export function AdvancedAIOptimization({
  maxLoreChars, setMaxLoreChars,
  cacheTtl, setCacheTtl,
  rewriteTemp, setRewriteTemp,
  inlineConsistencyAI, onToggleInlineConsistencyAI,
}: Props) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold">Optimasi AI Lanjutan</summary>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* #5 — cap lore di cache */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col">
          <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Maks. Lore di Cache
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex-1">
            Batas karakter Codex pada prompt statis (mode caching). Lebih kecil = cache lebih murah ditulis ulang bila sering edit lore di tengah sesi; lebih besar = lebih banyak lore sampai ke AI. Pantau <em>cache hit rate</em> di Dashboard.
          </p>
          <select
            value={maxLoreChars}
            onChange={(e) => setMaxLoreChars(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
          >
            <option value="25000">25.000 karakter (~6k token) — paling hemat</option>
            <option value="50000">50.000 karakter (~12,5k token) — default</option>
            <option value="75000">75.000 karakter (~19k token)</option>
            <option value="100000">100.000 karakter (~25k token) — lore terkaya</option>
          </select>
        </div>

        {/* #P5 — masa hidup (TTL) cache Claude */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col">
          <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Masa Hidup Cache (Claude)
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex-1">
            Hanya untuk Claude langsung. <strong>1 jam</strong> menjaga cache hangat melewati jeda berpikir/mengetik (optimal untuk sesi menulis panjang yang banyak baca cache); <strong>5 menit</strong> menekan premi tulis bila kamu hanya sesekali memanggil AI. OpenRouter/Google tak terpengaruh.
          </p>
          <select
            aria-label="Masa Hidup Cache Claude"
            value={cacheTtl}
            onChange={(e) => setCacheTtl(e.target.value === '5m' ? '5m' : '1h')}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
          >
            <option value="1h">1 jam — default (sesi menulis panjang)</option>
            <option value="5m">5 menit — pemakaian jarang / burst pendek</option>
          </select>
        </div>

        {/* Suhu rewrite — opsi A: kontrol kreativitas khusus "Tanya AI" di editor */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col">
          <label htmlFor="rewrite-temp" className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Kreativitas Tulis Ulang
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex-1">
            Suhu AI untuk aksi <strong>"Tanya AI"</strong> di editor. <strong>Rendah</strong> = lebih taat instruksi & dekat naskah asli; <strong>tinggi</strong> = lebih bervariasi/kreatif tapi rawan menyimpang. Tugas analitis (cek konsistensi, ekstraksi) tak terpengaruh.
          </p>
          <input
            id="rewrite-temp"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={rewriteTemp}
            onChange={(e) => setRewriteTemp(e.target.value)}
            className="w-full accent-indigo-600 cursor-pointer"
          />
          <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            <span>Presisi</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {Number(rewriteTemp).toFixed(2)}
              {Number(rewriteTemp) === DEFAULT_REWRITE_TEMPERATURE && ' (default)'}
            </span>
            <span>Kreatif</span>
          </div>
        </div>

        {/* Konsistensi inline berbasis AI (opsional) */}
        <div className="md:col-span-2 p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label htmlFor="inline-consistency-ai" className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Cek Konsistensi Otomatis <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 align-middle">Boros token</span>
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bila aktif, AI memeriksa <strong>paragraf yang sedang kamu ketik</strong> terhadap Codex/Bible setelah jeda berhenti mengetik, lalu menggarisbawahi kalimat berpotensi kontradiktif (ungu). <strong>Memakai token tiap paragraf</strong> yang diperiksa. Kalau dimatikan, kamu tetap bisa memeriksa kapan saja lewat tombol <strong>"Cek Konsistensi"</strong> di menu seleksi teks (pilih teks → klik).
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 italic">
                Berlaku langsung. Saat memeriksa, indikator muncul di editor.
              </p>
            </div>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <button
                id="inline-consistency-ai"
                role="switch"
                aria-checked={inlineConsistencyAI}
                onClick={onToggleInlineConsistencyAI}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${inlineConsistencyAI ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${inlineConsistencyAI ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${inlineConsistencyAI ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {inlineConsistencyAI ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
