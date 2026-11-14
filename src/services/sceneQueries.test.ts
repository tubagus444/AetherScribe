import 'fake-indexeddb/auto';
import { afterAll, afterEach, expect, it } from 'vitest';
import { db } from '@/src/db';
import { visitSceneEmbeddings } from './sceneQueries';
import { StableTopK } from '@/src/lib/stableTopK';
afterEach(async () => { await db.sceneEmbeddings.clear(); });
afterAll(async () => { await db.delete(); });

it('pages exact candidates in stable key order and isolates projects', async () => {
  const rows = Array.from({ length: 600 }, (_, index) => ({
    id: String(index).padStart(4, '0'), projectId: index === 599 ? 2 : 1, chapterId: index + 1, chunkIndex: 0,
    snippet: 'fixture', contentHash: '', lastUpdated: 1, embedding: Float32Array.from([index % 17, 0]),
  }));
  await db.sceneEmbeddings.bulkAdd(rows);
  const visited: string[] = [], best = new StableTopK<string>(5);
  await visitSceneEmbeddings(1, row => { visited.push(row.id); best.add(row.id, row.embedding[0]); });
  expect(visited).toEqual(rows.slice(0, 599).map(row => row.id));
  expect(best.results()).toEqual(rows.slice(0, 599).sort((a, b) => b.embedding[0] - a.embedding[0]).slice(0, 5).map(row => row.id));
});
it('cooperative cancellation interrupts scanning without damaging the connection', async () => {
  await db.sceneEmbeddings.bulkAdd(Array.from({ length: 600 }, (_, index) => ({ id: String(index), projectId: 1, chapterId: 1, chunkIndex: index, contentHash: '', snippet: '', embedding: new Float32Array([1]), lastUpdated: 1 })));
  let count = 0;
  await expect(visitSceneEmbeddings(1, () => { count++; }, () => { if (count >= 260) throw new Error('cancelled'); })).rejects.toThrow('cancelled');
  expect(count).toBe(260);
  expect(await db.sceneEmbeddings.count()).toBe(600);
});
