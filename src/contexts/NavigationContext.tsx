import { readFirstChapter, readChapter } from '@/src/services/chapterQueries';
import { normalizeViewMode } from '@/src/lib/studioNavigation';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { ViewMode, WorkshopTarget } from '@/src/types';
import { useProject } from '@/src/contexts/ProjectContext';
import { flushActiveEditor, getActiveEditorChapterId } from '@/src/features/editor/editorBridge';
import type { ChapterSearchMatch } from '@/src/lib/globalSearch';

type ChapterSearchTarget = { projectId: number; chapterId: number; match: ChapterSearchMatch };

const VIEW_MODE_STORAGE_KEY = 'aether_view_mode';
/** Baca panel terakhir dari localStorage; fallback ke 'write' bila kosong/tidak valid. */
function loadInitialViewMode(): ViewMode {
  try {
    return normalizeViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY));
  } catch {
    // localStorage tidak tersedia (mode privasi/SSR) — pakai default.
  }
  return 'write';
}

interface NavigationContextType {
  activeChapterId: number | null;
  setActiveChapterId: (id: number | null) => Promise<boolean>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => Promise<boolean>;
  /** Teks yang harus disorot & di-scroll di editor setelah berpindah ke sana. */
  pendingHighlight: string | null;
  /** Pindah ke editor pada bab tertentu lalu sorot sepotong teks (mis. dari Cek Konsistensi). */
  jumpToText: (chapterId: number, text: string) => void;
  clearPendingHighlight: () => void;
  pendingChapterSearch: ChapterSearchTarget | null;
  openChapterFromSearch: (chapterId: number, match?: ChapterSearchMatch) => Promise<boolean>;
  clearPendingChapterSearch: (target: ChapterSearchTarget) => void;
  /** Entri Codex yang harus dibuka detailnya setelah berpindah ke panel Codex (deep-link). */
  pendingCodexEntryId: number | null;
  /** Pindah ke panel Codex lalu buka modal detail entri tertentu (mis. dari panel Kelengkapan). */
  openCodexEntry: (entryId: number) => Promise<boolean>;
  clearPendingCodexEntry: () => void;
  /** Target penanda & peta Atlas yang harus disorot setelah berpindah ke panel Atlas (deep-link). */
  pendingAtlasTarget: { mapId: number; markerId?: number } | null;
  /** Pindah ke panel Atlas lalu buka peta tertentu dan sorot penandanya jika ada. */
  openAtlasMarker: (mapId: number, markerId?: number) => void;
  clearPendingAtlasTarget: () => void;
  /** Sasaran sesi Lokakarya Codex yang sedang aktif (null bila tidak sedang di Lokakarya). */
  workshopTarget: WorkshopTarget | null;
  /** Buka Lokakarya Codex untuk entitas tertentu; mengingat panel asal untuk tombol Kembali. */
  openWorkshop: (target: WorkshopTarget) => void;
  /** Tutup Lokakarya dan kembali ke panel sebelum membukanya (default 'codex'). */
  closeWorkshop: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const { projectId } = useProject();
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(loadInitialViewMode);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const [pendingChapterSearch, setPendingChapterSearch] = useState<ChapterSearchTarget | null>(null);
  const [pendingCodexEntryId, setPendingCodexEntryId] = useState<number | null>(null);
  const [pendingAtlasTarget, setPendingAtlasTarget] = useState<{ mapId: number; markerId?: number } | null>(null);
  const [workshopTarget, setWorkshopTarget] = useState<WorkshopTarget | null>(null);
  // Lacak proyek sebelumnya agar bisa membedakan refresh (restore panel) vs ganti proyek (reset ke editor).
  const prevProjectIdRef = useRef<number | null>(null);
  // Panel asal sebelum membuka Lokakarya, agar tombol Kembali memulihkan tempat semula.
  const workshopReturnRef = useRef<ViewMode>('codex');
  const navigationRequest = useRef(0);

  const navigate = useCallback((leavesEditor: boolean, apply: () => void): Promise<boolean> => {
    const request = ++navigationRequest.current;
    const commit = () => {
      setPendingChapterSearch(null);
      apply();
    };
    if (!leavesEditor || getActiveEditorChapterId() === null) {
      commit();
      return Promise.resolve(true);
    }
    // Editor menampilkan kegagalan dan mempertahankan draf untuk percobaan berikutnya.
    return flushActiveEditor().then(() => {
      if (navigationRequest.current !== request) return false;
      // Lepas editor sebelum ia menerima input berikutnya setelah simpan berhasil.
      flushSync(commit);
      return true;
    }, () => false);
  }, []);

  const selectChapter = useCallback((id: number | null) => {
    if (id === activeChapterId) return Promise.resolve(true);
    return navigate(viewMode === 'write', () => setActiveChapterId(id));
  }, [activeChapterId, navigate, viewMode]);

  const selectView = useCallback((mode: ViewMode) => {
    const next = normalizeViewMode(mode, !!workshopTarget);
    if (next === viewMode) return Promise.resolve(true);
    return navigate(viewMode === 'write', () => setViewMode(next));
  }, [navigate, viewMode, workshopTarget]);

  const jumpToText = useCallback((chapterId: number, text: string) => {
    void navigate(viewMode === 'write' && chapterId !== activeChapterId, () => {
      setActiveChapterId(chapterId);
      setViewMode('write');
      setPendingHighlight(text);
    });
  }, [activeChapterId, navigate, viewMode]);

  const clearPendingHighlight = useCallback(() => setPendingHighlight(null), []);

  const openChapterFromSearch = useCallback((chapterId: number, match?: ChapterSearchMatch) => {
    if (projectId == null) return Promise.resolve(false);
    return navigate(viewMode === 'write' && chapterId !== activeChapterId, () => {
      setPendingHighlight(null);
      setPendingChapterSearch(match ? { projectId, chapterId, match } : null);
      setActiveChapterId(chapterId);
      setViewMode('write');
    });
  }, [activeChapterId, navigate, projectId, viewMode]);
  const clearPendingChapterSearch = useCallback((target: ChapterSearchTarget) => {
    setPendingChapterSearch(current => current === target ? null : current);
  }, []);

  const openCodexEntry = useCallback((entryId: number) => {
    return navigate(viewMode === 'write', () => {
      setPendingCodexEntryId(entryId);
      setViewMode('codex');
    });
  }, [navigate, viewMode]);

  const clearPendingCodexEntry = useCallback(() => setPendingCodexEntryId(null), []);

  const openAtlasMarker = useCallback((mapId: number, markerId?: number) => {
    void navigate(viewMode === 'write', () => {
      setPendingAtlasTarget({ mapId, markerId });
      setViewMode('atlas');
    });
  }, [navigate, viewMode]);

  const clearPendingAtlasTarget = useCallback(() => setPendingAtlasTarget(null), []);

  const openWorkshop = useCallback((target: WorkshopTarget) => {
    void navigate(viewMode === 'write', () => {
      if (viewMode !== 'workshop') workshopReturnRef.current = viewMode;
      setWorkshopTarget(target);
      setViewMode('workshop');
    });
  }, [navigate, viewMode]);

  const closeWorkshop = useCallback(() => {
    setWorkshopTarget(null);
    setViewMode(workshopReturnRef.current || 'codex');
  }, []);

  // Simpan panel terakhir agar bertahan setelah refresh browser. 'workshop' sengaja
  // TIDAK dipersist (sesi transien tanpa sasaran tersimpan) → refresh kembali ke panel asal.
  useEffect(() => {
    if (viewMode === 'workshop') return;
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // localStorage tidak tersedia — abaikan.
    }
  }, [viewMode]);

  // Load first chapter when project changes
  useEffect(() => {
    let active = true;
    if (projectId) {
      readFirstChapter(projectId).then(ch => {
        if (ch && active) setActiveChapterId(ch.id!);
      });
      // Hanya reset ke editor saat benar-benar BERPINDAH proyek, bukan saat
      // proyek pertama dimuat (refresh) — agar panel terpulihkan dari localStorage.
      if (prevProjectIdRef.current !== null && prevProjectIdRef.current !== projectId) {
        ++navigationRequest.current;
        setPendingChapterSearch(null);
        setViewMode('write');
      }
      prevProjectIdRef.current = projectId;
    }
    return () => { active = false; };
  }, [projectId]);

  // Handle case where active chapter is deleted
  useEffect(() => {
    let isMounted = true;

    const syncActiveChapter = async () => {
      if (!activeChapterId || !projectId) return;

      const current = await readChapter(activeChapterId);
      
      if (!current && isMounted) {
        const nextCh = await readFirstChapter(projectId);
        if (isMounted) {
          setActiveChapterId(nextCh?.id || null);
        }
      }
    };

    if (activeChapterId) {
      syncActiveChapter();
    }

    return () => { isMounted = false; };
  }, [activeChapterId, projectId]);

  return (
    <NavigationContext.Provider value={{
      activeChapterId,
      setActiveChapterId: selectChapter,
      viewMode,
      setViewMode: selectView,
      pendingHighlight,
      jumpToText,
      clearPendingHighlight,
      pendingChapterSearch,
      openChapterFromSearch,
      clearPendingChapterSearch,
      pendingCodexEntryId,
      openCodexEntry,
      clearPendingCodexEntry,
      pendingAtlasTarget,
      openAtlasMarker,
      clearPendingAtlasTarget,
      workshopTarget,
      openWorkshop,
      closeWorkshop
    }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
