import 'fake-indexeddb/auto';
import Dexie, { liveQuery } from 'dexie';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { readChapterList, readLatestChapterModified } from './chapterQueries';
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

it('import/restore rebuild derived keys instead of trusting metadata from the file', async () => {
  await db.projects.add({ id: 1, name: 'Fixture', description: '', createdAt: 1, lastOpened: 1 });
  const id = await db.chapters.add(chapter());
  const project = await backupService.collectProjectData(1); delete project.checksum;
  project.data.chapters[0].listMetadata = [99, 'spoofed', 'done', 999, 999];
  const imported = await backupService.importProjectData(project);
  expect((await readChapterList(imported.projectId))[0]).toMatchObject({ title: 'A', _computedWordCount: 2, lastModified: 1 });
  const full = await backupService.collectAllData();
  await db.chapters.update(id, { content: 'three new words', lastModified: 10 });
  await backupService.restoreData(full);
  expect((await readChapterList(1))[0]._computedWordCount).toBe(2);
  expect(await readLatestChapterModified(1)).toBe(1);
});

it('live queries observe metadata edits and index-key timestamp changes', async () => {
  const id = await db.chapters.add(chapter());
  const values: number[] = [], modified: number[] = [];
  const subscription = liveQuery(() => readChapterList(1)).subscribe(rows => values.push(rows[0]?._computedWordCount ?? 0));
  const latest = liveQuery(() => readLatestChapterModified(1)).subscribe(value => modified.push(value));
  try {
    await vi.waitFor(() => expect(values.at(-1)).toBe(2));
    await vi.waitFor(() => expect(modified.at(-1)).toBe(1));
    await db.chapters.update(id, { content: 'one two three', lastModified: 5 });
    await vi.waitFor(() => expect(values.at(-1)).toBe(3));
    await vi.waitFor(() => expect(modified.at(-1)).toBe(5));
    await db.chapters.delete(id);
    await vi.waitFor(() => expect(values.at(-1)).toBe(0));
    await vi.waitFor(() => expect(modified.at(-1)).toBe(0));
  } finally { subscription.unsubscribe(); latest.unsubscribe(); }
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
