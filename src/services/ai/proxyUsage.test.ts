import { afterEach, expect, it, vi } from 'vitest';
import { callProxy } from './proxy';
const { log } = vi.hoisted(() => ({ log: vi.fn().mockResolvedValue(1) }));
vi.mock('@/src/db', () => ({ db: { aiUsageLogs: { add: log } } }));
vi.mock('@/src/services/errorService', () => ({ ErrorService: { log: vi.fn() } }));
vi.mock('./providerPolicy', () => ({ enforceProviderPolicy: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it.each(['google', 'claude', 'openai'])('F13 %s forwards temperature zero and defaults undefined', async provider => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const requests: any[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => {
    requests.push(JSON.parse(init!.body as string).body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }], content: [{ text: 'OK' }], choices: [{ message: { content: 'OK' } }] }));
  });
  await callProxy(provider, { systemInstruction: '', userPrompt: '', temperature: 0 });
  await callProxy(provider, { systemInstruction: '', userPrompt: '' });
  await callProxy(provider, { systemInstruction: '', userPrompt: '', temperature: 1 });
  await callProxy(provider, { systemInstruction: '', userPrompt: '', temperature: null });
  const value = (body: any) => provider === 'google' ? body.generationConfig.temperature : body.temperature;
  expect(requests.map(value)).toEqual([0, .7, 1, .7]);
});
it('F13 Claude usage retains input/cache counts through message_stop and preserves zero output', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const frame = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response([
    frame({ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 } } }),
    frame({ type: 'content_block_delta', delta: { text: 'OK' } }),
    frame({ type: 'message_delta', usage: { output_tokens: 0 } }), frame({ type: 'message_stop' }),
  ].join('')));
  await callProxy('claude', { systemInstruction: '', userPrompt: '', stream: true });
  expect(log).toHaveBeenCalledWith(expect.objectContaining({ promptTokens: 35, cachedTokens: 20, completionTokens: 0, totalTokens: 35 }));
});
