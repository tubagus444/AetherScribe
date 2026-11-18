/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal ringkas untuk MENCATAT Janji Plot dari konteks (tanpa pindah panel).
 * Dipakai dua titik masuk: seleksi teks di editor (janji dalam prosa → kata kunci)
 * dan tombol di CodexDetailModal (janji = entitas → terpaut codexId). Menulis ke
 * db.plotPromises; pengelolaan lanjutan tetap di panel "Janji Plot".
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Crosshair, X, Check, Loader2 } from 'lucide-react';
import { addPlotPromise } from '@/src/services/continuityOperations';
import { db } from '@/src/db';
import { useToast } from '@/src/hooks/useToast';
import { PlotPromise, PlotPromiseImportance } from '@/src/types';
import { cn } from '@/src/lib/utils';

export interface QuickPromiseSeed {
  projectId: number;
  title?: string;
  description?: string;
  /** Bila diisi → janji terpaut entri Codex (dilacak via nama/alias). */
  codexId?: number;
  /** Nama entri Codex untuk ditampilkan (mode terpaut). */
  codexName?: string;
  /** Prefilled untuk janji berbasis kata kunci (non-entitas). */
  keywords?: string[];
  plantedChapterId?: number;
}

const inputCls = 'w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400';

export function QuickPromiseModal({ seed, onClose }: { seed: QuickPromiseSeed; onClose: () => void }) {
  const { toast } = useToast();
  const linked = seed.codexId != null;

  const [title, setTitle] = useState(seed.title ?? '');
  const [description, setDescription] = useState(seed.description ?? '');
  const [keywords, setKeywords] = useState((seed.keywords ?? []).join(', '));
  const [importance, setImportance] = useState<PlotPromiseImportance>('medium');
  const [expectedBy, setExpectedBy] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const canSave = title.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const kw = keywords.split(',').map(s => s.trim()).filter(Boolean);
    const now = Date.now();
    try {
      await addPlotPromise({
        projectId: seed.projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        codexId: linked ? seed.codexId : undefined,
        keywords: !linked && kw.length ? kw : undefined,
        plantedChapterId: seed.plantedChapterId,
        importance,
        expectedBy: expectedBy.trim() || undefined,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      } as PlotPromise);
      toast.success('Janji plot dicatat — pantau di panel Janji Plot.');
      onClose();
    } catch {
      toast.error('Gagal mencatat janji plot.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"><Crosshair size={16} /></span>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Catat Janji Plot</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Judul janji *</span>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder='mis. "Belati berukir yang berdenyut"' className={inputCls} />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Deskripsi</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Apa janjinya pada pembaca?" className={cn(inputCls, 'resize-none')} />
          </label>

          {/* Pelacakan */}
          {linked ? (
            <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300">
              <Check size={13} /> Terpaut entri Codex{seed.codexName ? `: ${seed.codexName}` : ''} — dilacak via nama & alias.
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Kata kunci pelacak</span>
              <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="ramalan, sang pengkhianat (pisahkan koma)" className={inputCls} />
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Dilacak lewat kemunculan kata kunci di teks bab. Kosongkan bila belum yakin.</span>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Kepentingan</span>
              <select value={importance} onChange={e => setImportance(e.target.value as PlotPromiseImportance)} className={inputCls}>
                <option value="high">Penting</option>
                <option value="medium">Sedang</option>
                <option value="low">Ringan</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Target terbayar</span>
              <input value={expectedBy} onChange={e => setExpectedBy(e.target.value)} placeholder="sebelum klimaks" className={inputCls} />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800/60">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
          <button onClick={save} disabled={!canSave || saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors active:scale-95">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Catat
          </button>
        </div>
      </motion.div>
    </div>
  );
}
