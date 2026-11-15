import { beforeAll, afterAll, expect, it, vi } from 'vitest';
const { store } = vi.hoisted(() => ({ store: { init: vi.fn().mockResolvedValue(undefined), indexEntry: vi.fn(), updateEntry: vi.fn(), removeEntry: vi.fn(), search: vi.fn().mockResolvedValue([]), searchWithScores: vi.fn().mockResolvedValue([]) } }));
vi.mock('./oramaStore', () => ({ oramaStore: store }));
let receive: (event: MessageEvent) => void;
const posted = vi.fn();
beforeAll(async () => {
 vi.stubGlobal('self', { set onmessage(handler: typeof receive) { receive = handler; }, postMessage: posted });
 await import('./oramaWorker');
});
afterAll(() => vi.unstubAllGlobals());
it('rejects malformed transport before search and keeps the queue usable', async () => {
 receive({ data: { type: 'SEARCH', id: 1, payload: { query: 42, limit: 5 } } } as MessageEvent);
 await vi.waitFor(() => expect(posted).toHaveBeenCalledWith({ type: 'SEARCH_RESULT', id: 1, error: 'Invalid Orama request' }));
 expect(store.search).not.toHaveBeenCalled();
 receive({ data: { type: 'SEARCH', id: 2, payload: { query: 'fixture', limit: 5 } } } as MessageEvent);
 await vi.waitFor(() => expect(posted).toHaveBeenCalledWith({ type: 'SEARCH_RESULT', id: 2, result: [] }));
});
