import 'fake-indexeddb/auto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { ensureDefaultProject } from './projectOperations';

afterEach(async () => { vi.restoreAllMocks(); for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });

it('serializes concurrent bootstrap and reuses the same complete project', async () => {
  const ids = await Promise.all(Array.from({ length: 8 }, () => ensureDefaultProject()));
  expect(new Set(ids).size).toBe(1);
  expect(await db.projects.count()).toBe(1);
  expect(await db.chapters.count()).toBe(1);
  expect(await db.bible.count()).toBe(1);
  expect(await ensureDefaultProject()).toBe(ids[0]);
});

it('rolls back all initial records when Bible creation fails and allows retry', async () => {
  vi.spyOn(db.bible, 'add').mockRejectedValueOnce(new Error('Synthetic storage failure'));
  await expect(ensureDefaultProject()).rejects.toThrow('Synthetic storage failure');
  expect(await db.projects.count()).toBe(0);
  expect(await db.chapters.count()).toBe(0);
  expect(await db.bible.count()).toBe(0);
  const id = await ensureDefaultProject();
  expect(await db.chapters.toArray()).toEqual([expect.objectContaining({ projectId: id })]);
});
