import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { dexieChapterStorage } from '@/src/adapters/dexieChapterStorage';
import { observeChapterQuery, readChapterList, readLatestChapterModified } from './chapterQueries';
import { backupService } from './backupService';
import * as utils from '@/src/lib/utils';

afterEach(async () => { vi.restoreAllMocks(); for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });
const chapter = (title = 'A', content = '<p>one two</p>') => ({ projectId: 1, title, content, order: 0, lastModified: 1 });

it('reads generated IDs/count/order from index keys without reading HTML records', async () => {
  const id = await db.chapters.add(chapter());
  const second = await db.chapters.add(chapter('B', '<p>three</p>'));
  const reading = vi.fn(); db.chapters.hook('reading', reading);
  try {
    expect(await readChapterList(1)).toEqual([
      { id, projectId: 1, title: 'A', order: 0, lastModified: 1, status: 'outline', _computedWordCount: 2 },
      { id: second, projectId: 1, title: 'B', order: 0, lastModified: 1, status: 'outline', _computedWordCount: 1 },
    ]);
    expect(await readLatestChapterModified(1)).toBe(1);
    expect(reading).not.toHaveBeenCalled();
    expect(await readChapterList(2)).toEqual([]);
  } finally { db.chapters.hook('reading').unsubscribe(reading); }
});

it('changes metadata atomically and only recounts changed content', async () => {
  const id = await db.chapters.add(chapter());
  const count = vi.spyOn(utils, 'countWords');
  await db.chapters.update(id, { title: 'Renamed', order: 3, status: 'done' });
  expect(count).not.toHaveBeenCalled();
  await db.chapters.update(id, { content: '<p>now three words</p>', lastModified: 9 });
  expect(count).toHaveBeenCalledTimes(1);
  expect((await readChapterList(1))[0]).toMatchObject({ title: 'Renamed', order: 3, status: 'done', _computedWordCount: 3 });
  expect(await readLatestChapterModified(1)).toBe(9);
  await db.chapters.delete(id);
  expect(await readChapterList(1)).toEqual([]);
  expect(await readLatestChapterModified(1)).toBe(0);
});

it('rollback does not leave metadata behind; moving projects updates both indexes', async () => {
  const id = await db.chapters.add(chapter()); const before = await readChapterList(1);
  await expect(db.transaction('rw', db.chapters, async () => {
    await db.chapters.update(id, { content: 'changed', lastModified: 7 }); throw new Error('rollback');
  })).rejects.toThrow('rollback');
  expect(await readChapterList(1)).toEqual(before);
  await db.chapters.update(id, { projectId: 2 });
  expect(await readChapterList(1)).toEqual([]);
  expect((await readChapterList(2))[0]).toMatchObject({ id, projectId: 2, _computedWordCount: 2 });
});

it('DB06 keeps derived keys in storage and rebuilds them when reading old v8 backups', async () => {
  await db.projects.add({ id: 1, name: 'Fixture', description: '', createdAt: 1, lastOpened: 1 });
  const id = await db.chapters.add(chapter());
  await db.chapters.update(id, { summary: 'Keep summary', tension: 4 });
  const stored = await db.chapters.get(id);
  expect(stored?.listMetadata).toEqual([0, 'A', 'outline', 2, 1]);
  expect(await dexieChapterStorage.read.readChapter(id)).not.toHaveProperty('listMetadata');
  expect(await dexieChapterStorage.read.readChaptersById([id + 99, id])).toEqual([
    undefined, await dexieChapterStorage.read.readFirstChapter(1),
  ]);
  const addLegacyMetadata = async (backup: Awaited<ReturnType<typeof backupService.collectAllData>>) => {
    expect(backup.version).toBe(8);
    expect(backup.data.chapters[0]).not.toHaveProperty('listMetadata');
    const data = { ...backup.data, chapters: backup.data.chapters.map(row => ({
      ...row, listMetadata: [99, 'spoofed', 'done', 999, 999], futureField: 'keep',
    })) };
    const checksum = await backupService.computeChecksum(JSON.stringify(data));
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    return { ...backup, data, checksum };
  };
  const project = await addLegacyMetadata(await backupService.collectProjectData(1));
  const imported = await backupService.importProjectData(project);
  expect((await readChapterList(imported.projectId))[0]).toMatchObject({ title: 'A', _computedWordCount: 2, lastModified: 1 });
  expect(await db.chapters.where('projectId').equals(imported.projectId).first()).toMatchObject({
    summary: 'Keep summary', tension: 4, futureField: 'keep',
  });
  const full = await addLegacyMetadata(await backupService.collectAllData());
  await db.chapters.update(id, { content: 'three new words', lastModified: 10 });
  await backupService.restoreData(full);
  expect(await db.chapters.get(id)).toMatchObject({
    content: '<p>one two</p>', summary: 'Keep summary', tension: 4, futureField: 'keep',
    listMetadata: [0, 'A', 'outline', 2, 1],
  });
  expect(await readLatestChapterModified(1)).toBe(1);
});

it('live queries observe metadata edits and index-key timestamp changes', async () => {
  const id = await db.chapters.add(chapter());
  const values: number[] = [], modified: number[] = [];
  const onError = vi.fn();
  const stopList = observeChapterQuery(read => read.readChapterList(1))(rows => values.push(rows[0]?._computedWordCount ?? 0), onError);
  const stopModified = observeChapterQuery(read => read.readLatestChapterModified(1))(value => modified.push(value), onError);
  try {
    await vi.waitFor(() => expect(values.at(-1)).toBe(2));
    await vi.waitFor(() => expect(modified.at(-1)).toBe(1));
    await db.chapters.update(id, { content: 'one two three', lastModified: 5 });
    await vi.waitFor(() => expect(values.at(-1)).toBe(3));
    await vi.waitFor(() => expect(modified.at(-1)).toBe(5));
    await db.chapters.delete(id);
    await vi.waitFor(() => expect(values.at(-1)).toBe(0));
    await vi.waitFor(() => expect(modified.at(-1)).toBe(0));
    expect(onError).not.toHaveBeenCalled();
  } finally { stopList(); stopModified(); }
});

it('upgrades a real v33 database with a cursor migration and preserves source text', async () => {
  await db.delete();
  const stores = Object.fromEntries(db.tables.map(table => [table.name,
    table.name === 'chapters' ? '++id, projectId, order' : table.name === 'sceneEmbeddings' ? 'id, projectId, chapterId, [projectId+chapterId]' : [table.schema.primKey.src, ...table.schema.indexes.map(index => index.src)].join(', '),
  ]));
  const old = new Dexie(db.name); old.version(33).stores(stores);
  await old.table('chapters').add({ ...chapter(), id: 7 }); old.close();
  await db.open();
  expect(db.verno).toBe(34);
  expect((await readChapterList(1))[0]).toMatchObject({ id: 7, _computedWordCount: 2 });
  expect((await db.chapters.get(7))!.content).toBe('<p>one two</p>');
});
