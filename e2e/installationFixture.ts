import Dexie from 'dexie';

// Historical schemas are explicit: never import/open the current db before seeding.
export async function seedLegacy(version: 17 | 33) {
  const stores = {
    projects: '++id, name, lastOpened', chapters: '++id, projectId, order',
    codex: '++id, projectId, name, category, *aliases', bible: '++id, projectId, key, &[projectId+key]',
    aiActions: '++id, projectId, label', snapshots: '++id, chapterId, timestamp',
    timeline: '++id, chapterId, projectId, type', relationships: '++id, projectId, sourceId, targetId',
    errors: '++id, timestamp, type', backups: '++id, timestamp',
    chatSessions: '++id, projectId, chapterId, activeChapterId, lastMessageAt',
    embeddings: 'id, projectId, codexId', aiUsageLogs: '++id, timestamp, provider, actionType',
  };
  const old = new Dexie('AetherScribeDB');
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
    await old.table('chatSessions').add({ id: 3, projectId: 7, title: 'Global Scribble', messages: [], lastMessageAt: 1, ...(version === 33 ? { kind: 'studio' } : {}) });
    return old.backendDB().version;
  } finally { old.close(); }
}
