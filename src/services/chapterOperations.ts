import { dexieChapterStorage } from '@/src/adapters/dexieChapterStorage';
import { createChapterOperations } from './chapterMutations';
import { notifyDeletedChapters } from './entityDeletion';

export const {
  updateChapter,
  saveChapterContent,
  moveChapter,
  saveGeneratedSummary,
  replaceChapterText,
  restoreChapterSnapshot,
  changeChapters,
} = createChapterOperations(dexieChapterStorage, notifyDeletedChapters);
