import { afterEach, expect, it, vi } from 'vitest';
import { getLastActiveTabForStudio, getStudioForViewMode, normalizeViewMode, rememberLastActiveTab, STUDIOS } from './studioNavigation';
afterEach(() => vi.unstubAllGlobals());
it.each([['arc', 'continuity'], ['orphans', 'completeness'], ['unknown', 'write'], [null, 'write'], ['workshop', 'codex']])('normalizes %s into a rendered destination', (input, output) => expect(normalizeViewMode(input)).toBe(output));
it('preserves valid modes and only permits workshop with a live target', () => {
  for (const studio of STUDIOS) for (const tab of studio.tabs) expect(normalizeViewMode(tab.mode, true)).toBe(tab.mode);
  expect(normalizeViewMode('workshop')).toBe('codex');
  expect(getStudioForViewMode('orphans')).toBe('world');
  expect(getStudioForViewMode('arc')).toBe('analysis');
});
it('migrates studio history and never persists an unknown or transient destination', () => {
  const values = new Map([['aether_last_tab_analysis', 'arc'], ['aether_last_tab_world', 'orphans']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  expect(getLastActiveTabForStudio('analysis')).toBe('continuity');
  expect(getLastActiveTabForStudio('world')).toBe('completeness');
  rememberLastActiveTab('world', 'orphans'); expect(values.get('aether_last_tab_world')).toBe('completeness');
  rememberLastActiveTab('world', 'workshop'); expect(values.get('aether_last_tab_world')).toBe('completeness');
  values.set('aether_last_tab_world', 'invalid'); expect(getLastActiveTabForStudio('world')).toBe('codex');
});
