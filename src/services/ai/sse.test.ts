import { expect, it, vi } from 'vitest';
import { readAIStream } from './sse';
const parse = (provider: string, pieces: string[], callback = vi.fn()) => readAIStream(provider, new ReadableStream<Uint8Array>({ start(c) { pieces.forEach(p => c.enqueue(new TextEncoder().encode(p))); c.close(); } }).getReader(), callback);
it.each(['openai', 'google', 'claude'])('rejects %s error frames', async provider => {
  await expect(parse(provider, ['event: error\ndata: {"error":{"message":"unavailable"}}\n\n'])).rejects.toThrow('unavailable');
});
it('parses CRLF, fragmented/multiline frames and final buffer without delimiter', async () => {
  const chunks = vi.fn();
  const result = await parse('openai', ['data: {"choices":\r', '\ndata: [{"delta":{"content":"Hello"}}]}\r\n\r\ndata: [DO', 'NE]'], chunks);
  expect(result.text).toBe('Hello'); expect(chunks).toHaveBeenCalledWith('Hello');
});
it.each(['', 'data: [DONE]\n\n', 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', 'data: {bad}\n\n'])('rejects empty/truncated/malformed stream %s', async input => { await expect(parse('openai', [input])).rejects.toThrow(); });
it('collects Google parts and requires finishReason', async () => {
  expect((await parse('google', ['data: {"candidates":[{"content":{"parts":[{"text":"A"},{"text":"B"}]},"finishReason":"STOP"}]}\n\n'])).text).toBe('AB');
});
it('Claude merges usage and recognizes message_stop', async () => {
  const result = await parse('claude', ['data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n', 'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n', 'data: {"type":"message_delta","usage":{"output_tokens":2}}\n\ndata: {"type":"message_stop"}\n\n']);
  expect(result.text).toBe('Hi'); expect(result.usage).toMatchObject({ input_tokens: 10, output_tokens: 2 });
});
it('does not swallow consumer errors and cancels reader', async () => {
  const cancel = vi.fn();
  const reader = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')); }, cancel }).getReader();
  await expect(readAIStream('openai', reader, () => { throw new Error('consumer failed'); })).rejects.toThrow('consumer failed'); expect(cancel).toHaveBeenCalled();
});
