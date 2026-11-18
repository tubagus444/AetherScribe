import { db } from '@/src/db';
import { addOwned, patchOwned, requireProjectReference } from './writeIntegrity';
import type { GlossaryEntry, PlotPromise, PlotPromiseStatus } from '@/src/types';

export function addGlossaryEntry(entry: Omit<GlossaryEntry, 'id'>) {
  return addOwned(db.glossary, entry);
}

export function updateGlossaryEntry(id: number, changes: Partial<Omit<GlossaryEntry, 'id' | 'projectId'>>) {
  return patchOwned(db.glossary, id, changes);
}

export function deleteGlossaryEntry(id: number) {
  return db.glossary.delete(id);
}

async function validatePromiseRefs(patch: Partial<PlotPromise>, projectId: number) {
  await requireProjectReference(db.chapters, patch.plantedChapterId, projectId);
  await requireProjectReference(db.codex, patch.codexId, projectId);
  await requireProjectReference(db.codex, patch.payoffCodexId, projectId);
}

export function addPlotPromise(promise: Omit<PlotPromise, 'id'>) {
  return addOwned(db.plotPromises, promise, [db.chapters, db.codex], validatePromiseRefs);
}

export function updatePlotPromise(id: number, changes: Partial<Omit<PlotPromise, 'id' | 'projectId'>>) {
  return patchOwned(db.plotPromises, id, changes, [db.chapters, db.codex], validatePromiseRefs);
}

export function setPlotPromiseStatus(id: number, status: PlotPromiseStatus) {
  return updatePlotPromise(id, { status, updatedAt: Date.now() });
}

export function deletePlotPromise(id: number) {
  return db.plotPromises.delete(id);
}
