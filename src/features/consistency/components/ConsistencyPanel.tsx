/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ShieldCheck, ScanSearch, Loader2, AlertTriangle, CheckCircle2, X, ChevronRight,
  ArrowUpRight, Layers, Sparkles, ChevronDown, ChevronUp, CheckSquare, Square,
  RotateCcw, Check, BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useProjectData } from '@/src/hooks/useProjectData';
import { checkConsistency, cancelAI } from '@/src/services/ai';
import { stripHtml } from '@/src/lib/editorUtils';
import { buildTimelineSummary } from '@/src/lib/timelineSummary';
import { ConsistencyFinding } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface ConsistencyPanelProps {
  projectId: number;
}

export interface BatchResultItem {
  chapterId: number;
  chapterTitle: string;
  chapterOrder: number;
  findings: ConsistencyFinding[];
  truncated: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

const SEVERITY_META: Record<ConsistencyFinding['severity'], { label: string; badge: string; dot: string; order: number }> = {
  high: {
    label: 'Tinggi',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
    dot: 'bg-red-500',
    order: 0
  },
  medium: {
    label: 'Sedang',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
    dot: 'bg-amber-500',
    order: 1
  },
  low: {
    label: 'Rendah',
    badge: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800/50',
    dot: 'bg-sky-500',
    order: 2
  }
};

export function ConsistencyPanel({ projectId }: ConsistencyPanelProps) {
  const { activeChapterId, jumpToText } = useNavigation();
  const { codexEntries, bibleRules, relationships } = useProjectData(projectId);

  const chapters = useLiveQuery(() =>
    db.chapters.where('projectId').equals(projectId).sortBy('order')
  , [projectId]);

  const [mode, setMode] = useState<'single' | 'batch'>('single');

  // Single mode state
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(activeChapterId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<ConsistencyFinding[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [checkedTitle, setCheckedTitle] = useState('');
  const [checkedChapterId, setCheckedChapterId] = useState<number | null>(null);

  // Batch mode state
  const [selectedBatchChapterIds, setSelectedBatchChapterIds] = useState<Set<number>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{
    running: boolean;
    currentChapterIndex: number;
    totalChapters: number;
    currentChapterTitle: string;
  } | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResultItem[] | null>(null);
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<number>>(new Set());
  const batchCancelledRef = useRef(false);

  // Default ke bab aktif begitu daftar bab termuat / bab aktif berubah.
  useEffect(() => {
    if (selectedChapterId == null && activeChapterId != null) {
      setSelectedChapterId(activeChapterId);
    }
  }, [activeChapterId, selectedChapterId]);

  // Batch selection helpers
  const toggleBatchChapter = (id: number) => {
    setSelectedBatchChapterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllBatchChapters = () => {
    if (!chapters) return;
    const all = new Set(chapters.map(c => c.id).filter((id): id is number => id != null));
    setSelectedBatchChapterIds(all);
  };

  const selectRecentBatchChapters = (count = 5) => {
    if (!chapters) return;
    const sorted = [...chapters].sort((a, b) => b.order - a.order);
    const recent = sorted.slice(0, count).map(c => c.id).filter((id): id is number => id != null);
    setSelectedBatchChapterIds(new Set(recent));
  };

  const clearBatchChapters = () => {
    setSelectedBatchChapterIds(new Set());
  };

  const toggleExpandedChapter = (id: number) => {
    setExpandedChapterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAllChapters = () => {
    if (!batchResults) return;
    setExpandedChapterIds(new Set(batchResults.map(r => r.chapterId)));
  };

  const collapseAllChapters = () => {
    setExpandedChapterIds(new Set());
  };

  // Run single chapter check
  const runCheck = async () => {
    if (selectedChapterId == null) return;
    const chapter = await db.chapters.get(selectedChapterId);
    if (!chapter) {
      setError('Bab tidak ditemukan.');
      return;
    }

    const plain = stripHtml(chapter.content || '').trim();
    if (plain.length < 50) {
      setError('Bab ini terlalu pendek untuk diperiksa.');
      setFindings(null);
      return;
    }

    setLoading(true);
    setError(null);
    setFindings(null);
    setCheckedTitle(chapter.title);
    setCheckedChapterId(chapter.id ?? selectedChapterId);

    // Bangun ringkasan timeline dari data terkini agar AI bisa cek urutan waktu.
    const project = await db.projects.get(projectId);
    const timelineEvents = await db.timeline.where('projectId').equals(projectId).toArray();
    const timelineSummary = buildTimelineSummary(timelineEvents, chapters || [], codexEntries, project?.calendar);

    try {
      const { findings, truncated } = await checkConsistency({
        chapterText: plain,
        chapterTitle: chapter.title,
        bibleRules,
        codexEntries,
        relationships,
        timelineSummary
      });
      // Urutkan berdasarkan severity (tinggi dulu).
      findings.sort((a, b) => SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order);
      setFindings(findings);
      setTruncated(truncated);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setError(null);
      } else {
        setError(e?.message || 'Pengecekan konsistensi gagal.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Run batch chapters check
  const runBatchCheck = async () => {
    if (!chapters || selectedBatchChapterIds.size === 0) return;
    const targetChapters = chapters
      .filter(c => c.id != null && selectedBatchChapterIds.has(c.id))
      .sort((a, b) => a.order - b.order);

    if (targetChapters.length === 0) return;

    setLoading(true);
    setError(null);
    setBatchResults([]);
    batchCancelledRef.current = false;
    setBatchProgress({
      running: true,
      currentChapterIndex: 0,
      totalChapters: targetChapters.length,
      currentChapterTitle: targetChapters[0].title,
    });

    const project = await db.projects.get(projectId);
    const timelineEvents = await db.timeline.where('projectId').equals(projectId).toArray();
    const timelineSummary = buildTimelineSummary(timelineEvents, chapters || [], codexEntries, project?.calendar);

    const accumulatedResults: BatchResultItem[] = [];
    const autoExpanded = new Set<number>();

    for (let i = 0; i < targetChapters.length; i++) {
      if (batchCancelledRef.current) break;

      const ch = targetChapters[i];
      setBatchProgress({
        running: true,
        currentChapterIndex: i,
        totalChapters: targetChapters.length,
        currentChapterTitle: ch.title,
      });

      const plain = stripHtml(ch.content || '').trim();
      if (plain.length < 50) {
        accumulatedResults.push({
          chapterId: ch.id!,
          chapterTitle: ch.title,
          chapterOrder: ch.order,
          findings: [],
          truncated: false,
          skipped: true,
          skipReason: 'Bab terlalu pendek (< 50 karakter)'
        });
        setBatchResults([...accumulatedResults]);
        continue;
      }

      try {
        const { findings: chFindings, truncated: chTruncated } = await checkConsistency({
          chapterText: plain,
          chapterTitle: ch.title,
          bibleRules,
          codexEntries,
          relationships,
          timelineSummary
        });

        chFindings.sort((a, b) => SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order);

        if (chFindings.length > 0) {
          autoExpanded.add(ch.id!);
        }

        accumulatedResults.push({
          chapterId: ch.id!,
          chapterTitle: ch.title,
          chapterOrder: ch.order,
          findings: chFindings,
          truncated: chTruncated,
        });
      } catch (e: any) {
        if (e?.name === 'AbortError' || batchCancelledRef.current) {
          break;
        }
        accumulatedResults.push({
          chapterId: ch.id!,
          chapterTitle: ch.title,
          chapterOrder: ch.order,
          findings: [],
          truncated: false,
          error: e?.message || 'Gagal memeriksa konsistensi bab ini.'
        });
        autoExpanded.add(ch.id!);
      }

      setBatchResults([...accumulatedResults]);
      setExpandedChapterIds(new Set(autoExpanded));
    }

    setLoading(false);
    setBatchProgress(null);
  };

  const cancel = () => {
    batchCancelledRef.current = true;
    cancelAI('consistency');
    setLoading(false);
    setBatchProgress(null);
  };

  // Hitung statistik hasil batch
  const batchStats = batchResults ? {
    totalChapters: batchResults.length,
    totalFindings: batchResults.reduce((sum, r) => sum + r.findings.length, 0),
    high: batchResults.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'high').length, 0),
    medium: batchResults.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'medium').length, 0),
    low: batchResults.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'low').length, 0),
  } : null;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 pb-20 w-full">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase border border-indigo-100 dark:border-indigo-800/50">
          <ShieldCheck size={14} />
          <span>Pengecek Konsistensi</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
          Periksa Kontinuitas
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          AI membandingkan bab naskah dengan Kamus Data, Buku Cerita, dan relasi karakter — lalu menandai detail yang bertentangan (warna mata, peran, timeline, plot). Mendukung pemeriksaan per-bab maupun batch beruntun hemat token dengan prompt caching.
        </p>
      </header>

      {/* Mode Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setMode('single')}
          disabled={loading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer',
            mode === 'single'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
        >
          <ScanSearch size={14} /> Bab Tunggal
        </button>
        <button
          type="button"
          onClick={() => setMode('batch')}
          disabled={loading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer',
            mode === 'batch'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          )}
        >
          <Layers size={14} /> Audit Batch (Banyak Bab)
        </button>
      </div>

      {/* Kontrol Mode Tunggal */}
      {mode === 'single' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Bab yang diperiksa
            </label>
            <select
              value={selectedChapterId ?? ''}
              onChange={(e) => setSelectedChapterId(e.target.value ? Number(e.target.value) : null)}
              disabled={loading}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 transition-all disabled:opacity-50"
            >
              <option value="" disabled>Pilih bab…</option>
              {chapters?.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.title}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <button
              onClick={cancel}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-[0.98]"
            >
              <X size={16} /> Batalkan
            </button>
          ) : (
            <button
              onClick={runCheck}
              disabled={selectedChapterId == null}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm hover:shadow-md cursor-pointer"
            >
              <ScanSearch size={16} /> Periksa Konsistensi
            </button>
          )}
        </div>
      )}

      {/* Kontrol Mode Batch */}
      {mode === 'batch' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">Antrian Pemeriksaan Bab</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilih bab yang ingin diaudit secara berurutan.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={selectAllBatchChapters}
                disabled={loading}
                className="px-2.5 py-1 text-xs font-medium rounded-lg text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
              >
                Pilih Semua
              </button>
              <button
                type="button"
                onClick={() => selectRecentBatchChapters(5)}
                disabled={loading}
                className="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                5 Bab Terakhir
              </button>
              <button
                type="button"
                onClick={clearBatchChapters}
                disabled={loading}
                className="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Kosongkan
              </button>
            </div>
          </div>

          {/* Daftar Bab Terpilih */}
          <div className="max-h-56 overflow-y-auto space-y-1 p-2 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-800/60">
            {chapters?.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Belum ada bab yang dibuat.</p>
            ) : (
              chapters?.map((ch) => {
                const isSelected = ch.id != null && selectedBatchChapterIds.has(ch.id);
                const wordCount = (ch.content ? stripHtml(ch.content).split(/\s+/).filter(Boolean).length : 0);
                return (
                  <label
                    key={ch.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => ch.id != null && toggleBatchChapter(ch.id)}
                        disabled={loading}
                        className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 shrink-0"
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {ch.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      ~{wordCount.toLocaleString('id-ID')} kata
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Prompt Caching Highlight Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/40 text-xs text-indigo-900 dark:text-indigo-200">
            <Sparkles size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">Prompt Caching Otomatis Aktif</span>
              <p className="text-indigo-700/80 dark:text-indigo-300/80 leading-relaxed text-[11px]">
                Kamus Data (Codex), Buku Cerita (Bible), dan Relasi Karakter dikirimkan sekaligus. Bab ke-2 dan seterusnya otomatis memanfaatkan prompt cache hit (~100% reusable context), menghemat hingga 90% biaya token dan mempercepat analisis.
              </p>
            </div>
          </div>

          {/* Tombol Aksi Batch */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {selectedBatchChapterIds.size} bab dipilih
            </span>
            {loading ? (
              <button
                onClick={cancel}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl text-sm font-semibold hover:bg-red-100 transition-all active:scale-[0.98] cursor-pointer"
              >
                <X size={16} /> Hentikan Antrian
              </button>
            ) : (
              <button
                onClick={runBatchCheck}
                disabled={selectedBatchChapterIds.size === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm hover:shadow-md cursor-pointer"
              >
                <Layers size={16} /> Mulai Audit Batch ({selectedBatchChapterIds.size} Bab)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Indikator Progres Batch */}
      {batchProgress && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" />
              Memeriksa Bab {batchProgress.currentChapterIndex + 1} dari {batchProgress.totalChapters}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {Math.round(((batchProgress.currentChapterIndex + 1) / batchProgress.totalChapters) * 100)}%
            </span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full transition-all duration-300"
              style={{
                width: `${Math.round(((batchProgress.currentChapterIndex + 1) / batchProgress.totalChapters) * 100)}%`
              }}
            />
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
            Sedang membandingkan: <span className="font-semibold">{batchProgress.currentChapterTitle}</span>
          </p>
        </motion.div>
      )}

      {/* Loading Tunggal */}
      {loading && mode === 'single' && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="animate-spin text-indigo-500 mb-3" size={32} />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-serif italic">
            Membandingkan bab dengan knowledge base…
          </p>
        </div>
      )}

      {/* Pesan Kesalahan */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{error}</p>
        </div>
      )}

      {/* Hasil Mode Tunggal */}
      {mode === 'single' && !loading && findings !== null && (
        <div className="space-y-4">
          {truncated && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-2.5">
              Bab terlalu panjang — hanya bagian awal yang diperiksa. Pertimbangkan memecahnya menjadi beberapa bab.
            </p>
          )}

          {findings.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-emerald-200 dark:border-emerald-800/50 rounded-3xl bg-emerald-50/40 dark:bg-emerald-900/10">
              <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mb-5">
                <CheckCircle2 size={26} className="text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Tidak ada inkonsistensi terdeteksi</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
                AI tidak menemukan kontradiksi pada <span className="font-medium">{checkedTitle}</span> terhadap Kamus Data &amp; Buku Cerita saat ini.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {findings.length} temuan pada <span className="text-indigo-600 dark:text-indigo-400">{checkedTitle}</span>
                </h2>
              </div>
              <AnimatePresence mode="popLayout">
                {findings.map((f, idx) => (
                  <FindingCard
                    key={idx}
                    finding={f}
                    index={idx}
                    onJump={checkedChapterId != null ? () => jumpToText(checkedChapterId, f.quote) : undefined}
                  />
                ))}
              </AnimatePresence>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 italic pt-2">
                Hasil dari AI bersifat saran — selalu verifikasi sebelum mengubah naskah. Temuan ini tidak disimpan; jalankan ulang kapan saja.
              </p>
            </>
          )}
        </div>
      )}

      {/* Hasil Mode Batch */}
      {mode === 'batch' && batchResults !== null && batchResults.length > 0 && (
        <div className="space-y-5">
          {/* Ringkasan Statistik Batch */}
          {batchStats && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Hasil Audit Batch ({batchStats.totalChapters} Bab)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total {batchStats.totalFindings} temuan inkonsistensi
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAllChapters}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Buka Semua
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={collapseAllChapters}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Tutup Semua
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-center">
                  <span className="block text-lg font-bold text-slate-800 dark:text-slate-200">{batchStats.totalChapters}</span>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Bab Diaudit</span>
                </div>
                <div className="p-2.5 rounded-xl bg-red-50/60 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-center">
                  <span className="block text-lg font-bold text-red-600 dark:text-red-400">{batchStats.high}</span>
                  <span className="text-[10px] text-red-500 font-semibold uppercase">Tinggi</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-center">
                  <span className="block text-lg font-bold text-amber-600 dark:text-amber-400">{batchStats.medium}</span>
                  <span className="text-[10px] text-amber-500 font-semibold uppercase">Sedang</span>
                </div>
                <div className="p-2.5 rounded-xl bg-sky-50/60 dark:bg-sky-900/20 border border-sky-200/60 dark:border-sky-800/40 text-center">
                  <span className="block text-lg font-bold text-sky-600 dark:text-sky-400">{batchStats.low}</span>
                  <span className="text-[10px] text-sky-500 font-semibold uppercase">Rendah</span>
                </div>
              </div>
            </div>
          )}

          {/* Daftar Accordion Bab */}
          <div className="space-y-3">
            {batchResults.map((r) => {
              const isExpanded = expandedChapterIds.has(r.chapterId);
              const hasFindings = r.findings.length > 0;

              return (
                <div
                  key={r.chapterId}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
                >
                  {/* Header Bar Accordion */}
                  <button
                    type="button"
                    onClick={() => toggleExpandedChapter(r.chapterId)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                        #{r.chapterOrder + 1}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
                        {r.chapterTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {r.skipped ? (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {r.skipReason || 'Dilewati'}
                        </span>
                      ) : r.error ? (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                          Gagal
                        </span>
                      ) : !hasFindings ? (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">
                          ✓ Konsisten
                        </span>
                      ) : (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-semibold">
                          {r.findings.length} temuan
                        </span>
                      )}

                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>

                  {/* Body Accordion */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-slate-100 dark:border-slate-800/80 p-4 space-y-3 bg-slate-50/30 dark:bg-slate-950/20"
                      >
                        {r.error && (
                          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs border border-red-200 dark:border-red-800/40">
                            {r.error}
                          </div>
                        )}

                        {r.truncated && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3 py-2">
                            Bab ini sangat panjang — hanya bagian awal yang diperiksa.
                          </p>
                        )}

                        {!r.error && !r.skipped && !hasFindings && (
                          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-2">
                            <CheckCircle2 size={16} className="shrink-0" />
                            <span>Tidak ada kontradiksi terdeteksi pada bab ini terhadap basis pengetahuan cerita.</span>
                          </div>
                        )}

                        {hasFindings && (
                          <div className="space-y-3">
                            {r.findings.map((f, idx) => (
                              <FindingCard
                                key={idx}
                                finding={f}
                                index={idx}
                                onJump={() => jumpToText(r.chapterId, f.quote)}
                              />
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic pt-2">
            Hasil audit bersifat saran verifikasi kontinuitas. Klik &quot;Buka di editor&quot; untuk langsung meloncat ke bab dan teks kutipan terkait.
          </p>
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding, index, onJump }: { finding: ConsistencyFinding; index: number; onJump?: () => void }) {
  const meta = SEVERITY_META[finding.severity];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', meta.badge)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          {finding.type}
        </span>
        {onJump && (
          <button
            onClick={onJump}
            title="Buka kutipan ini di editor"
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors active:scale-95"
          >
            Buka di editor <ArrowUpRight size={12} />
          </button>
        )}
      </div>

      <blockquote className="border-l-2 border-slate-300 dark:border-slate-600 pl-3 text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed">
        “{finding.quote}”
      </blockquote>

      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {finding.explanation}
      </p>

      {finding.conflictsWith && (
        <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed">
          <span className="font-semibold text-slate-600 dark:text-slate-400">Bertentangan dengan: </span>
          {finding.conflictsWith}
        </p>
      )}

      {finding.suggestion && (
        <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/15 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800/40">
          <ChevronRight size={14} className="shrink-0 mt-0.5" />
          <p className="leading-relaxed">{finding.suggestion}</p>
        </div>
      )}
    </motion.div>
  );
}
