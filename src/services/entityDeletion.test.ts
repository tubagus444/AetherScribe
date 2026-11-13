import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { changeChapters } from './chapterOperations';
import { deleteAtlasMap, deleteCodexEntry, deleteProjectData } from './entityDeletion';

beforeEach(async () => {
  for (const id of [1, 2]) {
    await db.projects.add({ id, name: 'Project', description: '', createdAt: 1, lastOpened: 1 });
    await db.chapters.add({ id, projectId: id, title: 'Chapter', content: 'Keep', order: 0, lastModified: 1 });
    await db.snapshots.add({ id, chapterId: id, content: 'Snapshot', label: '', timestamp: 1 });
    await db.codex.add({ id, projectId: id, name: 'Codex', description: '', aliases: [], tags: [], category: 'character' });
    await db.maps.add({ id, projectId: id, name: 'Map', width: 10, height: 10, createdAt: 1, imageBlob: new Blob() });
    await db.mapMarkers.add({ id, projectId: id, mapId: id, linkedMapId: 1, codexId: id, kind: 'pin', geometry: { x: .5, y: .5 }, createdAt: 1 });
    await db.timeline.add({ id, projectId: id, chapterId: id, title: 'Event', description: 'Keep', type: 'plot', order: 0, characterIds: [id] });
    await db.chatSessions.add({ id, projectId: id, chapterId: id, activeChapterId: id, title: 'Keep', messages: [], lastMessageAt: 1, kind: 'workshop', workshopKey: `entry:${id}` });
    await db.plotPromises.add({ id, projectId: id, title: 'Keep', codexId: id, payoffCodexId: id, plantedChapterId: id, status: 'open', createdAt: 1, updatedAt: 1 });
    await db.sceneEmbeddings.add({ id: String(id), projectId: id, chapterId: id, chunkIndex: 0, contentHash: '', snippet: '', embedding: new Float32Array(), lastUpdated: 1 });
    await db.embeddings.add({ id: String(id), projectId: id, codexId: id, contentHash: '', embedding: new Float32Array(), lastUpdated: 1 });
    await db.relationships.add({ projectId: id, sourceId: id, targetId: id, type: 'self' });
    await db.continuityTriage.add({ projectId: id, findingId: 'finding', status: 'dismissed', timestamp: 1 });
  }
});
afterEach(async () => { vi.restoreAllMocks(); for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });

it('chapter deletion removes snapshots, preserves text and unlinks references without touching another project', async () => {
  await changeChapters(1, 'delete', 1);
  expect(await db.snapshots.get(1)).toBeUndefined();
  expect(await db.sceneEmbeddings.get('1')).toBeUndefined();
  expect(await db.sceneEmbeddings.get('2')).toBeDefined();
  expect(await db.snapshots.get(2)).toBeDefined();
  expect(await db.timeline.get(1)).toMatchObject({ description: 'Keep' });
  expect((await db.timeline.get(1))!.chapterId).toBeUndefined();
  expect((await db.chatSessions.get(1))!.activeChapterId).toBeUndefined();
  expect((await db.plotPromises.get(1))!.plantedChapterId).toBeUndefined();
  expect((await db.chatSessions.get(2))!.chapterId).toBe(2);
  expect(await db.continuityTriage.where('projectId').equals(2).count()).toBe(1);
});
it('map deletion removes owned markers and unlinks incoming portals', async () => {
  await deleteAtlasMap(1, 1);
  expect(await db.mapMarkers.get(1)).toBeUndefined();
  expect((await db.mapMarkers.get(2))!.linkedMapId).toBeUndefined();
  expect(await db.maps.get(2)).toBeDefined();
});
it('wrong project cannot delete a map', async () => {
  await expect(deleteAtlasMap(2, 1)).rejects.toThrow(); expect(await db.maps.get(1)).toBeDefined();
});
it('codex deletion unlinks all structured references while retaining author text', async () => {
  await deleteCodexEntry(1);
  expect(await db.embeddings.get('1')).toBeUndefined();
  expect(await db.embeddings.get('2')).toBeDefined();
  expect(await db.relationships.where('sourceId').equals(1).count()).toBe(0);
  expect((await db.timeline.get(1))!.characterIds).toEqual([]);
  expect((await db.mapMarkers.get(1))!.codexId).toBeUndefined();
  expect((await db.plotPromises.get(1))!.payoffCodexId).toBeUndefined();
  expect(await db.chatSessions.get(1)).toMatchObject({ title: 'Keep', kind: 'studio' });
  expect((await db.chatSessions.get(1))!.workshopKey).toBeUndefined();
  expect(await db.codex.get(2)).toBeDefined();
});
it('project deletion removes legacy orphan snapshots but preserves live snapshots and backup history', async () => {
  await db.snapshots.add({ chapterId: 999, content: 'Orphan', label: '', timestamp: 1 });
  await db.backups.add({ timestamp: 1, data: '{}', size: 2 });
  await deleteProjectData(1);
  expect(await db.projects.get(1)).toBeUndefined();
  expect(await db.projects.get(2)).toBeDefined();
  expect((await db.snapshots.toArray()).map(r => r.chapterId)).toEqual([2]);
  expect(await db.backups.count()).toBe(1);
  expect((await db.mapMarkers.get(2))!.linkedMapId).toBeUndefined();
});
it.each(['chapter', 'map', 'codex', 'project'])('rolls back %s deletion after a write failure', async kind => {
  const operation = kind === 'chapter' ? () => changeChapters(1, 'delete', 1) : kind === 'map' ? () => deleteAtlasMap(1, 1) : kind === 'codex' ? () => deleteCodexEntry(1) : () => deleteProjectData(1);
  const table = kind === 'chapter' ? db.chapters : kind === 'map' ? db.maps : kind === 'codex' ? db.codex : db.projects;
  vi.spyOn(table, 'delete').mockRejectedValueOnce(new Error('write failure'));
  await expect(operation()).rejects.toThrow('write failure');
  expect(await db.chapters.get(1)).toBeDefined(); expect(await db.snapshots.get(1)).toBeDefined();
  expect((await db.mapMarkers.get(2))!.linkedMapId).toBe(1);
  expect((await db.timeline.get(1))!.chapterId).toBe(1);
});
