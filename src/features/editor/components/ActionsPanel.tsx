import { ACTION_ICONS, ICON_OPTIONS, DEFAULT_ICON, getActionIcon } from './actionIcons';
/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { addAiAction, updateAiAction, deleteAiAction } from '@/src/services/aiActionOperations';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus, Trash2, Zap, Sparkles, Command, MessageSquare, ChevronRight, PenTool,
  Pencil, X, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface ActionsPanelProps {
  projectId: number;
}

export function ActionsPanel({ projectId }: ActionsPanelProps) {
  const customActions = useLiveQuery(() =>
    db.aiActions.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const [newLabel, setNewLabel] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newIcon, setNewIcon] = useState(DEFAULT_ICON);
  const [isFocused, setIsFocused] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const resetForm = () => {
    setNewLabel('');
    setNewPrompt('');
    setNewIcon(DEFAULT_ICON);
    setEditingId(null);
  };

  const saveAction = async () => {
    const label = newLabel.trim();
    const prompt = newPrompt.trim();
    if (!label || !prompt) return;

    if (editingId != null) {
      await updateAiAction(editingId, { label, prompt, icon: newIcon });
    } else {
      await addAiAction({ projectId, label, prompt, icon: newIcon });
    }
    resetForm();
  };

  const startEdit = (action: { id?: number; label: string; prompt: string; icon?: string }) => {
    setEditingId(action.id ?? null);
    setNewLabel(action.label);
    setNewPrompt(action.prompt);
    setNewIcon(action.icon || DEFAULT_ICON);
  };

  const deleteAction = async (id: number) => {
    await deleteAiAction(id);
    if (editingId === id) resetForm();
  };

  const isEditing = editingId != null;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-10 pb-20 w-full">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase border border-indigo-100 dark:border-indigo-800/50">
          <Sparkles size={14} />
          <span>Aksi AI</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
          Aksi AI Kustom
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          Rancang pintasan AI sesuai gaya menulismu. Sorot teks di editor, dan aksi kustommu akan muncul di menu mengambang.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Creator Form */}
        <section className="lg:col-span-5 h-fit sticky top-10">
          <div className={cn(
            "bg-white dark:bg-slate-900 border rounded-2xl p-6 shadow-sm transition-all duration-300",
            isFocused ? "border-indigo-400 dark:border-indigo-500 ring-4 ring-indigo-50 dark:ring-indigo-950/50" : "border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/50"
          )}>
            <div className="flex items-center justify-between gap-2 mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <PenTool size={18} />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isEditing ? 'Ubah Aksi' : 'Buat Aksi'}
                </h2>
              </div>
              {isEditing && (
                <button
                  onClick={resetForm}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X size={14} /> Batal
                </button>
              )}
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Command size={12} /> Label Tombol
                </label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 transition-all placeholder:text-slate-400"
                  placeholder="mis. Bikin Mencekam"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={12} /> Ikon
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map((slug) => {
                    const Icon = ACTION_ICONS[slug];
                    const active = newIcon === slug;
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => setNewIcon(slug)}
                        aria-label={`Pilih ikon ${slug}`}
                        aria-pressed={active}
                        className={cn(
                          "p-2.5 rounded-xl border transition-all",
                          active
                            ? "bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-700"
                        )}
                      >
                        <Icon size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare size={12} /> Instruksi Prompt AI
                </label>
                <textarea
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 transition-all min-h-[140px] resize-none leading-relaxed placeholder:text-slate-400"
                  placeholder="mis. Tulis ulang teks terpilih agar terdengar lebih kelam dan misterius. Gunakan kalimat pendek dan fokus pada detail indrawi."
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
              </div>

              <button
                onClick={saveAction}
                disabled={!newLabel.trim() || !newPrompt.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all active:scale-[0.98] shadow-sm hover:shadow-md"
              >
                {isEditing ? <><Check size={16} /> Simpan Perubahan</> : <><Plus size={16} /> Simpan Aksi</>}
              </button>
            </div>
          </div>
        </section>

        {/* Existing Snippets List */}
        <section className="lg:col-span-7">
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {customActions && customActions.length > 0 ? (
                customActions.map((action, idx) => {
                  const Icon = getActionIcon(action.icon);
                  return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    key={action.id}
                    className={cn(
                      "group bg-white dark:bg-slate-900 border rounded-2xl p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:shadow-sm transition-all",
                      editingId === action.id
                        ? "border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40"
                        : "border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/50"
                    )}
                  >
                    <div className="space-y-3 flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md shrink-0">
                          <Icon size={14} />
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{action.label}</h3>
                      </div>
                      <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/50">
                        <ChevronRight size={14} className="shrink-0 mt-0.5 text-slate-400" />
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {action.prompt}
                        </p>
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-1 shrink-0 self-end sm:self-start">
                      <button
                        onClick={() => startEdit(action)}
                        className="p-2 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Ubah aksi"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => deleteAction(action.id!)}
                        className="p-2 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Hapus aksi"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                  );
                })
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center text-center py-20 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50"
                >
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-6">
                    <Zap size={24} className="text-slate-300 dark:text-slate-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Belum ada aksi</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
                    Buat aturan AI kustom untuk membantu menulis ulang, mengembangkan, atau brainstorming format teks tertentu.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

      </div>
    </div>
  );
}
