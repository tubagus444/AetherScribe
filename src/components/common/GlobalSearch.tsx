/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Book, FileText, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '@/src/db';
import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import { findCodexResults, type ChapterSearchMatch, type ChapterSearchRequest, type ChapterSearchResponse } from '@/src/lib/globalSearch';

interface GlobalSearchProps {
  projectId: number;
  onSelectChapter: (id: number, match?: ChapterSearchMatch) => Promise<boolean>;
  onSelectCodex: (id: number) => Promise<boolean>;
  onClose: () => void;
}

function MatchExcerpt({ match }: { match: ChapterSearchMatch }) {
  return (
    <p className="mt-0.5 break-words text-xs text-slate-600 dark:text-slate-300">
      {match.before.length === 48 && '…'}{match.before}
      <mark className="rounded bg-amber-100 text-slate-900 dark:bg-amber-300">{match.text}</mark>
      {match.after}{match.after.length === 48 && '…'}
    </p>
  );
}

export function GlobalSearch({ projectId, onSelectChapter, onSelectCodex, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const searchTerm = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const openingRef = useRef(false);
  const chapters = useProjectChapters(projectId, 'manuscript');
  const codex = useLiveQuery(() => db.codex.where('projectId').equals(projectId).toArray(), [projectId]);
  const [chapterSearch, setChapterSearch] = useState<{
    projectId: number;
    chapters: typeof chapters;
    query: string;
    response: ChapterSearchResponse;
  }>();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery !== searchTerm || !chapters) return;
    const receive = (response: ChapterSearchResponse) =>
      setChapterSearch({ projectId, chapters, query: debouncedQuery, response });
    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL('../../workers/chapterSearchWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<ChapterSearchResponse>) => receive(event.data);
      worker.onerror = () => receive({ error: true });
      worker.postMessage({
        query: debouncedQuery,
        chapters: chapters.flatMap(({ id, title, content }) => id == null ? [] : [{ id, title, content }]),
      } satisfies ChapterSearchRequest);
    } catch {
      receive({ error: true });
    }
    return () => {
      if (!worker) return;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
  }, [projectId, chapters, debouncedQuery, searchTerm]);

  const codexResults = useMemo(() => findCodexResults(codex ?? [], searchTerm === debouncedQuery ? searchTerm : ''), [codex, searchTerm, debouncedQuery]);
  const currentResponse = chapterSearch?.projectId === projectId && chapterSearch.chapters === chapters
    && chapterSearch.query === searchTerm ? chapterSearch.response : undefined;
  const chapterResults = currentResponse && 'results' in currentResponse ? currentResponse.results : [];
  const failed = !!currentResponse && 'error' in currentResponse;
  const isSearching = !!searchTerm && (!currentResponse || !codex);

  useEffect(() => {
    const handleDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !openingRef.current) onClose();
    };
    window.addEventListener('keydown', handleDown);
    return () => window.removeEventListener('keydown', handleDown);
  }, [onClose]);

  const open = async (navigate: () => Promise<boolean>) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setIsOpening(true);
    setOpenFailed(false);
    try {
      if (await navigate()) onClose();
      else setOpenFailed(true);
    } finally {
      openingRef.current = false;
      setIsOpening(false);
    }
  };

  const resultClass = 'flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-slate-100 focus-visible:outline-2 dark:hover:bg-slate-800 disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/40 p-4 pt-6 backdrop-blur-sm sm:pt-24">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian global"
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[80vh]"
      >
        <div className="flex flex-none items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <Search size={20} className="shrink-0 text-slate-400" />
          <input
            autoFocus
            type="search"
            aria-label="Cari bab atau entri Codex"
            className="min-w-0 flex-1 bg-transparent text-base focus:outline-none sm:text-lg"
            placeholder="Cari bab atau entri Codex…"
            value={query}
            onChange={event => {
              setOpenFailed(false);
              setQuery(event.target.value);
            }}
            onKeyDown={event => {
              if (event.key !== 'Enter' || isSearching) return;
              const chapter = chapterResults[0];
              const entry = codexResults[0];
              if (chapter) void open(() => onSelectChapter(chapter.id, chapter.match));
              else if (entry) void open(() => onSelectCodex(entry.id));
            }}
          />
          <button type="button" aria-label="Tutup pencarian" disabled={isOpening} onClick={onClose} className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
          {openFailed && <p role="status" className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Tujuan belum bisa dibuka. Coba lagi.</p>}
          {!searchTerm && <p className="p-6 text-center text-sm text-slate-500">Ketik judul, frasa naskah, atau nama entri.</p>}
          {isSearching && <p role="status" className="px-3 py-2 text-sm text-slate-500">Mencari…</p>}
          {failed && <p role="status" className="px-3 py-2 text-sm text-slate-500">Pencarian bab gagal. Ubah kata kunci atau buka ulang pencarian.</p>}
          {!!searchTerm && !isSearching && !failed && !chapterResults.length && !codexResults.length && (
            <p role="status" className="p-6 text-center text-sm text-slate-500">Tidak ada hasil untuk “{searchTerm}”.</p>
          )}

          {chapterResults.length > 0 && (
            <section aria-label="Hasil bab" className="mb-2 space-y-1">
              <h3 className="px-3 py-1 text-xs font-semibold text-slate-500">Bab</h3>
              {chapterResults.map(chapter => (
                <button key={chapter.id} type="button" disabled={isOpening} className={resultClass} onClick={() => void open(() => onSelectChapter(chapter.id, chapter.match))}>
                  <FileText size={16} className="mt-0.5 shrink-0 text-indigo-500" />
                  <div className="min-w-0">
                    <span className="block break-words text-sm font-semibold">{chapter.title || 'Bab tanpa judul'}</span>
                    {chapter.match && <MatchExcerpt match={chapter.match} />}
                  </div>
                </button>
              ))}
            </section>
          )}

          {codexResults.length > 0 && (
            <section aria-label="Hasil Codex" className="space-y-1">
              <h3 className="px-3 py-1 text-xs font-semibold text-slate-500">Codex</h3>
              {codexResults.map(({ entry, id }) => (
                <button key={id} type="button" disabled={isOpening} className={resultClass} onClick={() => void open(() => onSelectCodex(id))}>
                  <Book size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <span className="block break-words text-sm font-semibold">{entry.name}</span>
                    <p className="line-clamp-2 break-words text-xs text-slate-600 dark:text-slate-300">{entry.category} · {entry.description}</p>
                  </div>
                </button>
              ))}
            </section>
          )}
        </div>
      </motion.div>
    </div>
  );
}
