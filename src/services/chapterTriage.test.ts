import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { changeChapters } from './chapterOperations';
import { writeTriage } from './continuityTriageService';
import { registerActiveEditor, unregisterActiveEditor } from '@/src/features/editor/editorBridge';

beforeEach(async () => {
  await db.chapters.bulkAdd([1, 2, 3].map(id => ({ id, projectId: 1, title: `Bab ${id}`, content: '<p>Isi asli</p>', summary: 'Ringkasan', status: 'draft' as const, order: id === 3 ? 8 : 0, lastModified: 1 })));
});
afterEach(async () => { vi.restoreAllMocks(); await db.chapters.clear(); await db.continuityTriage.clear(); });
afterAll(async () => { await db.delete(); });

it('F06 duplicates full HTML and metadata into a new ID immediately after source', async () => {
  const id = await changeChapters(1, 'duplicate', 1);
  expect(id).not.toBe(1);
  expect(await db.chapters.get(id!)).toMatchObject({ content: '<p>Isi asli</p>', summary: 'Ringkasan', status: 'draft', order: 1 });
  expect((await db.chapters.orderBy('order').toArray()).map(r => r.id)).toEqual([1, id, 2, 3]);
});
it('F06 delete/add/duplicate/reorder produce contiguous deterministic orders', async () => {
  await changeChapters(1, 'delete', 2);
  const id = await changeChapters(1, 'add');
  await changeChapters(1, 'up', id);
  await changeChapters(1, 'duplicate', 1);
  expect((await db.chapters.orderBy('order').toArray()).map(r => r.order)).toEqual([0, 1, 2, 3]);
});
it('F06 failed reorder rolls back every update', async () => {
  const before = await db.chapters.toArray();
  const original = db.chapters.update.bind(db.chapters);
  vi.spyOn(db.chapters, 'update').mockImplementationOnce(original).mockRejectedValueOnce(new Error('write failed'));
  await expect(changeChapters(1, 'down', 1)).rejects.toThrow();
  expect(await db.chapters.toArray()).toEqual(before);
});
it('F06 failed flush prevents duplication', async () => {
  const bridge = { getChapterId: () => 1, flush: vi.fn().mockRejectedValue(new Error('save failed')), reload: vi.fn() };
  registerActiveEditor(bridge);
  try { await expect(changeChapters(1, 'duplicate', 1)).rejects.toThrow('save failed'); expect(await db.chapters.count()).toBe(3); }
  finally { unregisterActiveEditor(bridge); }
});
it('F06 concurrent additions do not share order and cannot duplicate across projects', async () => {
  await Promise.all([changeChapters(1, 'add'), changeChapters(1, 'add')]);
  expect((await db.chapters.orderBy('order').toArray()).map(r => r.order)).toEqual([0, 1, 2, 3, 4]);
  await expect(changeChapters(2, 'duplicate', 1)).rejects.toThrow();
});
it('F07 persists dismiss/acknowledge and isolates projects without SchemaError', async () => {
  await writeTriage(1, 'finding', 'dismissed');
  await writeTriage(2, 'finding', 'dismissed');
  await writeTriage(1, 'finding', 'acknowledged');
  expect(await db.continuityTriage.where('projectId').equals(1).first()).toMatchObject({ status: 'acknowledged' });
  db.close();
  await db.open();
  expect(await db.continuityTriage.where('projectId').equals(1).first()).toMatchObject({ status: 'acknowledged' });
  await writeTriage(1, 'finding');
  expect(await db.continuityTriage.where('projectId').equals(1).count()).toBe(0);
  expect(await db.continuityTriage.where('projectId').equals(2).count()).toBe(1);
});
it('F07 concurrent writes create one row and stale duplicates are consolidated', async () => {
  await Promise.all([writeTriage(1, 'finding', 'dismissed'), writeTriage(1, 'finding', 'acknowledged')]);
  expect(await db.continuityTriage.count()).toBe(1);
  await db.continuityTriage.add({ projectId: 1, findingId: 'finding', status: 'dismissed', timestamp: 1 });
  await writeTriage(1, 'finding', 'acknowledged');
  expect(await db.continuityTriage.count()).toBe(1);
  await writeTriage(1, 'finding');
  expect(await db.continuityTriage.count()).toBe(0);
});
