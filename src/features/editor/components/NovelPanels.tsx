/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { NovelNotesPanel } from '@/src/features/editor/components/NovelNotesPanel';
import { ChapterCodexPanel } from '@/src/features/editor/components/ChapterCodexPanel';
import type { CodexEntry } from '@/src/types';
import { Editor } from '@tiptap/core';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { useEditorPanel } from '@/src/contexts/EditorPanelContext';
import { PANEL_WIDTH } from '@/src/lib/constants';
import { restoreChapterSnapshot } from '@/src/services/chapterOperations';

// Lazy load side panels
const ScribbleAssistantPanel = React.lazy(() => import('@/src/features/assistant/components/ScribbleAssistantPanel').then(m => ({ default: m.ScribbleAssistantPanel })));
const SnapshotPanel = React.lazy(() => import('@/src/features/editor/components/SnapshotPanel').then(m => ({ default: m.SnapshotPanel })));
const ProseInsights = React.lazy(() => import('@/src/features/editor/components/ProseInsights').then(m => ({ default: m.ProseInsights })));
const ChapterOutline = React.lazy(() => import('@/src/features/editor/components/ChapterOutline').then(m => ({ default: m.ChapterOutline })));
const RevisionNotesPanel = React.lazy(() => import('@/src/features/editor/components/RevisionNotesPanel').then(m => ({ default: m.RevisionNotesPanel })));

interface NovelPanelsProps {
  projectId: number;
  chapterId: number;
  editor: Editor | null;
  codexEntries: CodexEntry[];
  bibleRules: any[];
  relationships?: any[];
  focusCommentId?: string | null;
  onFocusCommentConsumed?: () => void;
}

function EditorNotes({ projectId, chapterId, editor, focusCommentId, onFocusCommentConsumed }:
  Omit<NovelPanelsProps, 'codexEntries' | 'bibleRules' | 'relationships'>) {
  const [tab, setTab] = React.useState<'chapter' | 'text'>('chapter');
  const showText = Boolean(focusCommentId) || tab === 'text';

  return (
    <>
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button type="button" className="flex-1 p-2 text-sm aria-pressed:font-bold" aria-pressed={!showText} onClick={() => setTab('chapter')}>Catatan Bab</button>
        <button type="button" className="flex-1 p-2 text-sm aria-pressed:font-bold" aria-pressed={showText} onClick={() => setTab('text')}>Catatan Teks</button>
      </div>
      {showText ? (
        <div className="min-h-0 flex-1">
          <RevisionNotesPanel editor={editor} focusCommentId={focusCommentId} onFocusConsumed={() => {
            setTab('text');
            onFocusCommentConsumed?.();
          }} />
        </div>
      ) : <NovelNotesPanel projectId={projectId} chapterId={chapterId} />}
    </>
  );
}

export function NovelPanels({ projectId, chapterId, editor, codexEntries, bibleRules, relationships, focusCommentId, onFocusCommentConsumed }: NovelPanelsProps) {
  const { activePanel, setActivePanel } = useEditorPanel();
  
  return (
    <AnimatePresence>
      <React.Suspense fallback={
        <div className="h-full border-l border-slate-200 dark:border-slate-800 flex items-center justify-center bg-slate-50/50" style={{ width: activePanel !== 'none' ? PANEL_WIDTH : 0 }}>
          {activePanel !== 'none' && <Loader2 className="animate-spin text-slate-300" size={24} />}
        </div>
      }>
        {activePanel !== 'none' && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: window.innerWidth < 1024 ? (window.innerWidth < 400 ? '100%' : PANEL_WIDTH) : PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full absolute lg:relative right-0 top-0 z-50 lg:z-auto border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl lg:shadow-none"
          >
            <div className="h-full flex flex-col" style={{ width: window.innerWidth < 1024 && window.innerWidth < 400 ? '100%' : PANEL_WIDTH }}>
              {(activePanel === 'comments' || activePanel === 'chapterCodex') && (
                <button type="button" aria-label="Tutup panel editor" className="self-end p-2 lg:hidden" onClick={() => setActivePanel('none')}>
                  <X size={18} />
                </button>
              )}
              {activePanel === 'outline' && (
                <ChapterOutline editor={editor} />
              )}

              {activePanel === 'comments' && (
                <EditorNotes key={chapterId} projectId={projectId} chapterId={chapterId} editor={editor}
                  focusCommentId={focusCommentId} onFocusCommentConsumed={onFocusCommentConsumed} />
              )}

              {activePanel === 'chapterCodex' && editor && (
                <ChapterCodexPanel key={chapterId} editor={editor} entries={codexEntries} onJump={() => {
                  if (window.innerWidth < 1024) setActivePanel('none');
                }} />
              )}

              {activePanel === 'assistant' && (
                <ScribbleAssistantPanel 
                  projectId={projectId} 
                  chapterId={chapterId}
                  currentText={editor?.getText() || ''} 
                  onClose={() => setActivePanel('none')} 
                  onInsertText={(text) => {
                    editor?.commands.insertContent('\n\n' + text);
                  }}
                  codexEntries={codexEntries}
                  bibleRules={bibleRules}
                  relationships={relationships}
                  editor={editor}
                />
              )}

              {activePanel === 'snapshots' && (
                <SnapshotPanel 
                  chapterId={chapterId} 
                  currentContent={editor?.getHTML() || ''} 
                  onRestore={async (snapshotId) => {
                    await restoreChapterSnapshot(chapterId, snapshotId);
                    setActivePanel('none');
                  }} 
                />
              )}

              {activePanel === 'insights' && (
                <ProseInsights content={editor?.getText() || ''} />
              )}
            </div>
          </motion.div>
        )}
      </React.Suspense>
    </AnimatePresence>
  );
}
