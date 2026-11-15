import { StoryBibleRule, CodexEntry, SessionMode } from '@/src/types';

export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface AIRenderParams {
  systemInstruction: string;
  /**
   * Knowledge base statis (Story Bible + Codex + relationship graph) yang DIPISAH dari
   * systemInstruction, sebagai SEGMEN ber-tier terurut stabil→volatil (mis.
   * [Story Bible, Codex+graph]). Bila ada, proxy menempatkan tiap segmen sebagai blok
   * system di DEPAN instruksi, masing-masing dengan cache_control sendiri (saat cacheable).
   * Karena segmen identik lintas-aksi (rewrite/chat/consistency memakai output
   * buildCachedContextSegments yang sama), cache prefix-nya dibagi → aksi berikutnya
   * MEMBACA cache alih-alih menulis ulang ~14k token (#P0). Tier per-segmen membuat edit
   * satu entri Codex hanya membatalkan segmen volatil; prefix Bible tetap hit (#P3).
   * Hanya diisi di caching mode. Lihat RENCANA-OPTIMASI-AI.md (#9).
   */
  cachedContext?: string[];
  userPrompt: string;
  actionType?: 'chat' | 'summarize' | 'rewrite' | 'extract' | 'expand' | 'consistency' | 'other';
  provider?: string;
  model?: string;
  history?: { role: 'user' | 'model', parts: { text: string }[] }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  stream?: boolean;
  /**
   * Saat true, knowledge base (Story Bible + Codex) di system prompt ditandai
   * sebagai blok cache (cache_control ephemeral) agar provider menyimpannya di
   * prompt cache. Hanya diset pada "caching mode" untuk provider yang mendukung.
   */
  cacheable?: boolean;
  onChunk?: (chunk: string) => void;
  onRetry?: (attempt: number, error: unknown, provider: string) => void;
}

export interface GenerateParams {
  prompt: string;
  selection: string;
  bibleRules: StoryBibleRule[];
  codexEntries: CodexEntry[];
  relationships?: import('@/src/types').Relationship[];
  action: string;
  chapterId?: number;
  provider?: string;
  contextText?: string;
  ragContextText?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  onRetry?: (attempt: number, error: unknown, provider: string) => void;
}

export interface ConsistencyParams {
  /** Teks bab (plain text, sudah di-strip HTML) yang akan diperiksa. */
  chapterText: string;
  chapterTitle?: string;
  bibleRules: StoryBibleRule[];
  codexEntries: CodexEntry[];
  relationships?: import('@/src/types').Relationship[];
  /**
   * Ringkasan kronologi timeline (sudah diformat) untuk membantu AI menangkap
   * pelanggaran urutan waktu. Dibangun di pemanggil (punya akses bab & codex).
   */
  timelineSummary?: string;
  provider?: string;
  /**
   * Override kunci abort & label actionType. Default 'consistency'. Pengecekan
   * inline memakai 'consistency-inline' agar tak saling membatalkan dengan panel.
   */
  actionType?: string;
  onRetry?: (attempt: number, error: unknown, provider: string) => void;
}

export interface ChatParams {
  message: string;
  history: { role: 'user' | 'model', parts: { text: string }[] }[];
  bibleRules: StoryBibleRule[];
  codexEntries: CodexEntry[];
  relationships?: import('@/src/types').Relationship[];
  contextText: string;
  chapterId?: number; // Added/verified for chapter-specific AI context
  provider?: string;
  sessionMode?: SessionMode;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  onRetry?: (attempt: number, error: unknown, provider: string) => void;
  /**
   * Instruksi tambahan yang ditempelkan di AKHIR systemInstruction (mis. protokol
   * blok `codex-draft` di Lokakarya). Sengaja terpisah dari knowledge base agar
   * cache KB (cachedContext) tetap byte-identik lintas-aksi.
   */
  extraSystem?: string;
}
