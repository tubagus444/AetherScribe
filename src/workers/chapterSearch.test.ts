// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { expect, it } from 'vitest';
import { getChapterSearchRange } from '@/src/features/editor/extensions/ChapterSearchHighlight';
import { findCodexResults, resolveChapterMatch } from '@/src/lib/globalSearch';
import type { CodexEntry } from '@/src/types';
import { getSearchableHtmlBlocks, searchChapters } from './chapterSearch';

it('matches visible text across inline formatting and entities, within a paragraph', () => {
  const html = '<p>Peti <strong>e</strong>mas&nbsp;&amp;<br>perak.</p><p>Peti emas.</p><p>Perak.</p>'
    + '<p data-note="rahasia"><span hidden>rahasia</span></p><script>rahasia</script>';
  expect(getSearchableHtmlBlocks(html)).toEqual(['Peti emas & perak.', 'Peti emas.', 'Perak.']);
  const chapters = [{ id: 1, title: 'Dermaga', content: html }];
  const [result] = searchChapters({ query: '  PETI emas & Perak  ', chapters });
  expect(result.match).toMatchObject({ block: 0, offset: 0, text: 'Peti emas & perak' });
  expect(searchChapters({ query: 'emas. perak', chapters })).toEqual([]);
  expect(searchChapters({ query: 'rahasia', chapters })).toEqual([]);
  const editor = new Editor({ extensions: [StarterKit], content: html });
  try {
    const range = getChapterSearchRange(editor.state.doc, result.match!);
    expect(range?.from).toBe(1);
    expect(range && editor.state.doc.textBetween(range.from, range.to, '', ' ')).toBe('Peti emas\u00a0& perak');
  } finally {
    editor.destroy();
  }
});

it('keeps repeated hits on the first occurrence and relocates only unique context on a changed chapter', () => {
  const content = '<p>A: kompas tua.</p><p>B: kompas tua.</p>';
  const match = searchChapters({ query: 'kompas tua', chapters: [{ id: 1, title: 'Bab', content }] })[0].match!;
  expect(resolveChapterMatch(getSearchableHtmlBlocks(content), match)).toEqual({ block: 0, offset: 3 });
  expect(resolveChapterMatch(['Tambahan.', 'B: kompas tua.', 'A: kompas tua.'], match)).toEqual({ block: 2, offset: 3 });
  expect(resolveChapterMatch(['B: kompas tua.'], match)).toBeUndefined();
  expect(resolveChapterMatch(['A: kompas tua.', 'A: kompas tua.'], match)).toBeUndefined();
});

it('ranks titles above prose and preserves manuscript order across ties', () => {
  const chapters = [
    { id: 4, title: 'Awal', content: '<p>Badai turun.</p>' },
    { id: 2, title: 'Badai malam', content: '<p>Badai tadi malam.</p>' },
    { id: 3, title: 'Lanjutan', content: '<p>Badai berlalu.</p>' },
    { id: 1, title: 'Badai', content: '<p>Kapal berlayar.</p>' },
  ];
  const results = searchChapters({ query: 'badai', chapters });
  expect(results.map(result => result.id)).toEqual([1, 2, 4, 3]);
  expect(results[0].match).toBeUndefined();
  expect(results[1].match?.text).toBe('Badai');
});

it('ranks Codex names, aliases, and descriptions consistently with ID as the final tie-breaker', () => {
  const entry = (id: number, name: string, aliases: string[] = [], description = ''): CodexEntry =>
    ({ id, projectId: 1, category: 'character', name, aliases, description, tags: [] });
  expect(findCodexResults([
    entry(1, 'Juru mudi', [], 'Membantu Raka'),
    entry(6, 'Raka'),
    entry(3, 'Raka'),
    entry(5, 'Mas Raka'),
    entry(4, 'Raden', ['Raka']),
    entry(2, 'Nakhoda', ['Pak Raka']),
  ], 'raka').map(result => result.id)).toEqual([3, 6, 4, 5, 2, 1]);
});
