import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { cancelContextRequest } from './contextProtocol';
import { AhoCorasick } from '@/src/lib/ahoCorasick';
const { pipeline, encode, rows } = vi.hoisted(() => ({ pipeline: vi.fn(), encode: vi.fn(() => [1]), rows: vi.fn().mockResolvedValue([]) }));
vi.mock('@xenova/transformers', () => ({ pipeline, env: { backends: { onnx: { wasm: {} } } } }));
vi.mock('js-tiktoken', () => ({ getEncoding: () => ({ encode }), encodingForModel: () => ({ encode }) }));
vi.mock('@/src/db', () => ({ db: { sceneEmbeddings: { where: () => ({ equals: () => ({ toArray: rows }) }) } } }));
let handler: (event: MessageEvent) => Promise<void>;
const posted = vi.fn();
beforeAll(async () => {
  vi.stubGlobal('self', { set onmessage(value: any) { handler = value; }, postMessage: posted });
  await import('./contextWorker');
});
afterAll(() => vi.unstubAllGlobals());
const send = (data: any) => handler({ data } as MessageEvent);

it('F16 shares the cancel envelope and cancels only the selected request before work begins', async () => {
  posted.mockClear(); encode.mockClear();
  expect(cancelContextRequest(1)).toEqual({ type: 'CANCEL', payload: { cancelId: 1 } });
  const first = send({ type: 'COUNT_TOKENS', id: 1, payload: { text: 'cancel' } });
  const second = send({ type: 'COUNT_TOKENS', id: 2, payload: { text: 'keep' } });
  await send(cancelContextRequest(1)); await Promise.all([first, second]);
  expect(posted.mock.calls.map(c => c[0].id)).toEqual([2]); expect(encode).toHaveBeenCalledTimes(1);
});
it('F16 cancellation during model loading avoids embedding and DB scoring while another request completes', async () => {
  posted.mockClear(); rows.mockClear();
  let ready: () => void, resolveModel: (value: any) => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const embed = vi.fn().mockResolvedValue({ data: new Float32Array([1]) });
  pipeline.mockImplementation(() => { ready!(); return new Promise(resolve => { resolveModel = resolve; }); });
  const pending = send({ type: 'SEARCH_MANUSCRIPT', id: 3, payload: { projectId: 1, query: 'cancel', topK: 1 } });
  await started; await send(cancelContextRequest(3));
  await send({ type: 'COUNT_TOKENS', id: 4, payload: { text: 'keep' } });
  resolveModel!(embed); await pending;
  expect(embed).not.toHaveBeenCalled(); expect(rows).not.toHaveBeenCalled();
  expect(posted.mock.calls.some(c => c[0].id === 3)).toBe(false); expect(posted.mock.calls.some(c => c[0].id === 4)).toBe(true);
});
it('F16 stale cancellation is ignored and request cleanup permits reuse', async () => {
  posted.mockClear(); await send(cancelContextRequest(999));
  await send({ type: 'COUNT_TOKENS', id: 999, payload: { text: 'keep' } });
  expect(posted.mock.calls.some(c => c[0].id === 999)).toBe(true);
});
it('F16 long chunk scans yield and stop at the next cancellation checkpoint', async () => {
  posted.mockClear();
  const original = AhoCorasick.prototype.search;
  const search = vi.spyOn(AhoCorasick.prototype, 'search').mockImplementation(function (text) {
    if (search.mock.calls.length === 1) setTimeout(() => { void send(cancelContextRequest(5)); }, 0);
    return original.call(this, text);
  });
  try {
    await send({ type: 'GET_CODEX_MATCHES', id: 5, payload: { chunks: Array.from({ length: 64 }, (_, pos) => ({ pos, text: 'Dragon' })), allCodex: [{ id: 1, projectId: 1, name: 'Dragon', aliases: [] }] } });
    expect(search.mock.calls.length).toBeGreaterThan(0); expect(search.mock.calls.length).toBeLessThan(64);
    expect(posted.mock.calls.some(c => c[0].id === 5)).toBe(false);
  } finally { search.mockRestore(); }
});
