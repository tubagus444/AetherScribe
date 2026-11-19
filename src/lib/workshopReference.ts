import type { ChatSession } from '@/src/types';
import { requestId } from './dataContracts';

/** A number is an entry ID, null is a malformed entry key, undefined is a literal key. */
export function parseWorkshopEntryKey(key: unknown): number | null | undefined {
  if (typeof key !== 'string' || !key.startsWith('entry:')) return undefined;
  const match = /^entry:(\d+)$/.exec(key);
  const id = match?.[0] === key ? Number(match[1]) : NaN;
  return requestId(id) ? id : null;
}

export function workshopEntryKey(id: number): string {
  return `entry:${id}`;
}

export function detachWorkshopEntry(session: Pick<ChatSession, 'kind' | 'workshopKey'>): void {
  delete session.workshopKey;
  session.kind = 'studio';
}
