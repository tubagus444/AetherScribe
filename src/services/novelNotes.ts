import { db } from '@/src/db';
import type { NovelNote } from '@/src/types';

export async function saveNovelNote(note: NovelNote) {
  const body = note.body.trim();
  if (!body) throw new Error('Isi catatan wajib diisi.');

  await db.transaction('rw', [db.projects, db.chapters, db.novelNotes], async () => {
    if (!await db.projects.get(note.projectId)) throw new Error('Novel tidak ditemukan.');
    const chapterIds = [...new Set(note.chapterIds)];
    const chapters = await db.chapters.bulkGet(chapterIds);
    if (chapters.some(chapter => chapter?.projectId !== note.projectId)) {
      throw new Error('Ada bab yang sudah tidak tersedia. Periksa kembali pilihan bab.');
    }
    const changes = {
      title: note.title.trim(),
      body,
      tags: note.tags,
      color: note.color,
      chapterIds,
      updatedAt: Date.now(),
    };
    if (note.id === undefined) {
      await db.novelNotes.add({ ...changes, projectId: note.projectId, archived: false });
      return;
    }
    const updated = await db.novelNotes.where('projectId').equals(note.projectId)
      .filter(current => current.id === note.id).modify(changes);
    if (!updated) throw new Error('Catatan tidak ditemukan.');
  });
}
