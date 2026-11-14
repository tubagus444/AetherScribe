import { cancelContextRequest, type ContextTaskType, type ContextWorkerMessage } from './contextProtocol';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '@/src/db';
import { CodexEntry, StoryBibleRule, Relationship } from '@/src/types';
import ContextWorker from '@/src/services/contextWorker?worker';
import { oramaSync } from '@/src/services/rag/oramaSync';
import { getMaxCachedLoreChars } from '@/src/lib/aiTuning';
import type { ContinuityChapter, PresenceIndex } from '@/src/lib/continuity';
import type { ProseReport, ProseLanguage, ProseChapter } from '@/src/lib/proseAnalysis';
import type { PacingReport, ChapterTensionInput } from '@/src/lib/pacingHeatmap';

// Worker instance and communication state
let worker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void, resetTimeout: () => void }>();

const WORKER_IDLE_TIMEOUT_MS = 30000;

function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  const error = new Error('Context worker was terminated or crashed');
  pendingRequests.forEach(deferred => deferred.reject(error));
  pendingRequests.clear();
}

let lastCrashTime = 0;

function getWorker(): Worker {
  if (!worker) {
    if (Date.now() - lastCrashTime < 2000) {
      throw new Error('Context worker is crash-looping. Please wait before retrying.');
    }
    worker = new ContextWorker();
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error, type, payload } = e.data;
      if (type === 'PROGRESS') {
        window.dispatchEvent(new CustomEvent('semantic-indexing-progress', { detail: payload }));
        // Heartbeat: worker sedang bekerja (unduh model / embedding) → perpanjang timeout
        // SEMUA request tertunda. Tanpa ini, query sah yang antre di belakang indexing
        // perdana (yang bisa >30 dtk) gagal timeout spurious walau worker sehat.
        pendingRequests.forEach((p) => p.resetTimeout());
        return;
      }
      const deferred = pendingRequests.get(id);
      if (deferred) {
        pendingRequests.delete(id);
        if (error) deferred.reject(new Error(error));
        else deferred.resolve(result);
      }
    };
    worker.onerror = (e) => {
      // C11: JANGAN re-dispatch ErrorEvent('error') ke window — itu memicu handler
      // error global (main.tsx) dan bisa menggandakan log / berisiko loop. Cukup log
      // di sini; terminateWorker() me-reject semua pending sehingga pemanggil tahu.
      lastCrashTime = Date.now();
      console.error('Context Worker Error:', e.message || e);
      terminateWorker();
    };
    worker.onmessageerror = () => {
      lastCrashTime = Date.now();
      console.error('Context Worker Message Error');
      terminateWorker();
    };
  }
  return worker;
}

function sendToWorker(type: ContextTaskType, payload: any): Promise<any> {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    // Timeout IDLE (bukan sejak-mulai): 30 dtk tanpa AKTIVITAS worker apa pun. Di-reset
    // tiap pesan PROGRESS (lihat onmessage) → operasi berat yang mengabari kemajuan
    // (unduh model, embedding) tak gagal timeout selama worker masih hidup.
    let timeoutId: ReturnType<typeof setTimeout>;
    const arm = () => {
      timeoutId = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          // C3: beri sinyal batal ke worker agar tak membuang siklus pada operasi
          // async (mis. embedding) & tak mem-post hasil basi. Best-effort: hanya
          // berpengaruh di checkpoint await worker (operasi sinkron tak bisa diputus).
          try { worker?.postMessage(cancelContextRequest(id)); } catch { /* worker mati */ }
          reject(new Error(`Context engine worker request timed out (${type})`));
        }
      }, WORKER_IDLE_TIMEOUT_MS);
    };
    arm();

    pendingRequests.set(id, {
      resolve: (val) => {
        clearTimeout(timeoutId);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeoutId);
        reject(err);
      },
      resetTimeout: () => {
        clearTimeout(timeoutId);
        arm();
      },
    });

    try {
      getWorker().postMessage({ type, id, payload } satisfies ContextWorkerMessage);
    } catch (err) {
      clearTimeout(timeoutId);
      pendingRequests.delete(id);
      reject(err);
    }
  });
}

/**
 * Scans text for names or aliases found in the codex via Web Worker.
 * Augments the exact-match results with semantic matches from Orama local RAG.
 */
export async function getRelevantContext(text: string, allCodex: CodexEntry[]): Promise<CodexEntry[]> {
  if (!text) return [];
  
  // 1. Exact string matching (Aho-Corasick in worker)
  const exactMatches = await sendToWorker('GET_RELEVANT_CONTEXT', { text, allCodex });
  
  // 2. Semantic matching with Orama
  // Use a smaller text slice to prevent Orama from choking on huge paragraphs. 
  // We prefer the most recent lines of interaction.
  const searchSlice = text.length > 500 ? text.substring(text.length - 500) : text;
  
  let semanticMatches: CodexEntry[] = [];
  try {
    semanticMatches = await oramaSync.search(searchSlice, 5);
  } catch (err) {
    console.warn("[RAG] Orama semantic search failed", err);
  }

  // Deduplicate
  const mergedMap = new Map<number, CodexEntry>();
  exactMatches.forEach((e: CodexEntry) => { if (e.id) mergedMap.set(e.id, e); });
  semanticMatches.forEach((e: CodexEntry) => { if (e.id) mergedMap.set(e.id, e); });
  
  return Array.from(mergedMap.values());
}

/**
 * Searches the given text chunks for codex entries utilizing the context worker
 */
export async function getCodexMatches(chunks: {pos: number; text: string}[], allCodex: CodexEntry[]): Promise<{start: number; end: number; codexId: number}[]> {
  if (!chunks || chunks.length === 0 || !allCodex || allCodex.length === 0) return [];
  return sendToWorker('GET_CODEX_MATCHES', { chunks, allCodex });
}

export async function invalidateContextCache(deep: boolean = false) {
  return sendToWorker('INVALIDATE_CACHE', { deep });
}

/**
 * Clears the persisted semantic embeddings so the worker re-embeds the codex
 * from scratch on the next retrieval. Used by the "Clear Vector Cache" action.
 */
export async function clearEmbeddingCache() {
  await db.embeddings.clear();
  await invalidateContextCache(true);
}

/**
 * Scans all chapters to find where a specific codex entry is mentioned.
 */
export async function getEntryAppearances(entry: CodexEntry, projectId: number): Promise<number[]> {
  const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
  return sendToWorker('SCAN_APPEARANCES', { entry, chapters });
}

/**
 * Filters the story bible rules via Web Worker to prevent main thread blocking.
 */
export async function getRelevantBibleRules(
  text: string,
  allRules: StoryBibleRule[],
  maxChars: number = 1500
): Promise<StoryBibleRule[]> {
  if (!text) {
    return allRules.filter(r => [
      '__STORY_TITLE__', '__STORY_TAGLINE__', '__GENRES__', '__TONES__', '__POV__',
      '__PACING__', '__THEMES__', '__TARGET_AUDIENCE__'
    ].includes(r.key));
  }
  return sendToWorker('GET_RELEVANT_BIBLE_RULES', { text, allRules, maxChars });
}

// ---- Pencarian Semantik naskah ---------------------------------------------

export interface SceneSearchHit {
  chapterId: number;
  chunkIndex: number;
  snippet: string;
  score: number;
}

/**
 * Memicu indexing embedding seluruh adegan naskah (fire-and-forget). Aman dipanggil
 * berulang: worker mengabaikan bila indexing sedang berjalan, dan hanya meng-embed
 * chunk yang baru/berubah (inkremental via contentHash). Progres disiarkan sebagai
 * window event 'semantic-indexing-progress' bertipe 'manuscript_index_*'.
 */
export async function indexManuscript(projectId: number): Promise<void> {
  const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
  const payload = {
    projectId,
    chapters: chapters.map(c => ({ id: c.id, content: c.content || '' })),
  };
  // Fire-and-forget: TANPA id → worker tak membalas & tak terikat timeout 30d.
  getWorker().postMessage({ type: 'INDEX_MANUSCRIPT', payload });
}

/** Mencari adegan yang paling dekat maknanya dengan query (nol token, lokal). */
export async function searchManuscript(projectId: number, query: string, topK = 12): Promise<SceneSearchHit[]> {
  if (!query || !query.trim()) return [];
  return sendToWorker('SEARCH_MANUSCRIPT', { projectId, query, topK });
}

/** Menghapus indeks embedding adegan sebuah proyek (mis. untuk membangun ulang). */
export async function clearManuscriptIndex(projectId: number): Promise<void> {
  await db.sceneEmbeddings.where('projectId').equals(projectId).delete();
}

/** Jumlah chunk adegan yang sudah terindeks untuk proyek (untuk status panel). */
export async function countIndexedScenes(projectId: number): Promise<number> {
  return db.sceneEmbeddings.where('projectId').equals(projectId).count();
}

export async function countTokens(text: string, model?: string): Promise<number> {
  if (!text) return 0;
  return sendToWorker('COUNT_TOKENS', { text, model });
}

/**
 * Bangun PresenceIndex (scan Aho-Corasick nama+alias Codex lintas-bab) DI WORKER agar
 * tak memblokir main thread pada naskah besar. Fondasi bersama Peta Kontinuitas, Lensa
 * Karakter, Janji Plot, Atlas — semua meneruskan hasil ini ke fungsi derivasi murni.
 * Shortcut lokal saat tak ada yang dipindai (hindari spin-up worker sia-sia).
 */
export async function buildPresenceIndexAsync(
  chapters: ContinuityChapter[],
  codexEntries: CodexEntry[]
): Promise<PresenceIndex> {
  if (!chapters.length || !codexEntries.length) {
    return { perChapterCounts: chapters.map(() => new Map<number, number>()), byEntity: new Map() };
  }
  return sendToWorker('BUILD_PRESENCE_INDEX', { chapters, codexEntries });
}

export async function buildProseReportAsync(
  chapters: ProseChapter[],
  language: ProseLanguage,
  excludeWords?: Set<string>
): Promise<ProseReport> {
  return sendToWorker('BUILD_PROSE_REPORT', { chapters, language, excludeWords });
}

export async function buildPacingReportAsync(chapters: ChapterTensionInput[]): Promise<PacingReport> {
  return sendToWorker('BUILD_PACING_REPORT', { chapters });
}

export async function estimateContextTokens(text: string, codexText: string, rulesText: string, model?: string): Promise<{textTokens: number, codexTokens: number, rulesTokens: number}> {
  return sendToWorker('ESTIMATE_CONTEXT_TOKENS', { text, codexText, rulesText, model });
}

export async function previewContextTokens(text: string, projectId: number, model?: string, fullContext?: boolean): Promise<{textTokens: number, codexTokens: number, rulesTokens: number, totalTokens: number}> {
  // Mode caching menyertakan graf relasi di KB (buildCachedContextSegments).
  // Karena worker kini mengambil data langsung dari IndexedDB, kita cukup mengirim
  // projectId dan membiarkan worker yang melakukan fetch & konstruksi teks, sehingga
  // terhindar dari overhead clone/serialize array besar di setiap ketikan (O(n)).
  return sendToWorker('PREVIEW_CONTEXT_TOKENS', { text, projectId, model, fullContext, maxCachedLoreChars: getMaxCachedLoreChars() });
}
