import { readChaptersById } from '@/src/services/chapterQueries';
import React, { useEffect, useState } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { CodexEntry, Chapter } from '@/src/types';
import { getEntryAppearances } from '@/src/services/contextEngine';
import { useNavigation } from '@/src/contexts/NavigationContext';

export function AppearancesList({ entry, projectId, autoLoad = false }: {
  entry: CodexEntry;
  projectId: number;
  autoLoad?: boolean;
}) {
  const { setViewMode, setActiveChapterId } = useNavigation();
  const [attempt, setAttempt] = useState(autoLoad ? 1 : 0);
  const [result, setResult] = useState<Chapter[] | 'loading' | 'error' | null>(autoLoad ? 'loading' : null);

  useEffect(() => {
    if (!attempt) return;
    let current = true;
    getEntryAppearances(entry, projectId)
      .then(readChaptersById)
      .then(chapters => {
        if (current) setResult(chapters.filter(chapter => chapter !== undefined));
      })
      .catch(error => {
        if (!current) return;
        console.error('Failed to fetch appearances:', error);
        setResult('error');
      });
    return () => { current = false; };
  }, [entry, projectId, attempt]);

  const goToChapter = (id: number) => {
    setActiveChapterId(id);
    setViewMode('write');
  };

  if (result === null || result === 'error') {
    return (
      <>
        {result === 'error' && <p role="status" className="text-xs text-red-600 dark:text-red-400">Kemunculan gagal dimuat.</p>}
        <button
          type="button"
          onClick={() => { setResult('loading'); setAttempt(attempt + 1); }}
          className="mt-3 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          <BookOpen size={12} /> {result === 'error' ? 'Coba Lagi' : 'Cek Kemunculan di Chapter'}
        </button>
      </>
    );
  }

  if (result === 'loading') {
    return (
      <div role="status" className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 animate-pulse flex items-center gap-1">
        <Sparkles size={12} className="animate-spin" /> Sedang mencari...
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60">
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-2">
        <BookOpen size={12} /> Muncul di {result.length} Chapter:
      </span>
      <div className="flex flex-wrap gap-1.5">
        {result.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">Belum ditemukan di chapter mana pun.</span>
        ) : (
          result.map(ch => (
            <button
              key={ch.id}
              onClick={() => goToChapter(ch.id!)}
              className="text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
            >
              {ch.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
