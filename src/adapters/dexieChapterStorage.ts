import Dexie, { liveQuery } from 'dexie';
import { db } from '@/src/db';
import { CHAPTER_LIST_INDEX, chapterListRow, type ChapterListKey, type ChapterListMetadata } from '@/src/lib/chapterMetadata';
import { ChapterStorageError, type ChapterReader, type ChapterStorage, type ChapterTransactions } from '@/src/lib/chapterStorage';
import { domainTables, removeChapterRelations } from '@/src/services/entityDeletion';

function storageError(error: unknown): unknown {
  if (!(error instanceof Dexie.DexieError || error instanceof DOMException)) return error;
  return new ChapterStorageError(error.name === 'QuotaExceededError' ? 'quota' : 'failed', error);
}

async function access<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw storageError(error);
  }
}

const read: ChapterReader = {
  readChapter: id => access(() => db.chapters.get(id)),
  readChaptersById: ids => access(() => db.chapters.bulkGet(ids)),
  readFirstChapter: projectId => access(() => db.chapters.where('projectId').equals(projectId).first()),
  readProjectChapters: (projectId, sort) => access(() => {
    const rows = db.chapters.where('projectId').equals(projectId);
    return sort === 'manuscript' ? rows.sortBy('order') : rows.toArray();
  }),
  readChapterList: projectId => access(async () => {
    const rows: ChapterListMetadata[] = [];
    await db.chapters.where(CHAPTER_LIST_INDEX).between([projectId], [projectId, Dexie.maxKey])
      .eachKey((key, cursor) => {
        rows.push(chapterListRow(cursor.primaryKey as number, projectId, (key as [number, ChapterListKey])[1]));
      });
    return rows.sort((a, b) => a.order - b.order || a.id - b.id);
  }),
  readLatestChapterModified: projectId => access(async () => {
    const [key] = await db.chapters.where('[projectId+lastModified]')
      .between([projectId], [projectId, Dexie.maxKey]).reverse().limit(1).keys();
    return Array.isArray(key) && typeof key[1] === 'number' ? key[1] : 0;
  }),
  readChapterSnapshots: chapterId => access(() =>
    db.snapshots.where('chapterId').equals(chapterId).reverse().sortBy('timestamp')),
};

const edit: ChapterTransactions['edit'] = {
  readChapter: read.readChapter,
  readProjectChapters: read.readProjectChapters,
  patchChapter: (id, changes) => db.chapters.update(id, changes),
};
const snapshots: ChapterTransactions['snapshots'] = {
  readSnapshot: id => db.snapshots.get(id),
  deleteSnapshots: ids => db.snapshots.bulkDelete(ids),
};
const repositories: ChapterTransactions = {
  edit,
  snapshots,
  history: {
    ...edit,
    ...snapshots,
    addSnapshot: snapshot => db.snapshots.add(snapshot),
    readAutomaticSnapshots: chapterId => db.snapshots.where('chapterId').equals(chapterId)
      .filter(row => row.auto === true).sortBy('timestamp'),
  },
  create: {
    ...edit,
    projectExists: async id => !!await db.projects.get(id),
    insertChapter: chapter => db.chapters.add(chapter),
  },
  remove: {
    ...edit,
    async deleteChapterAndReferences(projectId, id) {
      await removeChapterRelations(projectId, id);
      await db.chapters.delete(id);
    },
  },
};

const tables = {
  edit: () => [db.chapters],
  snapshots: () => [db.snapshots],
  history: () => [db.chapters, db.snapshots],
  create: () => [db.projects, db.chapters],
  remove: domainTables,
};

export const dexieChapterStorage: ChapterStorage = {
  read,
  patchChapter: (id, changes) => access(() => edit.patchChapter(id, changes)),
  observe(query) {
    return (onValue, onError) => {
      const subscription = liveQuery(() => query(read)).subscribe({
        next: onValue,
        error: error => onError(storageError(error)),
      });
      return () => subscription.unsubscribe();
    };
  },
  transact(scope, work) {
    return access(() => db.transaction('rw', tables[scope](), () => work(repositories[scope])));
  },
};
