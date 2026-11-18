/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useChapter } from '@/src/hooks/useChapterQueries';
import React from 'react';
import { ChevronRight, Search, Moon, Sun, Zap, Download, ReplaceAll } from 'lucide-react';
import { useProject } from '@/src/contexts/ProjectContext';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useUI } from '@/src/contexts/UIContext';
import { WritingStats } from '@/src/components/common/WritingStats';
import { ContextMeter } from '@/src/components/common/ContextMeter';
import { cn } from '@/src/lib/utils';

// Label breadcrumb per-viewMode (Indonesia), selaras dengan Sidebar. Fallback ke
// nilai mentah agar mode baru tak pernah kehilangan label.
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', write: 'Editor', outline: 'Papan Rencana',
  codex: 'Kamus Data', glossary: 'Glosarium', bible: 'Buku Cerita',
  relationships: 'Relasi Karakter', timeline: 'Timeline Cerita', worldcalendar: 'Kalender Dunia', orphans: 'Saran Entitas',
  factions: 'Faksi & Kelompok', completeness: 'Kesehatan Codex', graph: 'Graf Lore',
  consistency: 'Cek Konsistensi', continuity: 'Peta Kontinuitas', arc: 'Lensa Karakter',
  prose: 'Wawasan Prosa', promises: 'Janji Plot', search: 'Cari Adegan', heatmap: 'Heatmap Tensi',
  brainstorm: 'Studio Asisten', actions: 'Snippet AI', workshop: 'Lokakarya Codex',
  settings: 'Pengaturan', guide: 'Panduan', errors: 'Log Error',
  atlas: 'Atlas Dunia',
};

export function Header() {
  const { projectId, project } = useProject();
  const { viewMode, activeChapterId } = useNavigation();
  const activeChapter = useChapter(activeChapterId);

  const { 
    sidebarOpen, 
    setSidebarOpen, 
    isFocusMode, 
    setIsSearchOpen,
    setIsReplaceOpen,
    setIsExportOpen,
    setIsProjectManagerOpen,
    theme,
    toggleTheme 
  } = useUI();

  if (isFocusMode) return null;

  return (
    <header className="relative h-14 flex-none border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 md:px-5 bg-background z-[var(--z-sticky)] shadow-sm transition-colors gap-4">
      {/* Left: Navigation Group */}
      <div className="flex flex-1 items-center gap-1.5 md:gap-3 min-w-0">
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md text-slate-400 dark:text-slate-500 hover:text-indigo-600 transition-colors flex-shrink-0"
          aria-label="Tampilkan/Sembunyikan Sidebar"
          title="Tampilkan/Sembunyikan Sidebar"
        >
          <ChevronRight size={18} className={cn("transition-transform", sidebarOpen && "rotate-180")} />
        </button>
        
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />
        
        <button 
          onClick={() => setIsProjectManagerOpen(true)}
          className="flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg group transition-all max-w-[150px] md:max-w-[250px] flex-shrink min-w-0"
          title="Ganti Proyek/Naskah"
        >
          <Zap size={14} className="flex-shrink-0 text-amber-500 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest truncate">
            {project?.name || 'Tanpa Judul'}
          </span>
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 flex-shrink-0 mx-1 hidden sm:block" />
        
        <button
          onClick={() => setIsSearchOpen(true)}
          className="p-1.5 flex items-center justify-center bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md text-slate-400 dark:text-slate-500 hover:text-indigo-600 transition-colors flex-shrink-0"
          title="Pencarian Global (Ctrl+K)"
        >
          <Search size={16} />
        </button>

        <button
          type="button"
          onClick={() => setIsReplaceOpen(true)}
          className="p-1.5 flex items-center justify-center bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md text-slate-400 dark:text-slate-500 hover:text-indigo-600 transition-colors flex-shrink-0"
          title="Ganti di Seluruh Naskah"
        >
          <ReplaceAll size={16} />
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 flex-shrink-0 mx-1 hidden sm:block" />
        
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate max-w-[80px] md:max-w-[120px] flex-shrink ml-1 min-w-0">
          {viewMode === 'write' && activeChapter ? `${activeChapter.title}` : (VIEW_LABELS[viewMode] || viewMode)}
        </span>
      </div>
      
      {/* Right: Actions Group */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {projectId && (
          <div className="flex-shrink-0 flex items-center gap-2">
            <ContextMeter />
            <WritingStats projectId={projectId} />
          </div>
        )}
        
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

        <div className="flex items-center gap-1 flex-shrink-0">
          <button 
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md"
            title={theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          
          <button 
            onClick={() => setIsExportOpen(true)} 
            className="flex items-center justify-center p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md"
            title="Ekspor Proyek"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
