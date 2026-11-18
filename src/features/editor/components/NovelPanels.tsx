/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Editor } from '@tiptap/core';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
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
  codexEntries: any[];
  bibleRules: any[];
  relationships?: any[];
  focusCommentId?: string | null;
  onFocusCommentConsumed?: () => void;
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
              {activePanel === 'outline' && (
                <ChapterOutline editor={editor} />
              )}

              {activePanel === 'comments' && (
                <RevisionNotesPanel
                  editor={editor}
                  focusCommentId={focusCommentId}
                  onFocusConsumed={onFocusCommentConsumed}
                />
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
                  onRestore={async (text) => {
                    await restoreChapterSnapshot(chapterId, text);
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
