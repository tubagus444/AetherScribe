import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Edit2, Plus, X, Wand2, Check, Undo2, AlertTriangle, ClipboardPaste, EyeOff, SlidersHorizontal, Users } from 'lucide-react';
import { CodexEntry, CodexCategory, type CategoryFieldDef, type CustomFieldValue } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { expandCodexEntry } from '@/src/services/ai';
import { useToast } from '@/src/hooks/useToast';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { BUILTIN_CATEGORIES, type CategoryDef } from '@/src/lib/codexCategories';
import { parseCodexMarkdown } from '@/src/lib/codexImport';
import { fieldValueMap, buildFieldValues, resolveFieldValues } from '@/src/lib/codexFields';
import { WORLD_STATUSES, STATUS_LABEL, suggestStatus } from '@/src/lib/worldCompleteness';
import { WORLD_STATUS_META } from '@/src/features/codex/components/WorldStatusBadge';
import { useProject } from '@/src/contexts/ProjectContext';
import { formatDate, daysInMonth } from '@/src/lib/worldCalendar';
import { CodexDetailsEditor } from '@/src/features/codex/components/CodexDetailsEditor';
import type { DetailChapterIndex } from '@/src/lib/codexDetails';
import { CODEX_COVER_TYPES, type CodexCoverPair } from '@/src/lib/codexCoverLimits';
import { useCodexCover, useCoverUrl } from '@/src/features/codex/hooks/useCodexCover';
import { prepareCodexCover } from '@/src/features/codex/lib/prepareCodexCover';

interface CodexFormProps {
  initialData?: Partial<CodexEntry>;
  editingId: number | null;
  bibleRules: any[];
  existingEntries?: CodexEntry[];
  categories?: CategoryDef[];
  detailChapters: DetailChapterIndex;
  onSave: (data: Partial<CodexEntry>, cover?: CodexCoverPair | null) => Promise<void>;
  /** Buat banyak entri sekaligus dari paste multi-blok (importer #7). Kembalikan jumlah yang dibuat. */
  onBulkCreate?: (entries: Partial<CodexEntry>[]) => Promise<number>;
  onCancel: () => void;
}

type DraftField = CustomFieldValue & { category: CodexCategory };

function loadFields(entry?: Partial<CodexEntry>): DraftField[] {
  return resolveFieldValues(entry ?? {}).map(field => ({ ...field, category: entry?.category ?? 'character' }));
}

function parseCommaSeparated(text: string): string[] {
  return text.split(',').map(value => value.trim()).filter(Boolean);
}

export function CodexForm({ initialData, editingId, bibleRules, existingEntries = [], categories = BUILTIN_CATEGORIES, detailChapters, onSave, onBulkCreate, onCancel }: CodexFormProps) {
  const { toast } = useToast();
  const { setViewMode } = useNavigation();
  const { project } = useProject();
  const cal = project?.calendar;
  const [formData, setFormData] = useState<Partial<CodexEntry>>({
    name: '',
    category: 'character',
    description: '',
    aliases: [],
    tags: [],
    ...initialData
  });
  const [aliasesText, setAliasesText] = useState<string>();
  const [tagsText, setTagsText] = useState<string>();
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [coverDraft, setCoverDraft] = useState<CodexCoverPair | null>();
  const [isProcessingCover, setIsProcessingCover] = useState(false);
  const storedThumbnail = useCodexCover(editingId, 'thumbnail');
  const coverPreview = useCoverUrl(coverDraft === undefined ? storedThumbnail : coverDraft?.thumbnail);
  // Deskripsi sebelum di-overwrite AI; menyimpannya memungkinkan "Urungkan"
  // tanpa risiko kehilangan tulisan pengguna. null = tidak ada yang bisa diurungkan.
  const [prevDescription, setPrevDescription] = useState<string | null>(null);
  // Paste-quick-add: tempel teks lore terstruktur → engine parser mengisi form.
  // Hanya untuk entri baru; deterministik & nol token (src/lib/codexImport).
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [draftFields, setDraftFields] = useState(() => loadFields(initialData));

  useEffect(() => {
    setFormData({
      name: '',
      category: 'character',
      description: '',
      aliases: [],
      tags: [],
      ...initialData
    });
    setAliasesText(undefined);
    setTagsText(undefined);
    setDraftFields(loadFields(initialData));
    setPrevDescription(null);
    setCoverDraft(undefined);
  }, [initialData]);

  // Definisi field untuk kategori aktif (hanya kategori kustom yang punya).
  const activeCategory = categories.find(c => c.slug === formData.category);
  const fieldDefs = activeCategory?.fields ?? [];
  const category = formData.category ?? 'character';
  const isField = (field: DraftField, def: CategoryFieldDef) =>
    field.category === category && field.key === def.key && field.label === def.label;
  const activeFields = fieldDefs.flatMap(def => draftFields.find(field => isField(field, def)) ?? []);
  const fieldValues = fieldValueMap({ customFields: activeFields });
  const retainedFields = draftFields.filter(field => field.value.trim() && !activeFields.includes(field));
  const setField = ({ key, label }: CategoryFieldDef, value: string) => setDraftFields(prev => [
    ...prev.filter(field => field.category !== category || field.key !== key || field.label !== label),
    { category, key, label, value },
  ]);

  // Kelengkapan worldbuilding (#11): saran status "lembut" dari isi form saat ini.
  // Ditampilkan saat penulis belum menetapkan status (mode "Otomatis").
  const suggested = suggestStatus({
    description: formData.description || '',
    secret: formData.secret,
    customFields: draftFields,
  });

  const handleSave = async () => {
    const details = formData.details?.map(detail => ({
      ...detail,
      label: detail.label.trim(),
      value: detail.value.trim(),
      revisions: detail.revisions?.map(revision => ({ ...revision, value: revision.value.trim() })),
    }));
    if (details?.some(detail => !detail.label || detail.revisions?.some(revision => !revision.value))) {
      toast.error('Isi nama setiap detail dan teks setiap catatan bab sebelum menyimpan.');
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        aliases: aliasesText === undefined ? formData.aliases : parseCommaSeparated(aliasesText),
        tags: tagsText === undefined ? formData.tags : parseCommaSeparated(tagsText),
        details,
        customFields: buildFieldValues(fieldDefs, fieldValues, retainedFields),
      }, coverDraft);
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        toast.error('Penyimpanan browser penuh. Entri dan sampul sebelumnya tetap tersimpan.');
      } else {
        toast.error(error instanceof Error ? error.message : 'Gagal menyimpan entri Codex.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCoverFile = async (file: File) => {
    setIsProcessingCover(true);
    try {
      setCoverDraft(await prepareCodexCover(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memproses gambar sampul.');
    } finally {
      setIsProcessingCover(false);
    }
  };

  const trimmedName = formData.name?.trim().toLowerCase() ?? '';
  const isDuplicateName = trimmedName.length > 0 && existingEntries.some(
    e => e.id !== editingId && e.name.trim().toLowerCase() === trimmedName
  );

  const handleExpand = async () => {
    if (!formData.name) return;
    setIsExpanding(true);
    try {
      const expandedDesc = await expandCodexEntry(
        formData.name,
        formData.category || 'character',
        formData.description || '',
        bibleRules || []
      );
      setPrevDescription(formData.description || '');
      setFormData(prev => ({ ...prev, description: expandedDesc }));
    } catch (e: any) {
      if (e.code === 'INVALID_KEY' || e.code === 'QUOTA_EXCEEDED') {
        toast.error(e.message, {
          action: {
            label: 'Buka Pengaturan',
            onClick: () => setViewMode('settings')
          }
        });
      } else {
        toast.error('Failed to expand: ' + e.message);
      }
    } finally {
      setIsExpanding(false);
    }
  };

  const handleUndoExpand = () => {
    if (prevDescription === null) return;
    setFormData(prev => ({ ...prev, description: prevDescription }));
    setPrevDescription(null);
  };

  const handleFillFromPaste = () => {
    const parsed = parseCodexMarkdown(pasteText, { defaultCategory: formData.category || 'character' });
    if (parsed.length === 0) {
      toast.error('Tak ada teks untuk mengisi form.');
      return;
    }
    const first = parsed[0];
    setFormData(prev => ({
      ...prev,
      name: first.name,
      category: first.category as CodexCategory,
      description: first.description,
      aliases: first.aliases.length ? first.aliases : prev.aliases,
      tags: first.tags.length ? first.tags : prev.tags,
    }));
    if (first.aliases.length) setAliasesText(undefined);
    if (first.tags.length) setTagsText(undefined);
    setPrevDescription(null);
    setShowPaste(false);
    setPasteText('');
    toast.info(
      parsed.length > 1
        ? `${parsed.length} blok terdeteksi — blok pertama dipakai (tinjau lalu simpan). Pakai "Buat semua" untuk semuanya.`
        : 'Form terisi dari teks — tinjau lalu simpan.'
    );
  };

  // Pratinjau jumlah entri "layak" (heading struktural/pemisah dibuang) untuk tombol
  // "Buat semua". Deterministik & nol token — sama engine dengan paste-quick-add.
  const bulkEntries = React.useMemo(
    () =>
      showPaste && pasteText.trim()
        ? parseCodexMarkdown(pasteText, {
            defaultCategory: formData.category || 'character',
            dropStructural: true,
          })
        : [],
    [showPaste, pasteText, formData.category]
  );

  const handleBulkCreateFromPaste = async () => {
    if (!onBulkCreate || bulkEntries.length === 0) return;
    const count = await onBulkCreate(
      bulkEntries.map(p => ({
        name: p.name,
        category: p.category as CodexCategory,
        description: p.description,
        aliases: p.aliases,
        tags: p.tags,
      }))
    );
    // Form ditutup oleh onBulkCreate; toast mengonfirmasi hasil.
    if (count > 0) toast.success(`${count} entri dibuat — tinjau di daftar Codex.`);
  };

  return (
    <motion.div 
      data-codex-form
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg col-span-full overflow-hidden"
    >
      <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          {editingId ? <Edit2 size={18} className="text-indigo-500" /> : <Plus size={18} className="text-indigo-500" />}
          {editingId ? 'Ubah Entri' : 'Entri Codex Baru'}
        </h3>
        <div className="flex items-center gap-1">
          {!editingId && (
            <button
              type="button"
              onClick={() => setShowPaste(v => !v)}
              className={cn(
                "flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full transition-all border",
                showPaste
                  ? "bg-indigo-600 text-white border-transparent"
                  : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
              )}
              title="Tempel teks lore untuk mengisi form otomatis (tanpa AI)"
            >
              <ClipboardPaste size={12} /> Tempel teks
            </button>
          )}
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="p-6">
        {!editingId && showPaste && (
          <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tempel teks lore (Markdown/polos) — isi form otomatis
              </label>
              <button type="button" onClick={() => setShowPaste(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={16} />
              </button>
            </div>
            <textarea
              autoFocus
              className="w-full min-h-[120px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100 resize-y font-mono"
              placeholder={"Tempel satu blok, mis.:\n#### Ironhaven — Kota Dermaga\nKota di sisi barat Kelmar..."}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Heading → Nama; sisanya → Deskripsi. Hasil bisa disunting sebelum disimpan.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {onBulkCreate && bulkEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={handleBulkCreateFromPaste}
                    title="Buat langsung semua entri terdeteksi (tanpa tinjau satu per satu)"
                    className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full transition-all border bg-emerald-600 text-white border-transparent hover:bg-emerald-700"
                  >
                    <Plus size={12} /> Buat semua {bulkEntries.length} entri
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFillFromPaste}
                  disabled={!pasteText.trim()}
                  className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full transition-all border bg-indigo-600 text-white border-transparent hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={12} /> Isi form dari teks
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nama Entri *</label>
              <input 
                autoFocus
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow dark:text-slate-100"
                placeholder="misal: Kota Angin"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
              {isDuplicateName && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                  <AlertTriangle size={12} className="shrink-0" />
                  Sudah ada entri dengan nama ini — nama ganda bisa membingungkan injeksi konteks AI.
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Kategori</label>
              <select 
                aria-label="Kategori"
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow dark:text-slate-100"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as CodexCategory})}
              >
                {categories.map(cat => (
                  <option key={cat.slug} value={cat.slug}>{cat.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="codex-aliases" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Alias</label>
              <input
                id="codex-aliases"
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow dark:text-slate-100"
                placeholder="Pisahkan dengan koma (misal: Budi, Pak Budi)"
                value={aliasesText ?? formData.aliases?.join(', ') ?? ''}
                onChange={e => setAliasesText(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="codex-tags" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Tag</label>
              <input
                id="codex-tags"
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow dark:text-slate-100"
                placeholder="Pisahkan dengan koma (misal: protagonis, bangsawan)"
                value={tagsText ?? formData.tags?.join(', ') ?? ''}
                onChange={e => setTagsText(e.target.value)}
              />
            </div>

            {formData.category === 'character' && cal && cal.months.length > 0 && (
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tanggal Lahir (Kalender Dunia)
                  </label>
                  {formData.birthDate && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, birthDate: undefined })}
                      className="text-[11px] text-rose-500 hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                {formData.birthDate ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        aria-label="Era Lahir"
                        value={formData.birthDate.era}
                        onChange={e => setFormData({
                          ...formData,
                          birthDate: { ...formData.birthDate!, era: Number(e.target.value) },
                        })}
                        className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                      >
                        {cal.eras.map((er, i) => (
                          <option key={i} value={i}>{er.name}{er.abbr ? ` (${er.abbr})` : ''}</option>
                        ))}
                      </select>
                      <input
                        aria-label="Tahun Lahir"
                        type="number"
                        value={formData.birthDate.year}
                        onChange={e => setFormData({
                          ...formData,
                          birthDate: { ...formData.birthDate!, year: Number(e.target.value) || 1 },
                        })}
                        className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                        placeholder="Tahun"
                      />
                      <select
                        aria-label="Bulan Lahir"
                        value={formData.birthDate.month}
                        onChange={e => {
                          const m = Number(e.target.value);
                          const curD = formData.birthDate?.day || 1;
                          const maxD = daysInMonth(cal, m) || 1;
                          setFormData({
                            ...formData,
                            birthDate: { ...formData.birthDate!, month: m, day: Math.min(curD, maxD) },
                          });
                        }}
                        className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                      >
                        {cal.months.map((m, i) => (
                          <option key={i} value={i + 1}>{m.name}</option>
                        ))}
                      </select>
                      <input
                        aria-label="Hari Lahir"
                        type="number"
                        min={1}
                        max={daysInMonth(cal, formData.birthDate.month) || 1}
                        value={formData.birthDate.day}
                        onChange={e => {
                          const maxD = daysInMonth(cal, formData.birthDate!.month) || 1;
                          const d = Math.max(1, Math.min(Number(e.target.value) || 1, maxD));
                          setFormData({
                            ...formData,
                            birthDate: { ...formData.birthDate!, day: d },
                          });
                        }}
                        className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                        placeholder="Hari"
                      />
                    </div>
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                      {formatDate(cal, formData.birthDate)}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      birthDate: { era: 0, year: 1, month: 1, day: 1 },
                    })}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 py-1"
                  >
                    <Plus size={12} /> Tetapkan tanggal lahir
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex flex-col h-full">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Deskripsi (Mendukung Markdown) *</label>
              <div className="flex items-center gap-2">
                {prevDescription !== null && !isExpanding && (
                  <button
                    type="button"
                    onClick={handleUndoExpand}
                    className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full transition-all border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                    title="Kembalikan deskripsi sebelum dikembangkan AI"
                  >
                    <Undo2 size={12} />
                    Urungkan
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExpand}
                  disabled={isExpanding || !formData.name}
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full transition-all border",
                    isExpanding
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent animate-pulse"
                      : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                  title={!formData.name ? "Masukkan nama terlebih dahulu" : "Buat lore detail menggunakan AI berdasarkan Nama dan Kategori"}
                >
                  <Wand2 size={12} className={isExpanding ? "animate-spin" : ""} />
                  {isExpanding ? "Mengembangkan..." : "Kembangkan dengan AI"}
                </button>
              </div>
            </div>
            <textarea 
              className="w-full flex-1 min-h-[160px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow dark:text-slate-100 resize-y font-serif leading-relaxed"
              placeholder="Deskripsikan sejarah atau sifat unik untuk memberi konteks pada AI..."
              value={formData.description}
              onChange={e => {
                setFormData({...formData, description: e.target.value});
                if (prevDescription !== null) setPrevDescription(null);
              }}
            />
          </div>
        </div>

        {/* Template field per kategori (#17) — muncul bila kategori punya skema field */}
        <section className="space-y-3" aria-label="Sampul Codex">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sampul</h4>
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            {coverPreview && <img src={coverPreview} alt="Pratinjau sampul" className="size-20 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1 basis-52 space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Pilih gambar sampul (opsional)
                <input
                  type="file"
                  accept={CODEX_COVER_TYPES.join(',')}
                  disabled={isSaving || isProcessingCover}
                  className="mt-1 block w-full min-w-0 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2 file:py-1.5 file:text-indigo-700 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                  onChange={event => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) void handleCoverFile(file);
                  }}
                />
              </label>
              {isProcessingCover && <p role="status" className="text-xs text-slate-500">Memperkecil gambar…</p>}
              {coverPreview && (
                <button type="button" disabled={isSaving || isProcessingCover} onClick={() => setCoverDraft(null)} className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">Hapus sampul</button>
              )}
            </div>
          </div>
        </section>

        <CodexDetailsEditor details={formData.details ?? []} chapters={detailChapters} onChange={details => setFormData(prev => ({ ...prev, details }))} />

        {fieldDefs.length > 0 && (
          <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-4">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
              <SlidersHorizontal size={13} className="text-indigo-500" /> Detail {activeCategory?.label}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fieldDefs.map(def => (
                <div key={def.key} className={def.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">{def.label}</label>
                  {def.type === 'textarea' ? (
                    <textarea
                      aria-label={def.label}
                      className="w-full min-h-[70px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100 resize-y"
                      value={fieldValues[def.key] ?? ''}
                      onChange={e => setField(def, e.target.value)}
                    />
                  ) : def.type === 'select' ? (
                    <select
                      aria-label={def.label}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                      value={fieldValues[def.key] ?? ''}
                      onChange={e => setField(def, e.target.value)}
                    >
                      <option value="">—</option>
                      {(def.options ?? []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={def.label}
                      type={def.type === 'number' ? 'number' : 'text'}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                      value={fieldValues[def.key] ?? ''}
                      onChange={e => setField(def, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {retainedFields.length > 0 && (
          <section className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h4 className="mb-2 text-xs font-semibold">Detail dari templat sebelumnya</h4>
            <ul className="space-y-2">
              {retainedFields.map((field, index) => (
                <li key={index} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0 whitespace-pre-wrap break-words">
                    <span className="font-semibold">{field.label}</span> · {field.value}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 hover:bg-red-50 dark:hover:bg-red-950"
                    aria-label={`Hapus nilai lama ${field.label}`}
                    onClick={() => setDraftFields(prev => prev.filter(item => item !== field))}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Kelengkapan worldbuilding (#11) — status kematangan + catatan/TODO */}
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Status kelengkapan</label>
            {!formData.worldStatus && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Disarankan: <span className="font-semibold">{STATUS_LABEL[suggested]}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, worldStatus: undefined })}
              className={cn(
                'text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all',
                !formData.worldStatus
                  ? 'bg-indigo-600 text-white border-transparent'
                  : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
              title="Biarkan alat menyarankan status dari kepadatan isi"
            >
              Otomatis
            </button>
            {WORLD_STATUSES.map(s => {
              const meta = WORLD_STATUS_META[s];
              const Icon = meta.icon;
              const active = formData.worldStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFormData({ ...formData, worldStatus: s })}
                  className={cn(
                    'flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all',
                    active
                      ? cn(meta.chip, 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900 ring-current')
                      : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                >
                  <Icon size={12} /> {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Catatan &amp; TODO <span className="font-normal text-slate-400">(opsional — satu baris per item)</span>
            </label>
            <textarea
              className="w-full min-h-[70px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100 resize-y"
              placeholder={"Mis.:\ntentukan sistem pemerintahan\nnama mata uang lokal"}
              value={formData.todo ?? ''}
              onChange={e => setFormData({ ...formData, todo: e.target.value })}
            />
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Muncul di panel <span className="font-semibold">Kelengkapan Dunia</span> sebagai daftar pekerjaan tersisa. Tak diberikan ke AI/ekspor.
            </p>
          </div>
        </div>

        {/* Lapis "Kebenaran Tersembunyi" — kanon vs rahasia penulis */}
        <div className="mt-6 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-purple-50/40 dark:bg-purple-900/10 p-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!formData.hidden}
              onChange={e => setFormData({ ...formData, hidden: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-purple-800 dark:text-purple-300">
                <EyeOff size={14} /> Rahasia penulis (sembunyikan entri dari pembaca)
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Entri disaring dari sorotan editor, saran, dan ekspor Codex — tetapi tetap
                diberikan ke AI agar Cek Konsistensi bisa menangkap kebocoran.
              </span>
            </span>
          </label>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Kebenaran tersembunyi <span className="font-normal text-slate-400">(opsional — hanya untuk AI &amp; penulis)</span>
            </label>
            <textarea
              className="w-full min-h-[80px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-shadow dark:text-slate-100 resize-y font-serif leading-relaxed"
              placeholder={"Pola “Dunia percaya… / Yang sebenarnya…”.\nMis.: Dunia percaya Sang Raja bijak; sebenarnya ia dalang kudeta."}
              value={formData.secret ?? ''}
              onChange={e => setFormData({ ...formData, secret: e.target.value })}
            />
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Tak pernah muncul di prosa/ekspor. Diumpankan ke AI sebagai kanon rahasia agar
              narasi tak keceplosan sebelum reveal.
            </p>
          </div>
        </div>

        {/* Panel Faksi & Kelompok (#15) — tandai entri ini sebagai wadah kelompok */}
        <div className="mt-6 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10 p-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.factionTag !== undefined}
              onChange={e => setFormData({
                ...formData,
                factionTag: e.target.checked ? (formData.factionTag || formData.name || '') : undefined,
              })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                <Users size={14} /> Jadikan Faksi / Kelompok
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Entri ini menjadi wadah kelompok. Anggotanya = entri Codex lain yang memuat
                tag keanggotaan di bawah. Muncul di panel <span className="font-semibold">Faksi &amp; Kelompok</span>.
              </span>
            </span>
          </label>

          {formData.factionTag !== undefined && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Tag keanggotaan
              </label>
              <input
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow dark:text-slate-100"
                placeholder="mis.: Kerajaan Merah"
                value={formData.factionTag ?? ''}
                onChange={e => setFormData({ ...formData, factionTag: e.target.value })}
              />
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Beri tag ini (persis sama) pada entri karakter/tempat yang menjadi anggota.
                Default = nama entri; boleh diubah agar tetap tertaut walau nama entri berubah.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isProcessingCover || !formData.name?.trim() || !formData.description?.trim()}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <Check size={16} /> {editingId ? 'Simpan Perubahan' : 'Buat Entri'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
