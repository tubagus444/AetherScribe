// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorAI } from './useEditorAI';
const { rewrite, cancel, toast } = vi.hoisted(() => ({ rewrite: vi.fn(), cancel: vi.fn(), toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/src/services/ai', () => ({ processRewrite: rewrite, cancelAI: cancel }));
vi.mock('@/src/services/contextEngine', () => ({}));
vi.mock('@/src/services/snapshotService', () => ({ createAutoSnapshot: vi.fn() }));
vi.mock('@/src/hooks/useToast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/src/contexts/NavigationContext', () => ({ useNavigation: () => ({ setViewMode: vi.fn() }) }));
const editor = { state: { selection: { from: 0, to: 12 }, doc: { textBetween: () => 'original text' } }, getText: () => 'original text' } as any;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('F14 retry replaces partial preview and final output is authoritative', async () => {
  let params: any, finish: (s: string) => void;
  rewrite.mockImplementation(p => { params = p; return new Promise<string>(resolve => { finish = resolve; }); });
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  let pending: Promise<void>;
  act(() => { pending = result.current.runAiAction('rewrite'); });
  act(() => { params.onChunk('old'); params.onRetry(1, {}, 'provider'); params.onChunk('new'); vi.advanceTimersByTime(50); });
  expect(result.current.rewritePreview?.rewritten).toBe('new');
  await act(async () => { finish!('canonical'); await pending!; });
  expect(result.current.rewritePreview?.rewritten).toBe('canonical'); expect(vi.getTimerCount()).toBe(0);
});
it('F15 failed request clears interval and partial preview', async () => {
  rewrite.mockRejectedValue(new Error('failed'));
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  await act(async () => { await result.current.runAiAction('rewrite'); });
  expect(result.current.rewritePreview).toBeNull(); expect(result.current.isAiProcessing).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('F15 unmount aborts and clears timer; late completion is ignored', async () => {
  let params: any, finish: (s: string) => void;
  rewrite.mockImplementation(p => { params = p; return new Promise<string>(resolve => { finish = resolve; }); });
  const { result, unmount } = renderHook(() => useEditorAI(editor, 1, [], []));
  let pending: Promise<void>;
  act(() => { pending = result.current.runAiAction('rewrite'); });
  unmount(); expect(cancel).toHaveBeenCalledWith('rewrite'); expect(vi.getTimerCount()).toBe(0);
  await act(async () => { params.onChunk('late'); finish!('late'); await pending!; });
  expect(toast.error).not.toHaveBeenCalled();
});
