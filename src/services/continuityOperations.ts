import { db } from '@/src/db';
import type { GlossaryEntry, PlotPromise, PlotPromiseStatus } from '@/src/types';

export function addGlossaryEntry(entry: Omit<GlossaryEntry, 'id'>) {
  return db.glossary.add(entry);
}

export function updateGlossaryEntry(id: number, changes: Partial<Omit<GlossaryEntry, 'id' | 'projectId'>>) {
  return db.glossary.update(id, changes);
}

export function deleteGlossaryEntry(id: number) {
  return db.glossary.delete(id);
}

export function addPlotPromise(promise: Omit<PlotPromise, 'id'>) {
  return db.plotPromises.add(promise);
}

export function updatePlotPromise(id: number, changes: Partial<Omit<PlotPromise, 'id' | 'projectId'>>) {
  return db.plotPromises.update(id, changes);
}

export function setPlotPromiseStatus(id: number, status: PlotPromiseStatus) {
  return updatePlotPromise(id, { status, updatedAt: Date.now() });
}

export function deletePlotPromise(id: number) {
  return db.plotPromises.delete(id);
}
