import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Trash2, Check, Lock, AlertTriangle, SlidersHorizontal, ChevronDown } from 'lucide-react';
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

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/60">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Kelola Kategori</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tambah kategori Codex sesuai dunia ceritamu.</p>
          </div>
          <button onClick={onClose} aria-label="Tutup" title="Tutup" className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Form tambah */}
          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Kategori baru</label>
            <div className="flex gap-2">
              <div className="p-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                {React.createElement(resolveIcon(icon), { size: 20, className: resolveColor(color) })}
              </div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="Misal: Faksi, Ras, Organisasi…"
                className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
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

          {/* Kategori kustom */}
          {custom.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Kategori kustom</p>
              {custom.map(cat => {
                const isEditing = editingFieldsFor === cat.id;
                const fields = cat.fields ?? [];
                return (
                <div key={cat.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      {React.createElement(resolveIcon(cat.icon), { size: 18, className: resolveColor(cat.color) })}
                    </div>
                    <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {cat.label}
                      {fields.length > 0 && (
                        <span className="ml-2 text-[10px] font-semibold text-indigo-500 dark:text-indigo-400">{fields.length} field</span>
                      )}
                    </span>
                    <button
                      onClick={() => toggleEditFields(cat.id!)}
                      className={`flex items-center gap-1 p-1.5 rounded-lg transition-colors ${isEditing ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}
                      title="Kelola field terstruktur (mis. Habitat, Kelemahan)"
                    >
                      <SlidersHorizontal size={15} />
                      <ChevronDown size={13} className={`transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      onClick={() => setPendingDelete(cat)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
          )}

          {/* Kategori bawaan (read-only) */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Kategori bawaan</p>
            {BUILTIN_CATEGORIES.map(cat => (
              <div key={cat.slug} className="flex items-center gap-3 px-3 py-2 opacity-70">
                <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  {React.createElement(resolveIcon(cat.icon), { size: 18, className: resolveColor(cat.color) })}
                </div>
                <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">{cat.label}</span>
                <Lock size={14} className="text-slate-400" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Konfirmasi hapus */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onClick={(e) => { e.stopPropagation(); setPendingDelete(null); }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-xl"><AlertTriangle className="text-red-500" size={20} /></div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Hapus "{pendingDelete.label}"?</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Entri yang memakai kategori ini akan dipindahkan ke <strong>Lore Lainnya</strong>. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingDelete(null)} className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm">Batal</button>
              <button onClick={confirmDelete} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors text-sm">
                <Check size={16} /> Hapus
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
