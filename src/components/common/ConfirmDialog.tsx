/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useLayoutEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Isi pesan; boleh JSX (mis. penekanan bagian penting). */
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' → aksen merah (aksi destruktif spt menimpa/hapus). */
  tone?: 'danger' | 'default';
  /** Saat true, tombol konfirmasi menampilkan spinner & dinonaktifkan. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog konfirmasi bergaya app (pengganti `window.confirm` untuk aksi destruktif).
 * Terkontrol lewat open; native showModal menyediakan top-layer/inert dan
 * penanganan Tab menjaga fokus di dialog. Busy menahan dismissal.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    (cancelRef.current?.disabled ? dialog : cancelRef.current)?.focus();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open]);
  useLayoutEffect(() => {
    if (open && busy) dialogRef.current?.focus();
    if (open && !busy && document.activeElement === dialogRef.current) cancelRef.current?.focus();
  }, [open, busy]);
  if (!open) return null;

  const isDanger = tone === 'danger';
  const confirmClasses = isDanger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-indigo-600 hover:bg-indigo-700 text-white';

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      tabIndex={-1}
      style={{ width: 'calc(100% - 2rem)' }}
      className="m-auto max-w-sm p-0 border-0 rounded-2xl bg-transparent backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
      onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        const focusable = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
          .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
        const first = focusable[0], last = focusable.at(-1);
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
        if (event.target === event.currentTarget && outside && !busy) onCancel();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-xl ${isDanger ? 'bg-red-50 dark:bg-red-900/30' : 'bg-indigo-50 dark:bg-indigo-900/30'}`}>
            <AlertTriangle className={isDanger ? 'text-red-500' : 'text-indigo-500'} size={20} />
          </div>
          <h3 id={titleId} className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        </div>
        <div id={descriptionId} className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {message}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-colors text-sm disabled:opacity-60 ${confirmClasses}`}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </dialog>
  );
}
