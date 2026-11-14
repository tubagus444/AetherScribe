export type ContextTaskType = 'SEARCH_MANUSCRIPT' | 'GET_RELEVANT_CONTEXT' | 'GET_CODEX_MATCHES' | 'GET_RELEVANT_BIBLE_RULES' | 'INVALIDATE_CACHE' | 'SCAN_APPEARANCES' | 'COUNT_TOKENS' | 'BUILD_PRESENCE_INDEX' | 'BUILD_PROSE_REPORT' | 'BUILD_PACING_REPORT' | 'ESTIMATE_CONTEXT_TOKENS' | 'PREVIEW_CONTEXT_TOKENS';
export type ContextWorkerMessage =
  | { type: 'CANCEL'; payload: { cancelId: number } }
  | { type: 'INDEX_MANUSCRIPT'; payload: any }
  | { type: ContextTaskType; id: number; payload: any };

export function cancelContextRequest(cancelId: number): ContextWorkerMessage {
  return { type: 'CANCEL', payload: { cancelId } };
}
