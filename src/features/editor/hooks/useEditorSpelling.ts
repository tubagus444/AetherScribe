import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import { CodexEntry } from '@/src/types';
import { InlineSpellingFinding } from '@/src/lib/inlineConsistency';
import { collectCanonicalTerms, findSpellingIssues } from '@/src/lib/nameSpelling';

const ENABLED_KEY = 'spellcheck_names';
const DEBOUNCE_MS = 800;

/** Default AKTIF: fitur nol-token/gratis, jadi aman menyala kecuali dimatikan. */
function isEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) !== 'false'; } catch { return true; }
}

/**
 * Buku Gaya inline — menandai kandidat salah-eja NAMA kanonik (deterministik,
 * nol token). Hitung dari data (teks bab +
 * nama/alias Codex) lalu dorong ke `findingsRef` + meta `forceUpdateConsistency`
 * agar `ConsistencyUnderline` menggambar garis bawah merah putus-putus.
 *
 * Ringan (pencocokan lokal ber-bucket), tapi tetap di-debounce saat mengetik.
 * Toggle di menu "Tampilan" (localStorage `spellcheck_names`, reaksi via 'storage').
 */
export function useEditorSpelling(
  editor: Editor | null,
  findingsRef: React.MutableRefObject<InlineSpellingFinding[]>,
  chapterId: number,
  codexEntries: CodexEntry[],
) {
  const [enabled, setEnabled] = useState<boolean>(isEnabled);
  const codexRef = useRef(codexEntries);
  codexRef.current = codexEntries;

  useEffect(() => {
    const onStorage = () => setEnabled(isEnabled());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const recompute = () => {
      if (editor.isDestroyed) return;
      if (!enabled) {
        if (findingsRef.current.length) {
          findingsRef.current = [];
          editor.view.dispatch(editor.state.tr.setMeta('forceUpdateConsistency', true));
        }
        return;
      }
      const terms = collectCanonicalTerms(codexRef.current);
      const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ');
      findingsRef.current = findSpellingIssues(text, terms);
      editor.view.dispatch(editor.state.tr.setMeta('forceUpdateConsistency', true));
    };

    // Hitung langsung (cukup saat pindah panel), lalu sekali lagi begitu konten
    // benar-benar masuk — saat reload halaman konten dimuat async SETELAH editor
    // dibuat (setContent emitUpdate:false), jadi run pertama bisa kena doc kosong.
    recompute();
    let done = false;
    const onTx = () => {
      if (done || editor.isDestroyed) return;
      if (editor.state.doc.content.size > 2) {
        done = true;
        editor.off('transaction', onTx);
        Promise.resolve().then(() => { if (!editor.isDestroyed) recompute(); });
      }
    };
    editor.on('transaction', onTx);

    // Hitung ulang (debounce) saat mengetik.
    let timer: any = null;
    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recompute, DEBOUNCE_MS);
    };
    editor.on('update', onUpdate);

    return () => {
      editor.off('transaction', onTx);
      editor.off('update', onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [editor, enabled, chapterId, codexEntries, findingsRef]);
}
