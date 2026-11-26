import { useMemo, useState } from 'react';
import { CategoryIcon } from '@/src/features/codex/components/CategoryIcon';
import { CodexChapterScope } from '@/src/features/codex/components/CodexChapterScope';
import { useCodexCover, useCoverUrl } from '@/src/features/codex/hooks/useCodexCover';
import { useChapterList } from '@/src/hooks/useChapterQueries';
import { getCategoryLabel, type CategoryDef } from '@/src/lib/codexCategories';
import { hasChapterDetailHistory, indexDetailChapters, readCurrentDetail, readDetailHistory } from '@/src/lib/codexDetails';
import { resolveFieldValues } from '@/src/lib/codexFields';
import type { CodexEntry } from '@/src/types';

export function ChapterCodexEntryDetails({ entry, categories, chapterId }: {
  entry: CodexEntry;
  categories: CategoryDef[];
  chapterId: number;
}) {
  const thumbnail = useCoverUrl(useCodexCover(entry.id, 'thumbnail'));
  const chapters = useChapterList(entry.projectId);
  const chapterIndex = useMemo(() => indexDetailChapters(chapters ?? []), [chapters]);
  const [scope, setScope] = useState<number | undefined>(chapterId);
  const scopedChapter = scope === undefined ? undefined : chapterIndex.get(scope);
  const hasHistory = hasChapterDetailHistory(entry, chapterIndex);
  const fields = resolveFieldValues(entry);
  const details = (entry.details ?? []).map(detail => ({
    detail,
    current: readCurrentDetail(detail, readDetailHistory(detail, chapterIndex), entry.projectId, scopedChapter?.position),
  }));

  return (
    <div className="space-y-4 [overflow-wrap:anywhere]">
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        {thumbnail ? <img src={thumbnail} alt="" className="size-10 rounded-lg object-cover" /> : <CategoryIcon category={entry.category} categories={categories} />}
        {getCategoryLabel(entry.category, categories)}
      </div>
      {entry.aliases?.length > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold">Alias</span>{' · '}{entry.aliases.join(', ')}
        </p>
      )}
      <p className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200">
        {entry.description?.trim() ? entry.description : 'Deskripsi belum diisi.'}
      </p>
      {hasHistory && <CodexChapterScope chapters={chapterIndex} projectId={entry.projectId} chapterId={scopedChapter?.id} onChange={setScope} />}
      {(fields.length > 0 || details.length > 0) && (
        <dl className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          {fields.map(field => (
            <div key={field.key}>
              <dt className="font-semibold">{field.label}</dt>
              <dd className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{field.value}</dd>
            </div>
          ))}
          {details.map(({ detail, current }) => (
            <div key={detail.id}>
              <dt className="font-semibold">{detail.label}</dt>
              {current.chapter && <dd className="text-xs text-slate-500 dark:text-slate-400">{current.chapter.title}</dd>}
              <dd className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                {current.value.trim() ? current.value : (scopedChapter ? 'Belum tercatat sampai bab ini.' : 'Belum diisi.')}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {entry.secret?.trim() && (
        <details className="rounded-lg bg-violet-50 p-3 dark:bg-violet-950/40">
          <summary className="cursor-pointer font-semibold">Kebenaran Tersembunyi</summary>
          <p className="mt-2 whitespace-pre-wrap">{entry.secret}</p>
        </details>
      )}
      {entry.tags?.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{entry.tags.map(tag => `#${tag}`).join(' ')}</p>}
    </div>
  );
}
