import { dexieChapterStorage } from '@/src/adapters/dexieChapterStorage';
import { createSnapshotOperations } from './chapterSnapshots';

export const { addSnapshot, deleteSnapshot, createAutoSnapshot } = createSnapshotOperations(dexieChapterStorage);
