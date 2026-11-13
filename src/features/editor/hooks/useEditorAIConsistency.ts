import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import { CodexEntry, StoryBibleRule, Relationship } from '@/src/types';
import { InlineQuoteFinding } from '@/src/lib/inlineConsistency';
import { touchLru } from '@/src/lib/lruList';
import { checkConsistency, cancelAI } from '@/src/services/ai';

const ENABLED_KEY = 'ai_inline_consistency';
const ACTION_TYPE = 'consistency-inline';
const IDLE_MS = 2500;       // jeda berhenti mengetik sebelum cek OTOMATIS
const MIN_PARAGRAPH = 40;   // paragraf terlalu pendek → lewati di mode otomatis

interface AIConsistencyData {
  chapterTitle?: string;
  codexEntries: CodexEntry[];
  bibleRules: StoryBibleRule[];
  relationships: Relationship[];
}

export interface InlineAIConsistency {
  /** true selagi AI memeriksa — untuk indikator di editor. */
  checking: boolean;
  /**
   * Cek MANUAL paragraf di posisi seleksi (dipakai tombol floating menu).
   * Mengembalikan jumlah temuan (≥0), atau -1 bila tak ada teks untuk diperiksa.
   * Melempar bila pemanggilan AI gagal.
   */
  checkAtSelection: () => Promise<number>;
}

/**
 * Cache hasil per-paragraf di level MODUL — bertahan saat editor di-unmount
 * (pindah panel) sehingga garis bawah dipulihkan tanpa memanggil AI lagi, dan
 * paragraf yang isinya tak berubah tak diperiksa ulang (nol token). Entri kosong
 * tetap disimpan. Reset saat refresh penuh. Diisi oleh cek otomatis MAUPUN manual.
 */
const chapterCache = new Map<number, Map<string, InlineQuoteFinding[]>>();
if (typeof window !== 'undefined') {
  window.addEventListener('aetherscribe-chapters-deleted', (event: Event) => {
    const ids = (event as CustomEvent<number[]>).detail;
    for (const id of ids) { chapterCache.delete(id); hydratedChapters.delete(id); }
    writeLru(readLru().filter(id => !ids.includes(id)));
  });
}


/**
 * Persistensi ke localStorage agar garis bawah ungu BERTAHAN melintasi reload
 * halaman (chapterCache di atas hanya hidup selama tab terbuka; refresh halaman
 * mengosongkannya). Hanya temuan NON-KOSONG yang masih ada di dokumen yang
 * disimpan → storage tetap ramping dan paragraf yang sudah diedit/bersih otomatis
 * terbuang. Memuat ulang dari sini murni membaca hasil lama — NOL token.
 */
const STORE_PREFIX = 'ai_inline_consistency_cache_';
const LRU_KEY = 'ai_inline_consistency_lru';
const MAX_PERSISTED_PER_CHAPTER = 300;
// Pagar kuota GLOBAL: simpan cache untuk paling banyak N bab (LRU). Tanpa ini, 100+
// bab × 300 temuan menumpuk kunci `ai_inline_consistency_cache_*` tanpa batas hingga
// localStorage penuh & `setItem` FITUR LAIN (setting/backup) ikut gagal.
const MAX_CACHED_CHAPTERS = 40;
const hydratedChapters = new Set<number>();

function storeKey(chapterId: number): string {
  return STORE_PREFIX + chapterId;
}

function readLru(): number[] {
  try {
    const raw = localStorage.getItem(LRU_KEY);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter((x) => typeof x === 'number') : [];
  } catch { return []; }
}
function writeLru(list: number[]): void {
  try { localStorage.setItem(LRU_KEY, JSON.stringify(list)); } catch { /* abaikan */ }
}
function evictChapterKey(chapterId: number): void {
  try { localStorage.removeItem(storeKey(chapterId)); } catch { /* abaikan */ }
}

function loadPersisted(chapterId: number): Map<string, InlineQuoteFinding[]> | null {
  try {
    const raw = localStorage.getItem(storeKey(chapterId));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Map(arr as [string, InlineQuoteFinding[]][]);
  } catch { return null; }
}

function persistChapter(
  chapterId: number,
  map: Map<string, InlineQuoteFinding[]>,
  presentTexts: Set<string>,
): void {
  const entries: [string, InlineQuoteFinding[]][] = [];
  for (const [text, findings] of map) {
    if (findings.length > 0 && presentTexts.has(text)) entries.push([text, findings]);
  }

  // Bab tanpa temuan → buang kunci & keluarkan dari LRU (jaga storage ramping).
  if (entries.length === 0) {
    evictChapterKey(chapterId);
    writeLru(readLru().filter((id) => id !== chapterId));
    return;
  }

  // Pagar kuota global: jadikan bab ini paling baru & pangkas hingga MAX_CACHED_CHAPTERS,
  // membuang kunci bab tertua yang tergusur.
  const { list, evicted } = touchLru(readLru(), chapterId, MAX_CACHED_CHAPTERS);
  evicted.forEach(evictChapterKey);

  const payload = JSON.stringify(entries.slice(-MAX_PERSISTED_PER_CHAPTER));
  // Tulis dengan DEGRADASI kuota: bila penuh, buang bab tertua (selain ini) lalu retry —
  // jangan biarkan cache konsistensi menghabiskan kuota & menjatuhkan setItem fitur lain.
  const working = [...list];
  for (;;) {
    try {
      localStorage.setItem(storeKey(chapterId), payload);
      writeLru(working);
      return;
    } catch {
      const victimIdx = working.findIndex((id) => id !== chapterId);
      if (victimIdx === -1) { writeLru(working); return; } // hanya bab ini tersisa → menyerah
      const [victim] = working.splice(victimIdx, 1);
      evictChapterKey(victim);
    }
  }
}

function getChapterMap(chapterId: number): Map<string, InlineQuoteFinding[]> {
  let m = chapterCache.get(chapterId);
  if (!m) { m = new Map(); chapterCache.set(chapterId, m); }
  // Hidrasi sekali per tab dari localStorage (tanpa menimpa hasil sesi yang lebih baru).
  if (!hydratedChapters.has(chapterId)) {
    hydratedChapters.add(chapterId);
    const persisted = loadPersisted(chapterId);
    if (persisted) for (const [k, v] of persisted) if (!m.has(k)) m.set(k, v);
  }
  return m;
}

/** Kumpulkan teks paragraf yang sedang ada di dokumen (untuk pruning & display). */
function collectPresentTexts(ed: Editor): Set<string> {
  const present = new Set<string>();
  ed.state.doc.descendants(node => {
    if (node.isTextblock) {
      const t = node.textContent.trim();
      if (t) present.add(t);
    }
  });
  return present;
}

function isEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === 'true'; } catch { return false; }
}

/**
 * Lapisan AI OPSIONAL untuk konsistensi inline (Fase 2). Memeriksa paragraf
 * terhadap Codex/Bible via checkConsistency, lalu menggarisbawahi kutipan
 * kontradiktif (ungu). Dua pemicu:
 *   • MANUAL (utama) — tombol "Cek Konsistensi" di floating menu (checkAtSelection).
 *     Selalu tersedia, hanya pakai token saat diklik.
 *   • OTOMATIS (opsional) — toggle Settings (default mati): cek paragraf aktif
 *     setelah idle saat menulis.
 * Hasil di-cache lintas remount; garis bawah selalu mencerminkan cache.
 */
export function useEditorAIConsistency(
  editor: Editor | null,
  quoteFindingsRef: React.MutableRefObject<InlineQuoteFinding[]>,
  chapterId: number,
  data: AIConsistencyData,
): InlineAIConsistency {
  const dataRef = useRef(data);
  dataRef.current = data;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const chapterIdRef = useRef(chapterId);
  chapterIdRef.current = chapterId;

  const [enabled, setEnabled] = useState<boolean>(isEnabled);
  const [checking, setChecking] = useState(false);

  // Toggle disimpan di Settings; reaksi lewat event 'storage'.
  useEffect(() => {
    const onStorage = () => setEnabled(isEnabled());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /**
   * Susun ulang quoteFindingsRef dari cache: gabungkan temuan semua paragraf yang
   * MASIH ADA di dokumen (otomatis membuang temuan paragraf yang sudah diedit/hilang),
   * lalu picu render garis bawah. Tanpa memanggil AI.
   */
  const refresh = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const map = getChapterMap(chapterIdRef.current); // memicu hidrasi localStorage bila perlu
    const flat: InlineQuoteFinding[] = [];
    if (map.size) {
      const present = collectPresentTexts(ed);
      for (const [paraText, findings] of map) {
        if (present.has(paraText)) flat.push(...findings);
      }
    }
    quoteFindingsRef.current = flat;
    ed.view.dispatch(ed.state.tr.setMeta('forceUpdateConsistency', true));
  }, [quoteFindingsRef]);

  /** Periksa satu potongan teks (cache-aware). Mengembalikan jumlah temuan. */
  const performCheck = useCallback(async (text: string): Promise<number> => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || !text) return -1;
    const map = getChapterMap(chapterIdRef.current);
    if (map.has(text)) { refresh(); return map.get(text)!.length; } // cache hit → nol token

    const d = dataRef.current;
    cancelAI(ACTION_TYPE); // batalkan pemeriksaan sebelumnya yang masih jalan
    setChecking(true);
    try {
      const { findings } = await checkConsistency({
        chapterText: text,
        chapterTitle: d.chapterTitle,
        bibleRules: d.bibleRules,
        codexEntries: d.codexEntries,
        relationships: d.relationships,
        actionType: ACTION_TYPE,
      });
      const lower = text.toLowerCase();
      const mapped: InlineQuoteFinding[] = findings
        // Buang kutipan yang tak benar-benar ada di teks (anti-halusinasi).
        .filter(f => f.quote && lower.includes(f.quote.trim().toLowerCase()))
        .map(f => ({
          quote: f.quote.trim(),
          severity: f.severity,
          message: [
            f.explanation,
            f.conflictsWith ? `(vs ${f.conflictsWith})` : '',
            f.suggestion ? `→ ${f.suggestion}` : '',
          ].filter(Boolean).join(' '),
        }));
      if (chapterCache.get(chapterIdRef.current) !== map) return 0;
      map.set(text, mapped); // simpan (termasuk []) agar tak diperiksa ulang
      refresh();
      // Tulis ke localStorage agar garis bawah bertahan setelah reload halaman.
      const edNow = editorRef.current;
      if (edNow && !edNow.isDestroyed) persistChapter(chapterIdRef.current, map, collectPresentTexts(edNow));
      return mapped.length;
    } finally {
      if (!editorRef.current?.isDestroyed) setChecking(false);
    }
  }, [refresh]);

  // Pulihkan garis bawah dari cache setiap editor/bab termuat — pindah panel = gratis.
  // Saat RELOAD halaman, konten bab dimuat async via setContent(emitUpdate:false)
  // SETELAH editor dibuat, jadi refresh pertama bisa kena dokumen kosong (tak ada
  // paragraf → tak ada garis bawah). Pasang listener 'transaction' sekali untuk
  // menggambar ulang begitu konten benar-benar masuk.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    refresh(); // coba langsung — cukup bila konten sudah tersedia (mis. pindah panel)
    let done = false;
    const onTx = () => {
      if (done || editor.isDestroyed) return;
      if (editor.state.doc.content.size > 2) { // dokumen sudah berisi
        done = true;
        editor.off('transaction', onTx);
        // tunda agar tak dispatch di tengah handler transaksi (cegah re-entrancy)
        Promise.resolve().then(() => { if (!editor.isDestroyed) refresh(); });
      }
    };
    editor.on('transaction', onTx);
    return () => { editor.off('transaction', onTx); };
  }, [editor, chapterId, refresh]);

  // Mode OTOMATIS (opsional): cek paragraf aktif setelah idle saat menulis.
  useEffect(() => {
    if (!editor || !enabled) return;
    let timer: any = null;
    let lastChecked = '';

    const runAuto = () => {
      if (editor.isDestroyed) return;
      const para = editor.state.selection.$from.parent;
      const text = para && para.isTextblock ? para.textContent.trim() : '';
      if (text.length < MIN_PARAGRAPH || text === lastChecked) return;
      lastChecked = text;
      performCheck(text).catch(() => { lastChecked = ''; });
    };

    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runAuto, IDLE_MS);
    };

    editor.on('update', onUpdate);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off('update', onUpdate);
      cancelAI(ACTION_TYPE);
    };
  }, [editor, enabled, chapterId, performCheck]);

  // Cek MANUAL: paragraf di posisi seleksi.
  const checkAtSelection = useCallback(async (): Promise<number> => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return -1;
    const para = ed.state.selection.$from.parent;
    const text = para && para.isTextblock ? para.textContent.trim() : '';
    if (!text) return -1;
    return performCheck(text);
  }, [performCheck]);

  return { checking, checkAtSelection };
}
