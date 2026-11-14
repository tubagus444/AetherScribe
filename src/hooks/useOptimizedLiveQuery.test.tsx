// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useOptimizedLiveQuery } from './useOptimizedLiveQuery';
const state = vi.hoisted(() => ({ value: undefined as any }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => state.value }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('keeps equal references and delivers changed data without JSON serialization', () => {
  state.value = [{ content: 'manuscript', tags: ['A'] }];
  const stringify = vi.spyOn(JSON, 'stringify');
  const hook = renderHook(() => useOptimizedLiveQuery(() => state.value));
  const first = hook.result.current;
  state.value = structuredClone(state.value); hook.rerender();
  expect(hook.result.current).toBe(first);
  state.value = [{ content: 'changed', tags: ['A'] }]; hook.rerender();
  expect(hook.result.current).not.toBe(first);
  expect(hook.result.current).toEqual(state.value);
  expect(stringify).not.toHaveBeenCalled();
});
