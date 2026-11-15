import type { CodexEntry } from '@/src/types';
import { record, requestId } from '@/src/lib/dataContracts';
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string');
/** Core worker fields; full backup/domain validation remains in backupValidation. */
export const isCodexData = (value: unknown): value is CodexEntry =>
  record(value) && requestId(value.projectId) && typeof value.category === 'string' &&
  typeof value.description === 'string' && strings(value.aliases) && strings(value.tags) &&
  typeof value.name === 'string' && (value.id === undefined || requestId(value.id));
