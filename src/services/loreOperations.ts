import { db } from '@/src/db';
import { addOwned, patchOwned, requireProjectReference, requireRow } from './writeIntegrity';
import { validateWriteFields } from '@/src/lib/backupValidation';
import type { Relationship } from '@/src/types';

async function validateRelationshipRefs(patch: Partial<Relationship>, projectId: number) {
  await requireProjectReference(db.codex, patch.sourceId, projectId);
  await requireProjectReference(db.codex, patch.targetId, projectId);
}

export function addRelationship(relationship: Omit<Relationship, 'id'>) {
  return addOwned(db.relationships, relationship, [db.codex], validateRelationshipRefs);
}

export function updateRelationship(id: number, changes: Partial<Omit<Relationship, 'id' | 'projectId'>>) {
  return patchOwned(db.relationships, id, changes, [db.codex], validateRelationshipRefs);
}

export function deleteRelationship(id: number) {
  return db.relationships.delete(id);
}

export async function saveBibleInstruction(projectId: number, key: string, instruction: string) {
  validateWriteFields('bible', { projectId, key, instruction }, 'create');
  await db.transaction('rw', db.projects, db.bible, async () => {
    await requireRow(db.projects, projectId);
    const existing = await db.bible.where({ projectId, key }).first();
    if (existing) await db.bible.update(existing.id!, { instruction });
    else await db.bible.add({ projectId, key, instruction });
  });
}
