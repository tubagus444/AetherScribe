import type { Chapter, Snapshot } from '@/src/types';
import type { ChapterCreateInput, ChapterPatch } from './chapterContracts';
import type { ChapterListMetadata } from './chapterMetadata';

export interface ChapterReader {
  readChapter(id: number): Promise<Chapter | undefined>;
  readChaptersById(ids: number[]): Promise<(Chapter | undefined)[]>;
  /** The lowest chapter ID in the project, used as the navigation fallback. */
  readFirstChapter(projectId: number): Promise<Chapter | undefined>;
  /** Defaults to chapter IDs. Manuscript order uses the chapter ID to break ties. */
  readProjectChapters(projectId: number, sort?: 'manuscript'): Promise<Chapter[]>;
  readChapterList(projectId: number): Promise<ChapterListMetadata[]>;
  readLatestChapterModified(projectId: number): Promise<number>;
  readChapterSnapshots(chapterId: number): Promise<Snapshot[]>;
}

export type ChapterChanges = ChapterPatch & Partial<Pick<Chapter,
  'content' | 'lastModified' | 'order' | 'summary' | 'summaryUpdatedAt' | 'summarySourceHash'
>>;

type ChapterEdits = Pick<ChapterReader, 'readChapter' | 'readProjectChapters'> & {
  patchChapter(id: number, changes: ChapterChanges): Promise<number>;
};

type Snapshots = {
  readSnapshot(id: number): Promise<Snapshot | undefined>;
  addSnapshot(snapshot: Omit<Snapshot, 'id'>): Promise<number>;
  readAutomaticSnapshots(chapterId: number): Promise<Snapshot[]>;
  deleteSnapshots(ids: number[]): Promise<void>;
};

export interface ChapterTransactions {
  edit: ChapterEdits;
  history: ChapterEdits & Snapshots;
  snapshots: Pick<Snapshots, 'readSnapshot' | 'deleteSnapshots'>;
  create: ChapterEdits & {
    projectExists(id: number): Promise<boolean>;
    insertChapter(chapter: ChapterCreateInput): Promise<number>;
  };
  remove: ChapterEdits & {
    deleteChapterAndReferences(projectId: number, id: number): Promise<void>;
  };
}

export type Subscribe<T> = (onValue: (value: T) => void, onError: (error: unknown) => void) => () => void;

export interface ChapterStorage {
  read: ChapterReader;
  patchChapter: ChapterEdits['patchChapter'];
  /** Emits the initial result and refreshes it after relevant committed writes. Returns cleanup. */
  observe<T>(query: (read: ChapterReader) => Promise<T>): Subscribe<T>;
  /** Runs all work in one transaction. Use only the supplied repositories inside the callback. */
  transact<K extends keyof ChapterTransactions, T>(
    scope: K, work: (repositories: ChapterTransactions[K]) => Promise<T>,
  ): Promise<T>;
}

export class ChapterStorageError extends Error {
  constructor(readonly kind: 'quota' | 'failed', cause: unknown) {
    super(kind === 'quota' ? 'Ruang penyimpanan bab penuh.' : 'Penyimpanan bab tidak dapat diakses.', { cause });
    this.name = 'ChapterStorageError';
  }
}
