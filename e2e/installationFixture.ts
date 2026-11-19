import Dexie from 'dexie';
import type { Chapter, ChatSession, Project, Snapshot } from '../src/types';

const dbName = 'AetherScribeDB';

// Historical schemas are explicit: never import/open the current db before seeding.
export async function seedLegacy(version: 17 | 33, extraChapter = false) {
  const stores = {
    projects: '++id, name, lastOpened', chapters: '++id, projectId, order',
    codex: '++id, projectId, name, category, *aliases', bible: '++id, projectId, key, &[projectId+key]',
    aiActions: '++id, projectId, label', snapshots: '++id, chapterId, timestamp',
    timeline: '++id, chapterId, projectId, type', relationships: '++id, projectId, sourceId, targetId',
    errors: '++id, timestamp, type', backups: '++id, timestamp',
    chatSessions: '++id, projectId, chapterId, activeChapterId, lastMessageAt',
    embeddings: 'id, projectId, codexId', aiUsageLogs: '++id, timestamp, provider, actionType',
  };
  const old = new Dexie(dbName);
  old.version(version).stores(version === 17 ? stores : {
    ...stores, codexCategories: '++id, projectId, slug, &[projectId+slug]',
    sceneEmbeddings: 'id, projectId, chapterId, [projectId+chapterId]',
    plotPromises: '++id, projectId, codexId', glossary: '++id, projectId',
    maps: '++id, projectId', mapMarkers: '++id, projectId, mapId, codexId',
    continuityTriage: '++id, projectId, findingId',
  });
  try {
    await old.table('projects').add({ id: 7, name: 'Legacy L02', description: 'Keep', createdAt: 1, lastOpened: 1 });
    await old.table('chapters').add({ id: 9, projectId: 7, title: 'Legacy chapter', content: '<p>Legacy manuscript survives</p>', order: 0, lastModified: 1 });
    if (extraChapter) await old.table('chapters').add({
      id: 10, projectId: 7, title: 'Legacy second chapter', content: '<p>Second manuscript</p>',
      order: 1, lastModified: 2, status: 'draft',
    });
    await old.table('snapshots').add({ id: 4, chapterId: 9, content: '<p>Original manuscript</p>', label: 'Original', timestamp: 1 });
    await old.table('chatSessions').add({ id: 3, projectId: 7, title: 'Global Scribble', messages: [], lastMessageAt: 1, ...(version === 33 ? { kind: 'studio' } : {}) });
    return old.backendDB().version;
  } finally { old.close(); }
}

export async function abortUpgradeAfterChapterWrite() {
  const originalPut = IDBObjectStore.prototype.put;
  let written = false;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = originalPut.call(this, value, key);
    if (this.name === 'chapters' && this.transaction.mode === 'versionchange') {
      const transaction = this.transaction;
      request.addEventListener('success', () => {
        if (!written) {
          transaction.abort();
          written = true;
        }
      }, { once: true });
    }
    return request;
  };
  try {
    const { db, drainPendingDbIssues } = await import('../src/db');
    try {
      await db.open();
    } catch (error) {
      if (!written) throw error;
      return drainPendingDbIssues();
    } finally {
      db.close();
    }
    throw new Error('Expected the schema upgrade to abort');
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
}

export async function readInstalledDatabase() {
  // Open the existing version without declaring an upgrade schema.
  const existing = new Dexie(dbName);
  try {
    await existing.open();
    return {
      version: existing.backendDB().version,
      tables: existing.tables.map(table => table.name),
      chapterIndexes: existing.table('chapters').schema.indexes.map(index => index.name),
      chapters: await existing.table<Chapter>('chapters').toArray(),
      projects: await existing.table<Project>('projects').toArray(),
      sessions: await existing.table<ChatSession>('chatSessions').toArray(),
      snapshots: await existing.table<Snapshot>('snapshots').toArray(),
    };
  } finally {
    existing.close();
  }
}
