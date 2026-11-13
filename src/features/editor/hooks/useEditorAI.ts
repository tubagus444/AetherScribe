import { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { getRelevantContext, getRelevantBibleRules } from '@/src/services/contextEngine';
import { processRewrite, cancelAI } from '@/src/services/ai';
import { cleanRewriteOutput } from '@/src/lib/cleanRewriteOutput';
import { createAutoSnapshot } from '@/src/services/snapshotService';
import { useToast } from '@/src/hooks/useToast';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { CodexEntry } from '@/src/types';

// Custom Keymap Extension
export const CustomAIKeymap = Extension.create({
  name: 'customAIKeymap',
  addKeyboardShortcuts() {
    return {
      'Mod-b': ({ editor }) => editor.commands.toggleBold(),
      'Mod-i': ({ editor }) => editor.commands.toggleItalic(),
    }
  },
});

export interface RewritePreview {
  original: string;
  rewritten: string;
  from: number;
  to: number;
}

export function useEditorAI(
  editor: Editor | null,
  chapterId: number,
  codexEntries: CodexEntry[],
  bibleRules: any[],
  relationships: import('@/src/types').Relationship[] = []
) {
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [rewritePreview, setRewritePreview] = useState<RewritePreview | null>(null);
  const { toast } = useToast();
  const { setViewMode } = useNavigation();
  
  const streamBufferRef = useRef<string>('');
  const isStreamingRef = useRef<boolean>(false);
  const runRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    setIsAiProcessing(false);
    setRetryStatus(null);
    setRewritePreview(null);
    return () => {
    ++runRef.current;
    isStreamingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    cancelAI('rewrite');
    };
  }, [chapterId, editor]);

  const runAiAction = async (action: string, provider?: string, customPrompt?: string) => {
    if (!editor || isStreamingRef.current) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    
    if (selectedText.length < 5) return;

    const run = ++runRef.current;
    setIsAiProcessing(true);
    setRetryStatus(null);
    setRewritePreview(null);
    try {
      const chapterContent = editor.getText();
      const textBeforeCursor = editor.state.doc.textBetween(Math.max(0, from - 2000), from, ' ');

      streamBufferRef.current = "";
      isStreamingRef.current = true;
      setRewritePreview({
        original: selectedText,
        rewritten: "",
        from,
        to
      });

      const flushBuffer = () => {
        if (!isStreamingRef.current) return;
        setRewritePreview(prev => prev ? { ...prev, rewritten: streamBufferRef.current } : null);
      };

      timerRef.current = setInterval(flushBuffer, 50);

      const result = await processRewrite({
        action,
        selection: selectedText,
        bibleRules: bibleRules,
        codexEntries: codexEntries,
        relationships: relationships,
        prompt: customPrompt || '',
        chapterId,
        provider,
        contextText: chapterContent,
        ragContextText: textBeforeCursor,
        stream: true,
        onRetry: (attempt, error, currentProvider) => {
          if (run !== runRef.current) return;
          streamBufferRef.current = "";
          setRetryStatus(`Koneksi melambat (${currentProvider}). Percobaan ulang ke-${attempt}...`);
        },
        onChunk: (chunk) => {
           if (run === runRef.current) streamBufferRef.current += chunk;
        }
      });

      if (run !== runRef.current) return;
      isStreamingRef.current = false;
      
      // Hasil final dari attempt sukses adalah sumber utama, bukan buffer parsial.
      const finalRewritten = cleanRewriteOutput(result);
      setRewritePreview({
        original: selectedText,
        rewritten: finalRewritten,
        from,
        to
      });
    } catch (err: any) {
      if (run !== runRef.current) return;
      setRewritePreview(null);
      console.error(err);
      if (err.code === 'INVALID_KEY' || err.code === 'QUOTA_EXCEEDED') {
        toast.error(err.message, {
          action: {
            label: 'Buka Pengaturan',
            onClick: () => {
              setViewMode('settings');
            }
          }
        });
      } else {
        toast.error(err.message || 'AI Rewrite failed. Please try again.');
      }
    } finally {
      if (run !== runRef.current) return;
      isStreamingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setIsAiProcessing(false);
      setRetryStatus(null);
    }
  };

  const acceptRewrite = () => {
    if (!editor || !rewritePreview) return;
    const { from, to, rewritten } = rewritePreview;

    // Aksi destruktif (menimpa teks terpilih) → simpan titik balik otomatis dulu.
    createAutoSnapshot(chapterId, editor.getHTML(), 'Sebelum tenun AI');

    editor.chain().focus().insertContentAt({ from, to }, rewritten).run();
    setRewritePreview(null);
    toast.success('Tulisan berhasil diperbarui!');
  };

  const insertRewriteBelow = () => {
    if (!editor || !rewritePreview) return;
    const { to, rewritten } = rewritePreview;
    
    // Insert after current block cleanly
    editor.chain().focus().insertContentAt(to, `\n\n${rewritten}`).run();
    setRewritePreview(null);
    toast.success('Hasil tenunan disisipkan di bawah teks asli!');
  };

  const discardRewrite = () => {
    setRewritePreview(null);
    toast.info('Perubahan dibatalkan.');
  };

  return {
    isAiProcessing,
    retryStatus,
    rewritePreview,
    setRewritePreview,
    runAiAction,
    acceptRewrite,
    insertRewriteBelow,
    discardRewrite
  };
}
