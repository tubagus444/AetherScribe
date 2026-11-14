import { afterEach, expect, it, vi } from 'vitest';
const { state } = vi.hoisted(() => ({ state: { worker: null as any, sent: [] as any[] } }));
vi.mock('@/src/services/contextWorker?worker', () => ({ default: class {
  onmessage: any; onerror: any; onmessageerror: any;
  constructor() { state.worker = this; }
  postMessage(message: any) { state.sent.push(message); }
  terminate() {}
} }));
vi.mock('@/src/db', () => ({ db: {} }));
vi.mock('@/src/services/rag/oramaSync', () => ({ oramaSync: {} }));
import { countTokens } from './contextEngine';
afterEach(() => vi.useRealTimers());
it('F16 timeout sends the shared cancel payload, removes pending state, and leaves another request intact', async () => {
  vi.useFakeTimers();
  const first = countTokens('first');
  const failure = expect(first).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(15_000);
  const second = countTokens('second');
  await vi.advanceTimersByTimeAsync(15_000); await failure;
  const requests = state.sent.filter(message => message.type === 'COUNT_TOKENS');
  expect(state.sent).toContainEqual({ type: 'CANCEL', payload: { cancelId: requests[0].id } });
  state.worker.onmessage({ data: { id: requests[0].id, result: 'late' } });
  state.worker.onmessage({ data: { id: requests[1].id, result: 2 } });
  expect(await second).toBe(2); expect(vi.getTimerCount()).toBe(0);
});
