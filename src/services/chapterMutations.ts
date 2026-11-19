import { ChapterContentConflictError, chapterCreateInput, type ChapterCreateInput, type ChapterPatch } from '@/src/lib/chapterContracts';
import type { ChapterStorage, ChapterTransactions } from '@/src/lib/chapterStorage';
import { assertWriteId } from '@/src/lib/dataContracts';
import { flushActiveEditor, getActiveEditorChapterId, reloadActiveEditor } from '@/src/features/editor/editorBridge';
import { replaceInHtml } from '@/src/lib/findReplace';
import { validateWriteFields } from '@/src/lib/backupValidation';
import type { Chapter } from '@/src/types';
import { requireSnapshot, saveAutoSnapshot } from './chapterSnapshots';

const chapterNotInProject = 'Bab tidak ditemukan dalam proyek ini.';

async function saveContent(repository: ChapterTransactions['edit'], id: number, content: string, baseContent?: string) {
  assertWriteId(id, 'ID bab');
  validateWriteFields('chapters', { content }, 'patch');
  if (baseContent !== undefined) {
    const current = await repository.readChapter(id);
    if (!current) throw new Error('Bab tidak ditemukan. Draft belum tersimpan.');
    if (current.content === content) return;
    if (current.content !== baseContent) throw new ChapterContentConflictError();
  }
  const affected = await repository.patchChapter(id, { content, lastModified: Date.now() });
  if (affected !== 1) throw new Error('Bab tidak ditemukan. Draft belum tersimpan.');
}

async function resequence(repository: ChapterTransactions['edit'], rows: Chapter[]) {
  for (const [order, row] of rows.entries()) await repository.patchChapter(row.id!, { order });
}

export function createChapterOperations(storage: ChapterStorage, onDelete: (ids: number[]) => void) {
  return {
    async updateChapter(id: number, changes: ChapterPatch) {
      assertWriteId(id, 'ID bab');
      validateWriteFields('chapters', changes, 'patch', ['title', 'status', 'act', 'tension']);
      const affected = await storage.patchChapter(id, changes);
      if (affected !== 1) throw new Error('Bab tidak ditemukan.');
      return affected;
    },

    async saveChapterContent(id: number, content: string, baseContent: string) {
      if (typeof baseContent !== 'string') throw new Error('Isi awal bab tidak tersedia.');
      return storage.transact('edit', repository => saveContent(repository, id, content, baseContent));
    },

    async moveChapter(projectId: number, chapterId: number, targetId: number, adoptStatus: boolean) {
      assertWriteId(projectId, 'ID proyek');
      assertWriteId(chapterId, 'ID bab');
      assertWriteId(targetId, 'ID bab tujuan');
      await storage.transact('edit', async repository => {
        const rows = await repository.readProjectChapters(projectId, 'manuscript');
        const from = rows.findIndex(row => row.id === chapterId);
        const to = rows.findIndex(row => row.id === targetId);
        if (from < 0 || to < 0) throw new Error(chapterNotInProject);
        if (from === to) return;
        const status = rows[to].status;
        const [moved] = rows.splice(from, 1);
        rows.splice(to, 0, moved);
        for (const [order, row] of rows.entries()) {
          await repository.patchChapter(row.id!, row.id === chapterId && adoptStatus ? { order, status } : { order });
        }
      });
    },

    async saveGeneratedSummary(chapter: Chapter, summary: string, sourceHash: string) {
      const id = chapter.id;
      assertWriteId(id, 'ID bab');
      const patch = { summary, summaryUpdatedAt: chapter.lastModified, summarySourceHash: sourceHash };
      validateWriteFields('chapters', patch, 'patch');
      await storage.transact('edit', async repository => {
        const fresh = await repository.readChapter(id);
        if (!fresh || fresh.projectId !== chapter.projectId || fresh.content !== chapter.content ||
          fresh.lastModified !== chapter.lastModified || fresh.summary !== chapter.summary ||
          fresh.summaryUpdatedAt !== chapter.summaryUpdatedAt) return;
        await repository.patchChapter(id, patch);
      });
    },

    /** Pemanggil menyelesaikan flush editor sebelum penggantian. */
    async replaceChapterText(projectId: number, regex: RegExp, replacement: string, query: string, onlyChapterId?: number) {
      assertWriteId(projectId, 'ID proyek');
      if (onlyChapterId !== undefined) assertWriteId(onlyChapterId, 'ID bab');
      const result = await storage.transact('history', async repositories => {
        const chapters = await repositories.readProjectChapters(projectId);
        if (onlyChapterId !== undefined && !chapters.some(chapter => chapter.id === onlyChapterId)) {
          throw new Error(chapterNotInProject);
        }
        let totalReplaced = 0;
        let chaptersChanged = 0;
        for (const chapter of chapters) {
          if (onlyChapterId !== undefined && chapter.id !== onlyChapterId) continue;
          regex.lastIndex = 0;
          const content = chapter.content || '';
          const { html, count } = replaceInHtml(content, regex, replacement);
          if (!count) continue;
          await saveAutoSnapshot(repositories, chapter.id!, content, `Sebelum ganti ${count}× "${query}"`);
          await saveContent(repositories, chapter.id!, html);
          totalReplaced += count;
          chaptersChanged++;
        }
        return { totalReplaced, chaptersChanged };
      });
      await reloadActiveEditor();
      return result;
    },

    async restoreChapterSnapshot(chapterId: number, snapshotId: number) {
      assertWriteId(chapterId, 'ID bab');
      assertWriteId(snapshotId, 'ID snapshot');
      if (getActiveEditorChapterId() === chapterId) await flushActiveEditor();
      await storage.transact('history', async repositories => {
        const chapter = await repositories.readChapter(chapterId);
        if (!chapter) throw new Error('Record chapters tidak ditemukan.');
        const snapshot = await requireSnapshot(repositories, chapterId, snapshotId);
        await saveAutoSnapshot(repositories, chapterId, chapter.content, 'Sebelum pemulihan');
        await saveContent(repositories, chapterId, snapshot.content);
      });
      if (getActiveEditorChapterId() === chapterId) await reloadActiveEditor();
    },

    async changeChapters(projectId: number, action: 'add' | 'duplicate' | 'delete' | 'up' | 'down', chapterId?: number): Promise<number | undefined> {
      assertWriteId(projectId, 'ID proyek');
      if (action === 'add' || action === 'duplicate') {
        if (action === 'duplicate') {
          assertWriteId(chapterId, 'ID bab');
          await flushActiveEditor();
        }
        return storage.transact('create', async repositories => {
          if (!await repositories.projectExists(projectId)) throw new Error('Record projects tidak ditemukan.');
          const rows = await repositories.readProjectChapters(projectId, 'manuscript');
          const index = action === 'add' ? rows.length : rows.findIndex(row => row.id === chapterId);
          if (index < 0) throw new Error(chapterNotInProject);
          const source = rows[index];
          const row: ChapterCreateInput = source
            ? { ...chapterCreateInput(source), title: `${source.title} (Copy)`, lastModified: Date.now() }
            : { projectId, title: `Chapter ${rows.length + 1}`, content: '', summary: '', status: 'outline', order: rows.length, lastModified: Date.now() };
          const id = await repositories.insertChapter(row);
          rows.splice(source ? index + 1 : index, 0, { ...row, id });
          await resequence(repositories, rows);
          return id;
        });
      }

      assertWriteId(chapterId, 'ID bab');
      if (action === 'delete') {
        if (getActiveEditorChapterId() === chapterId) await flushActiveEditor();
        await storage.transact('remove', async repositories => {
          const rows = await repositories.readProjectChapters(projectId, 'manuscript');
          const index = rows.findIndex(row => row.id === chapterId);
          if (index < 0) throw new Error(chapterNotInProject);
          await repositories.deleteChapterAndReferences(projectId, chapterId);
          rows.splice(index, 1);
          await resequence(repositories, rows);
        });
        onDelete([chapterId]);
      } else {
        await storage.transact('edit', async repository => {
          const rows = await repository.readProjectChapters(projectId, 'manuscript');
          const index = rows.findIndex(row => row.id === chapterId);
          if (index < 0) throw new Error(chapterNotInProject);
          const target = index + (action === 'up' ? -1 : 1);
          if (target >= 0 && target < rows.length) [rows[index], rows[target]] = [rows[target], rows[index]];
          await resequence(repository, rows);
        });
      }
    },
  };
}
