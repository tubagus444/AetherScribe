/**
 * Find & Replace lintas-bab (seluruh naskah).
 *
 * Beda dari pencarian-dalam-editor (extension TipTap, hanya bab aktif), modal ini
 * memindai & mengganti di SEMUA bab via Dexie. Keamanan bab yang sedang dibuka dijaga
 * lewat editorBridge: flush sebelum mengganti, reload sesudahnya (lihat editorBridge.ts).
 */

import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search, X, Replace, ReplaceAll, CaseSensitive, Regex, FileText,
  ChevronDown, ChevronRight, Loader2, AlertTriangle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useToast } from '@/src/hooks/useToast';
import { buildSearchRegex, prepareReplacement, findInHtml, replaceInHtml, MatchSnippet } from '@/src/lib/findReplace';
import { flushActiveEditor, reloadActiveEditor } from '@/src/features/editor/editorBridge';
import { createAutoSnapshot } from '@/src/services/snapshotService';

interface CrossChapterReplaceProps {
  projectId: number;
  onSelectChapter: (id: number) => void;
  onClose: () => void;
}

interface ChapterResult {
  id: number;
  title: string;
  count: number;
  snippets: MatchSnippet[];
}

const MAX_SNIPPETS_PER_CHAPTER = 5;

export function CrossChapterReplace({ projectId, onSelectChapter, onClose }: CrossChapterReplaceProps) {
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleDown);
    return () => window.removeEventListener('keydown', handleDown);
  }, [onClose]);

  const chapters = useLiveQuery(
    () => db.chapters.where('projectId').equals(projectId).sortBy('order'),
    [projectId],
  );

  const regexInvalid = useMemo(
    () => debouncedQuery.length > 0 && buildSearchRegex(debouncedQuery, { caseSensitive, regex: isRegex }) === null,
    [debouncedQuery, caseSensitive, isRegex],
  );

  const { results, totalMatches } = useMemo(() => {
    const regex = buildSearchRegex(debouncedQuery, { caseSensitive, regex: isRegex });
    if (!regex || !chapters) return { results: [] as ChapterResult[], totalMatches: 0 };
    const out: ChapterResult[] = [];
    let total = 0;
    for (const ch of chapters) {
      const { count, snippets } = findInHtml(ch.content || '', regex, MAX_SNIPPETS_PER_CHAPTER);
      if (count > 0) {
        out.push({ id: ch.id!, title: ch.title || 'Tanpa Judul', count, snippets });
        total += count;
      }
    }
    return { results: out, totalMatches: total };
  }, [debouncedQuery, caseSensitive, isRegex, chapters]);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runReplace = async (onlyChapterId?: number) => {
    const regex = buildSearchRegex(debouncedQuery, { caseSensitive, regex: isRegex });
    if (!regex) {
      toast.error('Pola pencarian tidak valid.');
      return;
    }
    const prepared = prepareReplacement(replacement, isRegex);
    setIsReplacing(true);
    let editorFlushed = false;
    try {
      // 1. Persist edit bab aktif yang belum tersimpan agar tidak hilang saat di-replace.
      await flushActiveEditor();
      editorFlushed = true;

      // 2. Baca ulang dari DB (pasca-flush) lalu ganti di dalam satu transaksi.
      const all = await db.chapters.where('projectId').equals(projectId).toArray();
      let totalReplaced = 0;
      let chaptersChanged = 0;
      const changed: { id: number; oldContent: string; count: number }[] = [];
      await db.transaction('rw', db.chapters, async () => {
        for (const ch of all) {
          if (onlyChapterId !== undefined && ch.id !== onlyChapterId) continue;
          regex.lastIndex = 0;
          const { html, count } = replaceInHtml(ch.content || '', regex, prepared);
          if (count > 0) {
            changed.push({ id: ch.id!, oldContent: ch.content || '', count });
            await db.chapters.update(ch.id!, { content: html, lastModified: Date.now() });
            totalReplaced += count;
            chaptersChanged++;
          }
        }
      });

      // 3. Titik balik otomatis per-bab yang berubah (konten LAMA pra-replace),
      //    di luar transaksi db.chapters karena menulis ke tabel snapshots.
      await Promise.all(
        changed.map(c => createAutoSnapshot(c.id, c.oldContent, `Sebelum ganti ${c.count}× "${debouncedQuery}"`)),
      );

      // 4. Muat ulang editor aktif agar mencerminkan hasil (tanpa memicu autosave).
      await reloadActiveEditor();

      if (totalReplaced === 0) {
        toast.info('Tidak ada yang diganti.');
      } else {
        toast.success(`Mengganti ${totalReplaced} kecocokan di ${chaptersChanged} bab.`);
      }
    } catch (err) {
      console.error('Cross-chapter replace failed:', err);
      toast.error(editorFlushed
        ? 'Gagal melakukan penggantian.'
        : 'Draft belum tersimpan. Penggantian dibatalkan. Coba lagi untuk menyimpan ulang.');
    } finally {
      setIsReplacing(false);
    }
  };

  const hasResults = results.length > 0;
  const canReplace = hasResults && !isReplacing && !regexInvalid;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6 sm:pt-24 bg-slate-900/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh]"
      >
        {/* Header / inputs */}
        <div className="flex-none p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <ReplaceAll size={16} className="text-indigo-500" /> Ganti di Seluruh Naskah
            </h2>
            <button type="button" onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 dark:text-slate-500" title="Tutup">
              <X size={16} />
            </button>
          </div>

          {/* Search row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                aria-label="Cari teks"
                className={cn(
                  'w-full h-10 pl-9 pr-20 bg-slate-50 dark:bg-slate-800/50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
                  regexInvalid ? 'border-red-300 dark:border-red-900 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500',
                )}
                placeholder="Cari di semua bab..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {debouncedQuery && !regexInvalid && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {totalMatches} match
                </span>
              )}
            </div>
            <div className="flex gap-0.5 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => setCaseSensitive(v => !v)}
                className={cn('p-2 rounded transition-colors', caseSensitive ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white dark:hover:bg-slate-800')}
                title="Case Sensitive (Aa)"
              >
                <CaseSensitive size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsRegex(v => !v)}
                className={cn('p-2 rounded transition-colors', isRegex ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white dark:hover:bg-slate-800')}
                title="Gunakan Regex (.*)"
              >
                <Regex size={14} />
              </button>
            </div>
          </div>

          {/* Replace row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Replace size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Ganti dengan"
                className="w-full h-10 pl-9 pr-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="Ganti dengan..."
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => runReplace()}
              disabled={!canReplace}
              className="h-10 px-4 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {isReplacing ? <Loader2 size={14} className="animate-spin" /> : <ReplaceAll size={14} />}
              Ganti Semua
            </button>
          </div>

          {regexInvalid && (
            <p className="text-xs text-red-500 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Pola regex tidak valid.
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {!debouncedQuery && (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <Search size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm italic">Ketik untuk mencari di seluruh bab.</p>
            </div>
          )}

          {debouncedQuery && !regexInvalid && !hasResults && (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <p className="text-sm">Tidak ada hasil untuk "{debouncedQuery}".</p>
            </div>
          )}

          {hasResults && (
            <div className="space-y-1">
              {results.map(r => {
                const isOpen = expanded.has(r.id);
                return (
                  <div key={r.id} className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50/60 dark:bg-slate-800/30">
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        title={isOpen ? 'Tutup cuplikan' : 'Lihat cuplikan'}
                      >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { onSelectChapter(r.id); onClose(); }}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left group"
                        title="Buka bab"
                      >
                        <FileText size={14} className="text-indigo-500 shrink-0" />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-indigo-600">{r.title}</span>
                      </button>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/50 px-1.5 py-0.5 rounded shrink-0">
                        {r.count}
                      </span>
                      <button
                        type="button"
                        onClick={() => runReplace(r.id)}
                        disabled={!canReplace}
                        className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
                        title="Ganti hanya di bab ini"
                      >
                        Ganti
                      </button>
                    </div>

                    {isOpen && (
                      <div className="px-3 py-2 space-y-1.5 border-t border-slate-100 dark:border-slate-800">
                        {r.snippets.map((s, i) => (
                          <p key={i} className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-serif">
                            {s.before}
                            <mark className="bg-amber-200 dark:bg-amber-500/30 text-slate-900 dark:text-amber-100 rounded px-0.5">{s.match}</mark>
                            {s.after}
                          </p>
                        ))}
                        {r.count > r.snippets.length && (
                          <p className="text-[10px] text-slate-400 italic">+{r.count - r.snippets.length} kecocokan lainnya…</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer summary */}
        {hasResults && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {totalMatches} kecocokan di {results.length} bab
          </div>
        )}
      </motion.div>
    </div>
  );
}
