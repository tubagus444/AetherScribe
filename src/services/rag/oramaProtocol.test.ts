import { expect, it } from 'vitest';
import { isOramaMessage, isOramaReply, validOramaResult } from './oramaProtocol';
const entry = { id: 1, projectId: 1, name: 'Ada', aliases: [], tags: [], category: 'character', description: '' };
it.each([
 { type: 'INIT_ORAMA', payload: { projectId: 1 } }, { type: 'INDEX_ENTRY', payload: { entry } },
 { type: 'UPDATE_ENTRY', payload: { entry } }, { type: 'REMOVE_ENTRY', payload: { dexieId: 1 } },
 { type: 'SEARCH', id: 1, payload: { query: '', limit: 5 } }, { type: 'SEARCH_WITH_SCORES', id: 1, payload: { projectId: 1, query: '', limit: 5 } },
])('accepts $type and rejects a malformed payload', request => {
 expect(isOramaMessage(request)).toBe(true); expect(isOramaMessage({ ...request, payload: {} })).toBe(false);
});
it('correlates scored/plain results and validates mutation error retry contracts', () => {
 expect(validOramaResult('SEARCH', [entry])).toBe(true);
 expect(validOramaResult('SEARCH_WITH_SCORES', [{ entry, score: 0 }])).toBe(true);
 expect(validOramaResult('SEARCH_WITH_SCORES', [entry])).toBe(false);
 expect(isOramaReply({ type: 'MUTATION_ERROR', op: 'REMOVE_ENTRY', payload: { dexieId: 1 }, retry: 1, error: 'fixture' })).toBe(true);
 expect(isOramaReply({ type: 'MUTATION_ERROR', op: 'UNKNOWN', payload: {}, error: 'fixture' })).toBe(false);
 expect(isOramaReply({ type: 'SEARCH_RESULT', id: 1, result: 'bad' })).toBe(false);
});
