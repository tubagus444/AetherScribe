// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NavigationProvider, useNavigation } from './NavigationContext';
vi.mock('./ProjectContext', () => ({ useProject: () => ({ projectId: 1 }) }));
vi.mock('@/src/db', () => ({ db: { chapters: {
  where: () => ({ equals: () => ({ first: async () => ({ id: 7, projectId: 1 }) }) }),
  get: async () => ({ id: 7, projectId: 1 }),
} } }));
afterEach(() => { cleanup(); localStorage.clear(); });
const wrapper = ({ children }: { children: React.ReactNode }) => <NavigationProvider>{children}</NavigationProvider>;

it('canonicalizes storage/setter while preserving chapter and entity deep links', async () => {
  localStorage.setItem('aether_view_mode', 'orphans');
  const hook = renderHook(useNavigation, { wrapper });
  await waitFor(() => expect(hook.result.current.activeChapterId).toBe(7));
  expect(hook.result.current.viewMode).toBe('completeness');
  expect(localStorage.getItem('aether_view_mode')).toBe('completeness');
  act(() => hook.result.current.setViewMode('arc'));
  expect(hook.result.current.viewMode).toBe('continuity');
  act(() => hook.result.current.openCodexEntry(44));
  expect(hook.result.current.viewMode).toBe('codex');
  expect(hook.result.current.pendingCodexEntryId).toBe(44);
  act(() => hook.result.current.openAtlasMarker(9, 3));
  expect(hook.result.current.pendingAtlasTarget).toEqual({ mapId: 9, markerId: 3 });
  expect(hook.result.current.activeChapterId).toBe(7);
});
it('requires a workshop target and preserves the previous panel on close', () => {
  const hook = renderHook(useNavigation, { wrapper });
  act(() => hook.result.current.setViewMode('workshop'));
  expect(hook.result.current.viewMode).toBe('codex');
  act(() => hook.result.current.openWorkshop({ mode: 'edit', entryId: 44 }));
  expect(hook.result.current.viewMode).toBe('workshop');
  expect(hook.result.current.workshopTarget).toEqual({ mode: 'edit', entryId: 44 });
  expect(localStorage.getItem('aether_view_mode')).toBe('codex');
  act(() => hook.result.current.closeWorkshop());
  expect(hook.result.current.viewMode).toBe('codex');
  expect(hook.result.current.workshopTarget).toBeNull();
});
