/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readChapter } from '@/src/services/chapterQueries';
import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Loader2, 
  X, 
  ScrollText, 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUI } from '@/src/contexts/UIContext';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useEditorPanel } from '@/src/contexts/EditorPanelContext';
import { EditorContent } from '@tiptap/react';
import { SelectionFloatingMenu } from '@/src/features/editor/components/SelectionFloatingMenu';
import { QuickPromiseModal, QuickPromiseSeed } from '@/src/features/consistency/components/QuickPromiseModal';
import { EditorPanelProvider } from '@/src/contexts/EditorPanelContext';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useToast } from '@/src/hooks/useToast';
import { useGlobalEvents } from '@/src/hooks/useGlobalEvents';
import { useCodexCategories } from '@/src/features/codex/hooks/useCodexCategories';
import { getCategoryLabel } from '@/src/lib/codexCategories';
import { CategoryIcon } from '@/src/features/codex/components/CategoryIcon';

// New Modular Components & Hooks
import { useNovelEditor } from '@/src/features/editor/hooks/useNovelEditor';
import { EditorHeader } from '@/src/features/editor/components/EditorHeader';
import { NovelFooter } from '@/src/features/editor/components/NovelFooter';
import { EditorLayout } from '@/src/features/editor/components/EditorLayout';
import { EditorToolbar } from '@/src/features/editor/components/EditorToolbar';
import { AiProcessingOverlay } from '@/src/features/editor/components/AiProcessingOverlay';
import { NovelPanels } from '@/src/features/editor/components/NovelPanels';
import { EditorActivityRail } from '@/src/features/editor/components/EditorActivityRail';
import { SearchReplaceBar } from '@/src/features/editor/components/SearchReplaceBar';

interface NovelEditorProps {
  chapterId: number;
  projectId: number;
}

export function NovelEditor(props: NovelEditorProps) {
  return (
    <EditorPanelProvider>
      <NovelEditorInner {...props} />
    </EditorPanelProvider>
  );
}

function NovelEditorInner({ chapterId, projectId }: NovelEditorProps) {
  const [chapter, setChapter] = useState<any>(undefined);
  const [isTypewriterMode, setIsTypewriterMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const saved = localStorage.getItem('editor_zoom');
    return saved ? parseInt(saved, 10) : 100;
  });

  useEffect(() => {
    localStorage.setItem('editor_zoom', zoomLevel.toString());
  }, [zoomLevel]);

  // `zoom` menggeser posisi visual teks tetapi TIDAK memicu event scroll/resize,
  // sehingga overlay yang memakai koordinat rect (floating menu) atau koordinat
  // absolut (popup codex) bisa tertinggal di posisi lama. Tutup popup codex dan —
  // setelah transisi zoom 300ms selesai — paksa floating menu menghitung ulang
  // posisinya lewat event resize yang sudah ia dengarkan.
  useEffect(() => {
    setActiveCodexPopup(null);
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
    return () => clearTimeout(t);
  }, [zoomLevel]);

  const { isFocusMode, setIsFocusMode } = useUI();
  const { pendingHighlight, clearPendingHighlight } = useNavigation();
  const { setActivePanel } = useEditorPanel();
  const { toast } = useToast();
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const [promiseSeed, setPromiseSeed] = useState<QuickPromiseSeed | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    setChapter(undefined); // Start loading
    readChapter(chapterId).then(data => {
      if (isMounted) {
        setChapter(data || null); // null if not found
      }
    });
    return () => { isMounted = false; };
  }, [chapterId]);

  const { codexEntries, aiActions, bibleRules, relationships, isLoading } = useProjectData(projectId);
  const { categories } = useCodexCategories(projectId);

  // Data untuk konsistensi inline (Fase 1, deterministik): urutan bab + timeline.
  const allChapters = useProjectChapters(projectId);
  const timelineEvents = useLiveQuery(() => db.timeline.where('projectId').equals(projectId).toArray(), [projectId]);
  const chapterRefs = useMemo(
    () => (allChapters || []).filter(c => c.id != null).map(c => ({ id: c.id!, order: c.order, title: c.title })),
    [allChapters]
  );

  const {
    editor,
    title,
    handleTitleChange,
    isAiProcessing,
    aiInlineChecking,
    checkConsistencySelection,
    retryStatus,
    rewritePreview,
    setRewritePreview,
    runAiAction,
    acceptRewrite,
    insertRewriteBelow,
    discardRewrite,
    activeCodexPopup,
    setActiveCodexPopup,
    handleReplace,
    handleReplaceAll,
    handleNext,
    handlePrev,
    // Search handlers
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    replaceQuery,
    setReplaceQuery,
    isCaseSensitive,
    setIsCaseSensitive,
    isRegex,
    setIsRegex,
    isSemanticMode,
    setIsSemanticMode,
    searchStats,
    closeSearch
  } = useNovelEditor({
    chapterId,
    chapter,
    codexEntries: codexEntries || [],
    bibleRules: bibleRules || [],
    relationships: relationships || [],
    aiActions: aiActions || [],
    isTypewriterMode,
    containerRef,
    chapters: chapterRefs,
    timeline: timelineEvents || []
  });

  // Tambah catatan revisi pada teks terpilih: bungkus selection dengan mark
  // RevisionComment (catatan tersimpan sebagai atribut mark → ikut HTML bab),
  // buka panel Catatan Revisi, dan tandai catatan baru agar editornya langsung aktif.
  const handleAddComment = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return; // butuh teks terpilih
    const commentId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    editor.chain().focus().setRevisionComment({ commentId, note: '', resolved: false }).run();
    setFocusCommentId(commentId);
    setActivePanel('comments');
  }, [editor, setActivePanel]);

  // Catat teks terpilih sebagai Janji Plot — janji dalam prosa umumnya bukan
  // entitas Codex, jadi default-nya dilacak via kata kunci. Seleksi pendek → jadi
  // judul + kata kunci; seleksi panjang → jadi deskripsi, judul dipangkas.
  const handleNotePromise = useCallback((text: string) => {
    const clean = (text || '').trim().replace(/\s+/g, ' ');
    if (!clean) {
      toast.info('Pilih dulu bagian teks yang ingin dicatat sebagai janji.');
      return;
    }
    const short = clean.length <= 40 && clean.split(' ').length <= 5;
    setPromiseSeed({
      projectId,
      title: short ? clean : clean.slice(0, 50).trim() + '…',
      description: short ? undefined : clean,
      keywords: short ? [clean] : undefined,
      plantedChapterId: chapterId,
    });
  }, [projectId, chapterId, toast]);

  // Cek konsistensi AI manual pada paragraf terpilih (on-demand, hemat token).
  const handleCheckConsistency = useCallback(async () => {
    try {
      const n = await checkConsistencySelection();
      if (n < 0) {
        toast.info('Pilih teks pada sebuah paragraf untuk diperiksa.');
      } else if (n === 0) {
        toast.success('Tidak ada potensi kontradiksi pada bagian ini.');
      } else {
        toast.warning(`${n} potensi kontradiksi ditemukan — lihat garis bawah ungu.`);
      }
    } catch {
      toast.error('Gagal memeriksa konsistensi. Coba lagi.');
    }
  }, [checkConsistencySelection, toast]);

  // Editor-specific Global Events (Ctrl+H, etc)
  useGlobalEvents({
    onToggleEditorSearch: () => setIsSearchOpen(!isSearchOpen),
    isEditorSearchOpen: isSearchOpen
  });

  // "Loncat ke editor" (mis. dari Cek Konsistensi): buka find bar terisi kutipan,
  // sorot semua kecocokan, lalu pilih+scroll ke yang pertama. Retry singkat sambil
  // konten bab selesai dimuat ke editor.
  useEffect(() => {
    if (!editor || !pendingHighlight || !chapter) return;
    const term = pendingHighlight;
    clearPendingHighlight();
    setSearchQuery(term);
    setIsSearchOpen(true);
    let tries = 0;
    const tryScroll = () => {
      const results = (editor.storage as any).searchAndReplace?.results || [];
      if (results.length > 0) {
        editor.commands.nextSearchResult(); // select + scrollIntoView kecocokan pertama
      } else if (tries++ < 12) {
        setTimeout(tryScroll, 100);
      }
    };
    const t = setTimeout(tryScroll, 80);
    return () => clearTimeout(t);
  }, [editor, pendingHighlight, chapter, clearPendingHighlight, setSearchQuery, setIsSearchOpen]);

  if (chapter === undefined || isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-300 bg-white dark:bg-slate-900">
        <Loader2 size={32} className="animate-spin mb-4 opacity-20" />
        <p className="font-serif italic text-lg">Menyinkronkan naskah...</p>
      </div>
    );
  }

  if (chapter === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-300 bg-white dark:bg-slate-900">
        <ScrollText size={48} className="mb-4 opacity-20" />
        <p className="font-serif italic text-lg text-center px-8">Bab ini telah dihapus.<br/>Silakan pilih jalur lain dari kerangka.</p>
      </div>
    );
  }

  return (
    <EditorLayout
      isFocusMode={isFocusMode}
      containerRef={containerRef}
      header={<EditorHeader title={title} onTitleChange={handleTitleChange} />}
      toolbar={<EditorToolbar editor={editor} />}
      footer={
        <NovelFooter 
          editor={editor} 
          isTypewriterMode={isTypewriterMode} 
          setIsTypewriterMode={setIsTypewriterMode} 
          isFocusMode={isFocusMode}
          setIsFocusMode={setIsFocusMode}
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel}
        />
      }
      panels={
        <NovelPanels
          projectId={projectId}
          chapterId={chapterId}
          editor={editor}
          codexEntries={codexEntries || []}
          bibleRules={bibleRules || []}
          relationships={relationships || []}
          focusCommentId={focusCommentId}
          onFocusCommentConsumed={() => setFocusCommentId(null)}
        />
      }
      rail={<EditorActivityRail />}
    >
      <div className="relative w-full">
        <AnimatePresence>
          {isSearchOpen && (
            <SearchReplaceBar
              editor={editor}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              replaceQuery={replaceQuery}
              setReplaceQuery={setReplaceQuery}
              isCaseSensitive={isCaseSensitive}
              setIsCaseSensitive={setIsCaseSensitive}
              isRegex={isRegex}
              setIsRegex={setIsRegex}
              isSemanticMode={isSemanticMode}
              setIsSemanticMode={setIsSemanticMode}
              searchStats={searchStats}
              onClose={closeSearch}
              onReplace={handleReplace}
              onReplaceAll={handleReplaceAll}
              onNext={handleNext}
              onPrev={handlePrev}
            />
          )}
        </AnimatePresence>

        {editor && (
          <SelectionFloatingMenu 
            editor={editor} 
            onAiAction={runAiAction} 
            customActions={aiActions} 
            isAiProcessing={isAiProcessing}
            rewritePreview={rewritePreview}
            onAcceptRewrite={acceptRewrite}
            onInsertBelow={insertRewriteBelow}
            onDiscardRewrite={discardRewrite}
            onAddComment={handleAddComment}
            onCheckConsistency={handleCheckConsistency}
            isCheckingConsistency={aiInlineChecking}
            onNotePromise={handleNotePromise}
          />
        )}

        {promiseSeed && (
          <QuickPromiseModal seed={promiseSeed} onClose={() => setPromiseSeed(null)} />
        )}
        
        <AnimatePresence>
          {activeCodexPopup && (() => {
            const entry = codexEntries?.find(e => e.id === activeCodexPopup.id);
            if (!entry) return null;
            const POPUP_HEIGHT = 180;
            const rawY = activeCodexPopup.y + 15;
            const safeY = rawY + POPUP_HEIGHT > window.innerHeight
              ? activeCodexPopup.y - POPUP_HEIGHT - 10
              : rawY;
            return (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed z-[100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white p-4 rounded-xl shadow-2xl shadow-slate-200/50 dark:shadow-black/50 w-64 text-sm pointer-events-auto"
                style={{ left: Math.min(activeCodexPopup.x + 10, window.innerWidth - 280), top: safeY }}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400 uppercase text-[10px] tracking-widest">
                    <CategoryIcon category={entry.category} categories={categories} size={12} />
                    {getCategoryLabel(entry.category, categories)}
                  </span>
                  <button onClick={() => setActiveCodexPopup(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full p-0.5"><X size={12} /></button>
                </div>
                <h4 className="font-bold text-base mb-1 text-slate-800 dark:text-slate-100">{entry.name}</h4>
                <p className="font-serif italic text-slate-600 dark:text-slate-300 text-xs leading-relaxed line-clamp-4">{entry.description || 'Belum ada deskripsi.'}</p>
                {entry.aliases && entry.aliases.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 w-full mb-1">Alias</span>
                    {entry.aliases.map(a => <span key={a} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">{a}</span>)}
                  </div>
                )}
              </motion.div>
            );
          })()}
        </AnimatePresence>

        <div style={{ zoom: zoomLevel / 100 }} className="transition-all duration-300 origin-top">
          <EditorContent editor={editor} />
        </div>

        <AiProcessingOverlay isProcessing={isAiProcessing} retryStatus={retryStatus} />

        {/* Indikator lapisan konsistensi inline AI sedang memeriksa paragraf */}
        <AnimatePresence>
          {aiInlineChecking && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="fixed bottom-20 right-4 sm:right-6 z-[90] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 shadow-sm text-[11px] font-medium pointer-events-none"
            >
              <Loader2 size={12} className="animate-spin" />
              Memeriksa konsistensi…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </EditorLayout>
  );
}
