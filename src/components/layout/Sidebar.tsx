/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  ScrollText, FileText, LayoutList, BarChart2, Database, BookMarked, 
  Book, Users, CalendarClock, CalendarDays, ClipboardList, Sparkles, 
  Map as MapIcon, Waypoints, Share2, Network, ShieldCheck, Flame, 
  Crosshair, Gauge, Telescope, BrainCircuit, Settings, HelpCircle, 
  AlertTriangle, ChevronRight
} from 'lucide-react';
import { useProject } from '@/src/contexts/ProjectContext';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useUI } from '@/src/contexts/UIContext';
import { updateProject } from '@/src/services/projectOperations';
import { cn } from '@/src/lib/utils';
import { ChapterList } from '@/src/features/chapters/components/ChapterList';
import { 
  STUDIOS, 
  getStudioForViewMode, 
  getLastActiveTabForStudio, 
  rememberLastActiveTab,
  StudioId 
} from '@/src/lib/studioNavigation';
import { ViewMode } from '@/src/types';

function renderStudioIcon(iconName: string, size = 16, className = "shrink-0") {
  switch (iconName) {
    case 'FileText': return <FileText size={size} className={className} />;
    case 'Database': return <Database size={size} className={className} />;
    case 'Map': return <MapIcon size={size} className={className} />;
    case 'ShieldCheck': return <ShieldCheck size={size} className={className} />;
    case 'BrainCircuit': return <BrainCircuit size={size} className={className} />;
    case 'Settings': return <Settings size={size} className={className} />;
    case 'LayoutList': return <LayoutList size={size} className={className} />;
    case 'BarChart2': return <BarChart2 size={size} className={className} />;
    case 'BookMarked': return <BookMarked size={size} className={className} />;
    case 'Book': return <Book size={size} className={className} />;
    case 'Users': return <Users size={size} className={className} />;
    case 'CalendarClock': return <CalendarClock size={size} className={className} />;
    case 'CalendarDays': return <CalendarDays size={size} className={className} />;
    case 'ClipboardList': return <ClipboardList size={size} className={className} />;
    case 'Sparkles': return <Sparkles size={size} className={className} />;
    case 'Waypoints': return <Waypoints size={size} className={className} />;
    case 'Share2': return <Share2 size={size} className={className} />;
    case 'Network': return <Network size={size} className={className} />;
    case 'Flame': return <Flame size={size} className={className} />;
    case 'Crosshair': return <Crosshair size={size} className={className} />;
    case 'Gauge': return <Gauge size={size} className={className} />;
    case 'Telescope': return <Telescope size={size} className={className} />;
    case 'HelpCircle': return <HelpCircle size={size} className={className} />;
    case 'AlertTriangle': return <AlertTriangle size={size} className={className} />;
    default: return <Sparkles size={size} className={className} />;
  }
}

export function Sidebar() {
  const { projectId, project } = useProject();
  const { activeChapterId, setActiveChapterId, viewMode, setViewMode } = useNavigation();
  const { setSidebarOpen } = useUI();

  const currentStudioId = getStudioForViewMode(viewMode);

  const handleStudioClick = (studioId: StudioId) => {
    if (studioId === currentStudioId) return;
    const targetMode = getLastActiveTabForStudio(studioId);
    rememberLastActiveTab(studioId, targetMode);
    setViewMode(targetMode);
  };

  const handleSubTabClick = (studioId: StudioId, mode: ViewMode) => {
    rememberLastActiveTab(studioId, mode);
    setViewMode(mode);
    if (window.innerWidth < 768 && mode !== 'write') {
      setSidebarOpen(false);
    }
  };

  // 5 Studio Utama
  const mainStudios = STUDIOS.filter((s) => s.id !== 'system');
  const isWritingStudio = currentStudioId === 'writing';

  return (
    <aside className="w-[260px] h-full flex flex-col relative shrink-0 bg-white dark:bg-slate-900 select-none">
      {/* Header Judul Proyek */}
      <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 dark:bg-indigo-500 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs">
            <ScrollText size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <input
              className="font-bold text-sm tracking-tight bg-transparent focus:outline-none w-full border-none p-0 h-auto text-slate-900 dark:text-slate-100 truncate"
              value={project?.name || ''}
              onChange={(e) => projectId && updateProject(projectId, { name: e.target.value })}
              placeholder="Novel Tanpa Judul"
            />
            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.18em]">
              AetherScribe IWE
            </p>
          </div>
        </div>
      </div>

      {/* Konten Navigasi Utama */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Daftar 5 Studio Utama */}
        <div className="p-3 space-y-1 shrink-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 px-2.5 mb-1.5">
            Ruang Kerja
          </p>
          {mainStudios.map((studio) => {
            const isStudioActive = currentStudioId === studio.id;
            return (
              <div key={studio.id} className="space-y-0.5">
                <button
                  onClick={() => handleStudioClick(studio.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-all text-left cursor-pointer group",
                    isStudioActive
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={cn(
                      "transition-colors",
                      isStudioActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                    )}>
                      {renderStudioIcon(studio.icon, 15)}
                    </span>
                    <span className="truncate">{studio.label}</span>
                  </div>
                  <ChevronRight 
                    size={13} 
                    className={cn(
                      "transition-transform opacity-40 group-hover:opacity-100", 
                      isStudioActive ? "rotate-90 text-indigo-600 dark:text-indigo-400 opacity-80" : ""
                    )} 
                  />
                </button>

                {/* Sub-item hanya ditampilkan untuk studio yang sedang aktif */}
                {isStudioActive && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l-2 border-indigo-200 dark:border-indigo-900/60 ml-3.5 my-1">
                    {studio.tabs.map((tab) => {
                      const isTabActive = viewMode === tab.mode;
                      return (
                        <button
                          key={tab.mode}
                          onClick={() => handleSubTabClick(studio.id, tab.mode)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all text-left cursor-pointer",
                            isTabActive
                              ? "bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 font-semibold"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40"
                          )}
                        >
                          <span className={isTabActive ? "text-indigo-600 dark:text-indigo-400" : "opacity-60"}>
                            {renderStudioIcon(tab.icon, 12)}
                          </span>
                          <span className="truncate">{tab.shortLabel || tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Khusus Mode Menulis: Daftar Bab Mendapat Seluruh Ruang Vertikal Sisa */}
        {isWritingStudio && projectId && (
          <div className="flex-1 min-h-0 flex flex-col border-t border-slate-100 dark:border-slate-800/80 px-2 pt-2">
            <div className="px-2 py-1 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                Daftar Bab
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChapterList
                projectId={projectId}
                activeChapterId={activeChapterId}
                onSelect={(id) => {
                  setActiveChapterId(id);
                  setViewMode('write');
                  if (window.innerWidth < 768) {
                    setSidebarOpen(false);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Utilitas Sistem (Minimalist Icon Dock Bar) */}
      <div className="px-3.5 py-2.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/95 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Sistem
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setViewMode('settings');
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer",
              viewMode === 'settings'
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-semibold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
            )}
            title="Pengaturan Aplikasi"
            aria-label="Pengaturan Aplikasi"
          >
            <Settings size={15} />
          </button>

          <button
            onClick={() => {
              setViewMode('guide');
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer",
              viewMode === 'guide'
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-semibold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
            )}
            title="Panduan Penggunaan"
            aria-label="Panduan Penggunaan"
          >
            <HelpCircle size={15} />
          </button>

          <button
            onClick={() => {
              setViewMode('errors');
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer",
              viewMode === 'errors'
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-semibold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
            )}
            title="Catatan Error & Log"
            aria-label="Catatan Error & Log"
          >
            <AlertTriangle size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
