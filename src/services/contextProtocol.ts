import { isCodexData as codex } from '@/src/lib/codexContracts';
import { record, finite, requestId } from '@/src/lib/dataContracts';
export { record, finite, requestId } from '@/src/lib/dataContracts';
import type { CodexEntry, StoryBibleRule } from '@/src/types';
import type { ContinuityChapter, PresenceIndex } from '@/src/lib/continuity';
import type { ProseChapter, ProseLanguage, ProseReport } from '@/src/lib/proseAnalysis';
import type { ChapterTensionInput, PacingReport } from '@/src/lib/pacingHeatmap';

export interface SceneSearchHit { chapterId: number; chunkIndex: number; snippet: string; score: number }
export interface CodexMatch { start: number; end: number; codexId: number }
export interface TokenEstimate { textTokens: number; codexTokens: number; rulesTokens: number }
export interface ContextPayloads {
  SEARCH_MANUSCRIPT: { projectId: number; query: string; topK?: number };
  GET_RELEVANT_CONTEXT: { text: string; allCodex: CodexEntry[] };
  GET_CODEX_MATCHES: { chunks: { pos: number; text: string }[]; allCodex: CodexEntry[] };
  GET_RELEVANT_BIBLE_RULES: { text: string; allRules: StoryBibleRule[]; maxChars: number };
  INVALIDATE_CACHE: { deep?: boolean };
  SCAN_APPEARANCES: { entry: CodexEntry; chapters: Pick<ContinuityChapter, 'id' | 'content'>[] };
  COUNT_TOKENS: { text: string; model?: string };
  BUILD_PRESENCE_INDEX: { chapters: ContinuityChapter[]; codexEntries: CodexEntry[] };
  BUILD_PROSE_REPORT: { chapters: ProseChapter[]; language: ProseLanguage; excludeWords?: Set<string> };
  BUILD_PACING_REPORT: { chapters: ChapterTensionInput[] };
  ESTIMATE_CONTEXT_TOKENS: { text: string; codexText: string; rulesText: string; model?: string };
  PREVIEW_CONTEXT_TOKENS: { text: string; projectId: number; model?: string; fullContext?: boolean; maxCachedLoreChars?: number; chapterId?: number };
}
export interface ContextResults {
  SEARCH_MANUSCRIPT: SceneSearchHit[];
  GET_RELEVANT_CONTEXT: CodexEntry[];
  GET_CODEX_MATCHES: CodexMatch[];
  GET_RELEVANT_BIBLE_RULES: StoryBibleRule[];
  INVALIDATE_CACHE: { success: true };
  SCAN_APPEARANCES: number[];
  COUNT_TOKENS: number;
  BUILD_PRESENCE_INDEX: PresenceIndex;
  BUILD_PROSE_REPORT: ProseReport;
  BUILD_PACING_REPORT: PacingReport;
  ESTIMATE_CONTEXT_TOKENS: TokenEstimate;
  PREVIEW_CONTEXT_TOKENS: TokenEstimate & { totalTokens: number };
}
export type ContextTaskType = keyof ContextPayloads;
export type ContextRequest<K extends ContextTaskType = ContextTaskType> = { [T in K]: { type: T; id: number; payload: ContextPayloads[T] } }[K];
export type ContextWorkerMessage = ContextRequest | { type: 'CANCEL'; payload: { cancelId: number } } | { type: 'INDEX_MANUSCRIPT'; payload: { projectId: number; chapters: { id: number; content: string }[] } };
export type ContextProgress =
 | { type: 'model_download'; info: unknown }
 | { type: 'embedding_start' | 'embedding_progress' | 'manuscript_index_progress'; total: number; completed: number }
 | { type: 'embedding_done' }
 | { type: 'embedding_error' | 'manuscript_index_error'; message: string }
 | { type: 'manuscript_index_start'; total: number; completed: number; totalChunks: number }
 | { type: 'manuscript_index_done'; totalChunks: number; embedded: number; pruned: number };
export type ContextReply<K extends ContextTaskType> = { id: number; result: ContextResults[K] } | { id: number; error: string };
export function cancelContextRequest(cancelId: number): ContextWorkerMessage { return { type: 'CANCEL', payload: { cancelId } }; }

const list = (value: unknown, check: (item: unknown) => boolean) => Array.isArray(value) && value.every(check);

const chapter = (value: unknown) => record(value) && requestId(value.id) && typeof value.content === 'string';
const titledChapter = (value: unknown) => chapter(value) && record(value) && typeof value.title === 'string';
const rule = (value: unknown) => record(value) && requestId(value.projectId) && typeof value.key === 'string' && typeof value.instruction === 'string';
const optional = (value: unknown, check: (item: unknown) => boolean) => value === undefined || check(value);
const text = (value: unknown) => typeof value === 'string';
const boolean = (value: unknown) => typeof value === 'boolean';
export function isContextRequest(value: unknown): value is ContextWorkerMessage {
  if (!record(value) || !record(value.payload)) return false;
  const p = value.payload;
  if (value.type === 'CANCEL') return requestId(p.cancelId);
  if (value.type === 'INDEX_MANUSCRIPT') return requestId(p.projectId) && list(p.chapters, chapter);
  if (!requestId(value.id)) return false;
  switch (value.type) {
    case 'COUNT_TOKENS': return text(p.text) && optional(p.model, text);
    case 'SEARCH_MANUSCRIPT': return requestId(p.projectId) && text(p.query) && optional(p.topK, finite);
    case 'GET_RELEVANT_CONTEXT': return text(p.text) && list(p.allCodex, codex);
    case 'GET_CODEX_MATCHES': return list(p.allCodex, codex) && list(p.chunks, item => record(item) && finite(item.pos) && text(item.text));
    case 'GET_RELEVANT_BIBLE_RULES': return text(p.text) && list(p.allRules, rule) && finite(p.maxChars);
    case 'INVALIDATE_CACHE': return optional(p.deep, boolean);
    case 'SCAN_APPEARANCES': return codex(p.entry) && list(p.chapters, chapter);
    case 'BUILD_PRESENCE_INDEX': return list(p.chapters, titledChapter) && list(p.codexEntries, codex);
    case 'BUILD_PROSE_REPORT': return list(p.chapters, titledChapter) && (p.language === 'en' || p.language === 'id') && optional(p.excludeWords, item => item instanceof Set && [...item].every(text));
    case 'BUILD_PACING_REPORT': return list(p.chapters, item => titledChapter(item) && record(item) && optional(item.tension, level => finite(level) && Number.isInteger(level) && level >= 1 && level <= 5));
    case 'ESTIMATE_CONTEXT_TOKENS': return text(p.text) && text(p.codexText) && text(p.rulesText) && optional(p.model, text);
    case 'PREVIEW_CONTEXT_TOKENS': return text(p.text) && requestId(p.projectId) && optional(p.model, text) && optional(p.fullContext, boolean) && optional(p.maxCachedLoreChars, finite) && optional(p.chapterId, requestId);
    default: return false;
  }
}
const numbers = (value: unknown, fields: string[]) => record(value) && fields.every(key => finite(value[key]));
const proseRow = (value: unknown) => record(value) && requestId(value.id) && text(value.title) && numbers(value, ['index', 'dialogueRatio']) && numbers(value.metrics, ['wordCount','sentenceCount','avgSentenceLength','longSentences','passiveVoiceCount','adverbCount','readabilityScore']);
const tensionRow = (value: unknown) => record(value) && requestId(value.id) && text(value.title) && numbers(value, ['index','level','score','wordCount']) && boolean(value.suggested);
const tensionRun = (value: unknown) => numbers(value, ['startIndex','endIndex','length']);
export function validContextResult<K extends ContextTaskType>(task: K, value: unknown): value is ContextResults[K] {
  switch (task) {
    case 'COUNT_TOKENS': return finite(value) && value >= 0;
    case 'GET_RELEVANT_CONTEXT': return list(value, codex);
    case 'GET_RELEVANT_BIBLE_RULES': return list(value, rule);
    case 'SCAN_APPEARANCES': return list(value, requestId);
    case 'SEARCH_MANUSCRIPT': return list(value, item => record(item) && requestId(item.chapterId) && finite(item.chunkIndex) && text(item.snippet) && finite(item.score));
    case 'GET_CODEX_MATCHES': return list(value, item => record(item) && finite(item.start) && finite(item.end) && requestId(item.codexId));
    case 'INVALIDATE_CACHE': return record(value) && value.success === true;
    case 'BUILD_PRESENCE_INDEX': return record(value) && Array.isArray(value.perChapterCounts) && value.perChapterCounts.every(item => item instanceof Map && [...item].every(([key, count]) => requestId(key) && finite(count))) && value.byEntity instanceof Map && [...value.byEntity].every(([key, item]) => requestId(key) && record(item) && list(item.indices, finite) && finite(item.mentions));
    case 'BUILD_PROSE_REPORT': return record(value) && list(value.chapters, proseRow) && list(value.echoWords, item => record(item) && text(item.word) && numbers(item, ['total','chapters','per1000'])) && list(value.proximityEchoes, item => record(item) && text(item.id) && text(item.word) && text(item.chapterTitle) && text(item.excerpt) && numbers(item, ['chapterId','chapterIndex','distance'])) && ['totalWords','avgReadability','avgSentenceLength','totalPassive','totalAdverbs','totalLongSentences','chapterCount'].every(key => finite(value[key]));
    case 'BUILD_PACING_REPORT': return record(value) && list(value.chapters, tensionRow) && list(value.plateaus, tensionRun) && list(value.valleys, tensionRun) && (value.peak === null || tensionRow(value.peak)) && (value.quiet === null || tensionRow(value.quiet)) && ['chapterCount','avgScore','suggestedCount'].every(key => finite(value[key]));
    default: return record(value) && ['textTokens','codexTokens','rulesTokens', ...(task === 'PREVIEW_CONTEXT_TOKENS' ? ['totalTokens'] : [])].every(key => finite(value[key]) && Number(value[key]) >= 0);
  }
}
export function isContextProgress(value: unknown): value is ContextProgress {
  if (!record(value)) return false;
  switch (value.type) {
    case 'model_download': return 'info' in value;
    case 'embedding_done': return true;
    case 'embedding_error': case 'manuscript_index_error': return text(value.message);
    case 'embedding_start': case 'embedding_progress': case 'manuscript_index_progress': return finite(value.total) && finite(value.completed);
    case 'manuscript_index_start': return finite(value.total) && finite(value.completed) && finite(value.totalChunks);
    case 'manuscript_index_done': return finite(value.totalChunks) && finite(value.embedded) && finite(value.pruned);
    default: return false;
  }
}
