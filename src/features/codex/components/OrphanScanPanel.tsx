/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { addCodexEntry } from '@/src/services/codexOperations';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserSearch, ScanSearch, Plus, EyeOff, Loader2, Sparkles, CheckCircle2, Wand2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useProjectData } from '@/src/hooks/useProjectData';
import { findOrphanEntities, gatherEntityContext, OrphanCandidate } from '@/src/lib/orphanEntities';
import { invalidateContextCache } from '@/src/services/contextEngine';
import { enrichEntities } from '@/src/services/ai';
import { CodexCategory } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface OrphanScanPanelProps {
  projectId: number;
}

interface Enrichment {
  category: CodexCategory;
  description: string;
  aliases: string[];
}

const CATEGORY_OPTIONS: { value: CodexCategory; label: string }[] = [
  { value: 'character', label: 'Karakter' },
  { value: 'location', label: 'Lokasi' },
  { value: 'item', label: 'Item' },
  { value: 'magic', label: 'Sihir' },
  { value: 'event', label: 'Peristiwa' },
  { value: 'other', label: 'Lainnya' }
];

// Batas wajar untuk satu panggilan batch (jaga token & kualitas output).
const MAX_BATCH = 25;

const ignoredKey = (projectId: number) => `codex_orphan_ignored_${projectId}`;

function loadIgnored(projectId: number): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ignoredKey(projectId)) || '[]'));
  } catch {
    return new Set();
  }
}

function saveIgnored(projectId: number, set: Set<string>) {
  try {
    localStorage.setItem(ignoredKey(projectId), JSON.stringify([...set]));
  } catch { /* abaikan kuota */ }
}

export function OrphanScanPanel({ projectId }: OrphanScanPanelProps) {
  const { codexEntries, bibleRules } = useProjectData(projectId);

  const chapters = useLiveQuery(() =>
    db.chapters.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const [minCount, setMinCount] = useState(3);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<OrphanCandidate[] | null>(null);
  const [categories, setCategories] = useState<Record<string, CodexCategory>>({});
  const [enriched, setEnriched] = useState<Record<string, Enrichment>>({});
  const [enrichingNames, setEnrichingNames] = useState<Set<string>>(new Set());
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Teks bab polos disimpan saat scan agar enrichment bisa mengumpulkan konteks
  // tanpa men-strip ulang HTML.
  const plainChaptersRef = useRef<{ id?: number; content: string }[]>([]);

  const scan = useCallback(async () => {
    if (!chapters) return;
    setScanning(true);
    setResults(null);
    setEnriched({});
    setEnrichError(null);
    await new Promise(r => setTimeout(r, 0)); // yield agar overlay loading render
    const plainChapters = chapters.map(c => ({
      id: c.id,
      content: (c.content || '').replace(/<[^>]*>/g, ' ')
    }));
    plainChaptersRef.current = plainChapters;
    const found = findOrphanEntities(plainChapters, codexEntries, {
      minCount,
      ignored: loadIgnored(projectId)
    });
    setResults(found);
    setScanning(false);
  }, [chapters, codexEntries, minCount, projectId]);

  const applyEnrichment = (list: { name: string; category: CodexCategory; description: string; aliases: string[] }[]) => {
    setEnriched(prev => {
      const next = { ...prev };
      for (const e of list) next[e.name] = { category: e.category, description: e.description, aliases: e.aliases };
      return next;
    });
    setCategories(prev => {
      const next = { ...prev };
      for (const e of list) next[e.name] = e.category;
      return next;
    });
  };

  const enrichOne = async (cand: OrphanCandidate) => {
    setEnrichError(null);
    setEnrichingNames(prev => new Set(prev).add(cand.name));
    try {
      const excerpts = gatherEntityContext(plainChaptersRef.current, cand.name, { maxSnippets: 6, window: 180, maxChars: 1500 });
      const res = await enrichEntities([{ name: cand.name, excerpts }], bibleRules);
      applyEnrichment(res.map(e => ({ name: e.name, category: e.category as CodexCategory, description: e.description, aliases: e.aliases })));
    } catch (e: any) {
      setEnrichError(e?.message || 'Gagal melengkapi entitas dengan AI.');
    } finally {
      setEnrichingNames(prev => { const n = new Set(prev); n.delete(cand.name); return n; });
    }
  };

  const enrichAll = async () => {
    if (!results || results.length === 0) return;
    setEnrichError(null);
    setEnrichingAll(true);
    try {
      const batch = results.slice(0, MAX_BATCH);
      const items = batch.map(c => ({
        name: c.name,
        excerpts: gatherEntityContext(plainChaptersRef.current, c.name, { maxSnippets: 3, window: 160, maxChars: 700 })
      }));
      const res = await enrichEntities(items, bibleRules);
      applyEnrichment(res.map(e => ({ name: e.name, category: e.category as CodexCategory, description: e.description, aliases: e.aliases })));
    } catch (e: any) {
      setEnrichError(e?.message || 'Gagal melengkapi entitas dengan AI.');
    } finally {
      setEnrichingAll(false);
    }
  };

  const addToCodex = async (cand: OrphanCandidate) => {
    const enr = enriched[cand.name];
    const category = categories[cand.name] || enr?.category || 'character';
    await addCodexEntry({
      projectId,
      name: cand.name,
      aliases: enr?.aliases || [],
      category,
      description: enr?.description || '',
      tags: []
    });
    // Entri baru harus segera masuk konteks AI (selaras dengan jalur simpan Codex).
    await invalidateContextCache();
    setResults(prev => prev ? prev.filter(c => c.name !== cand.name) : prev);
  };

  const ignore = (cand: OrphanCandidate) => {
    const set = loadIgnored(projectId);
    set.add(cand.name.toLowerCase());
    saveIgnored(projectId, set);
    setResults(prev => prev ? prev.filter(c => c.name !== cand.name) : prev);
  };

  const totalChapters = chapters?.length ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10 w-full">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase border border-indigo-100 dark:border-indigo-800/50">
          <UserSearch size={14} />
          <span>Saran Entitas</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
          Entitas Yatim
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          Memindai manuskrip untuk nama-diri yang sering muncul tetapi belum ada di Kamus Data. Tambahkan sekali klik, atau biarkan AI mengisi kategori &amp; deskripsi berdasarkan teks aslinya.
        </p>
      </header>

      {/* Kontrol */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Min. kemunculan</label>
          <select
            aria-label="Frekuensi minimum"
            value={minCount}
            onChange={(e) => setMinCount(Number(e.target.value))}
            disabled={scanning}
            className="w-full sm:w-40 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-50"
          >
            {[2, 3, 5, 8].map(n => <option key={n} value={n}>{n}× atau lebih</option>)}
          </select>
        </div>
        <button
          onClick={scan}
          disabled={scanning || totalChapters === 0}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm hover:shadow-md"
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />}
          {scanning ? 'Memindai…' : 'Pindai Manuskrip'}
        </button>
        <p className="text-xs text-slate-400 dark:text-slate-500 sm:ml-auto self-center">
          {totalChapters} bab di manuskrip
        </p>
      </div>

      {enrichError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{enrichError}</p>
        </div>
      )}

      {/* Hasil */}
      {results !== null && (
        results.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-emerald-200 dark:border-emerald-800/50 rounded-3xl bg-emerald-50/40 dark:bg-emerald-900/10">
            <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mb-5">
              <CheckCircle2 size={26} className="text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Tidak ada entitas yatim</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
              Semua nama-diri yang sering muncul sudah ada di Kamus Data (atau diabaikan). Codex Anda lengkap.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {results.length} kandidat ditemukan
              </h2>
              <button
                onClick={enrichAll}
                disabled={enrichingAll}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50 rounded-xl text-xs font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/50 disabled:opacity-50 transition-all active:scale-95"
                title="Isi kategori & deskripsi semua kandidat dengan AI (satu panggilan)"
              >
                {enrichingAll ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {enrichingAll ? 'Melengkapi…' : `Lengkapi semua dengan AI${results.length > MAX_BATCH ? ` (${MAX_BATCH} teratas)` : ''}`}
              </button>
            </div>
            <AnimatePresence mode="popLayout">
              {results.map(cand => (
                <CandidateCard
                  key={cand.name}
                  cand={cand}
                  category={categories[cand.name] || enriched[cand.name]?.category || 'character'}
                  enrichment={enriched[cand.name]}
                  isEnriching={enrichingNames.has(cand.name) || enrichingAll}
                  onCategory={(c) => setCategories(prev => ({ ...prev, [cand.name]: c }))}
                  onEnrich={() => enrichOne(cand)}
                  onAdd={() => addToCodex(cand)}
                  onIgnore={() => ignore(cand)}
                />
              ))}
            </AnimatePresence>
          </div>
        )
      )}

      {results === null && !scanning && (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
          <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-5">
            <Sparkles size={24} className="text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Belum dipindai</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Klik <span className="font-medium">Pindai Manuskrip</span> untuk menemukan nama yang sering muncul namun belum tercatat di Codex.
          </p>
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  cand, category, enrichment, isEnriching, onCategory, onEnrich, onAdd, onIgnore
}: {
  cand: OrphanCandidate;
  category: CodexCategory;
  enrichment?: Enrichment;
  isEnriching: boolean;
  onCategory: (c: CodexCategory) => void;
  onEnrich: () => void;
  onAdd: () => void;
  onIgnore: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 break-words">{cand.name}</h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50">
              {cand.count}×
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              di {cand.chapterIds.length} bab
            </span>
          </div>
          {cand.sample && !enrichment && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed break-words">{cand.sample}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label={`Kategori untuk ${cand.name}`}
            value={category}
            onChange={(e) => onCategory(e.target.value as CodexCategory)}
            className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-indigo-400"
          >
            {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={onEnrich}
            disabled={isEnriching}
            title="Lengkapi kategori & deskripsi dengan AI"
            className="flex items-center justify-center w-9 h-9 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/50 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/30 disabled:opacity-50 transition-colors"
          >
            {isEnriching ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          </button>
          <button
            onClick={onAdd}
            title="Tambah ke Codex"
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all active:scale-95"
          >
            <Plus size={14} /> Tambah
          </button>
          <button
            onClick={onIgnore}
            title="Abaikan kandidat ini"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <EyeOff size={15} />
          </button>
        </div>
      </div>

      {/* Hasil enrichment AI */}
      {enrichment && (
        <div className="rounded-xl bg-violet-50/50 dark:bg-violet-900/15 border border-violet-100 dark:border-violet-800/40 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
            <Wand2 size={12} /> Disusun AI dari manuskrip
          </div>
          {enrichment.description ? (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words">{enrichment.description}</p>
          ) : (
            <p className="text-xs text-slate-400 italic">AI tidak menemukan cukup konteks untuk deskripsi.</p>
          )}
          {enrichment.aliases.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Alias:</span>
              {enrichment.aliases.map((a, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
