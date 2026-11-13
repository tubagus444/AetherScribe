import { db } from '@/src/db';
import type { Chapter } from '@/src/types';
import { flushActiveEditor } from '@/src/features/editor/editorBridge';

export const compareChapters = (a: Chapter, b: Chapter) => a.order - b.order || a.id! - b.id!;

/** Semua pembacaan dan penulisan urutan berada di transaksi yang sama. */
export async function changeChapters(projectId: number, action: 'add' | 'duplicate' | 'delete' | 'up' | 'down', chapterId?: number): Promise<number | undefined> {
  if (action === 'duplicate') await flushActiveEditor();
  return db.transaction('rw', db.chapters, async () => {
    const rows = (await db.chapters.where('projectId').equals(projectId).toArray()).sort(compareChapters);
    let index = rows.findIndex(row => row.id === chapterId);
    if (action !== 'add' && index < 0) throw new Error('Bab tidak ditemukan dalam proyek ini.');
    let result: number | undefined;
    if (action === 'add' || action === 'duplicate') {
      const source = action === 'duplicate' ? rows[index] : undefined;
      const row: Chapter = source
        ? { ...source, title: `${source.title} (Copy)`, lastModified: Date.now() }
        : { projectId, title: `Chapter ${rows.length + 1}`, content: '', summary: '', status: 'outline', order: rows.length, lastModified: Date.now() };
      delete row.id;
      result = await db.chapters.add(row) as number;
      row.id = result;
      rows.splice(source ? index + 1 : rows.length, 0, row);
    } else if (action === 'delete') {
      await db.chapters.delete(chapterId!);
      rows.splice(index, 1);
    } else {
      const target = index + (action === 'up' ? -1 : 1);
      if (target >= 0 && target < rows.length) [rows[index], rows[target]] = [rows[target], rows[index]];
    }
    for (let order = 0; order < rows.length; order++) await db.chapters.update(rows[order].id!, { order });
    return result;
  });
}
