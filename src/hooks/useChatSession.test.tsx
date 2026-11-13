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
