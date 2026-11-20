import { normalizeViewMode } from '@/src/lib/studioNavigation';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScrollText, Plus, Loader2 } from 'lucide-react';
import { useProject } from '@/src/contexts/ProjectContext';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useUI } from '@/src/contexts/UIContext';
import { NovelEditor } from '@/src/features/editor/components/NovelEditor';
import { PanelErrorBoundary } from '@/src/components/common/PanelErrorBoundary';
import { StudioTabBar } from '@/src/components/layout/StudioTabBar';
import { cn } from '@/src/lib/utils';

// Lazy load heavy components
const OutlinePanel = lazy(() => import('@/src/features/chapters/components/OutlinePanel').then(m => ({ default: m.OutlinePanel })));
const CodexPanel = lazy(() => import('@/src/features/codex/components/CodexPanel').then(m => ({ default: m.CodexPanel })));
const ActionsPanel = lazy(() => import('@/src/features/editor/components/ActionsPanel').then(m => ({ default: m.ActionsPanel })));
const BiblePanel = lazy(() => import('@/src/features/lore/components/BiblePanel').then(m => ({ default: m.BiblePanel })));
const RelationshipMapper = lazy(() => import('@/src/features/lore/components/RelationshipMapper').then(m => ({ default: m.RelationshipMapper })));
const SettingsPanel = lazy(() => import('@/src/components/panels/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const GuidePanel = lazy(() => import('@/src/components/panels/GuidePanel').then(m => ({ default: m.GuidePanel })));
const ErrorLogPanel = lazy(() => import('@/src/components/panels/ErrorLogPanel').then(m => ({ default: m.ErrorLogPanel })));
const AIAssistantPanel = lazy(() => import('@/src/features/assistant/components/AIAssistantPanel').then(m => ({ default: m.AIAssistantPanel })));
const DashboardPanel = lazy(() => import('@/src/components/panels/DashboardPanel').then(m => ({ default: m.DashboardPanel })));
const ConsistencyPanel = lazy(() => import('@/src/features/consistency/components/ConsistencyPanel').then(m => ({ default: m.ConsistencyPanel })));
const ContinuityDashboard = lazy(() => import('@/src/features/consistency/components/ContinuityDashboard').then(m => ({ default: m.ContinuityDashboard })));
const ProseReportPanel = lazy(() => import('@/src/features/consistency/components/ProseReportPanel').then(m => ({ default: m.ProseReportPanel })));
const PacingHeatmapPanel = lazy(() => import('@/src/features/consistency/components/PacingHeatmapPanel').then(m => ({ default: m.PacingHeatmapPanel })));
const PlotPromisePanel = lazy(() => import('@/src/features/consistency/components/PlotPromisePanel').then(m => ({ default: m.PlotPromisePanel })));
const GlossaryPanel = lazy(() => import('@/src/features/consistency/components/GlossaryPanel').then(m => ({ default: m.GlossaryPanel })));
const TimelinePanel = lazy(() => import('@/src/features/timeline/components/TimelinePanel').then(m => ({ default: m.TimelinePanel })));
const WorldCalendarPanel = lazy(() => import('@/src/features/timeline/components/WorldCalendarPanel').then(m => ({ default: m.WorldCalendarPanel })));
const CodexHealthDashboard = lazy(() => import('@/src/features/codex/components/CodexHealthDashboard').then(m => ({ default: m.CodexHealthDashboard })));
const LoreGraphPanel = lazy(() => import('@/src/features/codex/components/LoreGraphPanel').then(m => ({ default: m.LoreGraphPanel })));
const FactionsPanel = lazy(() => import('@/src/features/lore/components/FactionsPanel').then(m => ({ default: m.FactionsPanel })));
const AtlasPanel = lazy(() => import('@/src/features/atlas/components/AtlasPanel').then(m => ({ default: m.AtlasPanel })));
const SemanticSearchPanel = lazy(() => import('@/src/features/search/components/SemanticSearchPanel').then(m => ({ default: m.SemanticSearchPanel })));
const CodexWorkshopPanel = lazy(() => import('@/src/features/codex-workshop/components/CodexWorkshopPanel').then(m => ({ default: m.CodexWorkshopPanel })));

function LoadingFallback() {
  return (
    <div className="h-full flex flex-col items-center justify-center opacity-50">
      <Loader2 className="animate-spin text-slate-400 mb-2" size={32} />
      <p className="text-sm text-slate-400 font-serif italic">Loading component...</p>
    </div>
  );
}

export function MainView() {
  const { projectId } = useProject();
  const { viewMode: requestedMode, activeChapterId, workshopTarget } = useNavigation();
  const viewMode = normalizeViewMode(requestedMode, !!workshopTarget);
  const { isFocusMode, setIsFocusMode } = useUI();

  return (
    <main className="flex-1 flex flex-col relative bg-background">
      {/* Focus Toggle (Exit) */}
      <AnimatePresence>
        {isFocusMode && (
          <motion.button 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setIsFocusMode(false)}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[var(--z-modal)] p-2.5 rounded-full transition-all duration-300 bg-slate-100/50 dark:bg-slate-800/50 backdrop-blur-sm text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100 shadow-sm"
            title="Exit Focus Mode"
          >
            <Plus className="rotate-45" size={22} />
          </motion.button>
        )}
      </AnimatePresence>

      {!isFocusMode && <StudioTabBar />}

      <PanelErrorBoundary resetKey={viewMode}>
      <div className="flex-1 overflow-hidden relative bg-background">
        {/* Persistent Editor: Conditionally mounted to save RAM as requested */}
        {viewMode === 'write' && (
          <div 
            className="absolute inset-0 z-10"
          >
            {activeChapterId && projectId ? (
              <NovelEditor 
                key={activeChapterId}
                chapterId={activeChapterId} 
                projectId={projectId} 
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <ScrollText size={48} className="mb-4 opacity-20" />
                <p className="font-serif italic text-lg text-slate-400">Select a chapter to begin your journey.</p>
              </div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {viewMode === 'outline' && projectId && (
            <ViewContainer key="outline" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <OutlinePanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'codex' && projectId && (
            <ViewContainer key="codex" className="z-20 !p-0 !overflow-hidden">
              <Suspense fallback={<LoadingFallback />}>
                <CodexPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'actions' && projectId && (
            <ViewContainer key="actions" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <ActionsPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'relationships' && projectId && (
            <ViewContainer key="relationships" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <RelationshipMapper projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'brainstorm' && projectId && (
            <ViewContainer key="brainstorm" className="z-20 !p-0">
              <Suspense fallback={<LoadingFallback />}>
                <AIAssistantPanel />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'bible' && projectId && (
            <ViewContainer key="bible" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <BiblePanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'settings' && (
            <ViewContainer key="settings" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <SettingsPanel />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'guide' && (
            <ViewContainer key="guide" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <GuidePanel />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'dashboard' && projectId && (
            <ViewContainer key="dashboard" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <DashboardPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'timeline' && projectId && (
            <ViewContainer key="timeline" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <TimelinePanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'worldcalendar' && projectId && (
            <ViewContainer key="worldcalendar" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <WorldCalendarPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'completeness' && projectId && (
            <ViewContainer key="completeness" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <CodexHealthDashboard projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'graph' && projectId && (
            <ViewContainer key="graph" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <LoreGraphPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'factions' && projectId && (
            <ViewContainer key="factions" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <FactionsPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'atlas' && projectId && (
            <ViewContainer key="atlas" className="z-20 !p-0 !overflow-hidden">
              <Suspense fallback={<LoadingFallback />}>
                <AtlasPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'search' && projectId && (
            <ViewContainer key="search" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <SemanticSearchPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'consistency' && projectId && (
            <ViewContainer key="consistency" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <ConsistencyPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'continuity' && projectId && (
            <ViewContainer key="continuity" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <ContinuityDashboard projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'prose' && projectId && (
            <ViewContainer key="prose" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <ProseReportPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'heatmap' && projectId && (
            <ViewContainer key="heatmap" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <PacingHeatmapPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'promises' && projectId && (
            <ViewContainer key="promises" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <PlotPromisePanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'glossary' && projectId && (
            <ViewContainer key="glossary" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <GlossaryPanel projectId={projectId} />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'errors' && (
            <ViewContainer key="errors" className="z-20">
              <Suspense fallback={<LoadingFallback />}>
                <ErrorLogPanel />
              </Suspense>
            </ViewContainer>
          )}

          {viewMode === 'workshop' && projectId && (
            <Suspense key="workshop" fallback={<LoadingFallback />}>
              <CodexWorkshopPanel projectId={projectId} />
            </Suspense>
          )}
        </AnimatePresence>
      </div>
      </PanelErrorBoundary>
    </main>
  );
}

function ViewContainer({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("absolute inset-0 p-4 sm:p-6 md:p-10 overflow-y-auto custom-scrollbar bg-background", className)}
    >
      {children}
    </motion.div>
  );
}

// Utility import already handled above
