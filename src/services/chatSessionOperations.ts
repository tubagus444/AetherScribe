import { db } from '@/src/db';
import type { ChatSession } from '@/src/types';

export function addChatSession(session: Omit<ChatSession, 'id'>) {
  return db.chatSessions.add(session);
}

export function updateChatSession(id: number, changes: Partial<Omit<ChatSession, 'id' | 'projectId'>>) {
  return db.chatSessions.update(id, changes);
}

export function deleteChatSession(id: number) {
  return db.chatSessions.delete(id);
}
