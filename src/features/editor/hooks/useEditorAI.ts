import { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Extension, type EditorEvents } from '@tiptap/core';
import type { Slice } from '@tiptap/pm/model';
import { processRewrite, cancelAI } from '@/src/services/ai';
import type { StreamFinishStatus } from '@/src/services/ai/types';
import { cleanRewriteOutput } from '@/src/lib/cleanRewriteOutput';
import { SNIPPET_INSERTION_HIGHLIGHT, snippetInsertionHighlightKey } from '@/src/features/editor/extensions/SnippetInsertionHighlight';
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
  targetValid: boolean;
  status: 'streaming' | StreamFinishStatus;
}

type RewriteTarget = { from: number; to: number; slice: Slice };

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
  const targetRef = useRef<RewriteTarget | null>(null);
  const finalTextRef = useRef('');
  useEffect(() => {
    setIsAiProcessing(false);
    setRetryStatus(null);
    setRewritePreview(null);
    const trackTarget = ({ transaction, appendedTransactions }: EditorEvents['transaction']) => {
      const target = targetRef.current;
      if (!target || !editor) return;
      if (!transaction.docChanged && !appendedTransactions.some(change => change.docChanged)) return;
      let { from, to } = target;
      let touched = false;
      for (const change of [transaction, ...appendedTransactions]) {
        for (const map of change.mapping.maps) {
          map.forEach((start, end) => {
            if (start < to && end > from) touched = true;
          });
          from = map.map(from, 1);
          to = map.map(to, -1);
        }
      }
      if (touched || from >= to || !editor.state.doc.slice(from, to).eq(target.slice)) {
        targetRef.current = null;
        setRewritePreview(prev => prev && { ...prev, targetValid: false });
      } else {
        targetRef.current = { ...target, from, to };
      }
    };
    editor?.on('transaction', trackTarget);
    return () => {
      editor?.off('transaction', trackTarget);
      ++runRef.current;
      isStreamingRef.current = false;
      targetRef.current = null;
      finalTextRef.current = '';
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
    targetRef.current = { from, to, slice: editor.state.doc.slice(from, to) };
    finalTextRef.current = '';
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
        targetValid: true,
        status: 'streaming',
      });

      const flushBuffer = () => {
        if (!isStreamingRef.current) return;
        const rewritten = streamBufferRef.current;
        setRewritePreview(prev => prev && prev.rewritten !== rewritten ? { ...prev, rewritten } : prev);
      };

      timerRef.current = setInterval(flushBuffer, 50);

      const completion: { status: StreamFinishStatus } = { status: 'complete' };
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
        onFinish: status => { completion.status = status; },
        onRetry: (attempt, error, currentProvider) => {
          if (run !== runRef.current) return;
          streamBufferRef.current = "";
          setRetryStatus(`Koneksi melambat (${currentProvider}). Percobaan ulang ke-${attempt}...`);
        },
        onChunk: (chunk) => {
          if (run !== runRef.current || !chunk) return;
          if (!streamBufferRef.current) setRetryStatus(null);
          streamBufferRef.current += chunk;
        }
      });

      if (run !== runRef.current) return;
      isStreamingRef.current = false;
      
      // Hasil final dari attempt sukses adalah sumber utama, bukan buffer parsial.
      const finalRewritten = cleanRewriteOutput(result);
      if (!finalRewritten) {
        targetRef.current = null;
        setRewritePreview(null);
        toast.error('Balasan AI belum berisi teks yang bisa diterapkan.');
        return;
      }
      finalTextRef.current = completion.status === 'complete' ? finalRewritten : '';
      setRewritePreview({
        original: selectedText,
        rewritten: finalRewritten,
        targetValid: targetRef.current !== null,
        status: completion.status,
      });
    } catch (err: any) {
      if (run !== runRef.current) return;
      targetRef.current = null;
      setRewritePreview(null);
      console.error('Rewrite failed; sensitive details omitted.');
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

  const reselectRewriteTarget = () => {
    if (!editor || targetRef.current || !rewritePreview) return;
    const { from, to, empty } = editor.state.selection;
    if (empty || !editor.state.doc.textBetween(from, to, ' ').trim()) return;
    targetRef.current = { from, to, slice: editor.state.doc.slice(from, to) };
    setRewritePreview(prev => prev && { ...prev, targetValid: true });
  };

  const applyRewrite = (replace: boolean) => {
    const target = targetRef.current;
    const rewritten = finalTextRef.current;
    if (!editor || editor.isDestroyed || !target || !rewritten || isStreamingRef.current) return;
    const { from, to } = target;
    if (!editor.state.doc.slice(from, to).eq(target.slice)) {
      targetRef.current = null;
      setRewritePreview(prev => prev && { ...prev, targetValid: false });
      return;
    }

    if (replace) void createAutoSnapshot(chapterId, editor.getHTML(), 'Sebelum tenun AI');
    // Cegah klik ganda dan abaikan transaksi yang dibuat oleh aksi ini sendiri.
    targetRef.current = null;
    const chain = editor.chain().focus(undefined, { scrollIntoView: replace }).insertContentAt(
      replace ? { from, to } : to,
      { type: 'text', text: replace ? rewritten : `\n\n${rewritten}` },
    );
    if (!replace) {
      chain.command(({ tr }) => {
        const end = tr.selection.to;
        const start = end - rewritten.length;
        if (start >= tr.mapping.map(to, -1) && end <= tr.mapping.map(to, 1) &&
            tr.doc.textBetween(start, end) === rewritten) {
          tr.setMeta(snippetInsertionHighlightKey, { from: start, to: end });
        }
        return true;
      });
    }
    const applied = chain.run();
    if (!applied) {
      targetRef.current = target;
      toast.error('Hasil tenunan belum bisa diterapkan.');
      return;
    }
    finalTextRef.current = '';
    setRewritePreview(null);
    if (!replace) {
      editor.view.dom.querySelector(`[${SNIPPET_INSERTION_HIGHLIGHT}]`)
        ?.scrollIntoView?.({ block: 'start', inline: 'nearest' });
    }
    toast.success(replace ? 'Tulisan berhasil diperbarui!' : 'Teks baru disisipkan.');
  };

  const discardRewrite = () => {
    ++runRef.current;
    if (isStreamingRef.current) cancelAI('rewrite');
    isStreamingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    targetRef.current = null;
    finalTextRef.current = '';
    setIsAiProcessing(false);
    setRetryStatus(null);
    setRewritePreview(null);
    toast.info('Perubahan dibatalkan.');
  };

  return {
    isAiProcessing,
    retryStatus,
    rewritePreview,
    reselectRewriteTarget,
    runAiAction,
    acceptRewrite: () => applyRewrite(true),
    insertRewriteBelow: () => applyRewrite(false),
    discardRewrite
  };
}
