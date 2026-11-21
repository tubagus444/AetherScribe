// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useChatSession } from './useChatSession';
const { chat } = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('@/src/services/ai', () => ({ processChat: chat, cancelAI: vi.fn() }));
vi.mock('@/src/services/contextEngine', () => ({}));
vi.mock('@/src/lib/loreUtils', () => ({ resolveLoreTags: (s: string) => s, stripLoreTags: (s: string) => s }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it('F14 chat preview resets across retry and persists only final response to originating session', async () => {
  vi.useFakeTimers(); let params: any, finish: (s: string) => void;
  chat.mockImplementation(p => { params = p; return new Promise<string>(resolve => { finish = resolve; }); });
  const saved = vi.fn();
  const { result } = renderHook(() => useChatSession({ projectId: 1, sessionId: 9, codexEntries: [], bibleRules: [], onMessageAdded: saved }));
  let pending: Promise<string>;
  act(() => { pending = result.current.sendMessage('Hello'); });
  act(() => { params.onChunk('old'); params.onRetry(1, {}, 'provider'); params.onChunk('new'); vi.advanceTimersByTime(50); });
  expect(result.current.messages.at(-1)?.content).toBe('new');
  await act(async () => { finish!('canonical'); await pending!; });
  expect(saved.mock.calls.at(-1)[0].at(-1).content).toBe('canonical'); expect(saved.mock.calls.at(-1)[1]).toBe(9); expect(vi.getTimerCount()).toBe(0);
});

it('preserves the original answer during failed, limited and stopped replacements', async () => {
  const original = [
    { role: 'user' as const, content: 'Pertanyaan', timestamp: 1 },
    { role: 'model' as const, content: 'Jawaban awal', timestamp: 2 },
  ];
  const saved = vi.fn();
  const { result } = renderHook(() => useChatSession({
    projectId: 1, sessionId: 9, codexEntries: [], bibleRules: [], initialMessages: original,
    onMessageAdded: saved, showInlineErrors: true,
  }));
  for (const outcome of ['failed', 'length', 'stopped']) {
    chat.mockImplementationOnce(async p => {
      expect(p.history).toEqual([]);
      p.onChunk('Pengganti');
      if (outcome === 'length') { p.onFinish('length'); return 'Pengganti'; }
      if (outcome === 'stopped') result.current.stop();
      throw new Error('offline');
    });
    await act(async () => {
      const promise = result.current.regenerate();
      if (outcome === 'stopped') await promise;
      else await expect(promise).rejects.toThrow();
    });
    expect(result.current.messages).toEqual(original);
    expect(saved).not.toHaveBeenCalled();
  }
  chat.mockResolvedValueOnce('Pengganti lengkap');
  await act(() => result.current.regenerate());
  expect(saved).toHaveBeenCalledTimes(1);
  expect(result.current.messages).toEqual([original[0], expect.objectContaining({ content: 'Pengganti lengkap', finishStatus: 'complete' })]);
});

it('saves the received text if a retry disconnects before its first chunk', async () => {
  const saved = vi.fn();
  const { result } = renderHook(() => useChatSession({ projectId: 1, sessionId: 7,
    codexEntries: [], bibleRules: [], onMessageAdded: saved, showInlineErrors: true }));
  chat.mockImplementationOnce(async p => {
    p.onChunk('Teks pertama'); p.onRetry(1, {}, 'google'); throw new Error('offline');
  });
  await act(async () => { await expect(result.current.sendMessage('Ide')).rejects.toThrow('offline'); });
  expect(saved.mock.lastCall).toEqual([[expect.objectContaining({ role: 'user' }),
    expect.objectContaining({ content: 'Teks pertama', finishStatus: 'interrupted' })], 7]);
});

it('retains the selected partial reply and later turns on continuation failure, then appends on retry', async () => {
  const original = [
    { role: 'user' as const, content: 'Ide awal', timestamp: 1 },
    { role: 'model' as const, content: 'Bagian awal', timestamp: 2, finishStatus: 'length' as const },
    { role: 'user' as const, content: 'Topik lain', timestamp: 3 },
  ];
  const saved = vi.fn();
  const { result } = renderHook(() => useChatSession({ projectId: 1, sessionId: 4,
    codexEntries: [], bibleRules: [], initialMessages: original, onMessageAdded: saved, maxTokens: 4096 }));
  chat.mockImplementationOnce(async p => {
    p.onChunk('Sementara'); throw new Error('offline');
  });
  await act(async () => { await expect(result.current.continueReply(1)).rejects.toThrow('offline'); });
  expect(saved).not.toHaveBeenCalled();
  expect(result.current.messages).toEqual(original);
  chat.mockImplementationOnce(async p => {
    expect(p.maxTokens).toBe(4096);
    expect(p.history.map((m: { parts: { text: string }[] }) => m.parts[0].text)).toEqual(['Ide awal', 'Bagian awal']);
    p.onFinish('length'); return 'berlanjut';
  });
  await act(async () => { await result.current.continueReply(1); });
  expect(saved.mock.lastCall).toEqual([[original[0], { ...original[1], content: 'Bagian awal berlanjut' }, original[2]], 4]);
});
