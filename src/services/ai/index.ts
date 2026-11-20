import { getSettings } from './settings';
import { formatBibleBlock } from '@/src/lib/storyBible';
import { sanitizeFinding, sanitizeAuditFinding, stripWrappers, type CodexAuditFinding } from './resultParsing';
export type { CodexAuditFinding } from './resultParsing';
import { record } from '@/src/lib/dataContracts';
import { StoryBibleRule, CodexEntry, Relationship, ConsistencyFinding } from '@/src/types';
import { callProxy } from '@/src/services/ai/proxy';
import { GenerateParams, ChatParams, ConsistencyParams, AIRenderParams } from '@/src/services/ai/types';
import { AI_PROMPTS, BIBLE_ASSIST_FIELD_GUIDE } from '@/src/lib/aiPrompts';
import { cleanRewriteOutput } from '@/src/lib/cleanRewriteOutput';
import { getRewriteTemperature } from '@/src/lib/aiTuning';
import { rewriteDedupKey, parseJsonArray } from '@/src/services/ai/resilience';
import { AIError } from './dispatch';
export { AIError, callAI } from './dispatch';
import { executeAIAction } from './execution';
export { cancelAI } from './execution';
import { resolveContextBuilder } from './context';
export { isCacheSupported, getContextWindow } from './context';
const inFlightRewrites = new Map<string, Promise<string>>();

// Facade Methods

export async function processRewrite(params: GenerateParams): Promise<string> {
  const settings = getSettings();
  const provider = params.provider || settings.provider;

  // Dedup in-flight: panggilan rewrite identik yang masih berjalan berbagi promise yang
  // sama → cegah panggilan kembar (mis. trigger ganda tak sengaja). Panggilan BERURUTAN
  // tak terpengaruh karena entri terhapus saat selesai, jadi "regenerate" tetap memberi
  // variasi baru. Catatan: peserta kedua berbagi stream peserta pertama sehingga onChunk-nya
  // tak terpanggil — ia tetap menerima hasil final via promise. Cukup untuk kasus double-fire.
  const dedupKey = rewriteDedupKey(provider, params.action, params.prompt, params.selection, params.chapterId);
  const existing = inFlightRewrites.get(dedupKey);
  if (existing) return existing;

  const task = (async (): Promise<string> => {
    const res = await executeAIAction({
      abortKey: 'rewrite',
      actionType: 'rewrite',
      providerOverride: params.provider,
      buildPrompts: async ({ useCaching, settings }) => {
        let textForRAG = params.ragContextText ? params.ragContextText + '\n' + params.selection : params.selection;
        let relevantScenesText = '';
        if (params.contextText && params.contextText.length > 500) {
           const { splitIntoScenes, getRelevantScenes, buildExcerptContext } = await import('@/src/lib/chunkEngine');
           const scenes = splitIntoScenes(params.contextText);
           const relevantScenes = getRelevantScenes(params.selection, scenes, params.codexEntries);
           if (relevantScenes.length > 0) {
              relevantScenesText = buildExcerptContext(relevantScenes);
              textForRAG += '\n' + relevantScenesText;
           }
        } else if (params.contextText) {
           textForRAG += '\n' + params.contextText;
        }

        const { cachedContext, contextBlock } = await resolveContextBuilder(
          useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || [], textForRAG, { chapterId: params.chapterId }
        );
        const systemInstruction = AI_PROMPTS.REWRITE.SYSTEM(contextBlock);

        let userPrompt = AI_PROMPTS.REWRITE.USER(params.action, params.selection, params.prompt);
        if (relevantScenesText) {
          userPrompt = `RELEVANT CHAPTER SCENES:\n${relevantScenesText}\n\n${userPrompt}`;
        }

        return { systemInstruction, cachedContext, userPrompt };
      },
      callOptions: {
        temperature: getRewriteTemperature(),
        maxTokens: Math.min(4000, Math.max(512, Math.ceil(Math.ceil((params.selection?.length || 0) / 4) * 2.5))),
        stream: params.stream,
        onChunk: params.onChunk,
        onRetry: params.onRetry
      }
    });
    return cleanRewriteOutput(res);
  })();

  inFlightRewrites.set(dedupKey, task);
  try {
    return await task;
  } finally {
    inFlightRewrites.delete(dedupKey);
  }
}

export async function processChat(params: ChatParams): Promise<string> {
  return executeAIAction({
    abortKey: 'chat',
    actionType: 'chat',
    providerOverride: params.provider,
    buildPrompts: async ({ useCaching, settings }) => {
      let textForRAG = params.message;
      let relevantScenesText = '';
      let draftSnippet = params.contextText?.substring(0, 3000) || '';
      
      if (params.contextText && params.contextText.length > 1000 && params.sessionMode !== 'plot-check') {
         const { splitIntoScenes, getRelevantScenes, buildExcerptContext, getLastScene } = await import('@/src/lib/chunkEngine');
         const scenes = splitIntoScenes(params.contextText);
         const relevantScenes = getRelevantScenes(params.message, scenes, params.codexEntries);
         
         if (relevantScenes.length > 0) {
            relevantScenesText = buildExcerptContext(relevantScenes);
            textForRAG += '\n' + relevantScenesText;
            draftSnippet = relevantScenesText; // Only send relevant scenes to AI instead of 3000 chars
         } else {
            const lastScene = getLastScene(scenes);
            if (lastScene) {
              relevantScenesText = buildExcerptContext([lastScene]);
              textForRAG += '\n' + relevantScenesText;
              draftSnippet = relevantScenesText;
            }
         }
      } else {
         textForRAG += ' ' + (params.contextText || '');
      }

      const { cachedContext, contextBlock } = await resolveContextBuilder(
        useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || [], textForRAG, { chapterId: params.chapterId }
      );
      
      let systemInstruction = AI_PROMPTS.CHAT.SYSTEM(contextBlock, params.sessionMode);
      if (params.extraSystem) {
        systemInstruction += '\n\n' + params.extraSystem;
      }
      
      const userPrompt = AI_PROMPTS.CHAT.USER(params.message, draftSnippet);
      
      return { systemInstruction, cachedContext, userPrompt };
    },
    callOptions: {
      history: params.history,
      temperature: 0.7,
      maxTokens: 2048,
      stream: params.stream,
      onChunk: params.onChunk,
        onRetry: params.onRetry
    }
  });
}

// Plafon teks bab yang dikirim untuk pengecekan konsistensi (~12k token).
// Bab lebih panjang dipotong; UI memberi tahu pengguna bila terjadi pemotongan.
const MAX_CONSISTENCY_CHARS = 48000;

/** Membersihkan & memvalidasi satu temuan mentah dari model menjadi ConsistencyFinding. */
export async function checkConsistency(params: ConsistencyParams): Promise<{ findings: ConsistencyFinding[]; truncated: boolean }> {
  const fullText = params.chapterText || '';
  const truncated = fullText.length > MAX_CONSISTENCY_CHARS;
  const chapterText = truncated ? fullText.slice(0, MAX_CONSISTENCY_CHARS) : fullText;

  const res = await executeAIAction({
    abortKey: params.actionType || 'consistency',
    actionType: 'consistency',
    providerOverride: params.provider,
    buildPrompts: async ({ useCaching, settings }) => {
      const { cachedContext, contextBlock } = await resolveContextBuilder(
        useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || [], undefined,
        { chapterId: params.chapterId, history: params.includeDetailHistory },
      );
      
      const timelineBlock = params.timelineSummary && params.timelineSummary.trim()
        ? `\n\nSTORY TIMELINE (urutan kronologis peristiwa cerita):\n${params.timelineSummary.trim()}`
        : '';
        
      const historyGuide = params.includeDetailHistory
        ? '\n\nWhen Codex details include a chapter history, compare the passage with the value valid in its chapter. Later changes do not contradict earlier states.'
        : '';
      const systemInstruction = AI_PROMPTS.CONSISTENCY.SYSTEM(contextBlock ? contextBlock + timelineBlock : undefined) + (contextBlock ? '' : timelineBlock) + historyGuide;
      const userPrompt = AI_PROMPTS.CONSISTENCY.USER(params.chapterTitle || '', chapterText);
      
      return { systemInstruction, cachedContext, userPrompt };
    },
    callOptions: {
      temperature: 0.2, // analitis: minim kreativitas, maksimal konsistensi
      maxTokens: 2048,
      onRetry: params.onRetry
    }
  });

  const findings = parseJsonArray(res)
    .map(sanitizeFinding)
    .filter((f): f is ConsistencyFinding => f !== null);
  return { findings, truncated };
}

/** Satu temuan audit konsistensi untuk SATU entri Codex (lapis 1: vs lore terstruktur). */
export interface CodexAuditParams {
  entry: { name: string; category: string; aliases?: string[]; description: string };
  codexEntries: CodexEntry[];
  bibleRules: StoryBibleRule[];
  relationships?: Relationship[];
  /**
   * LAPIS 2: cuplikan prosa bab tempat entitas muncul. Bila diisi, audit
   * membandingkan entri vs prosa (kontradiksi penampilan/perilaku/fakta),
   * bukan sekadar vs lore terstruktur.
   */
  chapterExcerpts?: string;
  provider?: string;
  onRetry?: (attempt: number, error: any, provider: string) => void;
}

/**
 * Audit konsistensi satu entri Codex.
 * - LAPIS 1 (default): entri vs SELURUH knowledge base terstruktur (Bible+Codex+relasi).
 * - LAPIS 2 (bila `chapterExcerpts` diisi): entri vs prosa bab tempat entitas muncul.
 * Abort key terpisah ('codex-audit') agar tak saling batal dengan audit bab.
 */
export async function auditCodexEntry(params: CodexAuditParams): Promise<CodexAuditFinding[]> {
  const deep = !!params.chapterExcerpts?.trim();
  const prompt = deep ? AI_PROMPTS.AUDIT_CODEX_DEEP : AI_PROMPTS.AUDIT_CODEX;

  const res = await executeAIAction({
    abortKey: 'codex-audit',
    actionType: 'consistency',
    providerOverride: params.provider,
    buildPrompts: async ({ useCaching, settings }) => {
      const { cachedContext, contextBlock } = await resolveContextBuilder(
        useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || [], undefined, { history: deep }
      );
      
      const systemInstruction = useCaching ? prompt.SYSTEM() : prompt.SYSTEM(contextBlock);
      const userPrompt = deep
        ? AI_PROMPTS.AUDIT_CODEX_DEEP.USER(params.entry, params.chapterExcerpts!.trim())
        : AI_PROMPTS.AUDIT_CODEX.USER(params.entry);
        
      return { systemInstruction, cachedContext, userPrompt };
    },
    callOptions: {
      temperature: 0.2, // analitis: minim kreativitas
      maxTokens: deep ? 2000 : 1500,
      onRetry: params.onRetry,
    }
  });

  return parseJsonArray(res)
    .map(sanitizeAuditFinding)
    .filter((f): f is CodexAuditFinding => f !== null);
}

const ENRICH_CATEGORIES = new Set(['character', 'location', 'item', 'magic', 'event', 'other']);

export interface EnrichedEntity {
  name: string;
  category: string;
  description: string;
  aliases: string[];
}

/**
 * Enrichment Codex berbasis manuskrip (grounded): diberi daftar entitas + cuplikan
 * konteksnya, AI mengembalikan kategori + deskripsi + alias yang SETIA pada teks.
 * Dirutekan ke model murah (actionType 'extract') dan dipakai on-demand saja.
 * Mode batch (banyak entitas sekaligus) mengamortisasi system prompt → hemat token.
 */
export async function enrichEntities(
  items: { name: string; excerpts: string }[],
  bibleRules: StoryBibleRule[]
): Promise<EnrichedEntity[]> {
  if (!items || items.length === 0) return [];
  const maxTokens = Math.min(4000, Math.max(600, items.length * 220 + 400));
  const requestedByLower = new Map(items.map(it => [it.name.toLowerCase(), it.name]));

  const res = await executeAIAction({
    abortKey: 'extract',
    actionType: 'extract',
    buildPrompts: async ({ useCaching, settings }) => {
      const { cachedContext, contextBlock } = await resolveContextBuilder(
        useCaching, settings.contextDepth, bibleRules, [], []
      );
      return {
        systemInstruction: AI_PROMPTS.ENRICH_CODEX.SYSTEM(contextBlock),
        cachedContext,
        userPrompt: AI_PROMPTS.ENRICH_CODEX.USER(items)
      };
    },
    callOptions: {
      temperature: 0.3,
      maxTokens
    }
  });

  const arr = parseJsonArray(res);
  const out: EnrichedEntity[] = [];
  for (const raw of arr) {
    if (!record(raw)) continue;
    const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!rawName) continue;
    const name = requestedByLower.get(rawName.toLowerCase()) || rawName;
    const category = typeof raw.category === 'string' && ENRICH_CATEGORIES.has(raw.category) ? raw.category : 'other';
    const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 1000) : '';
    const aliases = Array.isArray(raw.aliases)
      ? raw.aliases.filter((alias): alias is string => typeof alias === 'string' && !!alias.trim()).map(alias => alias.trim()).slice(0, 10)
      : [];
    out.push({ name, category, description, aliases });
  }
  return out;
}

export async function expandCodexEntry(
  name: string,
  category: string,
  currentDescription: string,
  bibleRules: StoryBibleRule[]
  ): Promise<string> {
  return executeAIAction({
    abortKey: 'expand',
    actionType: 'expand',
    buildPrompts: async ({ useCaching, settings }) => {
      const { cachedContext, contextBlock } = await resolveContextBuilder(
        useCaching, settings.contextDepth, bibleRules, [], []
      );
      return {
        systemInstruction: AI_PROMPTS.EXPAND_CODEX.SYSTEM(contextBlock),
        cachedContext,
        userPrompt: AI_PROMPTS.EXPAND_CODEX.USER(name, category, currentDescription)
      };
    },
    callOptions: {
      temperature: 0.9,
      maxTokens: 1000
    }
  });
}

export type BibleAssistField = 'tagline' | 'premise' | 'setting' | 'themes' | 'targetAudience';

export interface BibleContextInput {
  title?: string;
  tagline?: string;
  genres?: string[];
  tones?: string[];
  pov?: string;
  pacing?: string;
  premise?: string;
  setting?: string;
  themes?: string;
  targetAudience?: string;
}

/** Bidang assist → key Story Bible di DB (dipakai untuk mengecualikan bidang target dari profil). */
const BIBLE_FIELD_TO_KEY: Record<BibleAssistField, string> = {
  tagline: '__STORY_TAGLINE__',
  premise: '__CORE_PREMISE__',
  setting: '__WORLD_SETTING__',
  themes: '__THEMES__',
  targetAudience: '__TARGET_AUDIENCE__',
};

/** Membersihkan output model dari code fence / tanda kutip pembungkus yang kadang lolos. */
export async function suggestBibleField(field: BibleAssistField, ctx: BibleContextInput): Promise<string> {
  const guide = BIBLE_ASSIST_FIELD_GUIDE[field];
  if (!guide) throw new AIError('Bidang Story Bible tidak dikenal.', 'API_ERROR');

  const targetKey = BIBLE_FIELD_TO_KEY[field];
  // Susun profil dari bidang yang TERISI, kecuali bidang target itu sendiri.
  const rules: { key: string; instruction: string }[] = [
    { key: '__STORY_TITLE__', instruction: ctx.title || '' },
    { key: '__STORY_TAGLINE__', instruction: ctx.tagline || '' },
    { key: '__GENRES__', instruction: JSON.stringify(ctx.genres || []) },
    { key: '__TONES__', instruction: JSON.stringify(ctx.tones || []) },
    { key: '__POV__', instruction: ctx.pov || '' },
    { key: '__PACING__', instruction: ctx.pacing || '' },
    { key: '__CORE_PREMISE__', instruction: ctx.premise || '' },
    { key: '__WORLD_SETTING__', instruction: ctx.setting || '' },
    { key: '__THEMES__', instruction: ctx.themes || '' },
    { key: '__TARGET_AUDIENCE__', instruction: ctx.targetAudience || '' },
  ].filter(r => r.key !== targetKey);

  const profileBlock = formatBibleBlock(rules);
  const res = await executeAIAction({
    abortKey: 'bible-assist',
    actionType: 'expand',
    buildPrompts: async () => ({
      systemInstruction: AI_PROMPTS.BIBLE_ASSIST.SYSTEM(),
      userPrompt: AI_PROMPTS.BIBLE_ASSIST.USER(guide.label, guide.guide, profileBlock)
    }),
    callOptions: {
      temperature: 0.8,
      maxTokens: 800
    }
  });

  return stripWrappers(res);
}

export async function testConnection(provider: string, apiKey: string, model?: string): Promise<boolean> {
  try {
    const params: AIRenderParams = {
      systemInstruction: AI_PROMPTS.TEST_CONNECTION.SYSTEM(),
      userPrompt: AI_PROMPTS.TEST_CONNECTION.USER(),
      temperature: 0.1,
      model: model || undefined
    };

    let result = '';
    result = await callProxy(provider, params, apiKey);
    
    return result.includes('OK') || result.length > 0;
  } catch (error) {
    console.error('Connection test failed; sensitive details omitted.');
    throw error;
  }
}

