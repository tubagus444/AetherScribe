import { readLatestChapterModified } from '@/src/services/chapterQueries';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auto-index semantik inkremental — daemon yang memperbarui indeks pencarian
 * semantik (sceneEmbeddings) secara otomatis saat bab disimpan.
 *
 * Prasyarat: indeks sudah pernah dibangun secara MANUAL ("Bangun indeks" di panel
 * Cari Adegan). Hook ini TIDAK memaksa indexing perdana karena itu memerlukan unduh
 * model embedding (~30MB) yang harus dipilih pengguna secara sadar.
 *
 * Cara kerja:
 * 1. Pantau `MAX(lastModified)` dari bab proyek aktif via Dexie live query (ringan).
 * 2. Saat nilai berubah DAN indeks sudah ada → set timer debounce 8 detik.
 * 3. Saat timer menyala → panggil `indexManuscript` (fire-and-forget). Worker
 *    mengabaikan bila indexing sedang berjalan (`manuscriptIndexing` guard), dan
 *    hanya meng-embed chunk yang `contentHash`-nya berubah (inkremental).
 *
 * Dipasang di App.tsx (level daemon, selalu mount) — pola useAutoSummarizer.
 */

import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProject } from '@/src/contexts/ProjectContext';
import { indexManuscript, countIndexedScenes } from '@/src/services/contextEngine';

/** Debounce setelah simpan terakhir sebelum memicu re-index (ms). */
const DEBOUNCE_MS = 8_000;

export function useAutoSemanticIndex(): void {
  const { projectId } = useProject();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timestamp simpan terakhir dari bab mana pun di proyek aktif (ringan: satu index key).
  const latestModified = useLiveQuery(
    () =>
      projectId
        ? readLatestChapterModified(projectId)
        : 0,
    [projectId],
    0,
  );

  // Apakah indeks sudah pernah dibangun (count > 0)?
  const hasIndex = useLiveQuery(
    () => (projectId ? countIndexedScenes(projectId).then((n) => n > 0) : false),
    [projectId],
    false,
  );

  useEffect(() => {
    // Bersihkan timer lama setiap kali dependensi berubah.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Hanya aktif jika proyek ada, indeks sudah pernah dibangun, dan ada bab yang tersimpan.
    if (!projectId || !hasIndex || !latestModified) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // Fire-and-forget: worker menangani guard indexing ganda & inkrementalitas.
      indexManuscript(projectId).catch((err) =>
        console.warn('[AutoSemanticIndex] Gagal memicu re-index:', err),
      );
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [projectId, hasIndex, latestModified]);
}
