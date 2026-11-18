import { db } from '@/src/db';
import { addOwned, patchOwned, requireProjectReference } from './writeIntegrity';
import type { ChatSession } from '@/src/types';

async function validateSessionRefs(patch: Partial<ChatSession>, projectId: number) {
  await requireProjectReference(db.chapters, patch.chapterId, projectId);
  await requireProjectReference(db.chapters, patch.activeChapterId, projectId);
  if (patch.workshopKey?.startsWith('entry:')) {
    const match = /^entry:(\d+)$/.exec(patch.workshopKey);
    if (!match) throw new Error('Referensi entri workshop tidak valid.');
    await requireProjectReference(db.codex, Number(match[1]), projectId);
  }
}

export function addChatSession(session: Omit<ChatSession, 'id'>) {
  return addOwned(db.chatSessions, session, [db.chapters, db.codex], validateSessionRefs);
}

export function updateChatSession(id: number, changes: Partial<Omit<ChatSession, 'id' | 'projectId'>>) {
  return patchOwned(db.chatSessions, id, changes, [db.chapters, db.codex], validateSessionRefs);
}

export function deleteChatSession(id: number) {
  return db.chatSessions.delete(id);
}
