import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, MessageSquareText, Database, Tags, FlaskConical, Download, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ScribbleAssistantPanel } from '@/src/features/assistant/components/ScribbleAssistantPanel';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { Virtuoso } from 'react-virtuoso';

import { CodexForm } from '@/src/features/codex/components/CodexForm';
import { CodexCard } from '@/src/features/codex/components/CodexCard';
import { CodexDetailModal } from '@/src/features/codex/components/CodexDetailModal';
import { CategoryManagerModal } from '@/src/features/codex/components/CategoryManagerModal';
import { LoreIntegrityBanner } from '@/src/features/codex/components/LoreIntegrityBanner';
import { DanglingRef } from '@/src/lib/loreGraph';
import { useCodexPanel } from '@/src/features/codex/hooks/useCodexPanel';
import { getCategoryLabel } from '@/src/lib/codexCategories';
import { codexToMarkdown } from '@/src/lib/codexExport';
import { db } from '@/src/db';
import { useToast } from '@/src/hooks/useToast';
import { useChapterList } from '@/src/hooks/useChapterQueries';
import { indexDetailChapters } from '@/src/lib/codexDetails';

interface CodexPanelProps {
  projectId: number;
}

function CodexListHeader({ context }: { context?: React.ReactNode }) {
  return context;
}

const codexListComponents = { Header: CodexListHeader };

interface CodexFilterSelectProps {
  label: string;
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function CodexFilterSelect({ label, allLabel, value, options, onChange }: CodexFilterSelectProps) {
  const selectedLabel = value === 'all'
    ? allLabel
    : options.find(option => option.value === value)?.label ?? allLabel;

  return (
    <div className="relative flex min-w-0 max-w-full grow basis-40 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-indigo-500 sm:max-w-64 md:basis-auto xl:grow-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      {/* Render the selected text separately so it can wrap while the native picker handles input. */}
      <span aria-hidden="true" className="min-w-0 [overflow-wrap:anywhere]">{selectedLabel}</span>
      <ChevronDown aria-hidden="true" size={16} className="shrink-0" />
      <select
        aria-label={label}
        title={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="absolute inset-0 size-full cursor-pointer bg-white text-slate-900 opacity-0 dark:bg-slate-900 dark:text-slate-200"
      >
        <option value="all">{allLabel}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

export function CodexPanel({ projectId }: CodexPanelProps) {
  const { openWorkshop, pendingCodexEntryId, clearPendingCodexEntry } = useNavigation();
  const { toast } = useToast();
  const chapters = useChapterList(projectId);
  const detailChapters = useMemo(() => indexDetailChapters(chapters ?? []), [chapters]);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const {
    entries,
    filteredEntries,
    bibleRules,
    relationships,
    plotPromises,
    allTags,
    stats,
    categories,
    customCategories,

    isAdding,
    editingId,
    selectedEntry,
    setSelectedEntry,
    searchQuery,
    setSearchQuery,
    filterCategory,
    setFilterCategory,
    filterTag,
    setFilterTag,
    sortBy,
    setSortBy,
    isAssistantOpen,
    setIsAssistantOpen,

    initialData,
    confirmDeleteId,
    setConfirmDeleteId,

    startAdding,
    startEditing,
    handleSaveEntry,
    handleBulkCreateEntries,
    deleteEntry,
    confirmDelete,
    cancelEdit,
    addBond,
    deleteRelationship,
    resolveDangling
  } = useCodexPanel(projectId);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(([{ contentRect }]) => {
      // Allow roughly 320px per card and a 16px gap between cards.
      setColumns(contentRect.width >= 992 ? 3 : contentRect.width >= 656 ? 2 : 1);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => {
    const result = [];
    if (!isAdding) {
      for (let index = 0; index < filteredEntries.length; index += columns) {
        result.push(filteredEntries.slice(index, index + columns));
      }
    }
    return result;
  }, [filteredEntries, columns, isAdding]);

  const handleResolveDangling = async (ref: DanglingRef) => {
    await resolveDangling(ref);
    toast.success(ref.kind === 'relationship' ? 'Relasi menggantung dihapus.' : 'Tautan janji dilepas.');
  };

  const handleExport = async () => {
    if (!entries?.length) return;
    const project = await db.projects.get(projectId);
    const name = project?.name || 'Codex';
    const md = codexToMarkdown(entries, { projectName: name, categories });
    const safe = name.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'Codex';
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Codex-${safe}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${entries.length} entri diekspor ke Markdown.`);
  };

  // Deep-link (#11): buka modal detail entri saat dipanggil dari panel lain (mis.
  // Kelengkapan Dunia). Tunggu entries termuat, lalu konsumsi & bersihkan pending-nya.
  useEffect(() => {
    if (pendingCodexEntryId == null || !entries) return;
    const target = entries.find(e => e.id === pendingCodexEntryId);
    if (target) setSelectedEntry(target);
    clearPendingCodexEntry();
  }, [pendingCodexEntryId, entries, setSelectedEntry, clearPendingCodexEntry]);

  useEffect(() => {
    if (confirmDeleteId === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDeleteId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDeleteId, setConfirmDeleteId]);

  const listHeader = (
    <div ref={contentRef} className="px-4 pt-4 sm:px-6 sm:pt-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
          <div>
            <h2 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100 italic">Kamus Data (Codex)</h2>
            {stats.total > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium break-words">
                <span className="font-bold text-slate-600 dark:text-slate-300">{stats.total} entri</span>
                {Object.entries(stats.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, n]) => ` · ${n} ${getCategoryLabel(cat, categories)}`)
                  .join('')}
              </p>
            )}
          </div>
          {!isAdding && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => openWorkshop({ mode: 'create' })}
                className="flex items-center gap-2 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all active:scale-95"
                title="Rancang entri Codex baru lewat diskusi dengan AI"
              >
                <FlaskConical size={16} /> Lokakarya
              </button>
              <button
                onClick={() => setIsManagingCategories(true)}
                className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
                title="Kelola kategori Codex"
              >
                <Tags size={16} /> Kategori
              </button>
              {(entries?.length ?? 0) > 0 && (
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
                  title="Ekspor semua entri Codex ke berkas Markdown"
                >
                  <Download size={16} /> Ekspor
                </button>
              )}
              <button
                onClick={() => setIsAssistantOpen(value => !value)}
                aria-expanded={isAssistantOpen}
                className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <MessageSquareText size={16} /> Asisten AI
              </button>
              <button
                onClick={startAdding}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-indigo-700 transition-all shadow-md hover:shadow-indigo-500/20 active:scale-95"
              >
                <Plus size={16} /> Entri Baru
              </button>
            </div>
          )}
        </div>

        {!isAdding && (entries?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative min-w-0 grow basis-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                aria-label="Cari entri Codex"
                placeholder="Cari nama, alias, tag, atau deskripsi…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow dark:text-slate-200 placeholder:text-slate-400"
              />
            </div>
            <CodexFilterSelect
              label="Filter berdasarkan kategori"
              allLabel="Semua Kategori"
              value={filterCategory}
              options={categories.map(cat => ({ value: cat.slug, label: cat.label }))}
              onChange={setFilterCategory}
            />
            {allTags.length > 0 && (
              <CodexFilterSelect
                label="Filter berdasarkan tag"
                allLabel="Semua Tag"
                value={filterTag}
                options={allTags.map(tag => ({ value: tag, label: `#${tag}` }))}
                onChange={setFilterTag}
              />
            )}
            <select
               value={sortBy}
               onChange={(e) => {
                 const value = e.target.value;
                 if (value === 'name-asc' || value === 'name-desc' || value === 'category' || value === 'recent' || value === 'oldest') {
                   setSortBy(value);
                 }
               }}
               title="Urutkan entri"
               className="min-w-0 grow basis-32 xl:grow-0 py-2 px-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200"
            >
              <option value="name-asc">Nama (A–Z)</option>
              <option value="name-desc">Nama (Z–A)</option>
              <option value="category">Kategori</option>
              <option value="recent">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </div>
        )}

        {!isAdding && (entries?.length ?? 0) > 0 && (
          <LoreIntegrityBanner
            entries={entries || []}
            relationships={relationships || []}
            promises={plotPromises || []}
            onResolve={handleResolveDangling}
          />
        )}
      </header>

      <div>
        <AnimatePresence>
          {isAdding && (
            <div className="pb-4">
              <CodexForm
                initialData={initialData}
                editingId={editingId}
                bibleRules={bibleRules || []}
                existingEntries={entries || []}
                categories={categories}
                detailChapters={detailChapters}
                onSave={handleSaveEntry}
                onBulkCreate={handleBulkCreateEntries}
                onCancel={cancelEdit}
              />
            </div>
          )}
        </AnimatePresence>

        {entries?.length === 0 && !isAdding && (
          <div className="py-24 px-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
              <Database className="text-indigo-500 dark:text-indigo-400" size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Dunia Anda Masih Kosong</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-8">
              Mulailah membangun database lore Anda untuk memberi AI konteks tentang karakter, lokasi, dan sistem sihir Anda.
            </p>
            <button 
              onClick={startAdding}
              className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 hover:-translate-y-0.5 transition-all active:scale-95"
            >
              <Plus size={18} /> Buat Entri Pertama
            </button>
          </div>
        )}
        
        {entries && entries.length > 0 && filteredEntries.length === 0 && !isAdding && (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <Search size={32} className="mx-auto mb-4 opacity-50" />
            <p>Tidak ada entri yang cocok dengan kriteria pencarian Anda.</p>
            <button 
              onClick={() => { setSearchQuery(''); setFilterCategory('all'); setFilterTag('all'); }}
              className="mt-4 text-indigo-600 hover:text-indigo-700 text-sm font-semibold"
            >
              Cari Ulang
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto h-full max-w-7xl">
      <Virtuoso
        aria-label="Daftar entri Codex"
        className="h-full custom-scrollbar"
        data={rows}
        components={codexListComponents}
        context={listHeader}
        defaultItemHeight={220}
        increaseViewportBy={200}
        itemContent={(_index, row) => (
          <div
            className="grid gap-4 px-4 pb-4 sm:px-6"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {row.map(entry => (
              <CodexCard
                key={entry.id}
                entry={entry}
                relationships={relationships || []}
                projectId={projectId}
                categories={categories}
                detailChapters={detailChapters}
                onEdit={startEditing}
                onDelete={deleteEntry}
                onSelect={setSelectedEntry}
              />
            ))}
          </div>
        )}
      />

      {/* Panel Asisten AI */}
      <AnimatePresence>
        {isAssistantOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100%-2rem)] h-[600px] max-h-[85vh] rounded-2xl overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-slate-200 dark:border-slate-800"
          >
            <ScribbleAssistantPanel 
              projectId={projectId} 
              currentText="" 
              onClose={() => setIsAssistantOpen(false)}
              viewMode="codex"
              codexEntries={entries}
              bibleRules={bibleRules}
              relationships={relationships}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteId !== null && (
           <div 
             className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
             onClick={() => setConfirmDeleteId(null)}
           >
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
               onClick={(e) => e.stopPropagation()}
             >
               <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Hapus Entri?</h3>
               <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">Apakah Anda yakin ingin menghapus entri ini? Tindakan ini tidak dapat dibatalkan.</p>
               <div className="flex gap-3 justify-end">
                 <button 
                   onClick={() => setConfirmDeleteId(null)}
                   className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm"
                 >
                   Batal
                 </button>
                 <button 
                   onClick={confirmDelete}
                   className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm text-sm"
                 >
                   Hapus
                 </button>
               </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEntry && (
          <CodexDetailModal
            entry={selectedEntry}
            entries={entries || []}
            relationships={relationships || []}
            promises={plotPromises || []}
            projectId={projectId}
            categories={categories}
            detailChapters={detailChapters}
            onClose={() => setSelectedEntry(null)}
            onOpenEntry={setSelectedEntry}
            onEdit={(entry) => {
              setSelectedEntry(null);
              startEditing(entry);
            }}
            onDelete={(id) => {
              setSelectedEntry(null);
              deleteEntry(id);
            }}
            onAddBond={addBond}
            onDeleteRelationship={deleteRelationship}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isManagingCategories && (
          <CategoryManagerModal
            projectId={projectId}
            custom={customCategories}
            onClose={() => setIsManagingCategories(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
