import { useId } from 'react';
import type { DetailChapterIndex } from '@/src/lib/codexDetails';

export function CodexChapterScope({ chapters, projectId, chapterId, onChange }: {
  chapters: DetailChapterIndex;
  projectId: number;
  chapterId?: number;
  onChange: (chapterId: number | undefined) => void;
}) {
  const noteId = useId();

  return (
    <div className="space-y-1.5 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
      <label className="block space-y-1.5 font-semibold text-slate-800 dark:text-slate-200">
        <span className="block">Lihat sampai bab…</span>
        <select
          aria-describedby={noteId}
          value={chapterId ?? ''}
          onChange={event => onChange(event.target.value ? Number(event.target.value) : undefined)}
          className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 font-normal dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Nilai terkini</option>
          {Array.from(chapters.values()).filter(chapter => chapter.projectId === projectId).map(chapter => (
            <option key={chapter.id} value={chapter.id}>Bab {chapter.position + 1} · {chapter.title}</option>
          ))}
        </select>
      </label>
      <p id={noteId} className="text-xs text-slate-600 dark:text-slate-400">
        Mengikuti urutan baca. Untuk kilas balik, pilih bab yang mewakili keadaan tokoh pada adegan itu.
      </p>
    </div>
  );
}
