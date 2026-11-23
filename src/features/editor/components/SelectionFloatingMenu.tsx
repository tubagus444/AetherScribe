import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  Sparkles,
  Check,
  X,
  CornerDownRight,
  Send,
  Info,
  Wand2,
  Loader2,
  Eye,
  Flame,
  Pin,
  PinOff,
  StickyNote,
  ShieldCheck,
  Crosshair
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Editor } from '@tiptap/react';
import { AIAction } from '@/src/types';
import { getActionIcon } from './actionIcons';
import { useAvailableProviders } from '@/src/hooks/useAvailableProviders';

interface SelectionFloatingMenuProps {
  editor: Editor;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onAiAction: (action: string, provider?: string, customPrompt?: string) => void;
  customActions?: AIAction[];
  isAiProcessing?: boolean;
  rewritePreview?: { original: string; rewritten: string; from: number; to: number } | null;
  onAcceptRewrite?: () => void;
  onInsertBelow?: () => void;
  onDiscardRewrite?: () => void;
  onAddComment?: () => void;
  /** Cek konsistensi AI pada paragraf di posisi seleksi (manual, on-demand). */
  onCheckConsistency?: () => void;
  /** true selagi cek konsistensi berjalan (untuk spinner pada tombol). */
  isCheckingConsistency?: boolean;
  /** Catat teks terpilih sebagai Janji Plot (Chekhov's Gun) — tanpa pindah panel. */
  onTimeline?: (text: string) => void;
  onNotePromise?: (text: string) => void;
}

export function SelectionFloatingMenu({
  editor,
  scrollContainerRef,
  onAiAction,
  customActions = [],
  isAiProcessing = false,
  rewritePreview = null,
  onAcceptRewrite,
  onInsertBelow,
  onDiscardRewrite,
  onAddComment,
  onCheckConsistency,
  isCheckingConsistency = false,
  onTimeline,
  onNotePromise
}: SelectionFloatingMenuProps) {
  const [show, setShow] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customPromptText, setCustomPromptText] = useState('');
  const { 
    availableProviders, 
    selectedProvider, 
    setSelectedProvider 
  } = useAvailableProviders();
  const selectionRangeRef = React.useRef<Range | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ rect: DOMRect; top: number; bottom: number; width: number } | null>(null);
  const [menuSize, setMenuSize] = useState({ width: 0, height: 0 });

  // Load docked state from localStorage
  const [isDocked, setIsDocked] = useState(() => {
    try {
      return localStorage.getItem('novel-editor-floating-menu-docked') === 'true';
    } catch {
      return false;
    }
  });

  const [showAiMenu, setShowAiMenu] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('novel-editor-floating-menu-docked', String(isDocked));
    } catch (e) {
      console.warn(e);
    }
  }, [isDocked]);

  const showRef = React.useRef(show);

  useEffect(() => {
    showRef.current = show;
  }, [show]);

  const selectionTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const showAiMenuRef = React.useRef(showAiMenu);
  const isCustomOpenRef = React.useRef(isCustomOpen);

  useEffect(() => {
    showAiMenuRef.current = showAiMenu;
  }, [showAiMenu]);

  useEffect(() => {
    isCustomOpenRef.current = isCustomOpen;
  }, [isCustomOpen]);

  const updateBounds = React.useCallback(() => {
    const rect = selectionRangeRef.current?.getBoundingClientRect();
    const container = scrollContainerRef.current?.getBoundingClientRect();
    setBounds(rect?.width && rect.height && container ? {
      rect,
      top: Math.max(container.top, 0),
      bottom: Math.min(container.bottom, window.innerHeight),
      width: window.innerWidth,
    } : null);
  }, [scrollContainerRef]);

  const handleSelection = React.useCallback(() => {
    if (rewritePreview) return; // Freeze menu state during preview
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);

    const { selection } = editor.state;
    
    if (selection.empty) {
      // Check if user's focus is just inside the menu
      if (showAiMenuRef.current || isCustomOpenRef.current) {
        const activeEl = document.activeElement;
        if (activeEl?.closest('#selection-floating-menu')) {
          return;
        }
      }
      
      selectionRangeRef.current = null;
      setShow(false);
      setSelectedText('');
      setIsCustomOpen(false);
      return;
    }

    const rawText = editor.state.doc.textBetween(selection.from, selection.to, ' ');
    setSelectedText(rawText);

    selectionTimerRef.current = setTimeout(() => {
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) return;

      const range = domSelection.getRangeAt(0);
      if (range.collapsed || !editor.view.dom.contains(range.commonAncestorContainer)) return;

      selectionRangeRef.current = range.cloneRange();
      updateBounds();
      setShow(true);
    }, 0);
  }, [editor, rewritePreview, updateBounds]);

  useEffect(() => {
    return () => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    editor.on('selectionUpdate', handleSelection);
    
    const handleScrollOrResize = (e: Event) => {
      if (e && e.type === 'scroll') {
        const target = e.target as Node;
        const targetElement = target.nodeType === Node.ELEMENT_NODE ? (target as Element) : null;
        if (targetElement && targetElement.closest('#selection-floating-menu')) {
          return;
        }
      }
      if (selectionRangeRef.current) updateBounds();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      editor.off('selectionUpdate', handleSelection);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [editor, handleSelection, updateBounds]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!show || !menu) return;
    const measure = () => {
      const width = menu.offsetWidth;
      // Include content beyond the scroll boundary when deciding which side fits.
      const height = menu.scrollHeight + menu.offsetHeight - menu.clientHeight;
      setMenuSize(size => size.width === width && size.height === height ? size : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [show, showAiMenu, rewritePreview]);

  // Clean-up custom view when floating menu hides
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (!show) {
      timeoutId = setTimeout(() => {
        setIsCustomOpen(false);
        setShowAiMenu(false);
        setCustomPromptText('');
      }, 200); // delay to let exit animations play out
    }
    return () => clearTimeout(timeoutId);
  }, [show]);

  // Global click outside listener to collapse AI Menu safely without hiding editor UI immediately if handled elsewhere
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      if (!showRef.current) return;
      const target = e.target as Element;
      
      if (target?.closest?.('#selection-floating-menu')) return;
      
      if (showAiMenuRef.current || isCustomOpenRef.current) {
         setShowAiMenu(false);
         setIsCustomOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleGlobalClick);
    document.addEventListener('touchstart', handleGlobalClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('touchstart', handleGlobalClick);
    };
  }, []);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPromptText.trim() || isAiProcessing) return;
    onAiAction('Custom prompt', selectedProvider, customPromptText);
    setIsCustomOpen(false);
  };


  const hasLengthWarning = selectedText.replace(/\s/g, '').length < 5;

  const gap = 12;
  const rect = bounds?.rect;
  const above = bounds ? bounds.rect.top - bounds.top - gap * 2 : 0;
  const below = bounds ? bounds.bottom - bounds.rect.bottom - gap * 2 : 0;
  const showAbove = !isDocked && (above >= menuSize.height || (below < menuSize.height && above >= below));
  const availableHeight = showAbove ? above : below;
  const canScroll = showAiMenu || !!rewritePreview;
  const constrained = !isDocked && canScroll && availableHeight < menuSize.height;
  const minHeight = canScroll ? Math.min(menuSize.height, 44) : menuSize.height;
  const selectionVisible = bounds && bounds.rect.bottom > bounds.top && bounds.rect.top < bounds.bottom;
  const menuVisible = isDocked || (selectionVisible && menuSize.height > 0 && availableHeight >= minHeight);
  const viewportWidth = bounds?.width ?? 0;
  const center = rect && viewportWidth >= 720 ? rect.left + rect.width / 2 : viewportWidth / 2;
  const edge = Math.min(gap, (viewportWidth - menuSize.width) / 2);
  const left = Math.max(edge, Math.min(viewportWidth - menuSize.width - edge, center - menuSize.width / 2));

  const builtInActions = [
    { id: "Show don't tell", label: "Show, don't tell", icon: Sparkles, desc: "Ubah kalimat deskriptif pasif" },
    { id: "Focus Senses", label: "Senses", icon: Eye, desc: "Perkaya deskripsi suasana" },
    { id: "Intensify", label: "Intensify", icon: Flame, desc: "Tingkatkan ketegangan dramatis" }
  ];


  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "fixed z-[100] w-max max-w-[95vw] transition-colors duration-200 flex flex-col items-center",
            constrained && "overflow-y-auto no-scrollbar [&>*]:shrink-0",
            (rewritePreview || isAiProcessing) ? "bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl border" : "",
            rewritePreview
              ? "rounded-2xl p-4 w-[480px] border-slate-200 dark:border-slate-800"
              : isAiProcessing
                ? "rounded-full p-2 border-slate-200/50 dark:border-slate-700/50"
                : ""
          )}
          style={{
            visibility: menuVisible ? 'visible' : 'hidden',
            ...(isDocked ? { bottom: 72, left: '50%', translate: '-50%' } : {
              top: showAbove ? (rect?.top ?? 0) - gap : (rect?.bottom ?? 0) + gap,
              left,
              translate: showAbove ? '0 -100%' : undefined,
              maxHeight: constrained ? Math.max(0, availableHeight) : undefined,
            }),
          }}
          id="selection-floating-menu"
        >
          {rewritePreview ? (
            /* --- REWRITE COMPARISON / PREVIEW STATE --- */
            <div className="flex flex-col gap-3 text-slate-800 dark:text-slate-100" id="preview-container">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/80">
                <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-indigo-500 dark:text-indigo-400">
                  <Sparkles size={13} className="text-indigo-500 animate-pulse" />
                  Pratinjau Hasil Tenun AI
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsDocked(!isDocked)}
                    aria-label="Sematkan menu di bawah layar"
                    aria-pressed={isDocked}
                    className={cn(
                      "p-1 rounded-full transition-colors",
                      isDocked
                        ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40"
                        : "text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                    title={isDocked ? "Beralih ke Melayang (Float)" : "Sematkan di Bawah Layar agar Tidak Menghalangi (Dock to Bottom)"}
                  >
                    {isDocked ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
                  <button 
                    type="button"
                    onClick={onDiscardRewrite}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Batalkan"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto no-scrollbar">
                {/* Before (Original) */}
                <div className="p-2.5 rounded-lg border border-amber-200/50 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/10 flex flex-col gap-1.5 select-none">
                  <span className="text-[9px] font-bold tracking-wide uppercase text-amber-600 dark:text-amber-500">
                    Naskah Asli
                  </span>
                  <p className="font-serif italic text-xs text-slate-500 line-clamp-6 leading-relaxed">
                    "{rewritePreview.original}"
                  </p>
                </div>

                {/* After (Rewritten) */}
                <div className="p-2.5 rounded-lg border border-emerald-200/50 dark:border-emerald-950/30 bg-emerald-50/20 dark:bg-emerald-950/10 flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold tracking-wide uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    Hasil Tenunan
                  </span>
                  <p className="font-serif text-xs text-slate-800 dark:text-slate-200 leading-relaxed max-h-[160px] overflow-y-auto">
                    {rewritePreview.rewritten}
                  </p>
                </div>
              </div>

              {/* Action Buttons row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  onClick={onDiscardRewrite}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1"
                >
                  <X size={13} />
                  Abaikan
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={onInsertBelow}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 rounded-lg transition-colors flex items-center gap-1.5"
                    title="Sisipkan teks baru di bawah teks terpilih"
                  >
                    <CornerDownRight size={13} className="text-slate-500" />
                    Sisipkan di Bawah
                  </button>
                  <button
                    onClick={onAcceptRewrite}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg hover:shadow-indigo-500/10 transition-all flex items-center gap-1.5"
                    title="Timpa teks terpilih dengan hasil baru"
                  >
                    <Check size={13} />
                    Ganti Teks
                  </button>
                </div>
              </div>
            </div>
          ) : isAiProcessing ? (
            /* --- ACTIVE PROCESSING LOADING STATE --- */
            <div className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 min-w-[200px]" id="loading-container">
              <Loader2 size={14} className="animate-spin text-indigo-500" />
              <span className="font-serif italic animate-pulse">Menenun prosa indah...</span>
            </div>
          ) : (
            /* --- DEFAULT MULTI-LAYERED MENU --- */
            <>
              {/* LAYER 1: Core Actions Pill */}
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 p-1.5 rounded-2xl flex flex-wrap justify-center items-center gap-1 shadow-xl w-max max-w-[95vw]">
                {/* AI Trigger */}
                <button
                  type="button"
                  onClick={() => setShowAiMenu(!showAiMenu)}
                  aria-label="Buka menu Asisten AI"
                  aria-expanded={showAiMenu}
                  aria-haspopup="menu"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 font-semibold text-xs rounded-full transition-all shrink-0",
                    showAiMenu
                      ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                      : "bg-indigo-50 hover:bg-indigo-100/70 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                  )}
                  title="Buka menu Asisten AI"
                >
                  <Sparkles size={13} className={cn(showAiMenu ? "text-indigo-700 dark:text-indigo-300" : "animate-pulse")} />
                  Tanya AI
                  {hasLengthWarning && <Info size={12} className="text-indigo-400 dark:text-indigo-500 ml-0.5" />}
                </button>

                <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />

                {/* Cek konsistensi AI pada paragraf di posisi seleksi (on-demand) */}
                {onCheckConsistency && (
                  <>
                    <button
                      type="button"
                      onClick={() => onCheckConsistency()}
                      disabled={isCheckingConsistency}
                      aria-label="Cek konsistensi paragraf ini dengan AI"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-xs rounded-full transition-all shrink-0 text-violet-600 dark:text-violet-400 bg-violet-50 hover:bg-violet-100/70 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 disabled:opacity-60"
                      title="Periksa konsistensi paragraf ini terhadap Codex & Buku Cerita (pakai token)"
                    >
                      {isCheckingConsistency ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                      Cek Konsistensi
                    </button>
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
                  </>
                )}

                {/* Tambah catatan revisi pada teks terpilih */}
                {onAddComment && (
                  <button
                    type="button"
                    onClick={() => onAddComment()}
                    aria-label="Tambah catatan revisi"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-xs rounded-full transition-all shrink-0 text-amber-600 dark:text-amber-400 bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-500/10 dark:hover:bg-amber-500/20"
                    title="Tambah catatan revisi pada teks terpilih"
                  >
                    <StickyNote size={13} />
                    Catatan
                  </button>
                )}

                {/* Catat teks terpilih sebagai Janji Plot (nol token, tanpa pindah panel) */}
                {onTimeline && <button type="button" aria-label="Catat ke Linimasa"
                  className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200"
                  onMouseDown={e => e.preventDefault()} onClick={() => onTimeline(selectedText)}>Catat ke Linimasa</button>}
                {onNotePromise && (
                  <button
                    type="button"
                    onClick={() => onNotePromise(selectedText)}
                    aria-label="Catat sebagai Janji Plot"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-xs rounded-full transition-all shrink-0 text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100/70 dark:bg-rose-500/10 dark:hover:bg-rose-500/20"
                    title="Catat bagian ini sebagai Janji Plot (Chekhov's Gun) untuk dilacak"
                  >
                    <Crosshair size={13} />
                    Catat Janji
                  </button>
                )}

                <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />

                {/* Dock toggle: pindahkan menu ke bawah layar agar tak menghalangi teks */}
                <button
                  type="button"
                  onClick={() => setIsDocked(!isDocked)}
                  aria-label="Sematkan menu di bawah layar"
                  aria-pressed={isDocked}
                  className={cn(
                    "p-1.5 rounded-full transition-all flex items-center justify-center shrink-0",
                    isDocked
                      ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                  )}
                  title={isDocked ? "Beralih ke Melayang (Float)" : "Sematkan di Bawah Layar agar Tidak Menghalangi (Dock to Bottom)"}
                >
                  {isDocked ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              </div>

              {/* LAYER 2: AI Menu Overlay */}
              <AnimatePresence>
                {showAiMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className={cn(
                      "bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-2xl flex flex-col w-[340px] max-w-[95vw] overflow-hidden",
                      showAbove && !constrained ? "order-first mb-2" : "mt-2"
                    )}
                  >
                    {/* Header + Multi-provider indicator */}
                    <div className="flex items-center justify-between p-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                       <div className="flex items-center gap-2">
                         <Wand2 size={14} className="text-indigo-500 shrink-0" />
                         <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Asisten Editor AI</span>
                       </div>
                       
                       {availableProviders.length > 1 && (
                        <div className="flex gap-1 bg-slate-200/50 dark:bg-slate-800 min-w-min p-0.5 rounded-full">
                          {availableProviders.map(p => (
                            <button
                              key={p}
                              onClick={() => setSelectedProvider(p)}
                              title={`Gunakan provider ${p}`}
                              className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all uppercase",
                                selectedProvider === p 
                                  ? "bg-indigo-600 text-white shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                              )}
                            >
                              {p[0]}
                            </button>
                          ))}
                        </div>
                       )}
                    </div>

                    {!hasLengthWarning ? (
                      <div className="flex flex-col max-h-[300px]">
                        {/* Custom Instruction Box */}
                        <div className="p-2 border-b border-slate-100 dark:border-slate-800/80">
                          <form onSubmit={handleCustomSubmit} className="relative flex items-center">
                            <input
                              autoFocus
                              type="text"
                              value={customPromptText}
                              onChange={(e) => setCustomPromptText(e.target.value)}
                              placeholder="Ketik instruksi khusus (misal: buat lebih puitis)..."
                              className="w-full bg-slate-100 dark:bg-slate-800/80 border-0 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs px-3 py-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 pr-9 transition-all"
                            />
                            <button
                              type="submit"
                              disabled={!customPromptText.trim()}
                              className={cn(
                                "absolute right-1 p-1.5 rounded-md shrink-0 transition-colors",
                                customPromptText.trim() 
                                  ? "text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-slate-700"
                                  : "text-slate-300 dark:text-slate-600 pointer-events-none"
                              )}
                              title="Tenun Gaya Kustom"
                            >
                              <Send size={14} />
                            </button>
                          </form>
                        </div>

                        {/* Action Categories */}
                        <div className="overflow-y-auto w-full flex-1 p-2 no-scrollbar space-y-3">
                           {builtInActions.length > 0 && (
                             <div>
                                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1 flex items-center gap-1.5">
                                   Built-in
                                </div>
                                <div className="flex flex-col gap-0.5">
                                   {builtInActions.map((action) => (
                                     <button
                                        key={action.id}
                                        onClick={() => onAiAction(action.id, selectedProvider)}
                                        className="w-full text-left flex items-center gap-2.5 px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg transition-colors group"
                                     >
                                        <div className="bg-indigo-50 dark:bg-indigo-500/10 p-1.5 rounded-md text-indigo-500 dark:text-indigo-400">
                                           <action.icon size={13} />
                                        </div>
                                        <div className="flex flex-col">
                                           <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{action.label}</span>
                                           <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{action.desc}</span>
                                        </div>
                                     </button>
                                   ))}
                                </div>
                             </div>
                           )}

                           {customActions.length > 0 && (
                             <div>
                                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1 mt-1 flex items-center gap-1.5">
                                   Kustom (Personal)
                                </div>
                                <div className="flex flex-wrap gap-1.5 px-2">
                                  {customActions.map((action) => {
                                    const ActionIcon = getActionIcon(action.icon);
                                    return (
                                    <button
                                      key={action.id || action.prompt}
                                      onClick={() => onAiAction(action.prompt, selectedProvider)}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0 max-w-full"
                                    >
                                      <ActionIcon size={12} className="shrink-0" />
                                      <span className="truncate">{action.label}</span>
                                    </button>
                                    );
                                  })}
                                </div>
                             </div>
                           )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 px-4 gap-2 text-center">
                        <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center">
                           <Info size={20} />
                        </div>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Terlalu Singkat</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Pilih blok teks minimal 5 karakter untuk menggunakan asisten revisi dan gaya penulisan.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
