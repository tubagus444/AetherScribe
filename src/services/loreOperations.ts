import { db } from '@/src/db';
import type { Relationship } from '@/src/types';

export function addRelationship(relationship: Omit<Relationship, 'id'>) {
  return db.relationships.add(relationship);
}

export function updateRelationship(id: number, changes: Partial<Omit<Relationship, 'id' | 'projectId'>>) {
  return db.relationships.update(id, changes);
}

export function deleteRelationship(id: number) {
  return db.relationships.delete(id);
}

export async function saveBibleInstruction(projectId: number, key: string, instruction: string) {
  await db.transaction('rw', db.bible, async () => {
    const existing = await db.bible.where({ projectId, key }).first();
    if (existing) await db.bible.update(existing.id!, { instruction });
    else await db.bible.add({ projectId, key, instruction });
  });
}
