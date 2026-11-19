import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { db } from '@/src/db';
import { changeChapters, restoreChapterSnapshot, saveChapterContent, updateChapter } from './chapterOperations';
import { addSnapshot } from './snapshotService';
import { addTimelineEvent, updateTimelineEvent } from './timelineOperations';
import { addRelationship } from './loreOperations';
import { addChatSession, updateChatSession } from './chatSessionOperations';
import { addPlotPromise } from './continuityOperations';
import { createAtlasOperations } from './atlasOperations';
import { auditProjectIntegrity } from './integrityAudit';
import { deleteProjectData } from './entityDeletion';
import { saveSceneEmbeddings } from './embeddingWrites';

beforeEach(async () => {
  for (const id of [1, 2]) {
    await db.projects.add({ id, name: 'Proyek', description: '', createdAt: 1, lastOpened: 1 });
    await db.chapters.add({ id, projectId: id, title: 'Bab', content: '<p>Naskah asli</p>', order: 0, lastModified: 1 });
    await db.codex.add({ id, projectId: id, name: 'Tokoh', description: '', aliases: [], tags: [], category: 'character' });
    await db.maps.add({ id, projectId: id, name: 'Peta', width: 10, height: 10, imageBlob: new Blob(), createdAt: 1 });
  }
});
afterEach(async () => { for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });

it('validates chapter patches and snapshot ownership without losing manuscript text', async () => {
  await expect(changeChapters(9, 'add')).rejects.toThrow(/tidak ditemukan/);
  await expect(updateChapter(1, { tension: 9 } as never)).rejects.toThrow(/tension/);
  await expect(updateChapter(1, { projectId: 2 } as never)).rejects.toThrow(/projectId/);
  await expect(saveChapterContent(1, null as never, '<p>Naskah asli</p>')).rejects.toThrow(/content/);
  await expect(addSnapshot({ chapterId: 9, content: 'Asing', label: '', timestamp: 1 })).rejects.toThrow(/tidak ditemukan/);
  const snapshot = await addSnapshot({ chapterId: 2, content: 'Bab lain', label: '', timestamp: 1 });
  await expect(restoreChapterSnapshot(1, snapshot)).rejects.toThrow(/bab lain/);
  expect(await db.snapshots.count()).toBe(1);
  expect((await db.chapters.get(1))?.content).toBe('<p>Naskah asli</p>');
  const own = await addSnapshot({ chapterId: 1, content: '', label: '', timestamp: 1 });
  await restoreChapterSnapshot(1, own);
  expect((await db.chapters.get(1))?.content).toBe('');
  expect(await db.snapshots.where('chapterId').equals(1).count()).toBe(2);
});

it('accepts one of two concurrent chapter edits based on the same saved content', async () => {
  const original = '<p>Naskah asli</p>';
  const edits = ['<p>Versi A</p>', '<p>Versi B</p>'];
  const results = await Promise.allSettled(edits.map(content => saveChapterContent(1, content, original)));
  const winner = results.findIndex(result => result.status === 'fulfilled');
  expect(winner).toBeGreaterThanOrEqual(0);
  expect(results[1 - winner]).toMatchObject({ status: 'rejected', reason: { name: 'ChapterContentConflictError' } });
  expect((await db.chapters.get(1))?.content).toBe(edits[winner]);
});

it('rejects missing and cross-project references in each authoring domain', async () => {
  const event = { projectId: 1, title: 'Peristiwa', description: '', type: 'plot' as const };
  await expect(addTimelineEvent({ ...event, chapterId: 2 })).rejects.toThrow(/proyek lain/);
  await expect(addRelationship({ projectId: 1, sourceId: 1, targetId: 9, type: 'kenal' })).rejects.toThrow(/tidak ditemukan/);
  await expect(addChatSession({ projectId: 1, title: 'Diskusi', messages: [], lastMessageAt: 1, workshopKey: 'entry:2' })).rejects.toThrow(/proyek lain/);
  await expect(addPlotPromise({ projectId: 1, title: 'Janji', status: 'open', createdAt: 1, updatedAt: 1, payoffCodexId: 2 })).rejects.toThrow(/proyek lain/);
  await expect(createAtlasOperations(1).addMarker({ mapId: 1, linkedMapId: 2, kind: 'pin', geometry: { x: .5, y: .5 } })).rejects.toThrow(/proyek lain/);
  const id = await addTimelineEvent({ ...event, chapterId: 1, characterIds: [1] });
  await expect(updateTimelineEvent(id, { description: 'Tidak boleh ikut berubah', characterIds: [2] })).rejects.toThrow(/proyek lain/);
  expect(await db.timeline.get(id)).toMatchObject({ description: '', characterIds: [1] });
  await updateTimelineEvent(id, { description: 'Tersimpan', chapterId: undefined });
  const updated = await db.timeline.get(id);
  expect(updated?.description).toBe('Tersimpan');
  expect(updated?.chapterId).toBeUndefined();
});

it('reports legacy data without writing it and lets patches preserve or unlink old references', async () => {
  const id = await db.chatSessions.add({ projectId: 1, title: 'Diskusi lama', messages: [{ role: 'user', content: 'Teks penting', timestamp: 1 }], lastMessageAt: 1, activeChapterId: 2 });
  const snapshot = await db.snapshots.add({ chapterId: 99, content: 'Naskah lama', label: '', timestamp: 1 });
  const before = await db.chatSessions.get(id);
  expect(await auditProjectIntegrity()).toEqual(expect.arrayContaining([
    { table: 'chatSessions', recordId: id, field: 'activeChapterId', reason: 'cross-project' },
    { table: 'snapshots', recordId: snapshot, field: 'chapterId', reason: 'missing' },
  ]));
  expect(await db.chatSessions.get(id)).toEqual(before);
  await updateChatSession(id, { title: 'Nama baru' });
  await deleteProjectData(2);
  expect(await db.chatSessions.get(id)).toMatchObject({ title: 'Nama baru', messages: before?.messages });
  expect((await db.chatSessions.get(id))?.activeChapterId).toBeUndefined();
  expect((await db.snapshots.get(snapshot))?.content).toBe('Naskah lama');
});

it('skips late embeddings for deleted or foreign chapters', async () => {
  await changeChapters(1, 'delete', 1);
  const row = { projectId: 1, chapterId: 1, chunkIndex: 0, contentHash: '', snippet: '', embedding: new Float32Array(), lastUpdated: 1 };
  await saveSceneEmbeddings([{ ...row, id: 'deleted' }, { ...row, id: 'foreign', chapterId: 2 }, { ...row, id: 'current', projectId: 2, chapterId: 2 }]);
  expect(await db.sceneEmbeddings.toCollection().primaryKeys()).toEqual(['current']);
});
