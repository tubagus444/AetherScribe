import type { Chapter } from '@/src/types';
import { requestId } from '@/src/lib/dataContracts';
export type PersistedChapter = Chapter & { id: number };
export type ChapterCreateInput = Omit<Chapter, 'id' | 'listMetadata'> & { id?: never; listMetadata?: never };
export type ChapterPatch = Partial<Pick<Chapter, 'title' | 'status' | 'act' | 'tension'>>;

export class ChapterContentConflictError extends Error {
  constructor() {
    super('Isi bab berubah sejak editor membukanya. Salin draf ini sebelum memuat ulang bab.');
    this.name = 'ChapterContentConflictError';
  }
}

export function chapterCreateInput(chapter: Chapter): ChapterCreateInput {
 const { id, listMetadata, ...input } = chapter;
 return input;
}
export function chapterIdentity(chapter: Chapter): number {
 if (!requestId(chapter.id)) throw new Error('Stored chapter has no valid ID');
 return chapter.id;
}
