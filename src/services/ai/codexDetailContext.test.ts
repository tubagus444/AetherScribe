import { expect, it, vi } from 'vitest';
import type { CodexEntry } from '@/src/types';
import { resolveContextBuilder } from '@/src/services/ai/context';
import { readChapterList } from '@/src/services/chapterQueries';
import { getRelevantContext } from '@/src/services/contextEngine';

vi.mock('@/src/services/chapterQueries', () => ({ readChapterList: vi.fn() }));
vi.mock('@/src/services/contextEngine', () => ({
  getRelevantContext: vi.fn((_text: string, entries: CodexEntry[]) => Promise.resolve(entries)),
  getRelevantBibleRules: () => Promise.resolve([]),
}));

const entries: CodexEntry[] = [{
  id: 1, projectId: 1, name: 'Raka', category: 'character', description: 'Seorang ksatria.', aliases: [], tags: [],
  details: [
    { id: 'home', label: 'Asal', value: 'Pesisir', includeInAI: true },
    { id: 'condition', label: 'Kondisi', value: 'Sehat', includeInAI: true, revisions: [
      { id: 'late', chapterId: 12, value: 'Pulih' },
      { id: 'early', chapterId: 42, value: 'Terluka' },
      { id: 'deleted', detachedChapterTitle: 'Bab lama', value: 'TERHAPUS' },
    ] },
    { id: 'private', label: 'Label pribadi', value: 'SANDI PRIBADI', includeInAI: false, revisions: [
      { id: 'note', chapterId: 42, value: 'RIWAYAT PRIBADI' },
    ] },
  ],
}];

function setChapterOrder(first = 42, last = 12) {
  vi.mocked(readChapterList).mockResolvedValue([last, first].map(id => ({
    id, projectId: 1, order: id === first ? 0 : 1, title: `Adegan ${id}`, status: 'draft', _computedWordCount: 0, lastModified: 0,
  })));
}

it.each([true, false])('uses the chapter state and excludes private fields (cache %s)', async useCaching => {
  setChapterOrder();
  const context = await resolveContextBuilder(useCaching, 'balanced', [], entries, [], 'Raka', { chapterId: 42 });
  if (useCaching) {
    expect(context.cachedContext).toHaveLength(2);
    expect(context.contextBlock).toBeUndefined();
  }
  const prompt = context.contextBlock ?? context.cachedContext?.join('\n');
  expect(prompt).toContain('Kondisi: Terluka');
  expect(prompt).toContain('Asal: Pesisir');
  expect(prompt).not.toMatch(/Pulih|Label pribadi|SANDI PRIBADI|RIWAYAT PRIBADI|TERHAPUS/);
});

it('includes chronological history for an audit and omits detached and private notes', async () => {
  setChapterOrder();
  const { contextBlock } = await resolveContextBuilder(false, 'balanced', [], entries, [], undefined, { history: true });
  expect(contextBlock).toContain('Kondisi:\nNilai awal: Sehat\nBab 1 (Adegan 42): Terluka\nBab 2 (Adegan 12): Pulih');
  expect(contextBlock).not.toMatch(/Label pribadi|SANDI PRIBADI|RIWAYAT PRIBADI|TERHAPUS/);
});

it('uses current detail permissions even if a semantic match contains an older shared copy', async () => {
  setChapterOrder();
  const stale = { ...entries[0], details: entries[0].details?.map(detail => ({ ...detail, includeInAI: true })) };
  vi.mocked(getRelevantContext).mockResolvedValueOnce([stale]);
  const { contextBlock } = await resolveContextBuilder(false, 'balanced', [], entries, [], 'Raka', { chapterId: 42 });
  expect(contextBlock).toContain('Kondisi: Terluka');
  expect(contextBlock).not.toMatch(/Label pribadi|SANDI PRIBADI|RIWAYAT PRIBADI/);
});

it('follows the new order when chapters move and uses the initial version if a chapter is missing', async () => {
  setChapterOrder(12, 42);
  const latest = await resolveContextBuilder(false, 'balanced', [], entries, []);
  expect(latest.contextBlock).toContain('Kondisi: Terluka');
  const missing = await resolveContextBuilder(false, 'balanced', [], entries, [], undefined, { chapterId: 5 });
  expect(missing.contextBlock).toContain('Kondisi: Sehat');
  expect(missing.contextBlock).not.toMatch(/Pulih|Terluka/);
});
