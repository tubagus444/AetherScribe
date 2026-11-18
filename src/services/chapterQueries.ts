import { dexieChapterStorage } from '@/src/adapters/dexieChapterStorage';

export const {
  readChapter,
  readChaptersById,
  readFirstChapter,
  readProjectChapters,
  readChapterList,
  readLatestChapterModified,
} = dexieChapterStorage.read;
export const observeChapterQuery = dexieChapterStorage.observe;
