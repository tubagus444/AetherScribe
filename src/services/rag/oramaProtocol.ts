import { isCodexData } from '@/src/lib/codexContracts';
import type { CodexEntry } from '@/src/types';
import { record, finite, requestId } from '@/src/lib/dataContracts';
export interface SearchHit { entry: CodexEntry; score: number }
export interface OramaPayloads {
 INIT_ORAMA: { projectId: number }; INDEX_ENTRY: { entry: CodexEntry }; UPDATE_ENTRY: { entry: CodexEntry }; REMOVE_ENTRY: { dexieId: number };
 SEARCH: { query: string; limit: number }; SEARCH_WITH_SCORES: { projectId: number; query: string; limit: number };
}
export type OramaTask = keyof OramaPayloads;
export type OramaSearch = 'SEARCH' | 'SEARCH_WITH_SCORES';
export type OramaResults = { SEARCH: CodexEntry[]; SEARCH_WITH_SCORES: SearchHit[] };
export type OramaMessage = { [K in OramaTask]: { type: K; payload: OramaPayloads[K]; retry?: number } & (K extends OramaSearch ? { id: number } : { id?: never }) }[OramaTask];
export function isOramaMessage(value: unknown): value is OramaMessage {
 if (!record(value) || !record(value.payload) || (value.retry !== undefined && (!finite(value.retry) || !Number.isSafeInteger(value.retry) || value.retry < 0))) return false;
 const p = value.payload;
 if (value.type !== 'SEARCH' && value.type !== 'SEARCH_WITH_SCORES' && value.id !== undefined) return false;
 switch (value.type) {
  case 'INIT_ORAMA': return requestId(p.projectId);
  case 'REMOVE_ENTRY': return requestId(p.dexieId);
  case 'INDEX_ENTRY': case 'UPDATE_ENTRY': return isCodexData(p.entry) && requestId(p.entry.id);
  case 'SEARCH': case 'SEARCH_WITH_SCORES': return requestId(value.id) && typeof p.query === 'string' && finite(p.limit) && (value.type === 'SEARCH' || requestId(p.projectId));
  default: return false;
 }
}
export function validOramaResult<K extends OramaSearch>(task: K, value: unknown): value is OramaResults[K] {
 return Array.isArray(value) && value.every(hit => {
  const entry = task === 'SEARCH_WITH_SCORES' && record(hit) ? hit.entry : hit;
  return isCodexData(entry) && requestId(entry.id) && (task === 'SEARCH' || (record(hit) && finite(hit.score)));
 });
}

export type OramaMutation = Exclude<OramaTask, OramaSearch>;
export type OramaReply = { type: 'SEARCH_RESULT'; id: number; result: OramaResults[OramaSearch] } | { type: 'SEARCH_RESULT'; id: number; error: string } |
 { [K in OramaMutation]: { type: 'MUTATION_ERROR'; op: K; payload: OramaPayloads[K]; retry?: number; error: string } }[OramaMutation];
export function isOramaReply(value: unknown): value is OramaReply {
 if (!record(value)) return false;
 if (value.type === 'SEARCH_RESULT') return requestId(value.id) && (typeof value.error === 'string' || (value.error === undefined && (validOramaResult('SEARCH', value.result) || validOramaResult('SEARCH_WITH_SCORES', value.result))));
 if (value.type === 'MUTATION_ERROR') return typeof value.error === 'string' && isOramaMessage({ type: value.op, payload: value.payload, retry: value.retry }) && value.op !== 'SEARCH' && value.op !== 'SEARCH_WITH_SCORES';
 return false;
}
