import { db } from '@/src/db';
import { assertWriteId } from './writeIntegrity';

export const domainTables = () => [db.projects, db.chapters, db.codex, db.bible, db.aiActions, db.snapshots, db.timeline, db.relationships, db.chatSessions, db.codexCategories, db.embeddings, db.sceneEmbeddings, db.plotPromises, db.glossary, db.maps, db.mapMarkers, db.continuityTriage];

async function removeChapterReferences(chapterIds: number[]) {
  if (!chapterIds.length) return;
  const targets = new Set(chapterIds);
  const pointsToTarget = (id?: number) => id !== undefined && targets.has(id);
  await db.snapshots.where('chapterId').anyOf(chapterIds).delete();
  await db.sceneEmbeddings.where('chapterId').anyOf(chapterIds).delete();
  await db.timeline.filter(r => pointsToTarget(r.chapterId)).modify(r => { delete r.chapterId; });
  await db.chatSessions.filter(r => pointsToTarget(r.chapterId) || pointsToTarget(r.activeChapterId)).modify(r => {
    if (pointsToTarget(r.chapterId)) delete r.chapterId;
    if (pointsToTarget(r.activeChapterId)) delete r.activeChapterId;
  });
  await db.plotPromises.filter(r => pointsToTarget(r.plantedChapterId)).modify(r => { delete r.plantedChapterId; });
}

/** Dipanggil di transaksi penghapusan bab. */
export async function removeChapterRelations(projectId: number, chapterId: number) {
  await removeChapterReferences([chapterId]);
  await db.continuityTriage.where('projectId').equals(projectId).delete();
}

export function notifyDeletedChapters(ids: number[]) {
  if (typeof window === 'undefined') return;
  for (const id of ids) {
    try { localStorage.removeItem(`ai_inline_consistency_cache_${id}`); } catch { /* DB tetap sumber utama */ }
  }
  window.dispatchEvent(new CustomEvent('aetherscribe-chapters-deleted', { detail: ids }));
}

export async function deleteAtlasMap(projectId: number, id: number) {
  assertWriteId(projectId, 'ID proyek');
  assertWriteId(id, 'ID peta');
  await db.transaction('rw', db.maps, db.mapMarkers, async () => {
    const map = await db.maps.get(id);
    if (!map || map.projectId !== projectId) throw new Error('Peta tidak ditemukan dalam proyek ini.');
    await removeMapReferences([id]);
    await db.maps.delete(id);
  });
}

async function removeMapReferences(mapIds: number[]) {
  if (!mapIds.length) return;
  const targets = new Set(mapIds);
  await db.mapMarkers.where('mapId').anyOf(mapIds).delete();
  await db.mapMarkers.filter(r => r.linkedMapId !== undefined && targets.has(r.linkedMapId)).modify(r => { delete r.linkedMapId; });
}

async function removeCodexReferences(codexIds: number[]) {
  if (!codexIds.length) return;
  const targets = new Set(codexIds);
  const embeddingKeys = new Set(codexIds.map(String));
  const workshopKeys = new Set(codexIds.map(id => `entry:${id}`));
  const pointsToTarget = (id?: number) => id !== undefined && targets.has(id);
  await db.relationships.filter(r => targets.has(r.sourceId) || targets.has(r.targetId)).delete();
  await db.embeddings.filter(r => embeddingKeys.has(String(r.codexId))).delete();
  await db.timeline.filter(r => Array.isArray(r.characterIds) && r.characterIds.some(pointsToTarget)).modify(r => {
    r.characterIds = r.characterIds?.filter(id => !targets.has(id));
  });
  await db.mapMarkers.where('codexId').anyOf(codexIds).modify(r => { delete r.codexId; });
  await db.plotPromises.filter(r => pointsToTarget(r.codexId) || pointsToTarget(r.payoffCodexId)).modify(r => {
    if (pointsToTarget(r.codexId)) delete r.codexId;
    if (pointsToTarget(r.payoffCodexId)) delete r.payoffCodexId;
  });
  await db.chatSessions.filter(r => r.workshopKey !== undefined && workshopKeys.has(r.workshopKey)).modify(r => {
    delete r.workshopKey;
    r.kind = 'studio';
  });
}

export async function deleteCodexEntry(id: number) {
  assertWriteId(id, 'ID entri Codex');
  await db.transaction('rw', domainTables(), async () => {
    const entry = await db.codex.get(id);
    if (!entry) throw new Error('Entri tidak ditemukan.');
    await removeCodexReferences([id]);
    await db.continuityTriage.where('projectId').equals(entry.projectId).delete();
    await db.codex.delete(id);
  });
}

export async function deleteProjectData(id: number) {
  assertWriteId(id, 'ID proyek');
  const deleted = await db.transaction('rw', domainTables(), async () => {
    if (!await db.projects.get(id)) throw new Error('Proyek tidak ditemukan.');
    const chapters = await db.chapters.where('projectId').equals(id).primaryKeys() as number[];
    const maps = await db.maps.where('projectId').equals(id).primaryKeys() as number[];
    const codex = await db.codex.where('projectId').equals(id).primaryKeys() as number[];
    await removeChapterReferences(chapters);
    await removeMapReferences(maps);
    await removeCodexReferences(codex);
    for (const table of domainTables()) {
      if (['projects', 'snapshots'].includes(table.name)) continue;
      await table.where('projectId').equals(id).delete();
    }
    await db.projects.delete(id);
    return chapters;
  });
  notifyDeletedChapters(deleted);
}
