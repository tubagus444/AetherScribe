import type { ContextWorkerMessage } from './contextProtocol';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '@/src/db';
import { CodexEntry, StoryBibleRule } from '@/src/types';
import { getCodexRegex } from '@/src/lib/utils';
import { AhoCorasick } from '@/src/lib/ahoCorasick';
import { extractCodexAcKeywords } from '@/src/lib/codexKeywords';
import { formatBibleBlock } from '@/src/lib/storyBible';
import { buildCodexLoreString, buildRelationshipGraph } from '@/src/lib/loreFormat';
import { buildPresenceIndex } from '@/src/lib/continuity';
import { buildProseReport } from '@/src/lib/proseAnalysis';
import { buildPacingReport } from '@/src/lib/pacingHeatmap';
import { chunkChapter, hashChunk } from '@/src/lib/manuscriptChunker';
import { SceneEmbedding } from '@/src/types';
import { pipeline, env } from '@xenova/transformers';
import { getEncoding, encodingForModel } from 'js-tiktoken';

// Configure transformers environment
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

let embedder: any = null;
let backgroundIndexing = false; // cegah indexing embedding latar berjalan ganda
let modelInitPromise: Promise<any> | null = null;
let encoders = new Map<string, any>();

// C3: id request yang dibatalkan main thread (lewat pesan CANCEL saat timeout).
// Worker single-thread → cancel hanya efektif pada operasi async (mis. embedding),
// di mana checkpoint `checkCancelled` membuat handler berhenti & hasilnya di-drop.
const cancelledIds = new Set<number>();
const activeIds = new Set<number>();
class CancelledError extends Error { constructor() { super('__CANCELLED__'); } }
function checkCancelled(id?: number) {
  if (id !== undefined && cancelledIds.has(id)) throw new CancelledError();
}

function getEncoderForModelOrStandard(model?: string): any {
  if (!model) return getEncoding('cl100k_base');
  
  if (encoders.has(model)) return encoders.get(model);
  
  try {
    // Try by model name
    const enc = encodingForModel(model as any);
    encoders.set(model, enc);
    return enc;
  } catch (e) {
    try {
      // Fallback
      const enc = getEncoding('cl100k_base');
      encoders.set(model, enc);
      return enc;
    } catch (e2) {
      return null;
    }
  }
}

function countTokens(text: string, model?: string): number {
  if (!text) return 0;
  const encoder = getEncoderForModelOrStandard(model);
  if (!encoder) {
    return Math.ceil(text.length / 4); // Fallback approximation
  }
  return encoder.encode(text).length;
}

// Cache for Codex embeddings in the worker: key is codex ID, value is { embedding, contentHash }
const embeddingCache = new Map<string | number, { embedding: Float32Array, contentHash: string }>();

// Cache for AhoCorasick instance
let cachedAc: AhoCorasick | null = null;
let cachedAcHash = '';

function getAcInstance(allCodex: CodexEntry[]): AhoCorasick {
  if (!allCodex || allCodex.length === 0) return new AhoCorasick([]);
  // Gunakan fast hash string (O(N) loop + concat) untuk menghindari overhead JSON.stringify
  let hash = '';
  for (let i = 0; i < allCodex.length; i++) {
    const e = allCodex[i];
    hash += e.id + ':' + (e.name||'') + ':' + (e.aliases? e.aliases.join(',') : '') + '|';
  }
  
  if (cachedAcHash === hash && cachedAc) return cachedAc;
  
  // Filter konsisten dengan continuity.ts & loreGraph.ts: trim + length >= 2
  // (dulu di sini tidak ada filter panjang, menyebabkan divergensi hitungan).
  const keywords = extractCodexAcKeywords(allCodex, (entry, isAlias) => ({ entry, isAlias }));
  
  cachedAc = new AhoCorasick(keywords);
  cachedAcHash = hash;
  return cachedAc;
}

async function getEmbedder() {
  if (embedder) return embedder;
  if (!modelInitPromise) {
    modelInitPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: (info: any) => {
         self.postMessage({ type: 'PROGRESS', payload: { type: 'model_download', info } });
      }
    });
  }
  try {
    embedder = await modelInitPromise;
    return embedder;
  } catch (err) {
    // Jangan cache promise yang gagal — izinkan percobaan ulang pada panggilan berikutnya. (C2)
    modelInitPromise = null;
    throw err;
  }
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  // L2 Norm is already applied by 'normalize: true' in transformers.js
  // So dot product is equivalent to cosine similarity here.
  return dotProduct(a, b);
}

// Generate a string to uniquely identify the semantic content of an entry
function getCodexHash(entry: CodexEntry) {
  return `${entry.name}|${entry.aliases?.join(',')}|${entry.description}`;
}

async function getSemanticEmbedding(text: string): Promise<Float32Array> {
  const model = await getEmbedder();
  const result = await model(text, { pooling: 'mean', normalize: true });
  // result.data is already a Float32Array
  return result.data as Float32Array;
}

const ALWAYS_INCLUDE = [
  '__STORY_TITLE__',
  '__STORY_TAGLINE__',
  '__GENRES__',
  '__TONES__',
  '__POV__',
  '__PACING__',
  '__THEMES__',
  '__TARGET_AUDIENCE__'
];

const SCORE_ALWAYS_INCLUDE = 1000;
const SCORE_WORD_MATCH = 15;
const SCORE_KEY_MATCH = 30;
const MIN_SCORE_THRESHOLD = 25; // Raised threshold for leaner context
const DEFAULT_MAX_CHARS = 1200; // Lowered limit for leaner context
const MIN_WORD_LENGTH = 4;

// Bobot skor hibrida untuk getRelevantContext (semantik vs exact-match Aho-Corasick). (C8)
const AC_NAME_SCORE = 10;        // skor kecocokan nama (exact)
const AC_ALIAS_SCORE = 5;        // skor kecocokan alias (exact)
const SEMANTIC_WEIGHT = 60;      // skala skor semantik (~0..1) -> ~0..60
const AC_WEIGHT = 1.0;           // bobot skor exact-match
const EXACT_MATCH_BOOST = 10;    // dorongan agar kecocokan eksak pasti muncul
const RELEVANCE_THRESHOLD = 20;  // ambang skor minimum untuk entri non-eksak

const regexCache = new Map<string, RegExp>();

function getBoundaryRegex(name: string): RegExp {
  if (regexCache.has(name)) {
    const cached = regexCache.get(name)!;
    // Move to end to mark as most recently used
    regexCache.delete(name);
    regexCache.set(name, cached);
    return cached;
  }

  const regex = getCodexRegex(name);
  
  regexCache.set(name, regex);
  if (regexCache.size > 500) {
    // The first element in the iteration order is the least recently used
    const firstKey = regexCache.keys().next().value;
    if (firstKey !== undefined) regexCache.delete(firstKey);
  }
  
  return regex;
}

// Apakah skor semantik siap dipakai untuk SELURUH codex saat ini (model termuat
// & setiap entri punya embedding tercache dengan hash terkini)?
function semanticReady(allCodex: CodexEntry[]): boolean {
  if (!embedder) return false;
  for (const entry of allCodex) {
    const key = entry.id !== undefined ? entry.id : entry.name;
    const info = embeddingCache.get(key);
    if (!info || info.contentHash !== getCodexHash(entry)) return false;
  }
  return true;
}

/**
 * Memuat model + menyiapkan embedding (ambil dari IndexedDB bila ada, embed yang
 * belum ada). DIJALANKAN SEBAGAI TUGAS LATAR (tidak di-await oleh query) sehingga
 * worker tidak memblokir respons konteks. Loop tetap yield agar pesan ringan lain
 * (token meter, bible rules) bisa diselingi. Lihat audit C1.
 */
async function ensureEmbeddings(allCodex: CodexEntry[]): Promise<void> {
  if (backgroundIndexing) return;
  backgroundIndexing = true;
  try {
    await getEmbedder();

    // 1. Muat embedding tersimpan dari IndexedDB untuk entri yang belum ada di cache.
    const needFromDb = allCodex.filter(entry => {
      const key = entry.id !== undefined ? entry.id : entry.name;
      const info = embeddingCache.get(key);
      return !info || info.contentHash !== getCodexHash(entry);
    });

    if (needFromDb.length > 0) {
      try {
        const compositeIds = needFromDb.map(e => `${e.projectId}_${e.id !== undefined ? e.id : e.name}`);
        const stored = await db.embeddings.bulkGet(compositeIds);
        needFromDb.forEach((entry, i) => {
          const s = stored[i];
          const key = entry.id !== undefined ? entry.id : entry.name;
          if (s && s.contentHash === getCodexHash(entry)) {
            embeddingCache.set(key, { embedding: s.embedding, contentHash: s.contentHash });
          }
        });
      } catch (err) {
        console.warn("Failed to load embeddings from IndexedDB", err);
      }
    }

    // 2. Entri yang benar-benar perlu di-embed (belum ada di cache setelah load DB).
    const toEmbed = allCodex.filter(entry => {
      const key = entry.id !== undefined ? entry.id : entry.name;
      const info = embeddingCache.get(key);
      return !info || info.contentHash !== getCodexHash(entry);
    });

    if (toEmbed.length === 0) return;

    self.postMessage({ type: 'PROGRESS', payload: { type: 'embedding_start', total: toEmbed.length, completed: 0 } });

    const toSaveToDb: any[] = [];
    let done = 0;
    for (const entry of toEmbed) {
      const key = entry.id !== undefined ? entry.id : entry.name;
      const hash = getCodexHash(entry);
      const textToEmbed = `[${entry.category || 'General'}] ${entry.name}${entry.aliases?.length ? ` (aka ${entry.aliases.join(', ')})` : ''}: ${entry.description || ''}`;
      try {
        const embedding = await getSemanticEmbedding(textToEmbed);
        embeddingCache.set(key, { embedding, contentHash: hash });
        toSaveToDb.push({
          id: `${entry.projectId}_${key}`,
          projectId: entry.projectId,
          codexId: key,
          contentHash: hash,
          embedding,
          lastUpdated: Date.now()
        });
        done++;
        if (done % 5 === 0 || done === toEmbed.length) {
          self.postMessage({ type: 'PROGRESS', payload: { type: 'embedding_progress', total: toEmbed.length, completed: done } });
        }
        // Yield ke event loop tiap 10 embedding agar pesan lain bisa diproses.
        if (done % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch (e) {
        console.error("Failed to embed entry", entry.name, e);
      }
    }

    if (toSaveToDb.length > 0) {
      db.embeddings.bulkPut(toSaveToDb).catch(e => console.warn("Failed to save embeddings to db", e));
    }
    self.postMessage({ type: 'PROGRESS', payload: { type: 'embedding_done' } });
  } catch (error: any) {
    console.error("Background embedding indexing failed", error);
    // Surface ke UI agar kegagalan semantik tidak senyap. (C2)
    self.postMessage({ type: 'PROGRESS', payload: { type: 'embedding_error', message: error?.message || String(error) } });
  } finally {
    backgroundIndexing = false;
  }
}

async function getRelevantContext(text: string, allCodex: CodexEntry[], reqId?: number): Promise<CodexEntry[]> {
  if (!text || !allCodex || allCodex.length === 0) return [];

  // 1. Exact Match Score (AhoCorasick) — selalu cepat.
  const ac = getAcInstance(allCodex);
  const entryScores = new Map<string | number, { entry: CodexEntry; acScore: number; semanticScore: number; finalScore: number }>();

  const matches = ac.search(text);
  matches.forEach(match => {
    const { entry, isAlias } = match.data;
    if (!entry) return;
    const key = entry.id !== undefined ? entry.id : entry.name;
    const current = entryScores.get(key) || { entry, acScore: 0, semanticScore: 0, finalScore: 0 };
    current.acScore += isAlias ? AC_ALIAS_SCORE : AC_NAME_SCORE;
    entryScores.set(key, current);
  });

  // 2. Semantic Score — HANYA jika sudah siap. Jika belum, picu indexing latar
  //    (tanpa di-await) dan lanjut dengan AC-only agar query ini tetap cepat & tak
  //    pernah timeout/memblokir worker. Semantik aktif otomatis di query berikutnya.
  if (semanticReady(allCodex)) {
    try {
      const textEmbedding = await getSemanticEmbedding(text);
      checkCancelled(reqId); // request sudah di-timeout? hentikan, hasilnya tak terpakai.
      for (const entry of allCodex) {
        const key = entry.id !== undefined ? entry.id : entry.name;
        const info = embeddingCache.get(key);
        if (info) {
          const similarity = cosineSimilarity(textEmbedding, info.embedding);
          const current = entryScores.get(key) || { entry, acScore: 0, semanticScore: 0, finalScore: 0 };
          current.semanticScore = similarity;
          entryScores.set(key, current);
        }
      }
    } catch (error) {
      if (error instanceof CancelledError) throw error; // jangan ditelan fallback
      console.error("Semantic scoring failed, falling back to pure AhoCorasick", error);
    }
  } else {
    // Non-blocking warm-up; hasil query ini tetap AC-only.
    void ensureEmbeddings(allCodex);
  }

  // 3. Hybrid Scoring (konstanta lihat C8 di atas)
  return Array.from(entryScores.values())
    .map(item => {
      // similarity ~0..1 → diskalakan ke ~0..SEMANTIC_WEIGHT.
      const scaledSemantic = Math.max(0, item.semanticScore) * SEMANTIC_WEIGHT;
      const scaledAc = item.acScore * AC_WEIGHT;

      // Beri dorongan agar kecocokan eksak pasti muncul.
      const exactMatchBoost = item.acScore > 0 ? EXACT_MATCH_BOOST : 0;

      item.finalScore = scaledSemantic + scaledAc + exactMatchBoost;
      return item;
    })
    // Selalu sertakan entri dengan kecocokan eksak (acScore>0) — penting agar mode
    // AC-only (sebelum embedding panas) tetap mengembalikan konteks; selain itu pakai
    // ambang skor semantik. (Dulu: finalScore>20 saja, yang membuang kecocokan eksak tunggal.)
    .filter(item => item.acScore > 0 || item.finalScore > RELEVANCE_THRESHOLD)
    .sort((a, b) => b.finalScore - a.finalScore)
    .map(item => item.entry);
}

function getRelevantBibleRules(
  text: string,
  allRules: StoryBibleRule[],
  maxChars: number = DEFAULT_MAX_CHARS
): StoryBibleRule[] {
  if (!text) {
    const alwaysRules = allRules.filter(r => ALWAYS_INCLUDE.includes(r.key));
    return condenseCoreRules(alwaysRules);
  }

  const lowerText = text.toLowerCase();
  
  const scoredRules = allRules.map(rule => {
    let score = 0;
    
    if (ALWAYS_INCLUDE.includes(rule.key)) {
      score = SCORE_ALWAYS_INCLUDE;
    } else {
      // Refined split to preserve hyphens and handle word characters correctly
      const words = rule.instruction.toLowerCase().split(/[^\w-]+/);
      const uniqueWords = [...new Set(words)].filter(w => w.length > MIN_WORD_LENGTH);
      
      uniqueWords.forEach(w => {
        if (lowerText.includes(w)) {
          score += SCORE_WORD_MATCH;
        }
      });
      
      const keyWords = rule.key.toLowerCase().split(/[\s_+]+/);
      keyWords.forEach(kw => {
        if (kw.length > 3 && lowerText.includes(kw)) {
          score += SCORE_KEY_MATCH;
        }
      });
    }
    
    return { rule, score };
  });

  const sortedRules = scoredRules
    .filter(item => item.score >= MIN_SCORE_THRESHOLD || item.score === SCORE_ALWAYS_INCLUDE)
    .sort((a, b) => b.score - a.score);

  const alwaysRules = sortedRules
    .filter(item => item.score === SCORE_ALWAYS_INCLUDE)
    .map(item => item.rule);
  
  const dynamicRules = sortedRules
    .filter(item => item.score !== SCORE_ALWAYS_INCLUDE);

  const finalRules: StoryBibleRule[] = condenseCoreRules(alwaysRules);
  let currentChars = finalRules.reduce((acc, r) => acc + r.key.length + r.instruction.length, 0);

  for (const item of dynamicRules) {
    const ruleChars = item.rule.key.length + item.rule.instruction.length;
    if (currentChars + ruleChars <= maxChars) {
      finalRules.push(item.rule);
      currentChars += ruleChars;
    }
  }

  return finalRules;
}

/**
 * Condenses core rules into a single rule to save tokens (reducing key overhead).
 */
function condenseCoreRules(rules: StoryBibleRule[]): StoryBibleRule[] {
  if (rules.length === 0) return [];
  
  // Clean up keys for display
  const formatKey = (key: string) => key.replace(/__/g, '').replace(/_/g, ' ').trim();

  let condensedInstruction = rules
    .map(r => `${formatKey(r.key)}: ${r.instruction.trim()}`)
    .join('\n');

  // Hard limit for core profile to avoid token blow-up (e.g., 2500 chars)
  if (condensedInstruction.length > 2500) {
    condensedInstruction = condensedInstruction.substring(0, 2500) + '... [Core truncated to save tokens]';
  }

  return [{
    id: -1, // Virtual ID
    isVirtual: true,
    projectId: rules[0].projectId,
    key: 'STORY_PROFILE',
    instruction: condensedInstruction
  }];
}

// ---- Pencarian Semantik naskah (fitur "cari adegan per makna") --------------
// Indexing chunk bab jalan sebagai tugas latar fire-and-forget (bisa makan menit
// untuk naskah panjang → tak boleh terikat timeout request 30d). Progres & selesai
// disiarkan lewat event 'PROGRESS' bertipe 'manuscript_index_*'.

let manuscriptIndexing = false; // cegah indexing naskah ganda berjalan bersamaan

interface IndexChapterInput { id: number; content: string }

async function indexManuscript(projectId: number, chapters: IndexChapterInput[]): Promise<void> {
  if (manuscriptIndexing) return;
  manuscriptIndexing = true;
  try {
    await getEmbedder();

    // 1. Susun daftar chunk yang DIINGINKAN dari kondisi bab saat ini.
    type Desired = { id: string; chapterId: number; chunkIndex: number; hash: string; text: string };
    const desired: Desired[] = [];
    for (const ch of chapters) {
      if (ch.id === undefined || ch.id === null) continue;
      const chunks = chunkChapter(ch.content || '');
      for (const c of chunks) {
        desired.push({
          id: `${projectId}_${ch.id}_${c.index}`,
          chapterId: ch.id,
          chunkIndex: c.index,
          hash: hashChunk(c.text),
          text: c.text,
        });
      }
    }

    // 2. Muat baris tersimpan untuk proyek ini → tentukan mana yang perlu di-embed
    //    (baru / hash berubah) dan mana yang basi (chunk/bab terhapus → prune).
    let existing: SceneEmbedding[] = [];
    try {
      existing = await db.sceneEmbeddings.where('projectId').equals(projectId).toArray();
    } catch (err) {
      console.warn('Gagal memuat sceneEmbeddings tersimpan', err);
    }
    const existingById = new Map(existing.map(r => [r.id, r]));
    const desiredIds = new Set(desired.map(d => d.id));

    const toEmbed = desired.filter(d => {
      const row = existingById.get(d.id);
      return !row || row.contentHash !== d.hash;
    });
    const staleIds = existing.filter(r => !desiredIds.has(r.id)).map(r => r.id);

    self.postMessage({ type: 'PROGRESS', payload: { type: 'manuscript_index_start', total: toEmbed.length, completed: 0, totalChunks: desired.length } });

    // 3. Embed yang perlu, simpan berkala.
    const toSave: SceneEmbedding[] = [];
    let done = 0;
    for (const d of toEmbed) {
      try {
        const embedding = await getSemanticEmbedding(d.text);
        toSave.push({
          id: d.id,
          projectId,
          chapterId: d.chapterId,
          chunkIndex: d.chunkIndex,
          contentHash: d.hash,
          snippet: d.text.slice(0, 300),
          embedding,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        console.error('Gagal meng-embed chunk', d.id, err);
      }
      done++;
      if (done % 5 === 0 || done === toEmbed.length) {
        self.postMessage({ type: 'PROGRESS', payload: { type: 'manuscript_index_progress', total: toEmbed.length, completed: done } });
      }
      // Yield tiap 10 embedding agar pesan lain (mis. SEARCH) tetap terlayani.
      if (done % 10 === 0) {
        if (toSave.length > 0) {
          db.sceneEmbeddings.bulkPut(toSave.splice(0)).catch(e => console.warn('Gagal menyimpan sceneEmbeddings', e));
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (toSave.length > 0) {
      await db.sceneEmbeddings.bulkPut(toSave).catch(e => console.warn('Gagal menyimpan sceneEmbeddings', e));
    }
    if (staleIds.length > 0) {
      await db.sceneEmbeddings.bulkDelete(staleIds).catch(e => console.warn('Gagal memangkas sceneEmbeddings basi', e));
    }

    self.postMessage({ type: 'PROGRESS', payload: { type: 'manuscript_index_done', totalChunks: desired.length, embedded: toEmbed.length, pruned: staleIds.length } });
  } catch (error: any) {
    console.error('Indexing naskah gagal', error);
    self.postMessage({ type: 'PROGRESS', payload: { type: 'manuscript_index_error', message: error?.message || String(error) } });
  } finally {
    manuscriptIndexing = false;
  }
}

interface SceneSearchHit { chapterId: number; chunkIndex: number; snippet: string; score: number }

async function searchManuscript(projectId: number, query: string, topK: number, reqId?: number): Promise<SceneSearchHit[]> {
  const q = (query || '').trim();
  if (!q) return [];
  await getEmbedder();
  checkCancelled(reqId);
  const queryEmbedding = await getSemanticEmbedding(q);
  checkCancelled(reqId);

  const rows = await db.sceneEmbeddings.where('projectId').equals(projectId).toArray();
  checkCancelled(reqId);

  const scored = rows.map(r => ({
    chapterId: r.chapterId,
    chunkIndex: r.chunkIndex,
    snippet: r.snippet,
    score: cosineSimilarity(queryEmbedding, r.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, topK));
}

// Worker message listener
self.onmessage = async (e: MessageEvent) => {
  const message = e.data as ContextWorkerMessage;
  if (message.type === 'CANCEL') {
    const cancelId = message.payload?.cancelId;
    if (Number.isSafeInteger(cancelId) && activeIds.has(cancelId)) cancelledIds.add(cancelId);
    return;
  }
  const { type, payload } = message;
  const id = 'id' in message ? message.id : undefined;

  // Fire-and-forget: indexing naskah tak boleh terikat timeout request 30d.
  // Progres & selesai disiarkan lewat event 'PROGRESS'. Tak ada balasan id.
  if (type === 'INDEX_MANUSCRIPT') {
    void indexManuscript(payload.projectId, payload.chapters);
    return;
  }

  if (id !== undefined) activeIds.add(id);
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    checkCancelled(id);
    let result;
    switch (type) {
      case 'SEARCH_MANUSCRIPT':
        result = await searchManuscript(payload.projectId, payload.query, payload.topK ?? 12, id);
        break;
      case 'GET_RELEVANT_CONTEXT':
        result = await getRelevantContext(payload.text, payload.allCodex, id);
        break;
      case 'GET_CODEX_MATCHES': {
        const { chunks, allCodex } = payload;
        const ac = getAcInstance(allCodex);
        const matches: Array<{start: number, end: number, codexId: number}> = [];
        let processed = 0;
        for (const chunk of chunks) {
          if (processed++ % 16 === 0) await new Promise(resolve => setTimeout(resolve, 0));
          checkCancelled(id);
          const acMatches = ac.search(chunk.text);
          acMatches.forEach(m => {
            // Lewati entri tanpa id — codexId yang undefined merusak highlight downstream. (C5)
            if (m.data && m.data.entry && m.data.entry.id !== undefined) {
              matches.push({
                start: chunk.pos + m.start,
                end: chunk.pos + m.end,
                codexId: m.data.entry.id
              });
            }
          });
        }
        result = matches;
        break;
      }
      case 'GET_RELEVANT_BIBLE_RULES':
        result = getRelevantBibleRules(payload.text, payload.allRules, payload.maxChars);
        break;
      case 'INVALIDATE_CACHE':
        regexCache.clear();
        cachedAc = null;
        cachedAcHash = '';
        // Option to optionally clear embedding cache if needed
        if (payload?.deep) {
          embeddingCache.clear();
        }
        result = { success: true };
        break;
      case 'SCAN_APPEARANCES':
        const { entry, chapters } = payload;
        const nameRegex = getBoundaryRegex(entry.name);
        const aliasesRegex = (entry.aliases || []).map((a: string) => getBoundaryRegex(a));
        
        result = chapters
          .filter((ch: any) => {
            // Strip tag HTML agar tak ada false-match di dalam tag/atribut. (C6)
            const lowerContent = (ch.content || '').replace(/<[^>]*>/g, ' ').toLowerCase();
            // Reset lastIndex for test() because the regex is global/cached
            nameRegex.lastIndex = 0;
            if (nameRegex.test(lowerContent)) return true;
            return aliasesRegex.some((r: RegExp) => {
              r.lastIndex = 0;
              return r.test(lowerContent);
            });
          })
          .map((ch: any) => ch.id);
        break;
      case 'COUNT_TOKENS':
        result = countTokens(payload.text, payload.model);
        break;
      case 'BUILD_PRESENCE_INDEX':
        // Scan Aho-Corasick nama+alias Codex atas SEMUA bab — berat (multi-detik pada
        // 100+ bab), dijalankan di worker agar main thread tak jank. Fungsi yang SAMA
        // dipakai jalur sync (continuity.ts) → tak ada divergensi pencocokan.
        result = buildPresenceIndex(payload.chapters, payload.codexEntries);
        break;
      case 'BUILD_PROSE_REPORT':
        result = buildProseReport(payload.chapters, payload.language, payload.excludeWords);
        break;
      case 'BUILD_PACING_REPORT':
        result = buildPacingReport(payload.chapters);
        break;
      case 'ESTIMATE_CONTEXT_TOKENS':
        result = {
           textTokens: countTokens(payload.text, payload.model),
           codexTokens: countTokens(payload.codexText, payload.model),
           rulesTokens: countTokens(payload.rulesText, payload.model),
        };
        break;
      case 'PREVIEW_CONTEXT_TOKENS': {
        const { text, projectId, model, fullContext, maxCachedLoreChars } = payload;

        let codexText: string;
        let rulesText: string;

        // Fetch langsung dari IndexedDB di dalam worker (menghindari O(n) clone postMessage tiap ketikan)
        const allCodex = await db.codex.where('projectId').equals(projectId).toArray();
        checkCancelled(id);
        const allRules = await db.bible.where('projectId').equals(projectId).toArray();

        checkCancelled(id);
        // (reqId diteruskan ke getRelevantContext di cabang non-fullContext di bawah)
        if (fullContext) {
          // Mode caching: SELURUH Story Bible + Codex dikirim statis (lihat
          // buildCachedContextSegments di services/ai/index.ts). Cerminkan itu di meter
          // memakai SUMBER TUNGGAL yang sama (field #17 + secret + graf relasi) agar tak
          // underestimate. Cap diteruskan dari main thread (getMaxCachedLoreChars) —
          // worker tak punya localStorage. Fallback ke default bila tak terkirim.
          const allRelationships = await db.relationships.where('projectId').equals(projectId).toArray();
          const MAX_CACHED_LORE_CHARS = maxCachedLoreChars ?? 50000;
          const sortedRules = [...allRules].sort((a: StoryBibleRule, b: StoryBibleRule) => a.key.localeCompare(b.key));
          const sortedCodex = [...allCodex].sort((a: CodexEntry, b: CodexEntry) => a.name.localeCompare(b.name));
          rulesText = formatBibleBlock(sortedRules);
          const loreString = buildCodexLoreString(sortedCodex, MAX_CACHED_LORE_CHARS).text;
          const graphString = buildRelationshipGraph(allRelationships || [], allCodex);
          codexText = `${loreString}${graphString}`;
        } else {
          // Mode RAG legacy: hanya lore/aturan relevan yang dikirim.
          const relevantCodex = await getRelevantContext(text, allCodex, id);
          const relevantRules = getRelevantBibleRules(text, allRules, 2500); // Example depth
          codexText = relevantCodex.map(e => `[${e.name}]: ${e.description}`).join(' ');
          rulesText = formatBibleBlock(relevantRules);
        }

        result = {
           textTokens: countTokens(text, model),
           codexTokens: countTokens(codexText, model),
           rulesTokens: countTokens(rulesText, model),
           totalTokens: countTokens(text, model) + countTokens(codexText, model) + countTokens(rulesText, model)
        };
        break;
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    // Request dibatalkan saat diproses → jangan post hasil basi (main thread sudah
    // me-reject lewat timeout). Bersihkan penanda.
    if (id !== undefined && cancelledIds.has(id)) {
      cancelledIds.delete(id);
      return;
    }

    self.postMessage({ id, result });
  } catch (error: any) {
    if (error instanceof CancelledError) {
      if (id !== undefined) cancelledIds.delete(id);
      return; // dibatalkan; tak perlu balas
    }
    if (id === undefined || !cancelledIds.has(id)) self.postMessage({ id, error: error.message || 'Worker error' });
  } finally {
    if (id !== undefined) { activeIds.delete(id); cancelledIds.delete(id); }
  }
};
