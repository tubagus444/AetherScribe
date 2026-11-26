/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import { StickyNote, Pencil, Trash2, Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface CommentItem {
  commentId: string;
  note: string;
  resolved: boolean;
  quote: string;
  from: number;
  to: number;
}

interface RevisionNotesPanelProps {
  editor: Editor | null;
  /** Catatan yang baru dibuat → buka editor note-nya otomatis. */
  focusCommentId?: string | null;
  onFocusConsumed?: () => void;
}

const MARK = 'revisionComment';

function collectComments(editor: Editor): CommentItem[] {
  const map = new Map<string, CommentItem>();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === MARK);
    if (!mark || !mark.attrs.commentId) return;
    const id = mark.attrs.commentId as string;
    const from = pos;
    const to = pos + node.nodeSize;
    const ex = map.get(id);
    if (ex) {
      ex.quote += node.text || '';
      ex.from = Math.min(ex.from, from);
      ex.to = Math.max(ex.to, to);
    } else {
      map.set(id, {
        commentId: id,
        note: mark.attrs.note || '',
        resolved: !!mark.attrs.resolved,
        quote: node.text || '',
        from,
        to,
      });
    }
  });
  return [...map.values()].sort((a, b) => a.from - b.from);
}

export function RevisionNotesPanel({ editor, focusCommentId, onFocusConsumed }: RevisionNotesPanelProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) {
      setComments([]);
      return;
    }
    const extract = () => setComments(collectComments(editor));
    const syncActive = () => {
      const id = editor.isActive(MARK) ? (editor.getAttributes(MARK).commentId as string) : null;
      setActiveId(id ?? null);
    };
    const onUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(extract, 250);
    };

    extract();
    syncActive();
    editor.on('update', onUpdate);
    editor.on('selectionUpdate', syncActive);
    return () => {
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', syncActive);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor]);

  // Catatan baru dari floating menu → langsung buka editornya.
  useEffect(() => {
    if (!focusCommentId) return;
    setEditingId(focusCommentId);
    setDraft('');
    onFocusConsumed?.();
  }, [focusCommentId, onFocusConsumed]);

  const scrollToPos = (pos: number) => {
    if (!editor) return;
    const { node } = editor.view.domAtPos(pos);
    const el = (node.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  };

  const jumpTo = (c: CommentItem) => {
    if (!editor) return;
    // Pilih ulang rentang catatan agar terlihat jelas, lalu gulir ke sana.
    editor.chain().focus().setTextSelection({ from: c.from, to: c.to }).run();
    scrollToPos(c.from);
  };

  const commitNote = (c: CommentItem, note: string) => {
    if (!editor) return;
    editor
      .chain()
      .setTextSelection({ from: c.from, to: c.to })
      .updateRevisionComment({ note })
      .setTextSelection(c.to) // collapse → jangan picu menu seleksi
      .run();
  };

  const toggleResolved = (c: CommentItem) => {
    if (!editor) return;
    editor
      .chain()
      .setTextSelection({ from: c.from, to: c.to })
      .updateRevisionComment({ resolved: !c.resolved })
      .setTextSelection(c.to)
      .run();
  };

  const remove = (c: CommentItem) => {
    if (!editor) return;
    editor
      .chain()
      .setTextSelection({ from: c.from, to: c.to })
      .unsetRevisionComment()
      .setTextSelection(c.to)
      .run();
    if (editingId === c.commentId) setEditingId(null);
  };

  const startEdit = (c: CommentItem) => {
    setEditingId(c.commentId);
    setDraft(c.note);
  };

  const saveEdit = (c: CommentItem) => {
    commitNote(c, draft.trim());
    setEditingId(null);
  };

  const openComments = comments.filter(comment => !comment.resolved);
  const visibleComments = showOnlyOpen ? openComments : comments;

  return (
    <div className="w-full bg-white dark:bg-slate-900 h-full flex flex-col">
      <header className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/50">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <StickyNote size={14} />
          Catatan Revisi
        </h2>
        {comments.length > 0 && (
          <div role="group" aria-label="Filter catatan revisi" className="flex flex-wrap gap-1 text-xs font-semibold">
            <button type="button" aria-pressed={!showOnlyOpen} onClick={() => setShowOnlyOpen(false)}
              className="min-h-8 rounded-full px-2 text-slate-600 hover:bg-slate-200 aria-pressed:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 dark:aria-pressed:bg-slate-700">
              Semua
            </button>
            <button type="button" aria-pressed={showOnlyOpen} onClick={() => setShowOnlyOpen(true)}
              className="min-h-8 rounded-full px-2 text-amber-800 hover:bg-amber-100 aria-pressed:bg-amber-200 dark:text-amber-300 dark:hover:bg-amber-500/20 dark:aria-pressed:bg-amber-500/30">
              {openComments.length} terbuka
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {visibleComments.map((c) => {
            const active = c.commentId === activeId;
            const isEditing = c.commentId === editingId;
            return (
              <motion.div
                layout
                key={c.commentId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className={cn(
                  'rounded-xl border p-3 space-y-2 transition-colors',
                  c.resolved
                    ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/70 dark:border-slate-800 opacity-70'
                    : 'bg-amber-50/40 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-900/30',
                  active && 'ring-2 ring-amber-400/60 dark:ring-amber-500/40'
                )}
              >
                {/* Kutipan teks → klik untuk lompat */}
                <button
                  onClick={() => jumpTo(c)}
                  className="w-full text-left group"
                  title="Lompat ke teks ini"
                >
                  <p
                    className={cn(
                      'font-serif italic text-xs leading-relaxed line-clamp-2 border-l-2 pl-2 transition-colors',
                      c.resolved
                        ? 'border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 line-through'
                        : 'border-amber-400/70 dark:border-amber-500/50 text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'
                    )}
                  >
                    "{c.quote}"
                  </p>
                </button>

                {/* Catatan */}
                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => saveEdit(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          saveEdit(c);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      placeholder="Tulis catatan revisi... (Ctrl+Enter simpan)"
                      rows={3}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => saveEdit(c)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors flex items-center gap-1"
                      >
                        <Check size={12} />
                        Simpan
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(c)}
                    className="w-full text-left"
                  >
                    {c.note ? (
                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{c.note}</p>
                    ) : (
                      <p className="text-xs italic text-slate-400 dark:text-slate-500">Tambah catatan...</p>
                    )}
                  </button>
                )}

                {/* Aksi */}
                {!isEditing && (
                  <div className="flex items-center justify-end gap-0.5 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <button
                      onClick={() => startEdit(c)}
                      title="Edit catatan"
                      aria-label="Edit catatan"
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => toggleResolved(c)}
                      title={c.resolved ? 'Tandai belum selesai' : 'Tandai selesai'}
                      aria-label={c.resolved ? 'Tandai belum selesai' : 'Tandai selesai'}
                      aria-pressed={c.resolved}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        c.resolved
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      )}
                    >
                      <CheckCheck size={13} />
                    </button>
                    <button
                      onClick={() => remove(c)}
                      title="Hapus catatan"
                      aria-label="Hapus catatan"
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {showOnlyOpen && comments.length > 0 && openComments.length === 0 && (
          <p role="status" className="px-4 py-12 text-center text-xs text-slate-500 dark:text-slate-400">
            Semua catatan revisi sudah selesai.
          </p>
        )}
        {comments.length === 0 && (
          <div className="text-center py-12 px-4">
            <StickyNote size={24} className="mx-auto text-slate-200 dark:text-slate-700 mb-2 opacity-40" />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic leading-relaxed">
              Belum ada catatan revisi.<br />
              Pilih teks di editor lalu klik <span className="inline-flex items-center gap-0.5 not-italic font-semibold"><StickyNote size={10} /> Catatan</span> untuk menambahkannya.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
