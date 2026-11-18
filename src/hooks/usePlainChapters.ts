/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { stripHtml } from '@/src/lib/editorUtils';
import { TensionLevel } from '@/src/types';

export interface PlainChapter {
  id: number;
  title: string;
  content: string;
  order: number;
  pov?: string;
  tension?: TensionLevel;
}

/**
 * Hook utilitas untuk mengambil daftar bab sebuah proyek dan melakukan strip HTML 
 * secara efisien. Menggunakan useMemo agar komputasi stripHtml hanya terjadi
 * jika data bab berubah (misal dari useLiveQuery).
 * 
 * Dapat digunakan oleh banyak panel sekaligus tanpa membebani CPU dengan
 * parsing regex berulang.
 */
export function usePlainChapters(projectId: number): PlainChapter[] | undefined {
  const chapters = useProjectChapters(projectId, 'manuscript');

  return useMemo(() => {
    if (!chapters) return undefined;
    return chapters
      .filter(c => c.id != null)
      .map(c => ({
        id: c.id!,
        title: c.title,
        content: stripHtml(c.content || ''),
        order: c.order,
        pov: c.pov,
        tension: c.tension as TensionLevel | undefined,
      }));
  }, [chapters]);
}
