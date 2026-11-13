/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Telescope, Search, Loader2, RefreshCw, Sparkles, AlertTriangle, BookOpen, DatabaseZap, FolderHeart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import {
  indexManuscript, searchManuscript, countIndexedScenes, clearManuscriptIndex, SceneSearchHit,
} from '@/src/services/contextEngine';
import { oramaSync } from '@/src/services/rag/oramaSync';
import { CodexEntry } from '@/src/types';

interface SemanticSearchPanelProps {
  projectId: number;
}

export type FederatedSearchHit =
  | ({ type: 'scene' } & SceneSearchHit)
  | { type: 'codex'; entry: CodexEntry; score: number };

type IndexState =
  | { phase: 'idle' }
  | { phase: 'indexing'; total: number; completed: number }
  | { phase: 'error'; message: string };

/** Ambil frasa awal cuplikan sebagai istilah sorot saat melompat ke bab. */
function highlightTermFrom(snippet: string): string {
  const words = snippet.trim().split(/\s+/).slice(0, 8).join(' ');
  return words.replace(/[.,;:!?…"'”’)]+$/, '').trim();
}

export function SemanticSearchPanel({ projectId }: SemanticSearchPanelProps) {
  const { jumpToText } = useNavigation();

  const chapters = useLiveQuery(
    () => db.chapters.where('projectId').equals(projectId).toArray(),
    [projectId]
  );
  const indexedCount = useLiveQuery(() => countIndexedScenes(projectId), [projectId]) ?? 0;

  const chapterTitles = useMemo(() => {
    const m = new Map<number, string>();
    (chapters || []).forEach((c, i) => c.id !== undefined && m.set(c.id, c.title || `Bab ${i + 1}`));
    return m;
  }, [chapters]);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<FederatedSearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [indexState, setIndexState] = useState<IndexState>({ phase: 'idle' });
  const searchSeq = useRef(0);

  useEffect(() => {
    ++searchSeq.current;
    setResults(null);
    setSearching(false);
    setSearchError(null);
    return () => { ++searchSeq.current; };
  }, [projectId]);

  // Dengarkan progres indexing dari worker (event global).
  useEffect(() => {
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || typeof detail.type !== 'string') return;
      switch (detail.type) {
        case 'manuscript_index_start':
          setIndexState({ phase: 'indexing', total: detail.total ?? 0, completed: 0 });
          break;
        case 'manuscript_index_progress':
          setIndexState({ phase: 'indexing', total: detail.total ?? 0, completed: detail.completed ?? 0 });
          break;
        case 'manuscript_index_done':
          setIndexState({ phase: 'idle' });
          break;
        case 'manuscript_index_error':
          setIndexState({ phase: 'error', message: detail.message || 'Indexing gagal.' });
          break;
      }
    };
    window.addEventListener('semantic-indexing-progress', onProgress);
    return () => window.removeEventListener('semantic-indexing-progress', onProgress);
  }, []);

  const buildIndex = useCallback(async () => {
    setIndexState({ phase: 'indexing', total: 0, completed: 0 });
    try {
      await indexManuscript(projectId);
    } catch (e: any) {
      setIndexState({ phase: 'error', message: e?.message || 'Gagal memulai indexing.' });
    }
  }, [projectId]);

  const rebuildIndex = useCallback(async () => {
    setResults(null);
    await clearManuscriptIndex(projectId);
    await buildIndex();
  }, [projectId, buildIndex]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    try {
      const [sceneHitsRaw, codexHitsRaw] = await Promise.all([
        indexedCount > 0 ? searchManuscript(projectId, q, 15) : Promise.resolve([]),
        oramaSync.searchWithScores(projectId, q, 8) // Limit Orama lebih kecil karena bab biasanya lebih prioritas
      ]);
      
      if (seq !== searchSeq.current) return; // hasil basi (query berubah)
      
      const sceneHits: FederatedSearchHit[] = sceneHitsRaw.map(h => ({ type: 'scene', ...h }));
      
      // Normalisasi skor BM25 Orama agar sebanding dengan Cosine Similarity (0-1)
      const maxOrama = Math.max(...codexHitsRaw.map(h => h.score), 1);
      const codexHits: FederatedSearchHit[] = codexHitsRaw.map(h => ({
        type: 'codex',
        entry: h.entry,
        score: h.score / maxOrama
      }));
      
      // Gabungkan, urutkan berdasarkan skor ternormalisasi, ambil 15 teratas
      const combined = [...sceneHits, ...codexHits]
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);
        
      setResults(combined);
    } catch (e: any) {
      if (seq === searchSeq.current) setSearchError(e?.message || 'Pencarian gagal.');
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [projectId, query, indexedCount]);

  const isIndexing = indexState.phase === 'indexing';
  const totalChapters = chapters?.length ?? 0;
  const neverIndexed = indexedCount === 0;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 pb-20 w-full">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-xs font-semibold tracking-wide uppercase border border-sky-100 dark:border-sky-800/50">
          <Telescope size={14} />
          <span>Cari Adegan</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
          Pencarian Pintar
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          Temukan adegan naskah berdasarkan <em>makna</em>, dan entri Codex berdasarkan relevansi. Coba <span className="font-medium">"adegan protagonis merasa dikhianati"</span> atau <span className="font-medium">"pedang legendaris"</span>. Sepenuhnya lokal di browser — <span className="font-medium">nol token AI</span>.
        </p>
      </header>

      {/* Status indeks */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 border border-sky-100 dark:border-sky-800/50 flex items-center justify-center">
              <DatabaseZap size={18} className="text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {isIndexing
                  ? 'Membangun indeks…'
                  : neverIndexed
                    ? 'Indeks belum dibangun'
                    : `${indexedCount} adegan terindeks`}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{totalChapters} bab di manuskrip</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {neverIndexed ? (
              <button
                onClick={buildIndex}
                disabled={isIndexing || totalChapters === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 dark:bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-700 dark:hover:bg-sky-600 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm"
              >
                {isIndexing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {isIndexing ? 'Membangun…' : 'Bangun indeks'}
              </button>
            ) : (
              <button
                onClick={rebuildIndex}
                disabled={isIndexing}
                title="Perbarui indeks setelah menulis (hanya bab yang berubah yang di-embed ulang)"
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {isIndexing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {isIndexing ? 'Membangun…' : 'Perbarui indeks'}
              </button>
            )}
          </div>
        </div>

        {/* Keterangan auto-index */}
        {!neverIndexed && !isIndexing && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 -mt-1">
            <Sparkles size={11} />
            Indeks diperbarui otomatis saat Anda menulis. Tombol di atas untuk memaksa pembaruan segera.
          </p>
        )}

        {/* Progress bar */}
        {isIndexing && indexState.total > 0 && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${Math.round((indexState.completed / indexState.total) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-right">
              {indexState.completed} / {indexState.total} adegan di-embed
            </p>
          </div>
        )}

        {indexState.phase === 'error' && (
          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{indexState.message}</span>
          </div>
        )}
      </div>

      {/* Kotak pencarian */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Deskripsikan adegan yang dicari…"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-50 shadow-sm"
          />
        </div>
        <button
          onClick={runSearch}
          disabled={searching || !query.trim()}
          className="flex items-center justify-center gap-2 px-6 py-3.5 bg-sky-600 dark:bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-700 dark:hover:bg-sky-600 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm"
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Cari
        </button>
      </div>

      {searchError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{searchError}</p>
        </div>
      )}

      {/* Hasil */}
      {results !== null && (
        results.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
            <Sparkles size={24} className="text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Tidak ada hasil yang cocok</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">Coba kata kunci yang lebih deskriptif, atau perbarui indeks bila baru menulis.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">{results.length} hasil paling relevan</h2>
            <AnimatePresence mode="popLayout">
              {results.map((hit, idx) => {
                if (hit.type === 'scene') {
                  return (
                    <SceneResultCard
                      key={`scene_${hit.chapterId}_${hit.chunkIndex}`}
                      hit={hit}
                      chapterTitle={chapterTitles.get(hit.chapterId) || 'Bab tak dikenal'}
                      onOpen={() => jumpToText(hit.chapterId, highlightTermFrom(hit.snippet))}
                    />
                  );
                } else {
                  return (
                    <CodexResultCard
                      key={`codex_${hit.entry.id}_${idx}`}
                      entry={hit.entry}
                      score={hit.score}
                    />
                  );
                }
              })}
            </AnimatePresence>
          </div>
        )
      )}

      {results === null && !neverIndexed && (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
          <Telescope size={24} className="text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Siap mencari</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">Ketik deskripsi adegan lalu tekan Enter.</p>
        </div>
      )}

      {neverIndexed && !isIndexing && (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-sky-200 dark:border-sky-800/50 rounded-3xl bg-sky-50/40 dark:bg-sky-900/10">
          <Sparkles size={24} className="text-sky-400 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Bangun indeks untuk adegan</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            Codex dapat dicari langsung. Pencarian semantik perlu meng-index adegan naskah sekali (berjalan lokal, tanpa token). Setelah itu, cukup <span className="font-medium">Perbarui</span> saat menulis lagi.
          </p>
        </div>
      )}
    </div>
  );
}

function SceneResultCard({ hit, chapterTitle, onOpen }: { hit: SceneSearchHit; chapterTitle: string; onOpen: () => void }) {
  const pct = Math.max(0, Math.round(hit.score * 100));
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onClick={onOpen}
      className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-md transition-all active:scale-[0.99] group"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
          <BookOpen size={13} /> {chapterTitle}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800/50">
          {pct}% cocok
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
        {hit.snippet}
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        Klik untuk membuka & menyorot di editor →
      </p>
    </motion.button>
  );
}

function CodexResultCard({ entry, score }: { entry: CodexEntry; score: number }) {
  const { openCodexEntry } = useNavigation();
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onClick={() => openCodexEntry(entry.id!)}
      className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all active:scale-[0.99] group"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
          <FolderHeart size={13} /> Codex: {entry.category}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50">
          {pct}% relevan
        </span>
      </div>
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        {entry.name}
      </h3>
      {entry.description && (
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
          {entry.description}
        </p>
      )}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        Klik untuk membuka detail entri →
      </p>
    </motion.button>
  );
}
