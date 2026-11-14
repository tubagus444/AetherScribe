import Dexie from 'dexie';
import { db } from '@/src/db';
import { CHAPTER_LIST_INDEX, chapterListRow, type ChapterListKey, type ChapterListMetadata } from '@/src/lib/chapterMetadata';

export async function readChapterList(projectId: number): Promise<ChapterListMetadata[]> {
  const rows: ChapterListMetadata[] = [];
  await db.chapters.where(CHAPTER_LIST_INDEX).between([projectId], [projectId, Dexie.maxKey])
    .eachKey((key: any, cursor) => rows.push(chapterListRow(cursor.primaryKey as number, projectId, key[1] as ChapterListKey)));
  return rows.sort((a, b) => a.order - b.order || a.id! - b.id!);
}

export async function readLatestChapterModified(projectId: number): Promise<number> {
  const keys = await db.chapters.where('[projectId+lastModified]')
    .between([projectId], [projectId, Dexie.maxKey]).reverse().limit(1).keys();
  const key = keys[0];
  return Array.isArray(key) && typeof key[1] === 'number' ? key[1] : 0;
}
