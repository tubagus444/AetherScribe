import { db } from '@/src/db';
import { assertWriteId, patchOwned, requireProjectReference, requireRow } from './writeIntegrity';
import { validateWriteFields } from '@/src/lib/backupValidation';
import type { TimelineEvent } from '@/src/types';

async function validateEventRefs(patch: Partial<TimelineEvent>, projectId: number) {
  await requireProjectReference(db.chapters, patch.chapterId, projectId);
  for (const id of patch.characterIds ?? []) await requireProjectReference(db.codex, id, projectId);
}

export async function addTimelineEvent(event: Omit<TimelineEvent, 'id' | 'order'>) {
  validateWriteFields('timeline', { ...event, order: 0 }, 'create');
  return db.transaction('rw', [db.timeline, db.projects, db.chapters, db.codex], async () => {
    await requireRow(db.projects, event.projectId);
    await validateEventRefs(event, event.projectId);
    const events = await db.timeline.where('projectId').equals(event.projectId).toArray();
    const order = events.reduce((max, row) => Math.max(max, row.order), -1) + 1;
    return db.timeline.add({ ...event, order });
  });
}

export function updateTimelineEvent(id: number, changes: Partial<Omit<TimelineEvent, 'id' | 'order' | 'projectId'>>) {
  return patchOwned(db.timeline, id, changes, [db.chapters, db.codex], validateEventRefs);
}

export function deleteTimelineEvent(id: number) {
  return db.timeline.delete(id);
}

export async function moveTimelineEvent(projectId: number, eventId: number, targetId: number) {
  assertWriteId(projectId, 'ID proyek');
  assertWriteId(eventId, 'ID peristiwa');
  assertWriteId(targetId, 'ID peristiwa tujuan');
  await db.transaction('rw', db.timeline, async () => {
    const events = await db.timeline.where('projectId').equals(projectId).toArray();
    events.sort((a, b) => a.order - b.order || a.id! - b.id!);
    const from = events.findIndex(event => event.id === eventId);
    const to = events.findIndex(event => event.id === targetId);
    if (from < 0 || to < 0) throw new Error('Peristiwa tidak ditemukan dalam proyek ini.');
    if (from === to) return;
    const [moved] = events.splice(from, 1);
    events.splice(to, 0, moved);
    for (const [order, event] of events.entries()) await db.timeline.update(event.id!, { order });
  });
}
