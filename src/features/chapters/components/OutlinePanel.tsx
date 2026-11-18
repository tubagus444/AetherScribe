/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { 
  Plus, 
  GripVertical, 
  Trash2, 
  UserCircle, 
  Target, 
  LayoutGrid, 
  Columns, 
  Search, 
  BookOpen, 
  Filter,
  Activity, 
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  TrendingUp,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, countWords } from '@/src/lib/utils';
import { STATUS_COLORS, STATUS_DOTS } from '@/src/lib/constants';
import { useChapterManagement } from '@/src/features/chapters/hooks/useChapterManagement';
import { useChapterDragAndDrop } from '@/src/features/chapters/hooks/useChapterDragAndDrop';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { ChapterAct } from '@/src/types';

const STATUS_LANES: { id: 'outline' | 'draft' | 'edit' | 'polish' | 'done'; label: string; description: string; colorClass: string }[] = [
  { id: 'outline', label: 'Kerangka', description: 'Struktur ide & plot cerita', colorClass: 'border-t-2 border-slate-300 dark:border-slate-700' },
  { id: 'draft', label: 'Draf', description: 'Bab dalam proses penulisan', colorClass: 'border-t-2 border-indigo-500' },
  { id: 'edit', label: 'Revisi', description: 'Revisi & penyempurnaan isi', colorClass: 'border-t-2 border-amber-500' },
  { id: 'polish', label: 'Poles', description: 'Polesan gaya bahasa & diksi', colorClass: 'border-t-2 border-emerald-500' },
  { id: 'done', label: 'Selesai', description: 'Bab selesai & siap dipublikasi', colorClass: 'border-t-2 border-blue-500' }
];

const ACT_LANES: { id: ChapterAct; label: string; description: string; colorClass: string }[] = [
  { id: 'act-1', label: 'Babak I', description: 'Pengenalan & Insiden Pemicu', colorClass: 'border-t-2 border-blue-500' },
  { id: 'act-2a', label: 'Babak IIA', description: 'Aksi Meningkat (Rising Action)', colorClass: 'border-t-2 border-indigo-500' },
  { id: 'act-2b', label: 'Babak IIB', description: 'Krisis menuju Klimaks', colorClass: 'border-t-2 border-purple-500' },
  { id: 'act-3', label: 'Babak III', description: 'Klimaks & Resolusi', colorClass: 'border-t-2 border-rose-500' },
  { id: 'unassigned', label: 'Belum Ditentukan', description: 'Babak belum ditetapkan', colorClass: 'border-t-2 border-slate-400 dark:border-slate-600' }
];

const ACT_DOTS: Record<ChapterAct, string> = {
  'act-1': 'bg-blue-500',
  'act-2a': 'bg-indigo-500',
  'act-2b': 'bg-purple-500',
  'act-3': 'bg-rose-500',
  'unassigned': 'bg-slate-400 dark:bg-slate-500'
};

interface OutlinePanelProps {
  projectId: number;
}

export function OutlinePanel({ projectId }: OutlinePanelProps) {
  const { chapters, deleteConfirmId, updateField, deleteChapter, addChapter } = useChapterManagement(projectId);
  const { draggedId, handleDragStart, handleDragEnd, handleDragOver, handleDrop } = useChapterDragAndDrop(projectId);
  const { setActiveChapterId, setViewMode } = useNavigation();

  // UX Control States
  const [viewLayout, setViewLayout] = useState<'timeline' | 'kanban'>('timeline');
  const [kanbanDimension, setKanbanDimension] = useState<'status' | 'act'>('status');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPovFilter, setSelectedPovFilter] = useState<string | null>(null);
  const [globalExpandSummaries, setGlobalExpandSummaries] = useState(true);
  const [activeDropColumn, setActiveDropColumn] = useState<string | null>(null);

  // 1. Planning board statistics & insights
  const stats = useMemo(() => {
    if (!chapters) return { totalChapters: 0, totalWords: 0, totalGoal: 0, doneCount: 0, progressPercent: 0 };
    
    const totalChapters = chapters.length;
    const totalWords = chapters.reduce((sum, ch) => sum + countWords(ch.content || ''), 0);
    const totalGoal = chapters.reduce((sum, ch) => sum + (ch.wordGoal || 0), 0);
    const doneCount = chapters.filter(ch => ch.status === 'done').length;
    const progressPercent = totalGoal ? Math.min(100, Math.round((totalWords / totalGoal) * 100)) : 0;

    return { totalChapters, totalWords, totalGoal, doneCount, progressPercent };
  }, [chapters]);

  // Unique POVs list for pill navigation
  const uniquePOVs = useMemo(() => {
    if (!chapters) return [];
    return Array.from(new Set(chapters.map(ch => ch.pov?.trim()).filter(Boolean))) as string[];
  }, [chapters]);

  // Filtered Chapters based on search and POV
  const filteredChapters = useMemo(() => {
    if (!chapters) return [];
    return chapters.filter(chapter => {
      const titleMatch = chapter.title?.toLowerCase().includes(searchQuery.toLowerCase());
      const summaryMatch = chapter.summary?.toLowerCase().includes(searchQuery.toLowerCase());
      const povFieldMatch = chapter.pov?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSearch = titleMatch || summaryMatch || povFieldMatch;

      const matchesPov = selectedPovFilter 
        ? chapter.pov?.trim().toLowerCase() === selectedPovFilter.trim().toLowerCase() 
        : true;

      return matchesSearch && matchesPov;
    });
  }, [chapters, searchQuery, selectedPovFilter]);

  // Hanlde drops onto specific Kanban Columns/Lanes
  const handleDropOnColumn = async (e: React.DragEvent, laneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedId || !chapters) return;
    
    const draggedChapter = chapters.find(c => c.id === draggedId);
    if (draggedChapter) {
      if (kanbanDimension === 'status') {
        if (draggedChapter.status !== laneId) {
          await updateField(draggedId, 'status', laneId);
        }
      } else {
        if ((draggedChapter.act || 'unassigned') !== laneId) {
          await updateField(draggedId, 'act', laneId);
        }
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-24 px-4">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-md">
              <Sparkles size={20} className="animate-pulse" />
            </span>
            <h2 className="text-3xl font-serif font-bold text-slate-950 dark:text-slate-100 capitalize">Papan Rencana</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gambarkan draf cerita Bab demi Bab, pantau status menulis, target kata, dan visualisasikan narasi Anda.
          </p>
        </div>
        <button 
          onClick={addChapter}
          className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md hover:shadow-indigo-500/20 active:scale-95 shrink-0"
        >
          <Plus size={16} /> Tambah Bab Baru
        </button>
      </div>

      {/* STATISTICS PANEL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Total & Progres Bab */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4.5 rounded-xl shadow-sm flex flex-col justify-between group hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Bab Terencana</span>
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100/50 dark:border-indigo-500/20 group-hover:scale-105 transition-transform">
              <Bookmark size={14} className="text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold font-mono text-slate-900 dark:text-slate-100 tracking-tight">{stats.totalChapters}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">total bab</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <span><strong className="text-slate-700 dark:text-slate-300 font-mono">{stats.doneCount}</strong> dari <strong className="text-slate-700 dark:text-slate-300 font-mono">{stats.totalChapters}</strong> selesai</span>
          </div>
        </div>

        {/* Word Count Progress */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4.5 rounded-xl shadow-sm flex flex-col justify-between group hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Statistik Kata</span>
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100/50 dark:border-emerald-500/20 group-hover:scale-105 transition-transform">
              <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold font-mono text-slate-900 dark:text-slate-100 tracking-tight">{stats.totalWords.toLocaleString()}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">kata</span>
            {stats.totalGoal > 0 && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">/ {stats.totalGoal.toLocaleString()} target</span>
            )}
          </div>
          <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            {stats.totalGoal > 0 ? (
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-500 font-bold mb-1.5 uppercase tracking-widest">
                  <span>Progres Target</span>
                  <span className="font-mono">{stats.progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800/80 h-2 rounded-full overflow-hidden shadow-inner">
                  <div 
                    className={cn(
                      "h-full transition-all duration-700 rounded-full",
                      stats.progressPercent >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-indigo-400"
                    )}
                    style={{ width: `${stats.progressPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Activity size={13} className="text-amber-500" />
                <span>Belum ada target kata yang ditentukan.</span>
              </div>
            )}
          </div>
        </div>

        {/* POV Visual Tracker */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4.5 rounded-xl shadow-sm flex flex-col justify-between group hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Sudut Pandang (POV)</span>
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100/50 dark:border-amber-500/20 group-hover:scale-105 transition-transform">
              <UserCircle size={14} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto max-h-[68px] no-scrollbar py-1">
            {uniquePOVs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {uniquePOVs.map(pov => {
                  const isActive = selectedPovFilter === pov;
                  return (
                    <button
                      key={pov}
                      onClick={() => setSelectedPovFilter(isActive ? null : pov)}
                      className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer",
                        isActive 
                          ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      )}
                    >
                      {pov}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs italic text-slate-400 dark:text-slate-500 mt-1">Masukkan POV pada kartu bab untuk melacak sudut pandang karakter.</p>
            )}
          </div>

          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between">
            <span>Klik pil POV untuk memfilter isi board</span>
            {selectedPovFilter && (
              <button 
                onClick={() => setSelectedPovFilter(null)}
                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FILTER & CONTROL TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/85 mb-6 gap-4">
        {/* Search Input and active filter indicator */}
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={14} className="text-slate-400 dark:text-slate-500" />
          </div>
          <input
            type="text"
            placeholder="Cari bab berdasarkan judul, rangkuman, POV..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-14 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 transition-all shadow-sm box-border"
          />
          {searchQuery && (
            <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center">
              <button 
                onClick={() => setSearchQuery('')}
                className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded transition-colors"
              >
                Hapus
              </button>
            </div>
          )}
        </div>

        {/* Action Toggles to clean summaries & change layout view */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-800 pt-3 sm:pt-0">
          {/* Summary toggle button */}
          <button
            onClick={() => setGlobalExpandSummaries(!globalExpandSummaries)}
            className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-800/80 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm hover:shadow cursor-pointer tracking-wide"
            title={globalExpandSummaries ? "Sembunyikan semua rangkuman" : "Tampilkan semua rangkuman"}
          >
            {globalExpandSummaries ? (
              <>
                <EyeOff size={14} />
                <span>Sembunyikan Rangkuman</span>
              </>
            ) : (
              <>
                <Eye size={14} />
                <span>Tampilkan Rangkuman</span>
              </>
            )}
          </button>

          {/* Dual layout switch */}
          <div className="flex items-center bg-slate-200/60 dark:bg-slate-950 p-1 rounded-lg border border-slate-300/40 dark:border-slate-800">
            <button
              onClick={() => { setViewLayout('timeline'); setSelectedPovFilter(null); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer tracking-wide",
                viewLayout === 'timeline' 
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm" 
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              )}
            >
              <LayoutGrid size={13} />
              <span>Grid</span>
            </button>
            <button
              onClick={() => { setViewLayout('kanban'); setSelectedPovFilter(null); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer tracking-wide",
                viewLayout === 'kanban' 
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm" 
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              )}
            >
              <Columns size={13} />
              <span>Papan</span>
            </button>
          </div>

          {/* Dimension switch (only visible in kanban) */}
          {viewLayout === 'kanban' && (
            <div className="flex items-center bg-slate-200/60 dark:bg-slate-950 p-1 rounded-lg border border-slate-300/40 dark:border-slate-800 sm:ml-2">
              <button
                onClick={() => setKanbanDimension('status')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer tracking-wide",
                  kanbanDimension === 'status' 
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                )}
              >
                <span>Berdasarkan Status</span>
              </button>
              <button
                onClick={() => setKanbanDimension('act')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer tracking-wide",
                  kanbanDimension === 'act' 
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                )}
              >
                <span>Berdasarkan Babak</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FILTER MESSAGES */}
      {(searchQuery || selectedPovFilter) && (
        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-4 flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-950/20 px-4 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900/30">
          <div className="flex items-center gap-1.5">
            <Filter size={12} />
            <span>
              Menyaring hasil
              {searchQuery && ` untuk kata kunci "${searchQuery}"`}
              {searchQuery && selectedPovFilter && ' dan'}
              {selectedPovFilter && ` untuk POV "${selectedPovFilter}"`}
              . Ditemukan <strong className="font-bold">{filteredChapters.length} bab.</strong>
            </span>
          </div>
          <button 
            onClick={() => { setSearchQuery(''); setSelectedPovFilter(null); }}
            className="underline text-[10px] uppercase font-bold tracking-wider hover:opacity-80"
          >
            Reset Semua Filter
          </button>
        </div>
      )}

      {/* CHANNELS AND VIEWS PANEL */}
      <AnimatePresence mode="wait">
        {viewLayout === 'timeline' ? (
          /* TIMELINE VIEW GRID */
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            {filteredChapters.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredChapters.map((chapter, index) => (
                  <ChapterCard
                    key={chapter.id}
                    chapter={chapter}
                    index={index}
                    draggedId={draggedId}
                    deleteConfirmId={deleteConfirmId}
                    globalExpandSummaries={globalExpandSummaries}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={(e, id) => handleDrop(e, id, { adoptStatus: false })}
                    onDragEnd={handleDragEnd}
                    onUpdateField={updateField}
                    onDelete={deleteChapter}
                    onDirectEdit={() => {
                      setActiveChapterId(chapter.id!);
                      setViewMode('write');
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState view="timeline" onAdd={addChapter} />
            )}
          </motion.div>
        ) : (
          /* KANBAN BOARD VIEW columns */
          <motion.div
            key="kanban"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="overflow-x-auto pb-6"
          >
            <div className="flex gap-4 min-w-[1200px] h-[calc(100vh-320px)] min-h-[480px]">
              {(kanbanDimension === 'status' ? STATUS_LANES : ACT_LANES).map(lane => {
                const laneChapters = filteredChapters.filter(ch => {
                  if (kanbanDimension === 'status') return (ch.status || 'outline') === lane.id;
                  return (ch.act || 'unassigned') === lane.id;
                });
                const isColumnHovered = activeDropColumn === lane.id;
                const dotColor = kanbanDimension === 'status' 
                  ? STATUS_DOTS[lane.id as string] 
                  : ACT_DOTS[lane.id as ChapterAct];

                return (
                  <div
                    key={lane.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (activeDropColumn !== lane.id) {
                        setActiveDropColumn(lane.id);
                      }
                    }}
                    onDragLeave={() => {
                      setActiveDropColumn(null);
                    }}
                    onDrop={(e) => {
                      handleDropOnColumn(e, lane.id);
                      setActiveDropColumn(null);
                    }}
                    className={cn(
                      "flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/30 rounded-xl border p-3.5 transition-all w-[240px] select-none",
                      isColumnHovered 
                        ? "border-dashed border-indigo-400 dark:border-indigo-700 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-500/10" 
                        : "border-slate-200 dark:border-slate-800"
                    )}
                  >
                    {/* Lane Header */}
                    <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-200/60 dark:border-slate-800 relative">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full", dotColor || "bg-slate-400")} />
                          <h3 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">{lane.label}</h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold font-mono text-slate-500 dark:text-slate-400">
                            {laneChapters.length}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium leading-tight truncate max-w-[180px]">{lane.description}</p>
                      </div>
                    </div>

                    {/* Lane Body/Cards List */}
                    <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 no-scrollbar pb-2">
                      {laneChapters.length > 0 ? (
                        laneChapters.map((chapter, index) => (
                          <ChapterCard
                            key={chapter.id}
                            chapter={chapter}
                            index={index}
                            isCompactView={true}
                            draggedId={draggedId}
                            deleteConfirmId={deleteConfirmId}
                            globalExpandSummaries={globalExpandSummaries}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onDragEnd={handleDragEnd}
                            onUpdateField={updateField}
                            onDelete={deleteChapter}
                            onDirectEdit={() => {
                              setActiveChapterId(chapter.id!);
                              setViewMode('write');
                            }}
                          />
                        ))
                      ) : (
                        <div className="h-28 rounded-lg border border-dashed border-slate-200 dark:border-slate-800/80 flex flex-col items-center justify-center p-3 text-center text-slate-400 dark:text-slate-600">
                          <p className="text-[10px] italic">Tarik atau letakkan bab di sini</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* COMPONENT: EMPTY STATE SCREEN */
function EmptyState({ view, onAdd }: { view: string, onAdd: () => void }) {
  return (
    <div className="text-center py-16 bg-white/50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl max-w-lg mx-auto shadow-sm p-8 flex flex-col items-center backdrop-blur-sm">
      <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100/50 dark:border-indigo-500/20 flex items-center justify-center text-indigo-500 rounded-full mb-5 shadow-inner">
        <BookOpen size={28} />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-serif mb-2">Daftar Bab Kosong</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-8 font-medium leading-relaxed">
        {view === 'kanban' 
          ? "Tidak ada bab yang cocok dengan pencarian atau filter POV saat ini."
          : "Kanvas perencanaan cerita Anda masih kosong. Mari mulai dengan menyusun draf outline bab pertama Anda."}
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer group"
      >
        <Plus size={16} className="group-hover:rotate-90 transition-transform" /> Tambah Bab Pertama
      </button>
    </div>
  );
}

/* COMPONENT: CHAPTER CARD */
interface ChapterCardProps {
  chapter: any;
  index: number;
  isCompactView?: boolean;
  draggedId: number | null;
  deleteConfirmId: number | null;
  globalExpandSummaries: boolean;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: number) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onUpdateField: (id: number, field: string, value: any) => void;
  onDelete: (id: number) => void;
  onDirectEdit: () => void;
}

function ChapterCard({ 
  chapter, 
  index, 
  isCompactView = false,
  draggedId, 
  deleteConfirmId, 
  globalExpandSummaries,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onUpdateField,
  onDelete,
  onDirectEdit
}: ChapterCardProps) {
  const wordCount = useMemo(() => countWords(chapter.content || ''), [chapter.content]);
  const progressPercent = chapter.wordGoal ? Math.min(100, Math.round((wordCount / chapter.wordGoal) * 100)) : 0;

  // Local Collapsed override state
  const [localExpanded, setLocalExpanded] = useState<boolean | null>(null);
  
  // Decide whether to show summary text area based on global + override
  const showSummary = localExpanded !== null ? localExpanded : (isCompactView ? false : globalExpandSummaries);

  const isCurrentDragged = draggedId === chapter.id;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: Math.min(6, index) * 0.04 }}
      draggable
      onDragStart={(e: any) => onDragStart(e, chapter.id!)}
      onDragOver={onDragOver}
      onDrop={(e: any) => onDrop(e, chapter.id!)}
      onDragEnd={onDragEnd as any}
      className={cn(
        "group bg-white dark:bg-slate-950 border rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col relative overflow-hidden",
        isCurrentDragged 
          ? "opacity-45 border-indigo-500 scale-[0.98] bg-indigo-50/10 dark:bg-indigo-950/10" 
          : "opacity-100 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
        isCompactView ? "p-3.5 gap-2.5" : "p-5 gap-3.5"
      )}
      style={{ transition: 'opacity 0.2s, transform 0.2s, border-color 0.2s' }}
    >
      {/* DRAG HANDLE & TITLE ROW */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div 
            title="Tarik untuk mengurutkan"
            className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-700 hover:text-slate-500 hover:dark:text-slate-500 p-1 -ml-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-900 shrink-0 select-none"
          >
            <GripVertical size={16} className="pointer-events-none" />
          </div>
          <input 
            className="font-bold text-slate-950 dark:text-slate-100 focus:outline-none border border-transparent focus:border-indigo-400 focus:bg-indigo-50/50 dark:focus:bg-indigo-950/30 hover:border-slate-200 dark:hover:border-slate-800 bg-transparent px-2 py-1 rounded truncate w-full text-sm font-serif transition-colors"
            value={chapter.title}
            onChange={(e) => onUpdateField(chapter.id!, 'title', e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Judul Bab..."
          />
        </div>
        
        {/* Total Words Display */}
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 rounded-md select-none shrink-0 font-mono shadow-inner">
          {wordCount.toLocaleString()} kt
        </span>
      </div>

      {/* METADATA CONTROLS ROW */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status Dropdown */}
        <div className="relative">
          <select 
            value={chapter.status || 'outline'}
            onChange={(e) => onUpdateField(chapter.id!, 'status', e.target.value)}
            className={cn(
              "text-[10px] uppercase font-bold tracking-wider pl-2.5 pr-6 py-1 rounded-md outline-none border hover:shadow-sm cursor-pointer select-none transition-all appearance-none",
              STATUS_COLORS[chapter.status || 'outline'],
              "border-slate-200 dark:border-slate-700/60 focus:border-indigo-400"
            )}
          >
            <option value="outline">Kerangka</option>
            <option value="draft">Draf</option>
            <option value="edit">Revisi</option>
            <option value="polish">Poles</option>
            <option value="done">Selesai</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-current opacity-50 pointer-events-none" />
        </div>

        {/* Act Dropdown */}
        <div className="relative">
          <select 
            value={chapter.act || 'unassigned'}
            onChange={(e) => onUpdateField(chapter.id!, 'act', e.target.value)}
            className={cn(
              "text-[10px] uppercase font-bold tracking-wider pl-2.5 pr-6 py-1 rounded-md outline-none border hover:shadow-sm cursor-pointer select-none transition-all appearance-none",
              "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
              "border-slate-200 dark:border-slate-700/60 focus:border-indigo-400"
            )}
          >
            <option value="unassigned">- Babak -</option>
            <option value="act-1">Babak I</option>
            <option value="act-2a">Babak IIA</option>
            <option value="act-2b">Babak IIB</option>
            <option value="act-3">Babak III</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-current opacity-50 pointer-events-none" />
        </div>
        
        {/* POV Field */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 flex-1 min-w-[80px] max-w-[120px] hover:border-slate-300 dark:hover:border-slate-700 transition-colors focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100">
          <UserCircle size={12} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <input 
            className="bg-transparent text-[10px] font-bold text-slate-700 dark:text-slate-400 focus:outline-none w-full placeholder:text-slate-400 dark:placeholder:text-slate-600 uppercase tracking-widest truncate"
            placeholder="POV"
            value={chapter.pov || ''}
            onChange={(e) => onUpdateField(chapter.id!, 'pov', e.target.value)}
          />
        </div>

        {/* Tension Badge */}
        {chapter.tension && (
          <div 
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-colors shrink-0 select-none",
              chapter.tension === 1 ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50" :
              chapter.tension === 2 ? "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900/50" :
              chapter.tension === 3 ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50" :
              chapter.tension === 4 ? "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900/50" :
              "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50"
            )}
            title={`Tensi Naratif: ${chapter.tension}/5`}
          >
            <Flame size={12} className={chapter.tension >= 4 ? "animate-pulse" : ""} />
            <span>{chapter.tension}</span>
          </div>
        )}

        {/* Word Goal Input */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 w-[68px] shrink-0 hover:border-slate-300 dark:hover:border-slate-700 transition-colors focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100">
          <Target size={12} className="text-slate-400 shrink-0" />
          <input 
            className="bg-transparent text-[10px] font-bold text-slate-700 dark:text-slate-400 focus:outline-none w-full placeholder:text-slate-400 dark:placeholder:text-slate-600 font-mono"
            placeholder="TARGET"
            type="number"
            value={chapter.wordGoal || ''}
            onChange={(e) => onUpdateField(chapter.id!, 'wordGoal', parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* SUMMARY BOX - Collapsible */}
      <div className="flex flex-col border-t border-slate-100 dark:border-slate-800/80 pt-3 flex-grow">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-2 select-none">
          <span>Rangkuman Bab</span>
          
          <button 
            type="button" 
            onClick={() => setLocalExpanded(showSummary ? false : true)} 
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
            title={showSummary ? "Sembunyikan detail" : "Tampilkan detail"}
          >
            {showSummary ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {showSummary ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <textarea 
                className="w-full text-[13px] text-slate-700 dark:text-slate-300 bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 rounded-lg p-2.5 resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all font-serif italic min-h-[96px] max-h-[160px] leading-relaxed shadow-inner"
                placeholder="Rincian peristiwa narasi di bab ini..."
                value={chapter.summary || ''}
                onChange={(e) => onUpdateField(chapter.id!, 'summary', e.target.value)}
              />
            </motion.div>
          ) : (
            <div 
              onClick={() => setLocalExpanded(true)}
              className="group/summary bg-slate-50/50 hover:bg-slate-100/50 dark:bg-slate-900/30 dark:hover:bg-slate-900/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 rounded-lg p-2.5 cursor-pointer transition-all"
            >
              <span className="text-[12px] text-slate-500 dark:text-slate-400 font-serif italic line-clamp-2 group-hover/summary:text-slate-700 dark:group-hover/summary:text-slate-300 select-none">
                {chapter.summary || "Klik untuk menambahkan ringkasan plot bab..."}
              </span>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* FOOTER: CARD ACTIONS (EDIT SHORTCUT & DELETE BUTTON) */}
      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-auto">
        {/* Word goal progress indicator tiny bar */}
        <div className="flex-1 min-w-0 pr-4">
          {chapter.wordGoal > 0 ? (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 dark:text-slate-400 select-none uppercase tracking-wide font-mono">
                <span>Target: {progressPercent}%</span>
                <span>{wordCount} / {chapter.wordGoal}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden shadow-inner">
                <div 
                  className={cn(
                    "h-full transition-all duration-500 rounded-full",
                    progressPercent >= 100 ? "bg-emerald-500" : "bg-indigo-500"
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 dark:text-slate-500/70 italic select-none font-medium">Target kata belum diatur</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Direct write button */}
          <button
            onClick={onDirectEdit}
            className="flex items-center gap-1.5 bg-white hover:bg-indigo-600 dark:bg-slate-900 text-slate-700 hover:text-white dark:text-slate-400 dark:hover:text-white px-3 py-1.5 rounded-md text-[11px] font-bold transition-all border border-slate-200 dark:border-slate-800 hover:border-indigo-600 dark:hover:border-indigo-600 shadow-sm hover:shadow cursor-pointer select-none tracking-wide"
            title="Buka di Editor Utama"
          >
            <BookOpen size={13} />
            <span>Tulis</span>
          </button>

          {/* Delete confirmed button */}
          <button 
            type="button"
            onClick={() => onDelete(chapter.id!)}
            className={cn(
              "p-1.5 transition-all rounded-md cursor-pointer select-none border",
              deleteConfirmId === chapter.id 
                ? "bg-red-600 border-red-600 text-white hover:bg-red-700 opacity-100 scale-105" 
                : "border-transparent text-slate-400 hover:text-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20"
            )}
            title={deleteConfirmId === chapter.id ? "Klik lagi untuk menghapus" : "Hapus Bab"}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
