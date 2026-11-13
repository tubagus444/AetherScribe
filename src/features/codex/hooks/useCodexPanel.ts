import { deleteCodexEntry } from '@/src/services/entityDeletion';
import { useState, useMemo, useEffect } from 'react';
import { db } from '@/src/db';
import { useOptimizedLiveQuery } from '@/src/hooks/useOptimizedLiveQuery';
import { CodexEntry, CodexCategory } from '@/src/types';
import { DanglingRef } from '@/src/lib/loreGraph';
import { invalidateContextCache } from '@/src/services/contextEngine';
import { useCodexCategories } from '@/src/features/codex/hooks/useCodexCategories';

export type CodexSort = 'name-asc' | 'name-desc' | 'category' | 'recent' | 'oldest';

export function useCodexPanel(projectId: number) {
  const entries = useOptimizedLiveQuery(() => 
    db.codex.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const bibleRules = useOptimizedLiveQuery(() => 
    db.bible.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const relationships = useOptimizedLiveQuery(() =>
    db.relationships.where('projectId').equals(projectId).toArray()
  , [projectId]);

  // Janji plot dipakai untuk backlink payoff (#9) di detail entri.
  const plotPromises = useOptimizedLiveQuery(() =>
    db.plotPromises.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const { custom: customCategories, categories } = useCodexCategories(projectId);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Nilai pencarian yang ditunda agar pemfilteran (di atas seluruh codex) tidak
  // berjalan tiap ketukan tombol pada codex besar.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<CodexCategory | 'all'>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<CodexSort>('name-asc');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const [initialData, setInitialData] = useState<Partial<CodexEntry>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Daftar tag unik (terurut) untuk dropdown filter.
  const allTags = useMemo(() => {
    if (!entries) return [];
    const set = new Set<string>();
    entries.forEach(e => e.tags?.forEach(t => { if (t) set.add(t); }));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [entries]);

  // Jumlah entri per kategori + total, untuk ringkasan di header.
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    entries?.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
    return { total: entries?.length ?? 0, byCategory: counts };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    const q = debouncedQuery.toLowerCase();
    const result = entries.filter(entry => {
      const matchesSearch =
        entry.name.toLowerCase().includes(q) ||
        entry.description?.toLowerCase().includes(q) ||
        entry.aliases?.some(a => a.toLowerCase().includes(q)) ||
        entry.tags?.some(t => t.toLowerCase().includes(q));

      const matchesCategory = filterCategory === 'all' || entry.category === filterCategory;
      const matchesTag = filterTag === 'all' || (entry.tags?.includes(filterTag) ?? false);

      return matchesSearch && matchesCategory && matchesTag;
    });

    const sorted = [...result];
    switch (sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'id'));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name, 'id'));
        break;
      case 'category':
        sorted.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'id'));
        break;
      case 'recent':
        // id auto-increment → id lebih besar = lebih baru.
        sorted.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
        break;
      case 'oldest':
        sorted.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        break;
    }
    return sorted;
  }, [entries, debouncedQuery, filterCategory, filterTag, sortBy]);

  const startAdding = () => {
    setInitialData({ name: '', category: 'character', description: '', aliases: [], tags: [] });
    setEditingId(null);
    setIsAdding(true);
    setTimeout(() => {
      document.querySelector('[data-codex-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const startEditing = (entry: CodexEntry) => {
    setInitialData({
      name: entry.name,
      category: entry.category,
      description: entry.description,
      aliases: entry.aliases || [],
      tags: entry.tags || [],
      hidden: entry.hidden,
      secret: entry.secret,
      worldStatus: entry.worldStatus,
      todo: entry.todo,
      factionTag: entry.factionTag,
      customFields: entry.customFields || []
    });
    setEditingId(entry.id!);
    setIsAdding(true);
    setTimeout(() => {
      document.querySelector('[data-codex-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSaveEntry = async (data: Partial<CodexEntry>) => {
    if (!data.name) return;
    
    // Lapis "Kebenaran Tersembunyi" (#1): flag rahasia penulis dari form harus ikut
    // tersimpan — tanpa ini toggle "Rahasia penulis" & textarea "Kebenaran tersembunyi"
    // di CodexForm senyap tak berefek.
    if (editingId) {
      await db.codex.update(editingId, {
        name: data.name,
        category: data.category || 'character',
        description: data.description || '',
        aliases: data.aliases || [],
        tags: data.tags || [],
        hidden: !!data.hidden,
        secret: data.secret?.trim() || '',
        // Kelengkapan worldbuilding (#11). worldStatus dibiarkan undefined bila belum
        // ditetapkan penulis (agar saran otomatis tetap berlaku), bukan dipaksa nilai.
        worldStatus: data.worldStatus,
        todo: data.todo?.trim() || '',
        // Panel Faksi (#15): tag keanggotaan; undefined = bukan faksi.
        factionTag: data.factionTag?.trim() || undefined,
        // Template field per kategori (#17). Denormalisasi label sudah dilakukan CodexForm.
        customFields: data.customFields || []
      });
    } else {
      await db.codex.add({
        projectId,
        name: data.name,
        category: data.category || 'character',
        description: data.description || '',
        aliases: data.aliases || [],
        tags: data.tags || [],
        hidden: !!data.hidden,
        secret: data.secret?.trim() || '',
        worldStatus: data.worldStatus,
        todo: data.todo?.trim() || '',
        factionTag: data.factionTag?.trim() || undefined,
        customFields: data.customFields || []
      } as CodexEntry);
    }
    
    await invalidateContextCache();
    setIsAdding(false);
    setEditingId(null);
    setInitialData({});
  };

  // Buat banyak entri sekaligus dari paste-quick-add multi-blok (importer #7).
  // Add-only & non-destruktif — konsisten dengan filosofi jembatan teks ⇄ Codex.
  const handleBulkCreateEntries = async (list: Partial<CodexEntry>[]) => {
    const rows = list
      .filter((d) => d.name?.trim())
      .map((d) => ({
        projectId,
        name: d.name!.trim(),
        category: d.category || 'character',
        description: d.description || '',
        aliases: d.aliases || [],
        tags: d.tags || [],
      })) as CodexEntry[];
    if (!rows.length) return 0;
    await db.codex.bulkAdd(rows);
    await invalidateContextCache();
    setIsAdding(false);
    setEditingId(null);
    setInitialData({});
    return rows.length;
  };

  const deleteEntry = async (id: number) => {
    setConfirmDeleteId(id);
  };
  
  const confirmDelete = async () => {
    if (confirmDeleteId !== null) {
      const id = confirmDeleteId;
      // Hapus entri beserta data turunannya secara atomik agar tidak menyisakan
      // relasi/embedding yatim yang menunjuk entri yang sudah tiada.
      await deleteCodexEntry(id);
      // Lore berubah → cache konteks AI (termasuk indeks semantik) harus disegarkan.
      await invalidateContextCache(true);
      setConfirmDeleteId(null);
    }
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const addBond = async (sourceId: number, targetId: number, type: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    await db.relationships.add({ projectId, sourceId, targetId, type });
  };

  const deleteRelationship = async (id: number) => {
    await db.relationships.delete(id);
  };

  // Bersihkan satu tautan menggantung (#9): relasi yatim dihapus, FK janji dilepas.
  const resolveDangling = async (ref: DanglingRef) => {
    if (ref.kind === 'relationship' && ref.relationshipId != null) {
      await db.relationships.delete(ref.relationshipId);
    } else if (ref.promiseId != null) {
      const field = ref.kind === 'promise-codex' ? 'codexId' : 'payoffCodexId';
      await db.plotPromises.update(ref.promiseId, { [field]: undefined });
    }
  };

  return {
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
  };
}
