/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Glosarium istilah in-world (#8) — CRUD istilah NON-nama + varian ejaan salah.
 * Underline konsistensi digambar di editor via `useEditorGlossary` +
 * `ConsistencyUnderline` (deterministik, nol token). Logika di `src/lib/glossary.ts`.
 */

import React, { useMemo, useState } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookMarked, Plus, Loader2, Trash2, Pencil, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlossaryEntry } from '@/src/types';
import { cn } from '@/src/lib/utils';

const inputCls = 'w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 dark:text-slate-100';

export function GlossaryPanel({ projectId }: { projectId: number }) {
  const entries = useLiveQuery(
    () => db.glossary.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const [editing, setEditing] = useState<GlossaryEntry | 'new' | null>(null);

  const sorted = useMemo(
    () => [...(entries ?? [])].sort((a, b) => a.term.localeCompare(b.term, 'id', { sensitivity: 'base' })),
    [entries],
  );
  const loading = entries === undefined;

  const remove = (e: GlossaryEntry) => {
    if (e.id != null && confirm(`Hapus istilah "${e.term}"?`)) db.glossary.delete(e.id);
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 pb-20 w-full">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-xs font-semibold tracking-wide uppercase border border-teal-100 dark:border-teal-800/50">
          <BookMarked size={14} />
          <span>Glosarium</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">Glosarium Istilah</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          Jaga konsistensi ejaan istilah in-world <span className="font-medium">non-nama</span> — satuan, kalender, pangkat,
          lingua-franca, idiom. Editor akan menggarisbawahi (teal) ejaan tak baku yang Anda deklarasikan sebagai
          <span className="font-medium"> varian</span>, plus kandidat salah-eja mirip istilah baku. Sepenuhnya lokal,
          <span className="font-medium"> tanpa AI, tanpa token</span>.
        </p>
      </header>

      <div className="flex">
        <button
          onClick={() => setEditing('new')}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all active:scale-[0.98] shadow-sm hover:shadow-md"
        >
          <Plus size={16} /> Tambah Istilah
        </button>
      </div>

      <AnimatePresence>
        {editing && (
          // key per-target: remount dengan state segar saat berpindah entri/"baru"
          // (tanpa ini, edit A → edit B menyimpan isi A ke entri B).
          <GlossaryForm key={editing === 'new' ? 'new' : editing.id} projectId={projectId} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
      ) : sorted.length === 0 ? (
        <EmptyState onAdd={() => setEditing('new')} />
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {sorted.map((e) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 break-words">{e.term}</h3>
                      {e.strictMatch && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 font-medium">
                          Ketat
                        </span>
                      )}
                    </div>
                    {e.category && <span className="text-[10px] uppercase tracking-wider font-bold text-teal-600 dark:text-teal-400">{e.category}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(e)} title="Ubah" className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => remove(e)} title="Hapus" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                {e.definition && <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{e.definition}</p>}
                {(e.variants?.length ?? 0) > 0 && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-1.5 gap-y-0.5">
                    <span>Varian ditandai:</span>
                    {e.variants!.map((v) => <span key={v} className="line-through decoration-red-400">{v}</span>)}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
      <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-5">
        <BookMarked size={24} className="text-slate-300 dark:text-slate-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Belum ada istilah</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mb-5">
        Daftarkan istilah in-world (mis. satuan jarak, nama bulan, pangkat) beserta ejaan salah yang sering keliru — editor akan menandainya.
      </p>
      <button onClick={onAdd} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors active:scale-95">
        <Plus size={16} /> Tambah Istilah Pertama
      </button>
    </div>
  );
}

function GlossaryForm({ projectId, initial, onClose }: { projectId: number; initial: GlossaryEntry | null; onClose: () => void }) {
  const [term, setTerm] = useState(initial?.term ?? '');
  const [definition, setDefinition] = useState(initial?.definition ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [variants, setVariants] = useState((initial?.variants ?? []).join(', '));
  const [strictMatch, setStrictMatch] = useState(initial?.strictMatch ?? false);
  const [saving, setSaving] = useState(false);

  const canSave = term.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const now = Date.now();
    const vs = variants.split(',').map((s) => s.trim()).filter(Boolean);
    const base = {
      term: term.trim(),
      definition: definition.trim() || undefined,
      category: category.trim() || undefined,
      variants: vs.length ? vs : undefined,
      strictMatch: strictMatch ? true : undefined,
      updatedAt: now,
    };
    try {
      if (initial?.id != null) {
        await db.glossary.update(initial.id, base);
      } else {
        await db.glossary.add({ projectId, createdAt: now, ...base } as GlossaryEntry);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{initial ? 'Ubah Istilah' : 'Istilah Baru'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Istilah baku *">
            <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder='mis. "liga" / "Bulan Sabit"' className={inputCls} />
          </Field>
          <Field label="Kategori (opsional)">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="satuan / pangkat / kalender" className={inputCls} />
          </Field>
        </div>

        <Field label="Definisi (opsional)">
          <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} rows={2} placeholder="Arti/pemakaian istilah." className={cn(inputCls, 'resize-none')} />
        </Field>

        <Field label="Varian ejaan salah (dipisah koma) — ditandai bila muncul">
          <input value={variants} onChange={(e) => setVariants(e.target.value)} placeholder='mis. "liege, leage" untuk "liga"' className={inputCls} />
        </Field>

        <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={strictMatch}
            onChange={(e) => setStrictMatch(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
          />
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Pencocokan Ketat (Case-Sensitive / Huruf Sesuai)
            </span>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal">
              Hanya tandai varian bila besar/kecil huruf cocok persis. Mencegah alarm palsu untuk istilah pendek/huruf-kecil (mis. &quot;mana&quot;, &quot;ki&quot;, &quot;PM&quot;).
            </p>
          </div>
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
          <button onClick={save} disabled={!canSave || saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors active:scale-95">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}
