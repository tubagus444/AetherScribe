/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, FileText, Book, X, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface GlobalSearchProps {
  projectId: number;
  onSelectChapter: (id: number) => void;
  onSelectCodex: (id: number) => void;
  onClose: () => void;
}

export function GlobalSearch({ projectId, onSelectChapter, onSelectCodex, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  
  const chapters = useProjectChapters(projectId);

  const codex = useLiveQuery(() => 
    db.codex.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return { chapters: [], codex: [] };
    
    const q = debouncedQuery.toLowerCase();
    
    const matchedChapters = chapters?.filter(ch => 
      ch.title.toLowerCase().includes(q) || ch.content.toLowerCase().includes(q)
    ).map(ch => {
      // Mock hybrid relevance calculation
      const exactMatchTitle = ch.title.toLowerCase() === q ? 1 : 0;
      const includesTitle = ch.title.toLowerCase().includes(q) ? 0.6 : 0;
      const includesContent = ch.content.toLowerCase().includes(q) ? 0.3 : 0;
      
      const semanticMock = Math.random() * 0.4; // Simulate semantic vector score
      const score = Math.min(1, Math.max(exactMatchTitle, includesTitle, includesContent) + semanticMock);
      
      return { ...ch, relevanceScore: score };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore) || [];

    const matchedCodex = codex?.filter(ctx => 
      ctx.name.toLowerCase().includes(q) || 
      ctx.description.toLowerCase().includes(q) ||
      ctx.aliases?.some(a => a.toLowerCase().includes(q))
    ).map(ctx => {
      const exactMatchTitle = ctx.name.toLowerCase() === q ? 1 : 0;
      const includesTitle = ctx.name.toLowerCase().includes(q) ? 0.7 : 0;
      const semanticMock = Math.random() * 0.3;
      const score = Math.min(1, Math.max(exactMatchTitle, includesTitle) + semanticMock);

      return { ...ctx, relevanceScore: score };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore) || [];

    return { chapters: matchedChapters, codex: matchedCodex };
  }, [debouncedQuery, chapters, codex]);

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleDown);
    return () => window.removeEventListener('keydown', handleDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6 sm:pt-24 bg-slate-900/40 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh]"
      >
        <div className="flex-none p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <Search size={20} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <input 
            autoFocus
            className="flex-1 bg-transparent text-base sm:text-lg focus:outline-none placeholder:text-slate-300 min-w-0"
            placeholder="Search chapters, characters, places..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:bg-slate-800 rounded-md text-slate-400 dark:text-slate-500 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {!query && (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <Search size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm italic">Type something to search across your manuscript.</p>
            </div>
          )}

          {query && results.chapters.length === 0 && results.codex.length === 0 && (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <p className="text-sm">No results found for "{query}"</p>
            </div>
          )}

          {results.chapters.length > 0 && (
            <div className="space-y-1 mb-4">
              <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Chapters</h3>
              {results.chapters.map(ch => (
                <button 
                  key={ch.id}
                  onClick={() => { onSelectChapter(ch.id!); onClose(); }}
                  className="w-full flex items-center justify-between gap-3 p-3 hover:bg-indigo-50 rounded-xl transition-colors group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg group-hover:bg-white dark:hover:bg-slate-900 transition-colors">
                      <FileText size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{ch.title || 'Untitled Chapter'}</h4>
                      <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">Chapter • {ch.content.substring(0, 100)}...</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1",
                      (ch as any).relevanceScore > 0.8 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      (ch as any).relevanceScore > 0.5 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                      <span>{((ch as any).relevanceScore * 100).toFixed(0)}%</span>
                    </div>
                    <span className="text-[8px] uppercase tracking-wider text-slate-400 opacity-50">Hybrid</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.codex.length > 0 && (
            <div className="space-y-1">
              <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Codex</h3>
              {results.codex.map(ctx => (
                <button 
                  key={ctx.id}
                  onClick={() => { onSelectCodex(ctx.id!); onClose(); }}
                  className="w-full flex items-center justify-between gap-3 p-3 hover:bg-emerald-50 rounded-xl transition-colors group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg group-hover:bg-white dark:hover:bg-slate-900 transition-colors">
                      <Book size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{ctx.name}</h4>
                      <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1 italic">{ctx.category} — {ctx.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1",
                      (ctx as any).relevanceScore > 0.8 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      (ctx as any).relevanceScore > 0.5 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                      <span>{((ctx as any).relevanceScore * 100).toFixed(0)}%</span>
                    </div>
                    <span className="text-[8px] uppercase tracking-wider text-slate-400 opacity-50">Hybrid</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-sm">ESC</kbd> to close
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-sm">⏎</kbd> to open
          </div>
        </div>
      </motion.div>
    </div>
  );
}
