import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { summarizeChapterBackground } from './useAutoSummarizer';
const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }));
vi.mock('@/src/contexts/NavigationContext', () => ({ useNavigation: vi.fn() }));
vi.mock('@/src/services/ai/proxy', () => ({ callProxy: proxy, getLightModelForProvider: () => undefined }));
beforeEach(async () => {
  proxy.mockReset(); proxy.mockResolvedValue('Summary');
  vi.stubGlobal('localStorage', { getItem: (key: string) => key.startsWith('ai_key_') ? btoa('fixture') : null });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  await db.chapters.add({ id: 1, projectId: 1, title: 'Chapter', content: 'Original text '.repeat(12), order: 0, lastModified: 100 });
});
afterEach(async () => { vi.unstubAllGlobals(); await db.chapters.clear(); });
afterAll(async () => { await db.delete(); });
it('F29 commits only an unchanged version and skips a fresh hash-matched summary', async () => {
  await summarizeChapterBackground(1);
  const chapter = (await db.chapters.get(1))!;
  expect(chapter.summary).toBe('Summary'); expect(chapter.summaryUpdatedAt).toBe(100); expect(chapter.summarySourceHash).toMatch(/^[a-f0-9]{64}$/);
  await summarizeChapterBackground(1); expect(proxy).toHaveBeenCalledTimes(1);
});
it.each(['content', 'timestamp', 'deleted', 'manual-summary'])('F29 discards response after %s changes during request', async change => {
  let finish: (value: string) => void;
  let started: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  proxy.mockImplementation(() => { started!(); return new Promise<string>(resolve => { finish = resolve; }); });
  const pending = summarizeChapterBackground(1); await ready;
  if (change === 'deleted') await db.chapters.delete(1);
  else await db.chapters.update(1, change === 'content' ? { content: 'Changed '.repeat(20) } : change === 'timestamp' ? { lastModified: 101 } : { summary: 'Manual' });
  finish!('Stale'); await pending;
  const chapter = await db.chapters.get(1);
  expect(chapter?.summary).not.toBe('Stale'); expect(chapter?.summarySourceHash).toBeUndefined();
});
it('F29 concurrent calls share the in-flight guard', async () => {
  let finish: (value: string) => void; let started: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  proxy.mockImplementation(() => { started!(); return new Promise<string>(resolve => { finish = resolve; }); });
  const first = summarizeChapterBackground(1); await ready;
  await summarizeChapterBackground(1); expect(proxy).toHaveBeenCalledTimes(1);
  finish!('Summary'); await first;
});
it('F29 regenerates a legacy summary without source hash even if timestamp looks fresh', async () => {
  await db.chapters.update(1, { summary: 'Legacy', summaryUpdatedAt: Date.now() });
  await summarizeChapterBackground(1);
  expect(proxy).toHaveBeenCalledTimes(1); expect((await db.chapters.get(1))!.summary).toBe('Summary');
});
it('F29 zero source timestamp can still be fresh when its hash matches', async () => {
  await db.chapters.update(1, { lastModified: 0 });
  await summarizeChapterBackground(1); await summarizeChapterBackground(1);
  expect(proxy).toHaveBeenCalledTimes(1);
});
