import { db } from '@/src/db';

export const domainTables = () => [db.projects, db.chapters, db.codex, db.bible, db.aiActions, db.snapshots, db.timeline, db.relationships, db.chatSessions, db.codexCategories, db.embeddings, db.sceneEmbeddings, db.plotPromises, db.glossary, db.maps, db.mapMarkers, db.continuityTriage];

/** Appelée dans la transaction de suppression: préserver les textes, délier les FK. */
export async function removeChapterRelations(projectId: number, chapterId: number) {
  await db.snapshots.where('chapterId').equals(chapterId).delete();
  await db.sceneEmbeddings.where('chapterId').equals(chapterId).delete();
  await db.timeline.where('projectId').equals(projectId).filter(r => r.chapterId === chapterId).modify(r => { delete r.chapterId; });
  await db.chatSessions.where('projectId').equals(projectId).filter(r => r.chapterId === chapterId || r.activeChapterId === chapterId).modify(r => {
    if (r.chapterId === chapterId) delete r.chapterId;
    if (r.activeChapterId === chapterId) delete r.activeChapterId;
  });
  await db.plotPromises.where('projectId').equals(projectId).filter(r => r.plantedChapterId === chapterId).modify(r => { delete r.plantedChapterId; });
  // findingId encode des identités: cache dérivé, recalculé au prochain audit.
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
  await db.transaction('rw', db.maps, db.mapMarkers, async () => {
    const map = await db.maps.get(id);
    if (!map || map.projectId !== projectId) throw new Error('Peta tidak ditemukan dalam proyek ini.');
    await db.mapMarkers.where('mapId').equals(id).delete();
    await db.mapMarkers.filter(r => r.linkedMapId === id).modify(r => { delete r.linkedMapId; });
    await db.maps.delete(id);
  });
}

export async function deleteCodexEntry(id: number) {
  await db.transaction('rw', domainTables(), async () => {
    const entry = await db.codex.get(id);
    if (!entry) throw new Error('Entri tidak ditemukan.');
    await db.relationships.filter(r => r.sourceId === id || r.targetId === id).delete();
    await db.embeddings.filter(r => String(r.codexId) === String(id)).delete();
    await db.timeline.filter(r => !!r.characterIds?.includes(id)).modify(r => { r.characterIds = r.characterIds?.filter(value => value !== id); });
    await db.mapMarkers.where('codexId').equals(id).modify(r => { delete r.codexId; });
    await db.plotPromises.filter(r => r.codexId === id || r.payoffCodexId === id).modify(r => {
      if (r.codexId === id) delete r.codexId;
      if (r.payoffCodexId === id) delete r.payoffCodexId;
    });
    await db.chatSessions.filter(r => r.workshopKey === `entry:${id}`).modify(r => { delete r.workshopKey; r.kind = 'studio'; });
    await db.continuityTriage.where('projectId').equals(entry.projectId).delete();
    await db.codex.delete(id);
  });
}

export async function deleteProjectData(id: number) {
  const deleted = await db.transaction('rw', domainTables(), async () => {
    if (!await db.projects.get(id)) throw new Error('Proyek tidak ditemukan.');
    const chapters = await db.chapters.where('projectId').equals(id).primaryKeys() as number[];
    const maps = await db.maps.where('projectId').equals(id).primaryKeys() as number[];
    await db.mapMarkers.filter(r => r.linkedMapId !== undefined && maps.includes(r.linkedMapId)).modify(r => { delete r.linkedMapId; });
    if (chapters.length) await db.snapshots.where('chapterId').anyOf(chapters).delete();
    for (const table of domainTables()) {
      if (['projects', 'snapshots'].includes(table.name)) continue;
      await table.where('projectId').equals(id).delete();
    }
    await db.projects.delete(id);
    // Snapshot lama tanpa projectId tidak dapat diatribusikan. Buang hanya yang
    // parent bab-nya benar-benar tidak ada, tanpa menyentuh snapshot bab hidup.
    const live = new Set(await db.chapters.toCollection().primaryKeys());
    await db.snapshots.filter(row => !live.has(row.chapterId)).delete();
    return chapters;
  });
  notifyDeletedChapters(deleted);
}
