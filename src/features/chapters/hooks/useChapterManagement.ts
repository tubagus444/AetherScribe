import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import { changeChapters, updateChapter } from '@/src/services/chapterOperations';
import { useState } from 'react';

export function useChapterManagement(projectId: number) {
  const chapters = useProjectChapters(projectId, 'manuscript');

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const updateField = (id: number, field: 'status' | 'act', value: string) => {
    return updateChapter(id, { [field]: value });
  };

  const deleteChapter = async (id: number) => {
    if (deleteConfirmId === id) {
      await changeChapters(projectId, 'delete', id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const addChapter = async () => {
    await changeChapters(projectId, 'add');
  };

  return {
    chapters,
    deleteConfirmId,
    updateField,
    deleteChapter,
    addChapter
  };
}
