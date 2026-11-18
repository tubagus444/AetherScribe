import { useState } from 'react';
import { moveChapter } from '@/src/services/chapterOperations';

export function useChapterDragAndDrop(projectId: number) {
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id.toString());
    // Small delay to allow the drag image to be generated before styling
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedId(null);
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: number, options?: { adoptStatus?: boolean }) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedId === null) return;
    await moveChapter(projectId, draggedId, targetId, options?.adoptStatus ?? true);
  };

  return {
    draggedId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop
  };
}
