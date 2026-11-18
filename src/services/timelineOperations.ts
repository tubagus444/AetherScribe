import { db } from '@/src/db';
import type { TimelineEvent } from '@/src/types';

export function addTimelineEvent(event: Omit<TimelineEvent, 'id' | 'order'>) {
  return db.transaction('rw', db.timeline, async () => {
    const events = await db.timeline.where('projectId').equals(event.projectId).toArray();
    const order = events.reduce((max, row) => Math.max(max, row.order), -1) + 1;
    return db.timeline.add({ ...event, order });
  });
}

export function updateTimelineEvent(id: number, changes: Partial<Omit<TimelineEvent, 'id' | 'order'>>) {
  return db.timeline.update(id, changes);
}

export function deleteTimelineEvent(id: number) {
  return db.timeline.delete(id);
}

export async function moveTimelineEvent(projectId: number, eventId: number, targetId: number) {
  if (eventId === targetId) return;
  await db.transaction('rw', db.timeline, async () => {
    const events = await db.timeline.where('projectId').equals(projectId).toArray();
    events.sort((a, b) => a.order - b.order || a.id! - b.id!);
    const from = events.findIndex(event => event.id === eventId);
    const to = events.findIndex(event => event.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = events.splice(from, 1);
    events.splice(to, 0, moved);
    for (const [order, event] of events.entries()) await db.timeline.update(event.id!, { order });
  });
}
