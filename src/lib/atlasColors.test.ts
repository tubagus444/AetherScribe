import { describe, expect, it } from 'vitest';
import { factionHue, resolveMarkerColor, safeAtlasColor } from './atlasColors';
import type { CodexEntry } from '@/src/types';

describe('F01 Atlas color allowlist', () => {
  it.each(['#abc', '#AbC', '#123456', '#E11D48'])('preserves supported hex %s', color => {
    expect(safeAtlasColor(color)).toBe(color);
    expect(resolveMarkerColor('pin', color, undefined)).toBe(color);
  });

  it.each([
    undefined, null, 123, {}, '', 'red', 'rgb(1,2,3)', 'url(https://example.test)', 'var(--color)',
    '#1234', '#12345678', ' #abc ', '#abcdef;', '#fff;background-image:url(https://example.test)',
    '#fff;"><img src=x onerror=alert(1)>',
  ])('rejects untrusted color %j', color => {
    expect(safeAtlasColor(color)).toBe('#64748b');
    expect(resolveMarkerColor('pin', color as string, undefined)).toBe('#e11d48');
  });

  it('uses faction/category/kind fallbacks when imported explicit colors are invalid', () => {
    const entry = { category: 'character', factionTag: 'Guardians' } as CodexEntry;
    expect(resolveMarkerColor('area', 'url(x)', entry)).toBe(factionHue('Guardians'));
    expect(resolveMarkerColor('area', 'url(x)', { ...entry, factionTag: undefined })).toMatch(/^#[a-f0-9]{6}$/);
    expect(resolveMarkerColor('route', 'url(x)', undefined)).toBe('#0284c7');
    expect(resolveMarkerColor('constructor', undefined, undefined)).toBe('#64748b');
  });
});
