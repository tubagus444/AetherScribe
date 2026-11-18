/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import { Search, Clock } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useEditorPanel } from '@/src/contexts/EditorPanelContext';
import { ViewControlsMenu } from '@/src/features/editor/components/ViewControlsMenu';

interface NovelFooterProps {
  editor: Editor | null;
  isTypewriterMode: boolean;
  setIsTypewriterMode: (val: boolean) => void;
  isFocusMode?: boolean;
  setIsFocusMode: (val: boolean) => void;
  isSearchOpen?: boolean;
  setIsSearchOpen: (val: boolean) => void;
  zoomLevel: number;
  setZoomLevel: (val: number) => void;
}

export function NovelFooter({
  editor,
  isTypewriterMode,
  setIsTypewriterMode,
  isFocusMode,
  setIsFocusMode,
  isSearchOpen,
  setIsSearchOpen,
  zoomLevel,
  setZoomLevel
}: NovelFooterProps) {
  const { saveStatus } = useEditorPanel();

  // Hitung kata/karakter dari event editor (ter-debounce), bukan tiap render.
  // doc.textContent men-serialize SELURUH dokumen — pada bab panjang ini mahal bila
  // dijalankan di setiap render (mis. tiap ketukan/perubahan saveStatus).
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) {
      setCounts({ words: 0, chars: 0 });
      return;
    }

    const recompute = () => {
      const text = editor.state.doc.textContent;
      setCounts({
        words: text.trim().split(/\s+/).filter(Boolean).length,
        chars: text.length,
      });
    };

    const onUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(recompute, 400);
    };

    recompute(); // nilai awal saat editor/bab berganti
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor]);

  const wordCount = counts.words;
  const charCount = counts.chars;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200)); // ~200 kata/menit

  return (
    <div className="h-12 border-t border-slate-200 dark:border-slate-800 bg-background/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest z-10 transition-colors gap-4">
      {/* Kiri: Status dokumen (read-only) */}
      <div className="flex gap-4 items-center shrink-0">
        <span className="bg-slate-100 dark:bg-slate-800/50 px-3 py-1 rounded-full text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50 cursor-default">
          KATA: {wordCount}
        </span>
        <span className="hidden sm:inline cursor-default">KARAKTER: {charCount}</span>
        {wordCount > 0 && (
          <span className="hidden md:inline-flex items-center gap-1.5 cursor-default" title="Perkiraan waktu baca (~200 kata/menit)">
            <Clock size={11} className="opacity-60" />
            {readingMinutes} MNT
          </span>
        )}

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block"></div>

        {/* Status simpan */}
        <span role="status" className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border border-transparent",
          saveStatus === 'Menyimpan...' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/20' :
          !saveStatus || saveStatus === 'Tersimpan' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-900/20' :
          'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
        )}>
          {!saveStatus || saveStatus === 'Tersimpan' ? 'Isi bab tersimpan' : saveStatus}
        </span>

      </div>

      {/* Kanan: Aksi & tampilan */}
      <div className="flex gap-2 items-center shrink-0">
        <button
          type="button"
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          aria-label="Cari & Ganti"
          aria-pressed={isSearchOpen}
          className={cn(
            "p-1.5 rounded text-slate-500 hover:text-indigo-600 transition-colors",
            isSearchOpen ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-100 dark:hover:bg-slate-800"
          )}
          title="Search & Replace (Ctrl+H)"
        >
          <Search size={14} />
        </button>

        <ViewControlsMenu
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel}
          isFocusMode={isFocusMode}
          setIsFocusMode={setIsFocusMode}
          isTypewriterMode={isTypewriterMode}
          setIsTypewriterMode={setIsTypewriterMode}
        />
      </div>
    </div>
  );
}
