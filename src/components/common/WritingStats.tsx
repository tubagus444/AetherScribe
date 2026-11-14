import { readChapterList } from '@/src/services/chapterQueries';
/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useOptimizedLiveQuery } from '@/src/hooks/useOptimizedLiveQuery';
import { db } from '@/src/db';
import { Target, TrendingUp, Edit2, Clock, BarChart2, ChevronDown, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useDailyProgress } from '@/src/hooks/useDailyProgress';

interface WritingStatsProps {
  projectId: number;
}

export function WritingStats({ projectId }: WritingStatsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [isEditingDaily, setIsEditingDaily] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Optimized query: only return scalar values to avoid memory bloat and deep equality cost
  const stats = useOptimizedLiveQuery(async () => {
    const allChapters = await readChapterList(projectId);
    let words = 0;
    for (const ch of allChapters) {
      words += ch._computedWordCount;
    }
    return {
      totalWords: words,
      chapterCount: allChapters.length
    };
  }, [projectId]);

  const project = useOptimizedLiveQuery(() => 
    db.projects.get(projectId)
  , [projectId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsEditingGoal(false);
        setIsEditingDaily(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalWords = stats?.totalWords || 0;
  const chapterCount = stats?.chapterCount || 0;

  const { wordsToday, streak, dailyGoal, dailyPercent } = useDailyProgress(projectId, stats?.totalWords, project);

  const wordGoal = project?.wordGoal || 50000;
  const progressPercent = Math.min(100, Math.round((totalWords / wordGoal) * 100));
  
  const readTimeMin = Math.ceil(totalWords / 250);
  const avgChapterWords = chapterCount > 0 ? Math.round(totalWords / chapterCount) : 0;

  const updateGoal = (newGoal: string) => {
    const val = parseInt(newGoal.replace(/,/g, ''));
    if (!isNaN(val) && val > 0) {
      db.projects.update(projectId, { wordGoal: val });
    }
  };

  const updateDailyGoal = (newGoal: string) => {
    const val = parseInt(newGoal.replace(/,/g, ''));
    if (!isNaN(val) && val > 0) {
      db.projects.update(projectId, { dailyGoal: val });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Mini Progress Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-full transition-colors group text-left"
        title="Progres Naskah"
      >
        <Target size={14} className="text-indigo-500 group-hover:scale-110 transition-transform" />
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mr-0.5">
          {progressPercent}%
        </span>
      </button>

      {/* Popover Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-[280px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden"
            style={{ originY: 0, originX: 1 }}
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Target size={12} />
                  Target Naskah
                </h3>
              </div>
              
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 min-w-0 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">TARGET</div>
                  {isEditingGoal ? (
                    <input 
                      autoFocus
                      className="w-20 min-w-0 bg-transparent px-2 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
                      defaultValue={wordGoal}
                      onBlur={(e) => {
                        updateGoal(e.target.value);
                        setIsEditingGoal(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateGoal((e.target as HTMLInputElement).value);
                          setIsEditingGoal(false);
                        }
                      }}
                    />
                  ) : (
                    <button 
                      className="group flex flex-1 items-center gap-1.5 px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors"
                      onClick={() => setIsEditingGoal(true)}
                    >
                      {wordGoal.toLocaleString()}
                      <Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-slate-400 flex-shrink-0" />
                    </button>
                  )}
                </div>
                <span className="text-xs flex-shrink-0 font-medium text-slate-500 dark:text-slate-400">total kata</span>
              </div>
            </div>

            <div className="p-4 grid grid-cols-2 gap-3">
              {/* Daily / Session Progress */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase leading-none flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-indigo-500" /> Hari Ini
                  </p>
                  {streak > 0 && (
                    <span
                      className="flex items-center gap-1 text-[10px] font-bold text-amber-500"
                      title={`${streak} hari berturut-turut memenuhi target`}
                    >
                      <Flame size={12} /> {streak} hari
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1.5 mb-2">
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
                    {wordsToday.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400">/</span>
                  {isEditingDaily ? (
                    <input
                      autoFocus
                      aria-label="Target kata harian"
                      className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
                      defaultValue={dailyGoal}
                      onBlur={(e) => {
                        updateDailyGoal(e.target.value);
                        setIsEditingDaily(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateDailyGoal((e.target as HTMLInputElement).value);
                          setIsEditingDaily(false);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingDaily(true)}
                      className="group flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                      {dailyGoal.toLocaleString()} <span className="font-normal">kata</span>
                      <Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-slate-400" />
                    </button>
                  )}
                </div>

                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      dailyPercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500',
                    )}
                    style={{ width: `${dailyPercent}%` }}
                  />
                </div>
              </div>

              {/* Time to read */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                 <Clock size={14} className="text-slate-500" />
                 <div>
                   <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase leading-none mb-1">Waktu Baca</p>
                   <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">~{readTimeMin} mnt</p>
                 </div>
              </div>

              {/* Avg Length */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                 <BarChart2 size={14} className="text-slate-500" />
                 <div>
                   <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase leading-none mb-1">Rata-rata Bab</p>
                   <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{avgChapterWords.toLocaleString()}</p>
                 </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
