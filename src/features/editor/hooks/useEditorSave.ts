import { useState, useRef, useCallback, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { db } from '@/src/db';
import { useEditorPanel } from '@/src/contexts/EditorPanelContext';
import { registerActiveEditor, unregisterActiveEditor, ActiveEditorBridge } from '@/src/features/editor/editorBridge';

interface UseEditorSaveProps {
  chapterId: number;
  chapter: any;
  editor: Editor | null;
}

export function useEditorSave({ chapterId, chapter, editor }: UseEditorSaveProps) {
  const { setSaveStatus } = useEditorPanel();
  const [title, setTitle] = useState('');
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chapterIdRef = useRef(chapterId);
  const isMountedRef = useRef(true);
  const htmlRef = useRef(editor?.getHTML() || "");
  const saveFailedRef = useRef(false);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStatusTimeout = useCallback(() => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = null;
  }, []);

  const performSave = useCallback(async (id: number, content: string): Promise<void> => {
    clearStatusTimeout();
    if (isMountedRef.current) setSaveStatus('Menyimpan...');
    try {
      if (!Number.isInteger(id) || id <= 0) throw new Error('Bab tidak valid.');
      const affected = await db.chapters.update(id, { content, lastModified: Date.now() });
      if (affected !== 1) throw new Error('Bab tidak ditemukan. Draft belum tersimpan.');
      saveFailedRef.current = false;
      if (isMountedRef.current) {
        setSaveStatus('Tersimpan');
        statusTimeoutRef.current = setTimeout(() => {
          statusTimeoutRef.current = null;
          if (isMountedRef.current) setSaveStatus('');
        }, 2000);
      }
    } catch (err) {
      saveFailedRef.current = true;
      clearStatusTimeout();
      console.error('Failed to save chapter:', err);
      if (isMountedRef.current) setSaveStatus('Gagal menyimpan');
      // Caller yang mengubah DB/reload harus berhenti; draft editor tetap utuh.
      throw err;
    }
  }, [setSaveStatus, clearStatusTimeout]);

  // Autosave/lifecycle tidak punya pemanggil yang menunggu Promise. Error sudah
  // ditampilkan performSave; tangani rejection tanpa mengubah kontrak flush.
  const saveInBackground = useCallback((id: number, content: string) => {
    void performSave(id, content).catch(() => {});
  }, [performSave]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearStatusTimeout();
      // Final cleanup on unmount
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const html = htmlRef.current;
        if (chapterIdRef.current) {
          saveInBackground(chapterIdRef.current, html);
        }
      }
    };
  }, [editor, saveInBackground, clearStatusTimeout]);

  useEffect(() => {
    if (chapterIdRef.current !== chapterId) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveInBackground(chapterIdRef.current, htmlRef.current);
        saveTimeoutRef.current = null;
      }
      chapterIdRef.current = chapterId;
    }
  }, [chapterId, saveInBackground]);

  // Flush segera: batalkan timer debounce lalu simpan konten editor TERKINI ke DB.
  // Dipakai sebelum operasi lintas-bab (mis. Find & Replace global) agar edit yang
  // belum tersimpan tidak hilang. Membaca HTML langsung dari editor (bukan htmlRef)
  // agar tetap akurat walau belum ada event update sejak mount.
  const flushNow = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const id = chapterIdRef.current;
    const html = editor && !editor.isDestroyed ? editor.getHTML() : htmlRef.current;
    htmlRef.current = html;
    await performSave(id, html);
  }, [editor, performSave]);

  // Daftarkan editor aktif ke bridge agar operasi lintas-bab bisa flush + reload aman.
  useEffect(() => {
    if (!editor) return;
    const bridge: ActiveEditorBridge = {
      getChapterId: () => chapterIdRef.current,
      flush: flushNow,
      reload: async () => {
        if (saveFailedRef.current) {
          throw new Error('Draft belum tersimpan. Coba simpan ulang sebelum memuat ulang editor.');
        }
        if (!editor || editor.isDestroyed) return;
        const fresh = await db.chapters.get(chapterIdRef.current);
        if (!editor || editor.isDestroyed) return;
        const content = fresh?.content ?? '';
        // emitUpdate:false → tidak memicu autosave (mencegah penimpaan balik hasil replace).
        editor.commands.setContent(content, { emitUpdate: false });
        // Selaraskan snapshot flush agar flush unmount/ganti-bab berikutnya tak memakai
        // konten basi pra-replace.
        htmlRef.current = content;
      },
    };
    registerActiveEditor(bridge);
    return () => unregisterActiveEditor(bridge);
  }, [editor, flushNow]);

  // Sync title when chapter loads
  useEffect(() => {
    if (chapter) {
      if (title !== chapter.title) {
        setTitle(chapter.title);
      }
    }
  }, [chapter?.title]); // Only dependency needed is title, not content

  const onEditorUpdate = useCallback(({ editor: currentEditor }: { editor: Editor }) => {
    const idToSave = chapterIdRef.current;

    // Tangkap konten terkini SEGERA (bukan di dalam timeout) agar flush saat ganti
    // bab / unmount selalu menyimpan teks terbaru, bukan snapshot lama. Mencegah
    // kehilangan edit terakhir bila user pindah bab/keluar < 1.5s setelah mengetik.
    htmlRef.current = currentEditor.getHTML();

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    clearStatusTimeout();
    setSaveStatus('Menyimpan...');

    saveTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        saveInBackground(idToSave, htmlRef.current);
        saveTimeoutRef.current = null;
      }
    }, 1500);
  }, [setSaveStatus, saveInBackground, clearStatusTimeout]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    db.chapters.update(chapterIdRef.current, { title: newTitle });
  }, []);

  return {
    title,
    handleTitleChange,
    onEditorUpdate,
  };
}
