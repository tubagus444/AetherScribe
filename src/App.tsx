import { AIProviderIndicator } from '@/src/components/common/AIProviderIndicator';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '@/src/lib/utils';
import { useProject } from '@/src/contexts/ProjectContext';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useUI } from '@/src/contexts/UIContext';
import { useGlobalEvents } from '@/src/hooks/useGlobalEvents';
import { useAutoBackup } from '@/src/hooks/useAutoBackup';
import { useAutoSummarizer } from '@/src/hooks/useAutoSummarizer';
import { useAutoSemanticIndex } from '@/src/hooks/useAutoSemanticIndex';
import { useStorageQuota } from '@/src/hooks/useStorageQuota';
import { useDbIssueListener } from '@/src/hooks/useDbIssueListener';
import { motion } from 'motion/react';
import { Sidebar } from '@/src/components/layout/Sidebar';
import { Header } from '@/src/components/layout/Header';
import { MainView } from '@/src/components/layout/MainView';
import { ProjectManagerModal } from '@/src/components/modals/ProjectManagerModal';
import { GlobalSearch } from '@/src/components/common/GlobalSearch';
import { CrossChapterReplace } from '@/src/components/modals/CrossChapterReplace';
import { ExportManager } from '@/src/components/modals/ExportManager';
import { IndexingIndicator } from '@/src/components/common/IndexingIndicator';
import { Suspense, useEffect } from 'react';

import { db, cleanupAILogs } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';

export default function App() {
  const { projectId, project, isLoading } = useProject();
  const { setActiveChapterId, setViewMode } = useNavigation();
  const { 
    isFocusMode,
    setIsFocusMode,
    sidebarOpen, 
    setSidebarOpen,
    isSearchOpen,
    setIsSearchOpen,
    isReplaceOpen,
    setIsReplaceOpen,
    isExportOpen,
    setIsExportOpen
  } = useUI();

  useEffect(() => {
    cleanupAILogs();
  }, []);

  // Handle global keyboard shortcuts and errors
  useGlobalEvents({ 
    setIsSearchOpen,
    onToggleFocusMode: () => setIsFocusMode(!isFocusMode)
  });

  // Initialize Auto-Backup system
  useAutoBackup();
  // Initialize Auto-Summarizer daemon
  useAutoSummarizer();
  // Initialize Auto Semantic Index daemon (re-index saat bab disimpan)
  useAutoSemanticIndex();

  // Surface kegagalan DB (terblokir/gagal buka/diperbarui di tab lain) sebagai toast.
  useDbIssueListener();

  // Check storage quota on init
  const { checkStorageQuota } = useStorageQuota();
  useEffect(() => {
    if (!isLoading) {
      checkStorageQuota();
    }
  }, [isLoading, checkStorageQuota]);

  if (isLoading || !projectId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-slate-400 dark:text-slate-500 font-mono text-xs uppercase tracking-widest">
        Memulai AetherScribe…
      </div>
    );
  }

  // Calculate shift: if sidebar is closed OR focus mode is on, we shift left by 260px
  const isSidebarActuallyOpen = sidebarOpen && !isFocusMode;
  const xOffset = isSidebarActuallyOpen ? 0 : -260;

  return (
    <div className={cn(
      "h-screen bg-background text-foreground overflow-hidden font-sans transition-colors duration-700 flex flex-col",
      isFocusMode && "bg-secondary"
    )}>
      <AIProviderIndicator />
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {isSidebarActuallyOpen && (
          <div 
            className="md:hidden fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        <motion.div 
          initial={false}
          animate={{ 
            width: isSidebarActuallyOpen ? 260 : 0,
          }}
          transition={{ type: 'spring', damping: 27, stiffness: 220 }}
          className={cn(
            "h-full overflow-hidden absolute md:relative z-50 flex-none bg-white dark:bg-slate-900 shadow-xl md:shadow-none border-r border-slate-200 dark:border-slate-800 transition-all",
            !isSidebarActuallyOpen && "border-none"
          )}
        >
          <div className="w-[260px] h-full">
            <Sidebar />
          </div>
        </motion.div>
        
        <div className="flex-1 min-w-0 flex flex-col relative bg-background z-10 w-full overflow-hidden">
          {!isFocusMode && <Header />}
          <MainView />
        </div>
      </div>

      <IndexingIndicator />
      <ProjectManagerModal />
      
      <Suspense fallback={null}>
        {isSearchOpen && projectId && (
          <GlobalSearch 
            projectId={projectId}
            onClose={() => setIsSearchOpen(false)}
            onSelectChapter={(id) => {
              setActiveChapterId(id);
              setViewMode('write');
            }}
            onSelectCodex={() => {
              setViewMode('codex');
            }}
          />
        )}

        {isReplaceOpen && projectId && (
          <CrossChapterReplace
            projectId={projectId}
            onClose={() => setIsReplaceOpen(false)}
            onSelectChapter={(id) => {
              setActiveChapterId(id);
              setViewMode('write');
            }}
          />
        )}

        {isExportOpen && projectId && (
          <ExportManager
            projectId={projectId}
            project={project}
            onClose={() => setIsExportOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
