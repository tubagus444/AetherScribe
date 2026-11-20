import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, Plus, Trash2, Lock, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { addCategoryField, removeCategoryField, addCodexCategory, deleteCodexCategory } from '@/src/services/codexOperations';
import { useToast } from '@/src/hooks/useToast';
import { invalidateContextCache } from '@/src/services/contextEngine';
import {
  BUILTIN_CATEGORIES, ICON_KEYS, COLOR_KEYS,
  resolveIcon, resolveColor, slugify, isBuiltinSlug,
} from '@/src/lib/codexCategories';
import type { CustomCategory, CategoryFieldDef, CodexFieldType } from '@/src/types';

const FIELD_TYPE_LABELS: Record<CodexFieldType, string> = {
  text: 'Teks singkat',
  textarea: 'Teks panjang',
  number: 'Angka',
  select: 'Pilihan',
};

interface CategoryManagerModalProps {
  projectId: number;
  custom: CustomCategory[];
  onClose: () => void;
}

export function CategoryManagerModal({ projectId, custom, onClose }: CategoryManagerModalProps) {
  const { toast } = useToast();
  const titleId = useId();
  const categoryInputId = useId();
  const customTitleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(ICON_KEYS[0]);
  const [color, setColor] = useState(COLOR_KEYS[0]);
  const [pendingDelete, setPendingDelete] = useState<CustomCategory | null>(null);
  const [saving, setSaving] = useState(false);

  // Editor template field (#17) per kategori kustom.
  const [editingFieldsFor, setEditingFieldsFor] = useState<number | null>(null);
  const [fLabel, setFLabel] = useState('');
  const [fType, setFType] = useState<CodexFieldType>('text');
  const [fOptions, setFOptions] = useState('');

  useLayoutEffect(() => {
    const trigger = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  const toggleEditFields = (id: number) => {
    setEditingFieldsFor(prev => (prev === id ? null : id));
    setFLabel(''); setFOptions(''); setFType('text');
  };

  const addField = async (cat: CustomCategory) => {
    const label = fLabel.trim();
    if (!label) return;
    const def: Omit<CategoryFieldDef, 'key'> = { label, type: fType };
    if (fType === 'select') {
      const opts = fOptions.split(',').map(s => s.trim()).filter(Boolean);
      if (!opts.length) { toast.error('Isi minimal satu opsi (pisahkan dengan koma).'); return; }
      def.options = opts;
    }
    try {
      await addCategoryField(cat.id!, def);
      setFLabel(''); setFOptions(''); setFType('text');
    } catch (e: any) {
      toast.error('Gagal menambah field: ' + (e?.message || String(e)));
    }
  };

  const removeField = async (cat: CustomCategory, key: string) => {
    try {
      await removeCategoryField(cat.id!, key);
    } catch (e: any) {
      toast.error('Gagal menghapus field: ' + (e?.message || String(e)));
    }
  };

  const handleAdd = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const slug = slugify(trimmed);
    if (!slug) {
      toast.error('Nama kategori harus memuat huruf atau angka.');
      return;
    }
    if (isBuiltinSlug(slug) || custom.some(c => c.slug === slug)) {
      toast.error('Kategori dengan nama itu sudah ada.');
      return;
    }
    setSaving(true);
    try {
      await addCodexCategory({ projectId, slug, label: trimmed, icon, color });
      setLabel('');
      toast.success(`Kategori "${trimmed}" ditambahkan.`);
    } catch (e: any) {
      toast.error('Gagal menambah kategori: ' + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const cat = pendingDelete;
    try {
      await deleteCodexCategory(projectId, cat.id!, cat.slug);
      await invalidateContextCache();
      toast.success(`Kategori "${cat.label}" dihapus. Entri terkait dipindah ke Lore Lainnya.`);
    } catch (e: any) {
      toast.error('Gagal menghapus kategori: ' + (e?.message || String(e)));
    } finally {
      setPendingDelete(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 sm:p-5"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button, input, select, [tabindex]',
          )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
          const current = document.activeElement;
          if (event.shiftKey && current === focusable[0]) {
            event.preventDefault();
            focusable.at(-1)?.focus();
          } else if (!event.shiftKey && current === focusable.at(-1)) {
            event.preventDefault();
            focusable[0]?.focus();
          }
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6 border-b border-slate-100 dark:border-slate-800/60">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-slate-100">Kelola Kategori</h2>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Tutup" title="Tutup" className="shrink-0 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 auto-rows-max gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5 md:auto-rows-auto md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:overflow-hidden">
          {/* Form tambah */}
          <div className="min-w-0 md:overflow-y-auto md:overscroll-contain">
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
              <label htmlFor={categoryInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Kategori baru</label>
              <div className="flex gap-2">
                <div className="p-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                  {React.createElement(resolveIcon(icon), { size: 20, className: resolveColor(color) })}
                </div>
                <input
                  id={categoryInputId}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="Misal: Faksi, Ras, Organisasi…"
                  className="min-w-0 flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                />
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Ikon</p>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_KEYS.map(key => {
                    const Ico = resolveIcon(key);
                    const active = key === icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setIcon(key)}
                        className={`p-2 rounded-lg border transition-colors ${active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        title={key}
                        aria-pressed={active}
                      >
                        <Ico size={16} className="text-slate-600 dark:text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Warna</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_KEYS.map(key => {
                    const active = key === color;
                    return (
                      <button
                        key={key}
                        onClick={() => setColor(key)}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${active ? 'border-slate-400 dark:border-slate-300' : 'border-slate-200 dark:border-slate-700'}`}
                        title={key}
                        aria-pressed={active}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full bg-current ${resolveColor(key)}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!label.trim() || saving}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} /> Tambah Kategori
              </button>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-4 md:overflow-y-auto md:overscroll-contain">
            <section className="shrink-0">
              <h3 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Kategori bawaan</h3>
              <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {BUILTIN_CATEGORIES.map(cat => (
                  <li key={cat.slug} className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/40">
                    {React.createElement(resolveIcon(cat.icon), { size: 16, className: `shrink-0 ${resolveColor(cat.color)}` })}
                    <span className="min-w-0 flex-1 break-words text-xs font-medium text-slate-700 dark:text-slate-300">{cat.label}</span>
                    <Lock size={12} aria-hidden="true" className="shrink-0 text-slate-400" />
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex min-h-0 flex-col md:min-h-28">
              <h3 id={customTitleId} className="mb-2 shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">Kategori kustom</h3>
              <div role="region" aria-labelledby={customTitleId} className="min-h-0 space-y-2 md:overflow-y-auto md:overscroll-contain md:pr-1">
                {custom.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">Belum ada kategori kustom.</p>
                )}
                {custom.map(cat => {
                  const isEditing = editingFieldsFor === cat.id;
                  const fields = cat.fields ?? [];
                  return (
                    <div key={cat.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2">
                        <div className="shrink-0 p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          {React.createElement(resolveIcon(cat.icon), { size: 18, className: resolveColor(cat.color) })}
                        </div>
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-sm font-medium text-slate-800 dark:text-slate-100">
                          {cat.label}
                          {fields.length > 0 && (
                            <span className="ml-2 text-[10px] font-semibold text-indigo-500 dark:text-indigo-400">{fields.length} field</span>
                          )}
                        </span>
                        <button
                          onClick={() => toggleEditFields(cat.id!)}
                          className={`flex shrink-0 items-center gap-1 p-1.5 rounded-lg transition-colors ${isEditing ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}
                          title="Kelola field terstruktur (mis. Habitat, Kelemahan)"
                        >
                          <SlidersHorizontal size={15} />
                          <ChevronDown size={13} className={`transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                        </button>
                        <button
                          onClick={() => setPendingDelete(cat)}
                          className="shrink-0 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Hapus kategori"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {isEditing && (
                        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-3 space-y-3">
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Field terstruktur yang bisa diisi tiap entri kategori ini. Nilainya ikut ke AI &amp; ekspor.
                          </p>

                          {fields.length > 0 && (
                            <div className="space-y-1.5">
                              {fields.map(f => (
                                <div key={f.key} className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5">
                                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">{f.label}</span>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                                    {FIELD_TYPE_LABELS[f.type]}{f.type === 'select' && f.options ? ` · ${f.options.length}` : ''}
                                  </span>
                                  <button
                                    onClick={() => removeField(cat, f.key)}
                                    className="shrink-0 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                    title="Hapus field"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Tambah field */}
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={fLabel}
                              onChange={e => setFLabel(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') addField(cat); }}
                              placeholder="Nama field, mis. Habitat"
                              className="flex-1 min-w-[140px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                            />
                            <select
                              value={fType}
                              onChange={e => setFType(e.target.value as CodexFieldType)}
                              title="Tipe field"
                              className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                            >
                              {(Object.keys(FIELD_TYPE_LABELS) as CodexFieldType[]).map(t => (
                                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => addField(cat)}
                              disabled={!fLabel.trim()}
                              className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Plus size={14} /> Field
                            </button>
                          </div>
                          {fType === 'select' && (
                            <input
                              value={fOptions}
                              onChange={e => setFOptions(e.target.value)}
                              placeholder="Opsi pilihan, pisahkan koma (mis. Rendah, Sedang, Tinggi)"
                              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </motion.div>

      {pendingDelete && (
        <ConfirmDialog
          open
          title={`Hapus "${pendingDelete.label}"?`}
          message={<>Entri yang memakai kategori ini akan dipindahkan ke <strong>Lore Lainnya</strong>. Tindakan ini tidak dapat dibatalkan.</>}
          confirmLabel="Hapus"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>,
    document.body,
  );
}
