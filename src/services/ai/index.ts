import { readProviderPolicy, enforceProviderPolicy } from './providerPolicy';
import { StoryBibleRule, CodexEntry, ContextDepth, Relationship, ConsistencyFinding } from '@/src/types';
import { getRelevantContext, getRelevantBibleRules } from '@/src/services/contextEngine';
import { callProxy, getLightModelForProvider } from '@/src/services/ai/proxy';
import { GenerateParams, ChatParams, ConsistencyParams, AIRenderParams } from '@/src/services/ai/types';
import { ErrorService } from '@/src/services/errorService';
import { AI_PROMPTS, BIBLE_ASSIST_FIELD_GUIDE } from '@/src/lib/aiPrompts';
import { cleanRewriteOutput } from '@/src/lib/cleanRewriteOutput';
import { formatBibleBlock } from '@/src/lib/storyBible';
import { formatFieldsForAI } from '@/src/lib/codexFields';
import { buildCodexLoreString, buildRelationshipGraph } from '@/src/lib/loreFormat';
import { getMaxCachedLoreChars, getRewriteTemperature } from '@/src/lib/aiTuning';
import { CircuitBreaker } from '@/src/services/ai/circuitBreaker';
import { computeBackoffDelay, shouldAttemptFallback, selectFallbackProviders, rewriteDedupKey, parseJsonArray } from '@/src/services/ai/resilience';

export class AIError extends Error {
  code: string;
  provider?: string;
  
  constructor(message: string, code: string, provider?: string) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.name = 'AIError';
  }
}

// Satu tipe aksi bisa punya beberapa panggilan berjalan bersamaan, jadi simpan
// kumpulan controller per-tipe agar pembatalan & pembersihan tidak salah sasaran.
const abortControllers = new Map<string, Set<AbortController>>();

// Dedup rewrite konkuren: panggilan identik yang masih berjalan berbagi promise yang
// sama. Lihat catatan di processRewrite.
const inFlightRewrites = new Map<string, Promise<string>>();

function registerAbort(type: string, controller: AbortController) {
  let set = abortControllers.get(type);
  if (!set) {
    set = new Set();
    abortControllers.set(type, set);
  }
  set.add(controller);
}

function unregisterAbort(type: string, controller: AbortController) {
  const set = abortControllers.get(type);
  if (set) {
    set.delete(controller);
    if (set.size === 0) abortControllers.delete(type);
  }
}

export function cancelAI(type?: string) {
  if (type) {
    const set = abortControllers.get(type);
    if (set) {
      set.forEach(controller => controller.abort());
      abortControllers.delete(type);
    }
  } else {
    // Cancel all
    abortControllers.forEach(set => set.forEach(controller => controller.abort()));
    abortControllers.clear();
  }
}

const CACHE_SUPPORTED_PROVIDERS = ['google', 'claude', 'openrouter'];

export function isCacheSupported(provider: string): boolean {
  return CACHE_SUPPORTED_PROVIDERS.includes(provider.toLowerCase());
}

// Perkiraan jendela konteks (token) per provider — dipakai meter konteks sebagai
// denominator headroom. Nilai konservatif; model spesifik bisa berbeda, tapi cukup
// sebagai indikator visual "seberapa penuh konteks".
const PROVIDER_CONTEXT_WINDOW: Record<string, number> = {
  google: 2_000_000,
  claude: 200_000,
  openrouter: 128_000,
  openai: 128_000,
  groq: 128_000,
  huggingface: 128_000,
  ollama: 8_192,
};

export function getContextWindow(provider: string): number {
  return PROVIDER_CONTEXT_WINDOW[provider?.toLowerCase()] ?? 8_192;
}

/**
 * Mode caching: Story Bible + Codex diurutkan deterministik menjadi SEGMEN ber-tier
 * (stabil→volatil) agar system prompt statis & cache-able. Segmen 0 = Story Bible
 * (jarang berubah), segmen 1 = Codex lore + relationship graph (sering diedit). Proxy
 * memberi tiap segmen cache breakpoint sendiri sehingga edit satu entri Codex hanya
 * membatalkan segmen volatil; prefix Bible tetap hit (#P3). Join('\n\n') memulihkan blok
 * tunggal lama (dipakai jalur non-caching). Segmen byte-identik antar-aksi & antar-panggilan.
 */
function buildCachedContextSegments(bibleRules: StoryBibleRule[], codexEntries: CodexEntry[], relationships: Relationship[] = []): string[] {
  const sortedRules = [...bibleRules].sort((a, b) => a.key.localeCompare(b.key));
  const sortedCodex = [...codexEntries].sort((a, b) => a.name.localeCompare(b.name));

  const bibleString = formatBibleBlock(sortedRules) || 'No specific rules set.';
  // Format lore (entri `hidden` & `secret` TETAP diumpankan agar AI menangkap
  // kontradiksi/kebocoran) lewat SUMBER TUNGGAL `buildCodexLoreString` — dibagi dengan
  // meter token di contextWorker agar tak drift. Cap dipotong pada BATAS ENTRI.
  const lore = buildCodexLoreString(sortedCodex, getMaxCachedLoreChars());
  if (lore.truncated) {
    // Dulu `.substring()` memangkas senyap di tengah entri → entri huruf-akhir & blok
    // [RAHASIA…] hilang tanpa jejak. Kini potong di batas entri + peringatkan.
    console.warn(
      `[AI] KB lore terpotong: ${lore.includedCount}/${lore.totalCount} entri Codex termuat ` +
      `(cap ${getMaxCachedLoreChars()} char). Naikkan "cap lore cache" di Pengaturan → Optimasi AI Lanjutan.`
    );
  }
  const loreString = lore.text || 'No specific lore.';
  const graphString = buildRelationshipGraph(relationships, codexEntries);

  return [
    `STORY BIBLE:\n${bibleString}`,
    `CODEX LORE:\n${loreString}${graphString}`,
  ];
}

function getSettings() {
  const loadKey = (name: string) => {
    try {
      const session = sessionStorage.getItem(`ai_key_${name}`);
      if (session) return session;
      const stored = localStorage.getItem(`ai_key_${name}`);
      return stored ? atob(stored) : '';
    } catch (e) {
      return '';
    }
  };

  return {
    provider: localStorage.getItem('ai_provider') || 'google',
    contextDepth: (localStorage.getItem('ai_context_depth') as ContextDepth) || 'balanced',
    keys: {
      google: loadKey('google'),
      groq: loadKey('groq'),
      openrouter: loadKey('openrouter'),
      claude: loadKey('claude'),
      huggingface: loadKey('huggingface'),
      openai: loadKey('openai'),
      ollama: '' // Ollama doesn't use API key
    },
    models: {
      google: localStorage.getItem('ai_model_google') || '',
      groq: localStorage.getItem('ai_model_groq') || '',
      openrouter: localStorage.getItem('ai_model_openrouter') || '',
      claude: localStorage.getItem('ai_model_claude') || '',
      huggingface: localStorage.getItem('ai_model_huggingface') || '',
      openai: localStorage.getItem('ai_model_openai') || '',
      ollama: localStorage.getItem('ai_model_ollama') || ''
    }
  };
}

function buildContextBlock(rules: StoryBibleRule[], codex: CodexEntry[], relationships: Relationship[] = [], depth: ContextDepth = 'balanced'): string {
  // If depth is minimal, we only include the most core rules and no lore
  if (depth === 'minimal') {
    // Premis + Tema mengarahkan AI jauh lebih kuat daripada Judul; Judul sengaja
    // TIDAK disertakan di mode minimal (nyaris tak berguna untuk generasi).
    const coreKeys = ['__CORE_PREMISE__', '__GENRES__', '__TONES__', '__POV__', '__THEMES__'];
    const bible = formatBibleBlock(rules.filter(r => coreKeys.includes(r.key)));

    return bible ? `CORE RULES:\n${bible}` : '';
  }

  const bible = formatBibleBlock(rules) || 'No specific rules set.';

  let lore = 'No specific lore relevant to this passage.';
  let graph = '';
  
  if (codex.length > 0) {
    // Limits based on depth
    const MAX_LORE_CHARS = depth === 'deep' ? 4000 : 2500;
    const itemLimit = depth === 'deep' ? 1000 : 500; // Deep gets more detail per entry
    const subLimit = depth === 'deep' ? 300 : 150;

    let currentChars = 0;
    const loreParts: string[] = [];
    const includedCodexIds = new Set<number>();

    codex.forEach((e, index) => {
      if (currentChars >= MAX_LORE_CHARS) return;
      if (e.id) includedCodexIds.add(e.id);

      const limit = index < 3 ? itemLimit : subLimit;
      let desc = e.description.trim();
      if (desc.length > limit) {
        desc = desc.substring(0, limit) + '...';
      }

      let formattedEntry = `[${e.name}]: ${desc}`;
      // Template field per kategori (#17) — ringkas (satu baris) dalam anggaran karakter.
      const fields = formatFieldsForAI(e);
      if (fields) formattedEntry += ` {${fields.replace(/\n/g, '; ').substring(0, subLimit)}}`;
      // Kebenaran penulis (lihat buildCachedContextSegments) — ikut di jalur RAG legacy.
      if (e.secret?.trim()) formattedEntry += ` [RAHASIA PENULIS: ${e.secret.trim().substring(0, subLimit)}]`;

      if (currentChars + formattedEntry.length <= MAX_LORE_CHARS) {
        loreParts.push(formattedEntry);
        currentChars += formattedEntry.length + 1;
      }
    });

    if (loreParts.length > 0) {
      lore = loreParts.join('\n');
    }
    
    // Build Relationship Graph (Graph-RAG format), hanya relasi yang menyentuh codex relevan.
    if (relationships && relationships.length > 0) {
      const activeRelations = relationships.filter(r =>
        includedCodexIds.has(r.sourceId) || includedCodexIds.has(r.targetId)
      );
      graph = buildRelationshipGraph(activeRelations, codex);
    }
  }
  
  let block = `STORY BIBLE:\n${bible}\n\nCODEX LORE:\n${lore}${graph}`;
  return block;
}

const MAX_RETRIES = 3;
const FALLBACK_ORDER = ['openrouter', 'google', 'claude', 'groq', 'huggingface', 'openai']; // Ordered preference for fallback

// Tugas mekanis (bukan penulisan kreatif) dirutekan ke model tier-murah provider
// yang sama. rewrite/chat/expand tetap memakai model pilihan pengguna demi kualitas.
const LIGHT_TASK_ACTIONS = new Set(['extract', 'summarize']);

// Circuit breaker per-provider (logika inti + tes di ./circuitBreaker).
const CIRCUIT_OPEN_THRESHOLD = 3; // 3 consecutive failures to open circuit
const CIRCUIT_RESET_TIME = 1000 * 30; // 30 seconds
const breaker = new CircuitBreaker(CIRCUIT_OPEN_THRESHOLD, CIRCUIT_RESET_TIME);

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

async function callAIWithBackoff(
  params: AIRenderParams,
  provider: string,
  settings: ReturnType<typeof getSettings>,
  isFallback: boolean = false
): Promise<string> {
  let attempt = 1;
  // Hindari mutasi objek params milik pemanggil; resolusi model & key dilakukan lokal.
  let model = params.model || settings.models[provider as keyof typeof settings.models];
  // Routing per-tugas: tugas mekanis pakai model murah provider yang sama (kecuali
  // pemanggil sudah memaksa model tertentu lewat params.model).
  if (!params.model && params.actionType && LIGHT_TASK_ACTIONS.has(params.actionType)) {
    model = getLightModelForProvider(provider) || model;
  }
  const apiKey = settings.keys[provider as keyof typeof settings.keys];

  while (attempt <= MAX_RETRIES) {
    if (!breaker.check(provider)) {
      // Circuit terbuka: provider utama langsung dialihkan ke fallback; fallback digagalkan.
      if (isFallback) {
        throw new AIError(`Koneksi ${provider} terputus sementara (Circuit Open).`, 'CIRCUIT_OPEN', provider);
      }
      break;
    }

    try {
      enforceProviderPolicy(provider, isFallback);
      const result = await callProxy(provider, { ...params, model }, apiKey);

      breaker.recordSuccess(provider);
      return result;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        breaker.clearHalfOpen(provider); // jangan biarkan trial half-open menggantung karena pembatalan
        throw error;
      }

      if (error.code === 'PROVIDER_POLICY') throw new AIError(error.message, error.code, provider);
      breaker.recordFailure(provider);

      // Kunci salah / kuota habis: percuma diulang, lempar segera agar user tahu.
      if (error.code === 'INVALID_KEY' || error.code === 'QUOTA_EXCEEDED' || error.code === 'PROVIDER_POLICY') {
        throw new AIError(error.message, error.code, provider);
      }

      if (attempt < MAX_RETRIES) {
        const delay = computeBackoffDelay(attempt); // Exponential backoff: 2s, 4s, 8s + jitter
        if (params.onRetry) {
          params.onRetry(attempt, error, provider);
        }
        await wait(delay);
        attempt++;
      } else {
        if (isFallback) {
          throw new AIError(`Gagal menghubungi ${provider} setelah beberapa percobaan.`, error.code || 'API_ERROR', provider);
        } else {
          break; // Move to fallback logic outside this function
        }
      }
    }
  }
  
  throw new AIError(`Gagal menghubungi ${provider} setelah percobaan maksimal.`, 'TIMEOUT', provider);
}

export async function callAI(params: AIRenderParams): Promise<string> {
  const settings = getSettings();
  const provider = params.provider || settings.provider;
  
  try {
    return await callAIWithBackoff(params, provider, settings, false);
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    
    // Only attempt fallback if we know it's a connection/server/rate limit issue
    // NOT if there's no API key or Invalid API Key.
    if (error.code !== 'PROVIDER_POLICY' && shouldAttemptFallback(error.code) && !readProviderPolicy().localOnly) {
      const candidates = selectFallbackProviders(
        FALLBACK_ORDER,
        provider,
        (p) => readProviderPolicy().allowedFallbacks.includes(p) && !!settings.keys[p as keyof typeof settings.keys],
      );
      for (const fallback of candidates) {
        try {
          if (params.onRetry) params.onRetry(1, error, `${fallback} (Cadangan)`);
          const fallbackParams = { ...params, model: undefined, provider: fallback }; // let backup decide its own model
          return await callAIWithBackoff(fallbackParams, fallback, settings, true);
        } catch (fallbackError: any) {
          if (fallbackError.name === 'AbortError') throw fallbackError;
          continue; // Try next fallback
        }
      }
    }
    
    // If we land here, either all fallbacks failed or we didn't try
    const aiError = new AIError(
      error.message || 'AI processing failed', 
      error.code || 'API_ERROR',
      provider
    );

    // Metadata harus serializable untuk IndexedDB (structured clone): JANGAN sertakan
    // fungsi (onChunk/onRetry) atau AbortSignal, dan potong prompt agar tidak membengkak.
    ErrorService.log({
      message: aiError.message,
      type: 'error',
      source: `AI-Service (${provider})`,
      metadata: {
        provider,
        code: aiError.code,
        actionType: params.actionType,
        model: params.model,
        rawMessage: typeof error.rawMessage === 'string' ? error.rawMessage.slice(0, 1000) : undefined,
        promptPreview: params.userPrompt?.slice(0, 500)
      }
    });
    throw aiError;
  }
}

// Helper functions to deduplicate Boilerplate AI actions
interface AIExecutionParams {
  abortKey: string;
  actionType: AIRenderParams['actionType'];
  providerOverride?: string;
  buildPrompts: (ctx: { useCaching: boolean; settings: ReturnType<typeof getSettings>; provider: string }) => Promise<{
    systemInstruction: string;
    cachedContext?: string[];
    userPrompt: string;
  }>;
  callOptions?: Omit<AIRenderParams, 'systemInstruction'|'cachedContext'|'userPrompt'|'provider'|'signal'|'actionType'|'cacheable'>;
}

async function executeAIAction(config: AIExecutionParams): Promise<string> {
  const settings = getSettings();
  const provider = config.providerOverride || settings.provider;
  const useCaching = isCacheSupported(provider) && settings.contextDepth !== 'minimal';

  const { systemInstruction, cachedContext, userPrompt } = await config.buildPrompts({
    useCaching, settings, provider
  });

  const controller = new AbortController();
  registerAbort(config.abortKey, controller);
  
  try {
    return await callAI({
      ...(config.callOptions || {}),
      systemInstruction,
      cachedContext,
      userPrompt,
      provider,
      signal: controller.signal,
      actionType: config.actionType,
      cacheable: useCaching,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (error instanceof AIError) throw error;
    throw new AIError(error instanceof Error ? error.message : `AI action ${config.actionType} failed.`, 'API_ERROR');
  } finally {
    unregisterAbort(config.abortKey, controller);
  }
}

async function resolveContextBuilder(
  useCaching: boolean,
  depth: ContextDepth,
  rules: StoryBibleRule[],
  codex: CodexEntry[],
  rels: Relationship[],
  ragTargetText?: string
): Promise<{ cachedContext?: string[]; contextBlock?: string }> {
  if (useCaching) {
    return { cachedContext: buildCachedContextSegments(rules, codex, rels) };
  } else {
    if (ragTargetText) {
      const relevantCodex = await getRelevantContext(ragTargetText, codex);
      const relevantRules = await getRelevantBibleRules(ragTargetText, rules);
      return { contextBlock: buildContextBlock(relevantRules, relevantCodex, rels, depth) };
    } else {
      const kbSegments = buildCachedContextSegments(rules, codex, rels);
      return { contextBlock: kbSegments.join('\n\n') };
    }
  }
}

// Facade Methods

export async function processRewrite(params: GenerateParams): Promise<string> {
  const settings = getSettings();
  const provider = params.provider || settings.provider;

  // Dedup in-flight: panggilan rewrite identik yang masih berjalan berbagi promise yang
  // sama → cegah panggilan kembar (mis. trigger ganda tak sengaja). Panggilan BERURUTAN
  // tak terpengaruh karena entri terhapus saat selesai, jadi "regenerate" tetap memberi
  // variasi baru. Catatan: peserta kedua berbagi stream peserta pertama sehingga onChunk-nya
  // tak terpanggil — ia tetap menerima hasil final via promise. Cukup untuk kasus double-fire.
  const dedupKey = rewriteDedupKey(provider, params.action, params.prompt, params.selection);
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
          useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || [], textForRAG
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
        useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || [], textForRAG
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
function sanitizeFinding(raw: any): ConsistencyFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const quote = typeof raw.quote === 'string' ? raw.quote.trim() : '';
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : '';
  // Butuh minimal kutipan + penjelasan agar temuan bermakna & bisa dilacak penulis.
  if (!quote || !explanation) return null;

  const severity = ['high', 'medium', 'low'].includes(raw.severity) ? raw.severity : 'medium';
  return {
    severity,
    type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'Lainnya',
    quote: quote.slice(0, 500),
    conflictsWith: typeof raw.conflictsWith === 'string' ? raw.conflictsWith.trim().slice(0, 500) : '',
    explanation: explanation.slice(0, 1000),
    suggestion: typeof raw.suggestion === 'string' ? raw.suggestion.trim().slice(0, 1000) : ''
  };
}

/**
 * Memeriksa satu bab terhadap knowledge base (Story Bible + Codex + relasi) dan
 * logika internalnya, lalu mengembalikan daftar temuan inkonsistensi terstruktur.
 * Selalu mengirim knowledge base penuh (bukan RAG-filtered) karena pengecekan
 * harus melihat seluruh entri untuk menangkap kontradiksi.
 */
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
        useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || []
      );
      
      const timelineBlock = params.timelineSummary && params.timelineSummary.trim()
        ? `\n\nSTORY TIMELINE (urutan kronologis peristiwa cerita):\n${params.timelineSummary.trim()}`
        : '';
        
      const systemInstruction = AI_PROMPTS.CONSISTENCY.SYSTEM(contextBlock ? contextBlock + timelineBlock : undefined) + (contextBlock ? '' : timelineBlock);
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
export interface CodexAuditFinding {
  severity: 'high' | 'medium' | 'low';
  type: string;
  issue: string;
  conflictsWith?: string;
  suggestion?: string;
}

function sanitizeAuditFinding(raw: any): CodexAuditFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const issue = typeof raw.issue === 'string' ? raw.issue.trim() : '';
  if (!issue) return null; // tanpa deskripsi masalah, temuan tak bermakna
  const severity = ['high', 'medium', 'low'].includes(raw.severity) ? raw.severity : 'medium';
  return {
    severity,
    type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'Lainnya',
    issue: issue.slice(0, 1000),
    conflictsWith: typeof raw.conflictsWith === 'string' ? raw.conflictsWith.trim().slice(0, 500) : undefined,
    suggestion: typeof raw.suggestion === 'string' ? raw.suggestion.trim().slice(0, 1000) : undefined,
  };
}

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
        useCaching, settings.contextDepth, params.bibleRules, params.codexEntries, params.relationships || []
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
    if (!raw || typeof raw !== 'object') continue;
    const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!rawName) continue;
    const name = requestedByLower.get(rawName.toLowerCase()) || rawName;
    const category = ENRICH_CATEGORIES.has(raw.category) ? raw.category : 'other';
    const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 1000) : '';
    const aliases = Array.isArray(raw.aliases)
      ? raw.aliases.filter((a: any) => typeof a === 'string' && a.trim()).map((a: string) => a.trim()).slice(0, 10)
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
function stripWrappers(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  if (t.length > 1 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”')))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * AI-assist Story Bible: menghasilkan draf SATU bidang (premis/latar/tema/…) yang
 * konsisten dengan profil cerita yang sudah diisi. Bidang target dikecualikan dari
 * profil agar model tak sekadar menyalinnya. Kreatif namun ter-grounded (temp 0.8),
 * dirutekan ke model penuh (actionType 'expand'). Bisa dibatalkan lewat cancelAI('bible-assist').
 */
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
    console.error(`Connection test failed for ${provider}:`, error);
    throw error;
  }
}

