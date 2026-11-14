import type { Chapter, ChapterStatus } from '@/src/types';
import { countWords } from './utils';

/** Covering index payload: native key cursors can read the list without HTML. */
export type ChapterListKey = [order: number, title: string, status: ChapterStatus, words: number, modified: number];
export type ChapterListMetadata = Pick<Chapter, 'id' | 'projectId' | 'title' | 'order' | 'status' | 'lastModified'> & { _computedWordCount: number };
export const CHAPTER_LIST_INDEX = '[projectId+listMetadata]';

export function chapterListKey(chapter: Chapter, cachedWords?: number): ChapterListKey {
  return [chapter.order, chapter.title, chapter.status || 'outline', cachedWords ?? countWords(chapter.content), chapter.lastModified];
}

export function chapterListRow(id: number, projectId: number, key: ChapterListKey): ChapterListMetadata {
  return { id, projectId, order: key[0], title: key[1], status: key[2], _computedWordCount: key[3], lastModified: key[4] };
}
