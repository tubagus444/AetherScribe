import type { Chapter } from '@/src/types';
import type { ChapterListKey } from './chapterMetadata';

export interface ChapterRecord extends Chapter {
  id: number;
  /** Derived covering-index tuple, maintained by the v34 migration and write hooks. */
  listMetadata?: ChapterListKey;
}

/** Also accepts old backup rows whose derived field may contain arbitrary JSON. */
export function chapterFromRecord<T extends Chapter>(record: T & { listMetadata?: unknown }): Omit<T, 'listMetadata'> {
  const { listMetadata, ...chapter } = record;
  return chapter;
}
