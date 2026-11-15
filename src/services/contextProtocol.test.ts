import { expect, it } from 'vitest';
import { isContextRequest, validContextResult, isContextProgress, type ContextPayloads, type ContextResults, type ContextTaskType } from './contextProtocol';
import { buildPresenceIndex } from '@/src/lib/continuity';
import { buildProseReport } from '@/src/lib/proseAnalysis';
import { buildPacingReport } from '@/src/lib/pacingHeatmap';

const entry = { id: 1, projectId: 1, name: 'Ada', aliases: [], tags: [], category: 'character', description: '' };
const inputs: ContextPayloads = {
 SEARCH_MANUSCRIPT: { projectId: 1, query: 'fixture' }, GET_RELEVANT_CONTEXT: { text: 'Ada', allCodex: [entry] },
 GET_CODEX_MATCHES: { chunks: [{ pos: 0, text: 'Ada' }], allCodex: [entry] },
 GET_RELEVANT_BIBLE_RULES: { text: '', allRules: [], maxChars: 100 }, INVALIDATE_CACHE: {},
 SCAN_APPEARANCES: { entry, chapters: [{ id: 1, content: 'Ada' }] }, COUNT_TOKENS: { text: 'Ada' },
 BUILD_PRESENCE_INDEX: { chapters: [], codexEntries: [entry] }, BUILD_PROSE_REPORT: { chapters: [], language: 'id', excludeWords: new Set(['Ada']) },
 BUILD_PACING_REPORT: { chapters: [] }, ESTIMATE_CONTEXT_TOKENS: { text: '', codexText: '', rulesText: '' },
 PREVIEW_CONTEXT_TOKENS: { text: '', projectId: 1 },
};
it.each(Object.entries(inputs))('accepts %s and rejects missing/wrong payload', (type, payload) => {
 expect(isContextRequest(structuredClone({ type, payload, id: 1 }))).toBe(true);
 expect(isContextRequest({ type, id: 1, payload: null })).toBe(false);
 expect(isContextRequest({ type, id: '1', payload })).toBe(false);
});
const chapters = [{ id: 1, title: 'Fixture', content: 'Ada berjalan. Ada melihat rumah.' }];
const outputs: ContextResults = {
 SEARCH_MANUSCRIPT: [{ chapterId: 1, chunkIndex: 0, snippet: 'Ada', score: 0 }],
 GET_RELEVANT_CONTEXT: [entry], GET_CODEX_MATCHES: [{ start: 0, end: 3, codexId: 1 }],
 GET_RELEVANT_BIBLE_RULES: [{ projectId: 1, key: 'tone', instruction: 'calm' }],
 INVALIDATE_CACHE: { success: true }, SCAN_APPEARANCES: [1], COUNT_TOKENS: 0,
 BUILD_PRESENCE_INDEX: buildPresenceIndex(chapters, [entry]),
 BUILD_PROSE_REPORT: buildProseReport(chapters, 'id'), BUILD_PACING_REPORT: buildPacingReport(chapters),
 ESTIMATE_CONTEXT_TOKENS: { textTokens: 0, codexTokens: 1, rulesTokens: 2 },
 PREVIEW_CONTEXT_TOKENS: { textTokens: 0, codexTokens: 1, rulesTokens: 2, totalTokens: 3 },
};
it.each(Object.keys(outputs) as ContextTaskType[])('accepts real %s results and rejects non-results', task => {
 expect(validContextResult(task, structuredClone(outputs[task]))).toBe(true);
 expect(validContextResult(task, null)).toBe(false);
});
it('preserves native Map/Set contracts and rejects malformed nested reports', () => {
 expect(validContextResult('BUILD_PRESENCE_INDEX', { perChapterCounts: [], byEntity: {} })).toBe(false);
 expect(validContextResult('BUILD_PROSE_REPORT', { ...outputs.BUILD_PROSE_REPORT, chapters: [{ id: 1 }] })).toBe(false);
 expect(validContextResult('BUILD_PACING_REPORT', { ...outputs.BUILD_PACING_REPORT, peak: { level: 'high' } })).toBe(false);
 expect(isContextRequest({ type: 'BUILD_PROSE_REPORT', id: 1, payload: { chapters: [], language: 'id', excludeWords: ['A'] } })).toBe(false);
});
it('rejects mismatched result, malformed records, unknown messages and invalid progress', () => {
 expect(validContextResult('COUNT_TOKENS', '12')).toBe(false);
 expect(validContextResult('GET_CODEX_MATCHES', [{ start: 0, end: 3, codexId: undefined }])).toBe(false);
 expect(validContextResult('GET_RELEVANT_CONTEXT', [{ ...entry, aliases: 3 }])).toBe(false);
 expect(isContextRequest({ type: 'UNKNOWN', id: 1, payload: {} })).toBe(false);
 expect(isContextProgress({ type: 'embedding_progress', total: '1', completed: 0 })).toBe(false);
 expect(isContextProgress({ type: 'model_download', info: { status: 'progress', progress: 0 } })).toBe(true);
 expect(isContextRequest({ type: 'CANCEL', payload: { cancelId: 1 } })).toBe(true);
 expect(isContextRequest({ type: 'INDEX_MANUSCRIPT', payload: { projectId: 1, chapters: [{ content: '' }] } })).toBe(false);
});
