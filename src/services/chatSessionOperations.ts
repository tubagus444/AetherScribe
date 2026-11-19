import { db } from '@/src/db';
import { addOwned, patchOwned, requireProjectReference } from './writeIntegrity';
import type { ChatSession } from '@/src/types';
import { parseWorkshopEntryKey, workshopEntryKey } from '@/src/lib/workshopReference';

function canonicalizeWorkshopKey<T extends Pick<ChatSession, 'workshopKey'>>(input: T): T {
  const entryId = parseWorkshopEntryKey(input.workshopKey);
  if (entryId === null) throw new Error('Referensi entri Workshop tidak valid.');
  return entryId === undefined ? input : { ...input, workshopKey: workshopEntryKey(entryId) };
}

async function validateSessionRefs(patch: Partial<ChatSession>, projectId: number) {
  await requireProjectReference(db.chapters, patch.chapterId, projectId);
  await requireProjectReference(db.chapters, patch.activeChapterId, projectId);
  await requireProjectReference(db.codex, parseWorkshopEntryKey(patch.workshopKey) ?? undefined, projectId);
}

export async function addChatSession(session: Omit<ChatSession, 'id'>) {
  return addOwned(db.chatSessions, canonicalizeWorkshopKey(session), [db.chapters, db.codex], validateSessionRefs);
}

export async function updateChatSession(id: number, changes: Partial<Omit<ChatSession, 'id' | 'projectId'>>) {
  return patchOwned(db.chatSessions, id, canonicalizeWorkshopKey(changes), [db.chapters, db.codex], validateSessionRefs);
}

export async function findWorkshopSession(projectId: number, key: string) {
  const entryId = parseWorkshopEntryKey(key);
  const matches = await db.chatSessions.where('projectId').equals(projectId)
    .and(session => session.kind === 'workshop' && (session.workshopKey === key ||
      (typeof entryId === 'number' && parseWorkshopEntryKey(session.workshopKey) === entryId)))
    .toArray();
  return matches.find(session => session.workshopKey === key) ?? matches[0];
}

export function deleteChatSession(id: number) {
  return db.chatSessions.delete(id);
}
