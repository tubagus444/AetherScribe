import { afterEach, expect, it, vi } from 'vitest';
import { extractCompleteText, parseUsage, extractProviderError } from './responseContracts';
import { readAIStream } from './sse';
import { assertAIProvider } from './providerTypes';
import { callProxy } from './proxy';
vi.mock('./providerPolicy', () => ({ enforceProviderPolicy: vi.fn() }));
vi.mock('@/src/db', () => ({ db: { aiUsageLogs: { add: vi.fn().mockResolvedValue(1) } } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('proxy rejects object-valued completion instead of resolving non-text output', async () => {
 vi.stubGlobal('localStorage', { getItem: () => null });
 vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: { private: 'fixture' } } }] })));
 await expect(callProxy('openai', { userPrompt: 'fixture', systemInstruction: '' })).rejects.toThrow('Invalid AI text');
});
it.each(['google', 'claude', 'openai'])('validates %s text rather than returning objects as text', provider => {
 const data = (text: unknown) => ({ content: [{ text }], candidates: [{ content: { parts: [{ text }] } }], choices: [{ message: { content: text } }] });
 expect(extractCompleteText(provider, data('OK'))).toBe('OK');
 expect(() => extractCompleteText(provider, data({ private: 'fixture' }))).toThrow();
});
it('validates usage numbers, preserving zero and ignoring unrecognized fields', () => {
 expect(parseUsage({ output_tokens: 0, prompt_tokens_details: { cached_tokens: 0 }, privateText: 'fixture' })).toEqual({ output_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } });
 for (const value of [-1, NaN, Infinity, '0', {}]) expect(() => parseUsage({ input_tokens: value })).toThrow();
 expect(extractProviderError({ error: { message: 'fixture' } })).toBe('fixture');
 expect(extractProviderError({ error: { message: {} } })).toBeUndefined();
 expect(() => assertAIProvider('unknown')).toThrow();
});
it('rejects malformed stream text/usage and releases the reader', async () => {
 for (const data of [{ choices: [{ delta: { content: {} } }] }, { usage: { prompt_tokens: '1' } }]) {
  const cancel = vi.fn();
  const reader = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)); }, cancel }).getReader();
  await expect(readAIStream('openai', reader, () => {})).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
  expect(reader.closed).toBeDefined();
 }
});
