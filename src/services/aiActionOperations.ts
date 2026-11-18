import { db } from '@/src/db';
import { addOwned, patchOwned } from './writeIntegrity';
import type { AIAction } from '@/src/types';

export function addAiAction(action: Omit<AIAction, 'id'>) {
  return addOwned(db.aiActions, action);
}

export function updateAiAction(id: number, changes: Partial<Omit<AIAction, 'id' | 'projectId'>>) {
  return patchOwned(db.aiActions, id, changes);
}

export function deleteAiAction(id: number) {
  return db.aiActions.delete(id);
}
