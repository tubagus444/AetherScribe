import 'fake-indexeddb/auto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { oramaSync } from './oramaSync';

let receive: (event: MessageEvent) => void;
let instance: any;
const sent: any[] = [];
beforeAll(async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('self', {
    set onmessage(handler: any) { receive = handler; },
    postMessage(data: unknown) { instance.onmessage?.({ data }); },
  });
  await import('./oramaWorker');
  vi.stubGlobal('Worker', class {
    onmessage: any; onerror: any; onmessageerror: any;
    constructor() { instance = this; }
    postMessage(data: unknown) { sent.push(data); receive({ data } as MessageEvent); }
    terminate() {}
  });
  oramaSync.setupHooks(); oramaSync.setupHooks();
});
afterAll(async () => { await db.delete(); vi.unstubAllGlobals(); });
const entry = (projectId: number, name: string) => ({ projectId, name, category: 'character', aliases: [], tags: [], description: 'fixture' });

it('F08 existing Codex is found with scores through facade and worker protocol', async () => {
  const id = await db.codex.add(entry(1, 'Dragon'));
  const hits = await oramaSync.searchWithScores(1, 'Dragon', 8);
  expect(hits.map(h => h.entry.id)).toContain(id);
  expect(hits.every(h => Number.isFinite(h.score) && h.score > 0)).toBe(true);
  expect(sent.some(m => m.type === 'SEARCH_WITH_SCORES')).toBe(true);
});
it('F09 auto-ID entry is immediately searchable after commit, with one index mutation', async () => {
  const before = sent.length;
  const id = await db.codex.add(entry(1, 'Phoenix'));
  const hits = await oramaSync.searchWithScores(1, 'Phoenix');
  expect(hits.map(h => h.entry.id)).toEqual([id]);
  expect(sent.slice(before).filter(m => ['INDEX_ENTRY', 'UPDATE_ENTRY'].includes(m.type) && m.payload.entry.id === id)).toHaveLength(1);
});
it('F09 rolled-back inserts never reach index', async () => {
  const before = sent.length;
  await expect(db.transaction('rw', db.codex, async () => { await db.codex.add(entry(1, 'Rollback')); throw new Error('abort'); })).rejects.toThrow();
  expect(await oramaSync.searchWithScores(1, 'Rollback')).toEqual([]);
  expect(sent.slice(before).filter(m => m.payload?.entry?.name === 'Rollback')).toEqual([]);
});
it('F09 create plus updates in one transaction index only the committed final record', async () => {
  const before = sent.length;
  let id: number;
  await db.transaction('rw', db.codex, async () => {
    id = await db.codex.add(entry(1, 'Temporary')) as number;
    await db.codex.update(id, { name: 'Finalname' });
  });
  expect((await oramaSync.searchWithScores(1, 'Finalname')).map(h => h.entry.id)).toEqual([id!]);
  expect(sent.slice(before).filter(m => ['INDEX_ENTRY', 'UPDATE_ENTRY'].includes(m.type) && m.payload.entry.id === id!)).toHaveLength(1);
});
it('F09 update and delete remain synchronized', async () => {
  const id = await db.codex.add(entry(1, 'Before'));
  await db.codex.update(id, { name: 'After' });
  expect((await oramaSync.searchWithScores(1, 'After')).map(h => h.entry.id)).toEqual([id]);
  await db.codex.delete(id);
  expect(await oramaSync.searchWithScores(1, 'After')).toEqual([]);
});
it('F08 project switches isolate results, including legacy unscored search', async () => {
  const id = await db.codex.add(entry(2, 'Dragon'));
  expect((await oramaSync.searchWithScores(2, 'Dragon')).map(h => h.entry.id)).toEqual([id]);
  expect((await oramaSync.search('Dragon')).map(h => h.id)).toEqual([id]);
  expect((await oramaSync.searchWithScores(1, 'Dragon')).every(h => h.entry.projectId === 1)).toBe(true);
});
it('F08 worker error is rejected instead of returning empty success', async () => {
  const request = oramaSync.searchWithScores(1, 'Dragon');
  await Promise.resolve();
  instance.onerror({ message: 'synthetic crash' });
  await expect(request).rejects.toThrow();
});
