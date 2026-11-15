// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useAtlasFilters } from './useAtlasFilters';
import { useAtlasSelection } from './useAtlasSelection';
import type { CodexEntry, MapMarker } from '@/src/types';

afterEach(cleanup);
const entries: CodexEntry[] = [{ id: 1, projectId: 1, name: 'Town', category: 'location', description: '', aliases: [], tags: [], factionTag: ' North ' }];
const markers: MapMarker[] = [
  { id: 1, projectId: 1, mapId: 1, kind: 'pin', codexId: 1, geometry: { x: .5, y: .5 }, createdAt: 1 },
  { id: 2, projectId: 1, mapId: 1, kind: 'pin', geometry: { x: .2, y: .2 }, createdAt: 1 },
];
it('filters linked category/faction without hiding unlinked markers or modifying source data', () => {
  const source = structuredClone(markers);
  const view = renderHook(() => useAtlasFilters(markers, entries));
  expect(view.result.current.presentFactions).toEqual(['North']);
  act(() => view.result.current.setOffCategories(new Set(['location'])));
  expect(view.result.current.visibleMarkers.map(m => m.id)).toEqual([2]);
  act(() => { view.result.current.setOffCategories(new Set()); view.result.current.setOffFactions(new Set(['North'])); });
  expect(view.result.current.visibleMarkers.map(m => m.id)).toEqual([2]);
  act(() => { view.result.current.setOffFactions(new Set()); view.result.current.setOffKinds(new Set(['pin'])); });
  expect(view.result.current.visibleMarkers).toEqual([]);
  expect(markers).toEqual(source);
});
it('disables geometry editing when marker selection changes', () => {
  const view = renderHook(useAtlasSelection);
  act(() => view.result.current.setSelectedMarkerId(1));
  act(() => view.result.current.setEditingGeometry(true));
  expect(view.result.current.editingGeometry).toBe(true);
  act(() => view.result.current.setSelectedMarkerId(2));
  expect(view.result.current.editingGeometry).toBe(false);
});
