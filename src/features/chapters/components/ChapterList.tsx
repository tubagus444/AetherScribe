import { changeChapters, compareChapters } from '@/src/services/chapterOperations';
import { useToast } from '@/src/hooks/useToast';
type ChapterListMetadata = Omit<Chapter, 'content'> & { _computedWordCount: number };
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import { useOptimizedLiveQuery } from '@/src/hooks/useOptimizedLiveQuery';
import { db } from '@/src/db';
import { Plus, FileText, Trash2, Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { cn, countWords } from '@/src/lib/utils';
import { Chapter } from '@/src/types';
import { STATUS_DOTS } from '@/src/lib/constants';
import { useVirtualizer } from '@tanstack/react-virtual';

interface ChapterListProps {
  projectId: number;
  activeChapterId: number | null;
  onSelect: (id: number | null) => void;
}

export function ChapterList({ projectId, activeChapterId, onSelect }: ChapterListProps) {
  const { toast } = useToast();
  const parentRef = useRef<HTMLDivElement>(null);

  const chapters = useOptimizedLiveQuery(async () => {
    const all = await db.chapters.where('projectId').equals(projectId).toArray();
    const sorted = all.sort(compareChapters);
    
    return sorted.map(({ content, ...metadata }): ChapterListMetadata => ({ ...metadata, _computedWordCount: countWords(content) }));
  }, [projectId]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const virtualizer = useVirtualizer({
    count: chapters?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  const addChapter = async () => {
    const nextOrder = chapters?.length ?? 0;
    const id = await changeChapters(projectId, 'add');
    onSelect(id as number);
    
    setTimeout(() => {
      virtualizer.scrollToIndex(nextOrder, { align: 'end' });
    }, 100);
  };

  const deleteChapter = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (deleteConfirmId === id) {
      await changeChapters(projectId, 'delete', id);
      setDeleteConfirmId(null);
      if (activeChapterId === id) {
        const remaining = (await db.chapters.where('projectId').equals(projectId).toArray()).sort(compareChapters)[0];
        if (remaining) {
          onSelect(remaining.id!);
        } else {
          onSelect(null);
        }
      }
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const duplicateChapter = async (e: React.MouseEvent, chapter: ChapterListMetadata) => {
    e.stopPropagation();
    const id = await changeChapters(projectId, 'duplicate', chapter.id);
    onSelect(id!);
  };
  const moveChapter = async (e: React.MouseEvent, chapter: ChapterListMetadata, direction: 'up' | 'down') => {
    e.stopPropagation();
    await changeChapters(projectId, direction, chapter.id);
  };
  const reportFailure = (operation: Promise<unknown>) => {
    void operation.catch(error => { console.error('Chapter operation failed:', error); toast.error('Operasi bab gagal. Draft dan perubahan yang belum tersimpan perlu dicoba kembali.'); });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 mb-2 shrink-0">
        <h2 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <FileText size={12} />
          Outline
        </h2>
        <button 
          onClick={() => reportFailure(addChapter())}
          className="p-1 hover:bg-indigo-50 rounded text-slate-400 dark:text-slate-500 hover:text-indigo-600 transition-all active:scale-90"
          title="New Chapter"
        >
          <Plus size={14} />
        </button>
      </div>

      <div 
        ref={parentRef} 
        className="flex-1 overflow-y-auto no-scrollbar relative"
      >
        <div 
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const chapter = chapters![virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ChapterListItem
                  chapter={chapter}
                  isActive={activeChapterId === chapter.id}
                  deleteConfirmId={deleteConfirmId}
                  onSelect={onSelect}
                  onDelete={(e, id) => reportFailure(deleteChapter(e, id))}
                  onDuplicate={(e, chapter) => reportFailure(duplicateChapter(e, chapter))}
                  onMove={(e, chapter, direction) => reportFailure(moveChapter(e, chapter, direction))}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ChapterListItemProps {
  chapter: ChapterListMetadata;
  isActive: boolean;
  deleteConfirmId: number | null;
  onSelect: (id: number) => void;
  onDelete: (e: React.MouseEvent, id: number) => void;
  onDuplicate: (e: React.MouseEvent, chapter: ChapterListMetadata) => void;
  onMove: (e: React.MouseEvent, chapter: ChapterListMetadata, direction: 'up' | 'down') => void;
}

const ChapterListItem = React.memo(function ChapterListItem({ chapter, isActive, deleteConfirmId, onSelect, onDelete, onDuplicate, onMove }: ChapterListItemProps) {
  const wordCount = chapter._computedWordCount || 0;

  return (
    <div className="relative group px-1 pb-1">
      <div
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs transition-all text-left font-medium border-l-2 cursor-pointer group/item",
          isActive 
            ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-500 shadow-sm" 
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800/50 border-transparent"
        )}
        onClick={() => onSelect(chapter.id!)}
      >
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOTS[chapter.status || 'outline'])} />
        <div className="flex-1 min-w-0">
          <div className="truncate">{chapter.title}</div>
          <div className="text-[9px] text-slate-400 dark:text-slate-500 font-normal">
            {wordCount.toLocaleString()} kata
          </div>
        </div>
        
        <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
          <button 
            onClick={(e) => onMove(e, chapter, 'up')}
            className="p-1 hover:bg-white dark:hover:bg-slate-900 rounded text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100"
            title="Move Up"
          >
            <ChevronUp size={12} />
          </button>
          <button 
            onClick={(e) => onMove(e, chapter, 'down')}
            className="p-1 hover:bg-white dark:hover:bg-slate-900 rounded text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100"
            title="Move Down"
          >
            <ChevronDown size={12} />
          </button>
          <button 
            onClick={(e) => onDuplicate(e, chapter)}
            className="p-1 hover:bg-white dark:hover:bg-slate-900 rounded text-slate-400 dark:text-slate-500 hover:text-indigo-500 transition-colors"
            title="Duplicate"
          >
            <Copy size={12} />
          </button>
          <button 
            onClick={(e) => onDelete(e, chapter.id!)}
            className={cn(
              "p-1 rounded transition-colors",
              deleteConfirmId === chapter.id 
                ? "bg-red-500 text-white hover:bg-red-600" 
                : "hover:bg-white dark:hover:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-red-500"
            )}
            title={deleteConfirmId === chapter.id ? "Click again to confirm" : "Delete"}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isActive === nextProps.isActive &&
    prevProps.deleteConfirmId === nextProps.deleteConfirmId &&
    prevProps.chapter.id === nextProps.chapter.id &&
    prevProps.chapter.title === nextProps.chapter.title &&
    prevProps.chapter.status === nextProps.chapter.status &&
    prevProps.chapter.order === nextProps.chapter.order &&
    prevProps.chapter._computedWordCount === nextProps.chapter._computedWordCount
  );
});
