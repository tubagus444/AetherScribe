import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ChapterContentConflictError } from '@/src/lib/chapterContracts';
import { readChapter } from '@/src/services/chapterQueries';
import { saveChapterContent, updateChapter } from '@/src/services/chapterOperations';
import { useEditorPanel } from '@/src/contexts/EditorPanelContext';
import { useToast } from '@/src/hooks/useToast';
import { registerActiveEditor, unregisterActiveEditor, type ActiveEditorBridge } from '@/src/features/editor/editorBridge';
import type { Chapter } from '@/src/types';

interface UseEditorSaveProps {
  chapterId: number;
  chapter: Pick<Chapter, 'title' | 'content'> | null | undefined;
  editor: Editor | null;
}

interface DraftState {
  baseContent?: string;
  pending?: string;
  writing?: Promise<void>;
  mounted: boolean;
  saveTimer?: ReturnType<typeof setTimeout>;
  statusTimer?: ReturnType<typeof setTimeout>;
}

export function useEditorSave({ chapterId, chapter, editor }: UseEditorSaveProps) {
  const { setSaveStatus } = useEditorPanel();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const draft = useMemo<DraftState>(() => ({ mounted: false }), [chapterId]);

  const initialContent = chapter?.content;
  useEffect(() => {
    draft.baseContent ??= initialContent;
  }, [draft, initialContent]);

  const flushNow = useCallback(async () => {
    clearTimeout(draft.saveTimer);
    draft.saveTimer = undefined;

    while (draft.pending !== undefined) {
      if (!draft.writing) {
        const content = draft.pending;
        const write = async () => {
          try {
            if (draft.baseContent === undefined) throw new Error('Isi awal bab belum dimuat.');
            await saveChapterContent(chapterId, content, draft.baseContent);
            draft.baseContent = content;
            if (draft.pending === content) {
              draft.pending = undefined;
              if (draft.mounted) {
                setSaveStatus('Tersimpan');
                draft.statusTimer = setTimeout(() => {
                  if (draft.mounted) setSaveStatus('');
                }, 2000);
              }
            }
          } catch (error) {
            if (draft.mounted) {
              setSaveStatus(error instanceof ChapterContentConflictError
                ? 'Gagal menyimpan. Isi bab telah berubah. Salin draf sebelum memuat ulang.'
                : 'Gagal menyimpan');
            }
            console.error('Failed to save chapter:', error);
            throw error;
          }
        };
        draft.writing = write().finally(() => { draft.writing = undefined; });
      }
      await draft.writing;
    }
  }, [chapterId, draft, setSaveStatus]);

  const saveInBackground = useCallback(() => {
    void flushNow().catch(() => {});
  }, [flushNow]);

  useEffect(() => {
    draft.mounted = true;
    return () => {
      draft.mounted = false;
      clearTimeout(draft.statusTimer);
      if (draft.saveTimer !== undefined) saveInBackground();
    };
  }, [draft, saveInBackground]);

  useEffect(() => {
    if (!editor) return;
    const bridge: ActiveEditorBridge = {
      getChapterId: () => chapterId,
      flush: flushNow,
      reload: async () => {
        const ensureClean = () => {
          if (draft.pending !== undefined) {
            throw new Error('Draft belum tersimpan. Coba simpan ulang sebelum memuat ulang editor.');
          }
        };
        ensureClean();
        if (editor.isDestroyed) return;
        const fresh = await readChapter(chapterId);
        if (editor.isDestroyed || !draft.mounted) return;
        ensureClean();
        editor.commands.setContent(fresh?.content ?? '', { emitUpdate: false });
        draft.baseContent = fresh?.content;
      },
    };
    registerActiveEditor(bridge);
    return () => unregisterActiveEditor(bridge);
  }, [chapterId, draft, editor, flushNow]);

  useEffect(() => {
    if (chapter?.title !== undefined) setTitle(chapter.title);
  }, [chapter?.title]);

  const onEditorUpdate = useCallback(({ editor: currentEditor }: { editor: Editor }) => {
    draft.pending = currentEditor.getHTML();
    clearTimeout(draft.saveTimer);
    clearTimeout(draft.statusTimer);
    setSaveStatus('Menyimpan...');
    draft.saveTimer = setTimeout(saveInBackground, 1500);
  }, [draft, saveInBackground, setSaveStatus]);

  const handleTitleChange = useCallback(async (newTitle: string) => {
    setTitle(newTitle);
    try {
      await updateChapter(chapterId, { title: newTitle });
    } catch (error) {
      console.error('Failed to save chapter title:', error);
      toast.error('Gagal menyimpan judul bab. Ubah judul untuk mencoba lagi.');
    }
  }, [chapterId, toast]);

  return { title, handleTitleChange, onEditorUpdate };
}
