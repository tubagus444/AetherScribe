import { chapterCreateInput, type ChapterCreateInput } from '@/src/lib/chapterContracts';
import { domainTables, removeChapterRelations, notifyDeletedChapters } from './entityDeletion';
import { db } from '@/src/db';
import type { Chapter } from '@/src/types';
import { flushActiveEditor, getActiveEditorChapterId, reloadActiveEditor } from '@/src/features/editor/editorBridge';
import { replaceInHtml } from '@/src/lib/findReplace';
import { saveAutoSnapshot } from './snapshotService';

export const compareChapters = (a: Chapter, b: Chapter) => a.order - b.order || a.id! - b.id!;

export function updateChapter(id: number, changes: Partial<Pick<Chapter, 'title' | 'status' | 'act' | 'tension'>>) {
  return db.chapters.update(id, changes);
}

export async function saveChapterContent(id: number, content: string) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Bab tidak valid.');
  const affected = await db.chapters.update(id, { content, lastModified: Date.now() });
  if (affected !== 1) throw new Error('Bab tidak ditemukan. Draft belum tersimpan.');
}

export async function moveChapter(projectId: number, chapterId: number, targetId: number, adoptStatus: boolean) {
  if (chapterId === targetId) return;
  await db.transaction('rw', db.chapters, async () => {
    const rows = (await db.chapters.where('projectId').equals(projectId).toArray()).sort(compareChapters);
    const from = rows.findIndex(row => row.id === chapterId);
    const to = rows.findIndex(row => row.id === targetId);
    if (from < 0 || to < 0) return;
    const status = rows[to].status;
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    for (const [order, row] of rows.entries()) {
      await db.chapters.update(row.id!, row.id === chapterId && adoptStatus ? { order, status } : { order });
    }
  });
}

export async function saveGeneratedSummary(chapter: Chapter, summary: string, sourceHash: string) {
  await db.transaction('rw', db.chapters, async () => {
    const fresh = await db.chapters.get(chapter.id!);
    if (!fresh || fresh.projectId !== chapter.projectId || fresh.content !== chapter.content ||
      fresh.lastModified !== chapter.lastModified || fresh.summary !== chapter.summary ||
      fresh.summaryUpdatedAt !== chapter.summaryUpdatedAt) return;
    await db.chapters.update(chapter.id!, { summary, summaryUpdatedAt: chapter.lastModified, summarySourceHash: sourceHash });
  });
}

/** Pemanggil menyelesaikan flush editor sebelum penggantian. */
export async function replaceChapterText(
  projectId: number, regex: RegExp, replacement: string, query: string, onlyChapterId?: number,
) {
  const result = await db.transaction('rw', db.chapters, db.snapshots, async () => {
    const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
    let totalReplaced = 0;
    let chaptersChanged = 0;
    for (const chapter of chapters) {
      if (onlyChapterId !== undefined && chapter.id !== onlyChapterId) continue;
      regex.lastIndex = 0;
      const content = chapter.content || '';
      const { html, count } = replaceInHtml(content, regex, replacement);
      if (!count) continue;
      await saveAutoSnapshot(chapter.id!, content, `Sebelum ganti ${count}× "${query}"`);
      await saveChapterContent(chapter.id!, html);
      totalReplaced += count;
      chaptersChanged++;
    }
    return { totalReplaced, chaptersChanged };
  });
  await reloadActiveEditor();
  return result;
}

export async function restoreChapterSnapshot(chapterId: number, content: string) {
  if (getActiveEditorChapterId() === chapterId) await flushActiveEditor();
  await db.transaction('rw', db.chapters, db.snapshots, async () => {
    const chapter = await db.chapters.get(chapterId);
    if (!chapter) throw new Error('Bab tidak ditemukan.');
    await saveAutoSnapshot(chapterId, chapter.content, 'Sebelum pemulihan');
    await saveChapterContent(chapterId, content);
  });
  if (getActiveEditorChapterId() === chapterId) await reloadActiveEditor();
}

/** Semua pembacaan dan penulisan urutan berada di transaksi yang sama. */
export async function changeChapters(projectId: number, action: 'add' | 'duplicate' | 'delete' | 'up' | 'down', chapterId?: number): Promise<number | undefined> {
  if (action === 'duplicate') await flushActiveEditor();
  const result = await db.transaction('rw', action === 'delete' ? domainTables() : [db.chapters], async () => {
    const rows = (await db.chapters.where('projectId').equals(projectId).toArray()).sort(compareChapters);
    let index = rows.findIndex(row => row.id === chapterId);
    if (action !== 'add' && index < 0) throw new Error('Bab tidak ditemukan dalam proyek ini.');
    let result: number | undefined;
    if (action === 'add' || action === 'duplicate') {
      const source = action === 'duplicate' ? rows[index] : undefined;
      const row: ChapterCreateInput = source
        ? { ...chapterCreateInput(source), title: `${source.title} (Copy)`, lastModified: Date.now() }
        : { projectId, title: `Chapter ${rows.length + 1}`, content: '', summary: '', status: 'outline', order: rows.length, lastModified: Date.now() };
      result = await db.chapters.add(row) as number;
      rows.splice(source ? index + 1 : rows.length, 0, { ...row, id: result });
    } else if (action === 'delete') {
      await removeChapterRelations(projectId, chapterId!);
      await db.chapters.delete(chapterId!);
      rows.splice(index, 1);
    } else {
      const target = index + (action === 'up' ? -1 : 1);
      if (target >= 0 && target < rows.length) [rows[index], rows[target]] = [rows[target], rows[index]];
    }
    for (let order = 0; order < rows.length; order++) await db.chapters.update(rows[order].id!, { order });
    return result;
  });
  if (action === 'delete') notifyDeletedChapters([chapterId!]);
  return result;
}
