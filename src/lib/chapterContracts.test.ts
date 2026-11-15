import { expect, it } from 'vitest';
import type { ChapterListKey } from './chapterMetadata';
import { chapterCreateInput, chapterIdentity } from './chapterContracts';
it('separates identity/derived data from create input while preserving manuscript fields', () => {
 const chapter = { id: 1, projectId: 1, title: 'Fixture', content: '<p>keep</p>', order: 0, lastModified: 1, summary: 'keep', listMetadata: [0, 'Fixture', 'outline', 1, 1] as ChapterListKey };
 const source = chapter;
 expect(chapterCreateInput(source)).toEqual({ projectId: 1, title: 'Fixture', content: '<p>keep</p>', order: 0, lastModified: 1, summary: 'keep' });
 expect(chapterIdentity(source)).toBe(1);
 expect(() => chapterIdentity({ ...source, id: undefined })).toThrow('valid ID');
});
