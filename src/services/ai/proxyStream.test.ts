vi.mock('./providerPolicy', () => ({ enforceProviderPolicy: vi.fn() }));
import { afterEach, expect, it, vi } from 'vitest';
import { callProxy } from './proxy';
vi.mock('@/src/db', () => ({ db: { aiUsageLogs: { add: vi.fn().mockResolvedValue(1) } } }));
vi.mock('@/src/services/errorService', () => ({ ErrorService: { log: vi.fn() } }));
afterEach(() => vi.restoreAllMocks());
const params = { userPrompt: 'fixture', systemInstruction: 'fixture', stream: true };
it('F12 proxy propagates SSE errors even with HTTP 200', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('data: {"error":{"message":"overloaded"}}\n\n'));
  await expect(callProxy('openai', { ...params, onChunk: vi.fn() })).rejects.toThrow('overloaded');
});
it('F12 proxy returns streamed output without requiring a chunk callback', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Result"}}]}\n\ndata: [DONE]'));
  expect(await callProxy('openai', params)).toBe('Result');
});
it('F12 abort cancels a stalled body and remains AbortError', async () => {
  const cancel = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel })));
  const controller = new AbortController();
  const pending = callProxy('openai', { ...params, signal: controller.signal });
  await Promise.resolve(); controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(cancel).toHaveBeenCalled();
});

it('falls back to the previous chat limit when the model rejects 4096 output tokens', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'max_tokens must be at most 2048' }), { status: 400 }))
    .mockResolvedValueOnce(new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]'));
  expect(await callProxy('openai', { ...params, actionType: 'chat', maxTokens: 4096 })).toBe('OK');
  expect(fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).body.max_tokens)).toEqual([4096, 2048]);
});
