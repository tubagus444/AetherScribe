/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback } from 'react';
import { useEditorSetup } from '@/src/features/editor/hooks/useEditorSetup';
import { useEditorSave } from '@/src/features/editor/hooks/useEditorSave';
import { useEditorCodexSync } from '@/src/features/editor/hooks/useEditorCodex';
import { useEditorAIConsistency } from '@/src/features/editor/hooks/useEditorAIConsistency';
import { useEditorSpelling } from '@/src/features/editor/hooks/useEditorSpelling';
import { useEditorGlossary } from '@/src/features/editor/hooks/useEditorGlossary';
import { useTypewriterMode } from '@/src/features/editor/hooks/useTypewriterMode';
import { useEditorAI } from '@/src/features/editor/hooks/useEditorAI';
import { useEditorSearch } from '@/src/features/editor/hooks/useEditorSearch';
import { CodexEntry } from '@/src/types';
import { InlineQuoteFinding, InlineSpellingFinding, InlineGlossaryFinding } from '@/src/lib/inlineConsistency';

interface UseNovelEditorProps {
  chapterId: number;
  chapter: any;
  codexEntries: CodexEntry[];
  bibleRules: any[];
  relationships?: import('@/src/types').Relationship[];
  aiActions: any[];
  isTypewriterMode: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;

}

export function useNovelEditor({
  chapterId,
  chapter,
  codexEntries,
  bibleRules,
  relationships = [],
  aiActions,
  isTypewriterMode,
  containerRef
}: UseNovelEditorProps) {

  const [activeCodexPopup, setActiveCodexPopup] = useState<{ id: number; x: number; y: number } | null>(null);

  // Ref stabil: onUpdate editor selalu memanggil versi terbaru onEditorUpdate (ED3).
  const onEditorUpdateRef = useRef<((props: any) => void) | null>(null);
  const handleEditorUpdate = useCallback((props: any) => onEditorUpdateRef.current?.(props), []);

  // Temuan kutipan dari lapisan AI inline opsional (Fase 2).
  const consistencyQuotesRef = useRef<InlineQuoteFinding[]>([]);
  const getConsistencyQuotes = useCallback(() => consistencyQuotesRef.current, []);
  // Temuan salah-eja nama (Buku Gaya) — deterministik, nol token.
  const spellingFindingsRef = useRef<InlineSpellingFinding[]>([]);
  const getConsistencySpelling = useCallback(() => spellingFindingsRef.current, []);
  // Temuan glosarium istilah in-world (#8) — deterministik, nol token.
  const glossaryFindingsRef = useRef<InlineGlossaryFinding[]>([]);
  const getConsistencyGlossary = useCallback(() => glossaryFindingsRef.current, []);

  const editor = useEditorSetup({
    chapterId,
    initialContent: chapter?.content,
    codexEntries,
    onCodexClick: (id, e) => setActiveCodexPopup({ id, x: e.clientX, y: e.clientY }),
    onUpdate: handleEditorUpdate,
    getConsistencyQuotes,
    getConsistencySpelling,
    getConsistencyGlossary,
  });

  useEditorCodexSync(editor, codexEntries);
  useEditorSpelling(editor, spellingFindingsRef, chapterId, codexEntries);
  useEditorGlossary(editor, glossaryFindingsRef, chapterId, chapter?.projectId ?? 0);
  const { checking: aiInlineChecking, checkAtSelection: checkConsistencySelection } = useEditorAIConsistency(
    editor, consistencyQuotesRef, chapterId, {
      chapterTitle: chapter?.title,
      codexEntries,
      bibleRules,
      relationships,
    }
  );

  const { title, handleTitleChange, onEditorUpdate } = useEditorSave({
    chapterId,
    chapter,
    editor
  });

  // Wire up the callback (dibaca lewat ref saat update terjadi → selalu versi terbaru)
  onEditorUpdateRef.current = onEditorUpdate;

  // Typewriter
  useTypewriterMode(editor, isTypewriterMode, containerRef, () => setActiveCodexPopup(null));

  // AI
  const { 
    isAiProcessing, 
    retryStatus,
    rewritePreview, 
    reselectRewriteTarget,
    runAiAction, 
    acceptRewrite, 
    insertRewriteBelow, 
    discardRewrite 
  } = useEditorAI(editor, chapterId, codexEntries, bibleRules, relationships);

  // Search
  const searchProps = useEditorSearch(editor, chapterId);

  // Keep Codex hook updated with the editor
  // (We passed null originally because we instantiated it before editor, but the effect uses `editor` dependencies in our refactored hook)
  // Actually, `useEditorCodex` takes `editor`. We can just call it AFTER editor setup!
  
  return {
    editor,
    title,
    handleTitleChange,
    isAiProcessing,
    aiInlineChecking,
    checkConsistencySelection,
    retryStatus,
    rewritePreview,
    reselectRewriteTarget,
    runAiAction,
    acceptRewrite,
    insertRewriteBelow,
    discardRewrite,
    activeCodexPopup,
    setActiveCodexPopup,
    ...searchProps
  };
}

