import { readChaptersById } from '@/src/services/chapterQueries';
import React, { useState } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { CodexEntry, Chapter } from '@/src/types';
import { getEntryAppearances } from '@/src/services/contextEngine';
import { useNavigation } from '@/src/contexts/NavigationContext';

export function AppearancesList({ entry, projectId }: { entry: CodexEntry; projectId: number }) {
  const { setViewMode, setActiveChapterId } = useNavigation();
  const [appearances, setAppearances] = useState<Chapter[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAppearances = async () => {
    setLoading(true);
    try {
      const chapterIds = await getEntryAppearances(entry, projectId);
      const chapters = await readChaptersById(chapterIds);
      setAppearances(chapters.filter(Boolean) as Chapter[]);
    } catch (err) {
      console.error('Failed to fetch appearances:', err);
    } finally {
      setLoading(false);
    }
  };

  const goToChapter = (id: number) => {
    setActiveChapterId(id);
    setViewMode('write');
  };

  if (!appearances && !loading) {
    return (
      <button 
        onClick={fetchAppearances}
        className="mt-3 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
      >
        <BookOpen size={12} /> Cek Kemunculan di Chapter
      </button>
    );
  }

  if (loading) {
    return (
      <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 animate-pulse flex items-center gap-1">
        <Sparkles size={12} className="animate-spin" /> Sedang mencari...
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60">
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-2">
        <BookOpen size={12} /> Muncul di {appearances?.length} Chapter:
      </span>
      <div className="flex flex-wrap gap-1.5">
        {appearances?.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">Belum ditemukan di chapter mana pun.</span>
        ) : (
          appearances?.map(ch => (
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
