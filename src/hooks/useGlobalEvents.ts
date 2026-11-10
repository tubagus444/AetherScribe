/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { ErrorService } from '@/src/services/errorService';
import { flushActiveEditor } from '@/src/features/editor/editorBridge';

interface GlobalEventsProps {
  setIsSearchOpen?: (open: boolean) => void;
  onToggleEditorSearch?: () => void;
  isEditorSearchOpen?: boolean;
  onToggleFocusMode?: () => void;
}

export function useGlobalEvents({ 
  setIsSearchOpen, 
  onToggleEditorSearch, 
  isEditorSearchOpen,
  onToggleFocusMode
}: GlobalEventsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global Search (Ctrl+K or Ctrl+F)
      if (setIsSearchOpen && (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'f') && !e.altKey) {
        e.preventDefault();
        setIsSearchOpen(true);
      }

      // Editor Search & Replace (Ctrl+H)
      if (onToggleEditorSearch && (e.metaKey || e.ctrlKey) && e.key === 'h') {
        e.preventDefault();
        onToggleEditorSearch();
      }

      // Focus Mode (Ctrl+Alt+F)
      if (onToggleFocusMode && (e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onToggleFocusMode();
      }

      // Escape Handler
      if (e.key === 'Escape') {
        if (isEditorSearchOpen && onToggleEditorSearch) {
          onToggleEditorSearch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setIsSearchOpen]);

  useEffect(() => {
    // Flush edit editor yang belum ter-persist saat tab disembunyikan/ditutup.
    // Autosave editor di-debounce 1,5 dtk, jadi mengetik lalu langsung menutup/
    // mengganti tab bisa membuang edit terakhir. flushActiveEditor() menyimpannya
    // lebih dulu lewat bridge (no-op bila editor tak sedang ter-mount).
    // `visibilitychange`→hidden lebih andal (halaman belum dibongkar sehingga tulis
    // IndexedDB sempat selesai, dan konsisten di mobile); `pagehide` menangkap
    // penutupan/navigasi sebenarnya di desktop.
    const flushOnHide = () => {
      void flushActiveEditor().catch(err => {
        console.error('Failed to flush editor on page hide:', err);
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    };
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
