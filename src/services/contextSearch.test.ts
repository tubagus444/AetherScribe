import 'fake-indexeddb/auto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
vi.mock('@xenova/transformers', () => ({ env: { backends: { onnx: { wasm: {} } } }, pipeline: async () => async () => ({ data: new Float32Array([1, 0]) }) }));
vi.mock('js-tiktoken', () => ({ getEncoding: () => ({ encode: () => [] }), encodingForModel: () => ({ encode: () => [] }) }));
let receive: (event: MessageEvent) => Promise<void>;
const posted = vi.fn();
beforeAll(async () => {
  vi.stubGlobal('self', { set onmessage(handler: any) { receive = handler; }, postMessage: posted });
  await import('./contextWorker');
});
afterAll(async () => { await db.delete(); vi.unstubAllGlobals(); });
it('worker semantic search preserves exact scores, stable ties and project isolation', async () => {
  await db.sceneEmbeddings.bulkAdd([
    { id: 'a', projectId: 1, chapterId: 1, chunkIndex: 0, contentHash: '', snippet: 'A', embedding: new Float32Array([0.5, 0]), lastUpdated: 1 },
    { id: 'b', projectId: 1, chapterId: 2, chunkIndex: 0, contentHash: '', snippet: 'B', embedding: new Float32Array([0.5, 0]), lastUpdated: 1 },
    { id: 'c', projectId: 1, chapterId: 3, chunkIndex: 0, contentHash: '', snippet: 'C', embedding: new Float32Array([-0.5, 0]), lastUpdated: 1 },
    { id: 'd', projectId: 2, chapterId: 4, chunkIndex: 0, contentHash: '', snippet: 'Other', embedding: new Float32Array([1, 0]), lastUpdated: 1 },
  ]);
  await receive({ data: { type: 'SEARCH_MANUSCRIPT', id: 1, payload: { projectId: 1, query: 'fixture', topK: 2 } } } as MessageEvent);
  expect(posted.mock.calls.find(call => call[0].id === 1)![0].result).toEqual([
    { chapterId: 1, chunkIndex: 0, snippet: 'A', score: 0.5 },
    { chapterId: 2, chunkIndex: 0, snippet: 'B', score: 0.5 },
  ]);
});
