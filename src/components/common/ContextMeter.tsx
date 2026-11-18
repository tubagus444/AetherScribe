/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useChapter } from '@/src/hooks/useChapterQueries';
import React, { useState, useRef, useEffect } from 'react';
import { Cpu, Loader2 } from 'lucide-react';
import { useProject } from '@/src/contexts/ProjectContext';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useContextMeter } from '@/src/hooks/useContextMeter';
import { useAvailableProviders } from '@/src/hooks/useAvailableProviders';
import { motion, AnimatePresence } from 'motion/react';

export function ContextMeter() {
  const { projectId } = useProject();
  const { activeChapterId } = useNavigation();
  const activeChapter = useChapter(activeChapterId);

  const chapterText = activeChapter?.content || '';
  const { selectedProvider } = useAvailableProviders();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [modelConfig, setModelConfig] = useState({ model: 'gpt-4o', modelContextLimit: 128000 });

  useEffect(() => {
    const updateModel = () => {
      let limit = 128000;
      let m = 'gpt-4o'; // Default standard

      if (selectedProvider === 'google') {
        m = localStorage.getItem('ai_model_google') || 'gemini-1.5-flash';
        limit = m.includes('pro') ? 2000000 : Math.max(1000000, 100000); // 1M+ limit usually
      } else if (selectedProvider === 'claude') {
        m = localStorage.getItem('ai_model_claude') || 'claude-3.5-sonnet';
        limit = 200000;
      } else if (selectedProvider === 'groq') {
        m = localStorage.getItem('ai_model_groq') || 'llama3-8b-8192';
        limit = m.includes('8192') ? 8192 : 32000;
      } else if (selectedProvider === 'ollama') {
        m = localStorage.getItem('ai_model_ollama') || 'llama3';
        limit = 8192; // usually 8k context locally
      } else if (selectedProvider === 'openrouter') {
        m = localStorage.getItem('ai_model_openrouter') || 'openrouter/auto';
        limit = 128000; // rough generic limit
      } else if (selectedProvider === 'huggingface') {
        m = localStorage.getItem('ai_model_huggingface') || 'meta-llama/Llama-3.3-70B-Instruct';
        limit = 32000; // perkiraan konservatif (sejalan dgn PROVIDER_CONTEXT_WINDOW)
      } else if (selectedProvider === 'openai') {
        m = localStorage.getItem('ai_model_openai') || 'gpt-4o-mini';
        limit = 128000; // perkiraan konservatif (sejalan dgn PROVIDER_CONTEXT_WINDOW)
      }
      
      setModelConfig({ model: m, modelContextLimit: limit });
    };

    updateModel();
    window.addEventListener('storage', updateModel);
    return () => window.removeEventListener('storage', updateModel);
  }, [selectedProvider]);

  const { model, modelContextLimit } = modelConfig;

  const { tokens, isCalculating } = useContextMeter(projectId, activeChapter?.id || null, chapterText, model);

  if (!projectId || !activeChapter) return null;

  const usagePercent = Math.min(100, Math.round((tokens.totalTokens / modelContextLimit) * 100));

  let colorClass = 'text-emerald-500';
  let borderClass = 'border-emerald-200 dark:border-emerald-900/50';
  let bgClass = 'bg-emerald-50 dark:bg-emerald-900/10';

  if (usagePercent > 85) {
    colorClass = 'text-red-500';
    borderClass = 'border-red-200 dark:border-red-900/50';
    bgClass = 'bg-red-50 dark:bg-red-900/10';
  } else if (usagePercent > 60) {
    colorClass = 'text-amber-500';
    borderClass = 'border-amber-200 dark:border-amber-900/50';
    bgClass = 'bg-amber-50 dark:bg-amber-900/10';
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 ${bgClass} hover:bg-opacity-80 border ${borderClass} rounded-full transition-colors group text-left relative`}
        aria-label="Context Meter"
        title="Context Meter AI"
      >
        {isCalculating ? (
          <Loader2 size={12} className={`animate-spin ${colorClass}`} />
        ) : (
          <Cpu size={14} className={`${colorClass} group-hover:scale-110 transition-transform`} />
        )}
        <span className={`text-[11px] font-bold ${colorClass} mr-0.5`}>
          {usagePercent}%
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs rounded-xl shadow-xl z-50 overflow-hidden border border-slate-200 dark:border-slate-800"
            style={{ originY: 0, originX: 1 }}
          >
            <div className="p-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
              <div className="font-bold flex justify-between items-center">
                <span className="text-[10px] flex items-center gap-1.5 font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">
                  <Cpu size={12} />
                  Context Meter
                </span>
                <span className="text-[11px] font-bold text-indigo-500">{tokens.totalTokens.toLocaleString()} / {modelContextLimit.toLocaleString()}</span>
              </div>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">Model:</span>
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-slate-300">{model}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] mt-1">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Teks Bab</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{tokens.textTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Lore / Codex</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{tokens.codexTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Story Bible</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{tokens.rulesTokens.toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
