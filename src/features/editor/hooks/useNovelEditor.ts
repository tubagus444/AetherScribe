/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import type { EditorBindings } from '@/src/features/editor/hooks/useEditorSetup';
import { useEditorSave } from '@/src/features/editor/hooks/useEditorSave';
import { useEditorCodexSync } from '@/src/features/editor/hooks/useEditorCodex';
import { useEditorAIConsistency } from '@/src/features/editor/hooks/useEditorAIConsistency';
import { useEditorSpelling } from '@/src/features/editor/hooks/useEditorSpelling';
import { useEditorGlossary } from '@/src/features/editor/hooks/useEditorGlossary';
import { useTypewriterMode } from '@/src/features/editor/hooks/useTypewriterMode';
import { useEditorAI } from '@/src/features/editor/hooks/useEditorAI';
import { useEditorSearch } from '@/src/features/editor/hooks/useEditorSearch';
import type { Chapter, CodexEntry, Relationship, StoryBibleRule } from '@/src/types';
import { InlineQuoteFinding, InlineSpellingFinding, InlineGlossaryFinding } from '@/src/lib/inlineConsistency';

interface UseNovelEditorProps {
  chapterId: number;
  chapter: Chapter;
  editor: Editor;
  bindings: RefObject<EditorBindings | null>;
  codexEntries: CodexEntry[];
  bibleRules: StoryBibleRule[];
  relationships?: Relationship[];
  isTypewriterMode: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;

}

export function useNovelEditor({
  chapterId,
  chapter,
  editor,
  bindings,
  codexEntries,
  bibleRules,
  relationships = [],
  isTypewriterMode,
  containerRef
}: UseNovelEditorProps) {

  const [activeCodexPopup, setActiveCodexPopup] = useState<{ id: number; x: number; y: number } | null>(null);

  // Temuan kutipan dari lapisan AI inline opsional (Fase 2).
  const consistencyQuotesRef = useRef<InlineQuoteFinding[]>([]);
  // Temuan salah-eja nama (Buku Gaya) — deterministik, nol token.
  const spellingFindingsRef = useRef<InlineSpellingFinding[]>([]);
  // Temuan glosarium istilah in-world (#8) — deterministik, nol token.
  const glossaryFindingsRef = useRef<InlineGlossaryFinding[]>([]);

  useEditorCodexSync(editor, codexEntries);
  useEditorSpelling(editor, spellingFindingsRef, chapterId, codexEntries);
  useEditorGlossary(editor, glossaryFindingsRef, chapterId, chapter.projectId);
  const { checking: aiInlineChecking, checkAtSelection: checkConsistencySelection } = useEditorAIConsistency(
    editor, consistencyQuotesRef, chapterId, {
      chapterTitle: chapter.title,
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

  useLayoutEffect(() => {
    bindings.current = {
      codexEntries: codexEntries.filter(entry => !entry.hidden),
      onCodexClick: (id, event) => setActiveCodexPopup({ id, x: event.clientX, y: event.clientY }),
      onUpdate: onEditorUpdate,
      getConsistencyQuotes: () => consistencyQuotesRef.current,
      getConsistencySpelling: () => spellingFindingsRef.current,
      getConsistencyGlossary: () => glossaryFindingsRef.current,
    };
    return () => { bindings.current = null; };
  }, [bindings, codexEntries, onEditorUpdate]);

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

  return {
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

