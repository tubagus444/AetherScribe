import { db } from '@/src/db';
import type { AIAction } from '@/src/types';

export function addAiAction(action: Omit<AIAction, 'id'>) {
  return db.aiActions.add(action);
}

export function updateAiAction(id: number, changes: Partial<Omit<AIAction, 'id' | 'projectId'>>) {
  return db.aiActions.update(id, changes);
}

export function deleteAiAction(id: number) {
  return db.aiActions.delete(id);
}
