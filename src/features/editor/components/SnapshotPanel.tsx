/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { History, RotateCcw, Trash2, Camera, Sparkles, GitCompare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useStorageQuota } from '@/src/hooks/useStorageQuota';
import { useToast } from '@/src/hooks/useToast';
import { addSnapshot, deleteSnapshot } from '@/src/services/snapshotService';
import { SnapshotDiffModal } from '@/src/features/editor/components/SnapshotDiffModal';
import type { Snapshot } from '@/src/types';

interface SnapshotPanelProps {
  chapterId: number;
  currentContent: string;
  onRestore: (content: string) => Promise<void>;
}

export function SnapshotPanel({ chapterId, currentContent, onRestore }: SnapshotPanelProps) {
  const { toast } = useToast();
  const { checkStorageQuota } = useStorageQuota();
  const snapshots = useLiveQuery(() => 
    db.snapshots.where('chapterId').equals(chapterId).reverse().sortBy('timestamp')
  , [chapterId]);

  const [label, setLabel] = useState('');
  const [diffSnap, setDiffSnap] = useState<Snapshot | null>(null);

  const takeSnapshot = async () => {
    if (!currentContent.trim()) return;
    await addSnapshot({
      chapterId,
      content: currentContent,
      label: label || `Snapshot ${format(new Date(), 'd MMM, HH:mm')}`,
      timestamp: Date.now()
    });
    setLabel('');
    checkStorageQuota();
  };

  const doRestore = async (snap: { content: string }) => {
    try {
      await onRestore(snap.content);
      void checkStorageQuota();
    } catch (error) {
      console.error('Snapshot restore failed:', error);
      toast.error('Gagal memulihkan versi bab.');
    }
  };

  // Pemulihan langsung dari kartu → konfirmasi dulu (belum melihat perbandingan).
  const restoreSnapshot = async (snap: { label: string; content: string }) => {
    const ok = window.confirm(
      `Pulihkan ke versi "${snap.label}"?\n\nNaskah saat ini akan ditimpa. Sebuah snapshot otomatis dari naskah sekarang akan dibuat lebih dulu agar perubahan ini bisa dikembalikan.`
    );
    if (!ok) return;
    await doRestore(snap);
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 h-full flex flex-col">
      <header className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <History size={14} />
          Riwayat Versi
        </h2>
      </header>

      <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Abadikan kondisi bab saat ini sebelum melakukan perubahan besar.</p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Nama snapshot..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            onClick={takeSnapshot}
            className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors shadow-sm"
            title="Ambil Snapshot"
          >
            <Camera size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {snapshots?.map((snap) => (
            <motion.div
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={snap.id}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2 group hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1 flex items-center gap-1.5">
                    {snap.auto && (
                      <span title="Dibuat otomatis sebelum aksi destruktif" className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-500/15 px-1 py-0.5 rounded shrink-0">
                        <Sparkles size={8} /> Otomatis
                      </span>
                    )}
                    <span className="truncate">{snap.label}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{format(snap.timestamp, 'MMM d, yyyy HH:mm:ss')}</p>
                </div>
                <button 
                  onClick={() => deleteSnapshot(snap.id!)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              
              <div className="flex gap-1.5">
                <button
                  onClick={() => setDiffSnap(snap)}
                  className="flex-1 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 transition-all"
                  title="Lihat perbedaan dengan naskah sekarang"
                >
                  <GitCompare size={10} />
                  Bandingkan
                </button>
                <button
                  onClick={() => restoreSnapshot(snap)}
                  className="flex-1 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all"
                >
                  <RotateCcw size={10} />
                  Pulihkan
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {snapshots?.length === 0 && (
          <div className="text-center py-12">
            <History size={24} className="mx-auto text-slate-200 mb-2 opacity-20" />
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">Belum ada snapshot tersimpan.</p>
          </div>
        )}
      </div>

      {diffSnap && (
        <SnapshotDiffModal
          snapshot={diffSnap}
          currentContent={currentContent}
          onClose={() => setDiffSnap(null)}
          onRestore={async () => {
            const snap = diffSnap;
            setDiffSnap(null);
            await doRestore(snap);
          }}
        />
      )}
    </div>
  );
}
