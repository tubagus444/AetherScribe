import { useEffect, useMemo, useState } from 'react';
import type { ChapterReader, Subscribe } from '@/src/lib/chapterStorage';
import { sameQueryResult } from '@/src/lib/queryEquality';
import { observeChapterQuery } from '@/src/services/chapterQueries';

function useChapterQuery<T>(
  id: number | null | undefined,
  query: (read: ChapterReader, id: number) => Promise<T>,
): T | undefined {
  const subscribe = useMemo(() => id == null ? undefined : observeChapterQuery(read => query(read, id)), [id, query]);
  const [state, setState] = useState<{
    source: Subscribe<T>;
    result: { value: T } | { error: unknown };
  }>();

  useEffect(() => {
    if (!subscribe) return;
    let active = true;
    const unsubscribe = subscribe(
      value => {
        if (!active) return;
        setState(previous => previous?.source === subscribe && 'value' in previous.result &&
          sameQueryResult(previous.result.value, value) ? previous : { source: subscribe, result: { value } });
      },
      error => {
        if (active) setState({ source: subscribe, result: { error } });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [subscribe]);

  if (!state || state.source !== subscribe) return undefined;
  if ('error' in state.result) throw state.result.error;
  return state.result.value;
}

const chapter = (read: ChapterReader, id: number) => read.readChapter(id);
const projectChapters = (read: ChapterReader, id: number) => read.readProjectChapters(id);
const manuscriptChapters = (read: ChapterReader, id: number) => read.readProjectChapters(id, 'manuscript');
const chapterList = (read: ChapterReader, id: number) => read.readChapterList(id);
const latestChapterModified = (read: ChapterReader, id: number) => read.readLatestChapterModified(id);
const chapterSnapshots = (read: ChapterReader, id: number) => read.readChapterSnapshots(id);

export const useChapter = (id: number | null | undefined) => useChapterQuery(id, chapter);
export const useProjectChapters = (id: number | null | undefined, sort?: 'manuscript') =>
  useChapterQuery(id, sort === 'manuscript' ? manuscriptChapters : projectChapters);
export const useChapterList = (id: number) => useChapterQuery(id, chapterList);
export const useLatestChapterModified = (id: number | null | undefined) => useChapterQuery(id, latestChapterModified) ?? 0;
export const useChapterSnapshots = (id: number) => useChapterQuery(id, chapterSnapshots);
