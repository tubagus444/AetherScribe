import { normalizeViewMode } from '@/src/lib/studioNavigation';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ViewMode, WorkshopTarget } from '@/src/types';
import { useProject } from '@/src/contexts/ProjectContext';

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
  setActiveChapterId: (id: number | null) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** Teks yang harus disorot & di-scroll di editor setelah berpindah ke sana. */
  pendingHighlight: string | null;
  /** Pindah ke editor pada bab tertentu lalu sorot sepotong teks (mis. dari Cek Konsistensi). */
  jumpToText: (chapterId: number, text: string) => void;
  clearPendingHighlight: () => void;
  /** Entri Codex yang harus dibuka detailnya setelah berpindah ke panel Codex (deep-link). */
  pendingCodexEntryId: number | null;
  /** Pindah ke panel Codex lalu buka modal detail entri tertentu (mis. dari panel Kelengkapan). */
  openCodexEntry: (entryId: number) => void;
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
  const [pendingCodexEntryId, setPendingCodexEntryId] = useState<number | null>(null);
  const [pendingAtlasTarget, setPendingAtlasTarget] = useState<{ mapId: number; markerId?: number } | null>(null);
  const [workshopTarget, setWorkshopTarget] = useState<WorkshopTarget | null>(null);
  // Lacak proyek sebelumnya agar bisa membedakan refresh (restore panel) vs ganti proyek (reset ke editor).
  const prevProjectIdRef = useRef<number | null>(null);
  // Panel asal sebelum membuka Lokakarya, agar tombol Kembali memulihkan tempat semula.
  const workshopReturnRef = useRef<ViewMode>('codex');

  const jumpToText = useCallback((chapterId: number, text: string) => {
    setActiveChapterId(chapterId);
    setViewMode('write');
    setPendingHighlight(text);
  }, []);

  const clearPendingHighlight = useCallback(() => setPendingHighlight(null), []);

  const openCodexEntry = useCallback((entryId: number) => {
    setPendingCodexEntryId(entryId);
    setViewMode('codex');
  }, []);

  const clearPendingCodexEntry = useCallback(() => setPendingCodexEntryId(null), []);

  const openAtlasMarker = useCallback((mapId: number, markerId?: number) => {
    setPendingAtlasTarget({ mapId, markerId });
    setViewMode('atlas');
  }, []);

  const clearPendingAtlasTarget = useCallback(() => setPendingAtlasTarget(null), []);

  const openWorkshop = useCallback((target: WorkshopTarget) => {
    setViewMode(prev => {
      // 'workshop' bersifat transien — jangan jadikan titik kembali bila dibuka berulang.
      if (prev !== 'workshop') workshopReturnRef.current = prev;
      return 'workshop';
    });
    setWorkshopTarget(target);
  }, []);

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
    if (projectId) {
      db.chapters.where('projectId').equals(projectId).first().then(ch => {
        if (ch) setActiveChapterId(ch.id!);
      });
      // Hanya reset ke editor saat benar-benar BERPINDAH proyek, bukan saat
      // proyek pertama dimuat (refresh) — agar panel terpulihkan dari localStorage.
      if (prevProjectIdRef.current !== null && prevProjectIdRef.current !== projectId) {
        setViewMode('write');
      }
      prevProjectIdRef.current = projectId;
    }
  }, [projectId]);

  // Handle case where active chapter is deleted
  useEffect(() => {
    let isMounted = true;

    const syncActiveChapter = async () => {
      if (!activeChapterId || !projectId) return;

      const current = await db.chapters.get(activeChapterId);
      
      if (!current && isMounted) {
        const nextCh = await db.chapters.where('projectId').equals(projectId).first();
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
      setActiveChapterId,
      viewMode,
      setViewMode: mode => setViewMode(normalizeViewMode(mode, !!workshopTarget)),
      pendingHighlight,
      jumpToText,
      clearPendingHighlight,
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
