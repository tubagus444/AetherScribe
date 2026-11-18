import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addRelationship, deleteRelationship, updateRelationship } from '@/src/services/loreOperations';
import { db } from '@/src/db';
import { RELATIONSHIP_TYPES } from '@/src/features/codex/relationshipTypes';

export function useRelationshipMapper(projectId: number) {
  const characters = useLiveQuery(() =>
    db.codex.where('projectId').equals(projectId).and(item => item.category === 'character').toArray()
  , [projectId]);

  // Semua entri Codex (bukan hanya karakter) — dipakai untuk resolusi nama &
  // daftar target, agar relasi ke lokasi/benda (mis. "Tinggal di"/"Memiliki")
  // tidak tampil sebagai "Unknown".
  const allEntries = useLiveQuery(() =>
    db.codex.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const relationships = useLiveQuery(() =>
    db.relationships.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [type, setType] = useState('Friend');
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyConnected, setOnlyConnected] = useState(false);

  // Peta jumlah koneksi per-karakter (sekali hitung), dipakai untuk badge & urutan.
  const connectionCount = useMemo(() => {
    const map = new Map<number, number>();
    relationships?.forEach(r => {
      map.set(r.sourceId, (map.get(r.sourceId) || 0) + 1);
      map.set(r.targetId, (map.get(r.targetId) || 0) + 1);
    });
    return map;
  }, [relationships]);

  // Auto-select first character if none is selected
  useEffect(() => {
    if (characters && characters.length > 0 && selectedCharacterId === null) {
      setSelectedCharacterId(characters[0].id!);
    }
  }, [characters, selectedCharacterId]);

  const selectedCharacter = useMemo(() => {
    return characters?.find(c => c.id === selectedCharacterId) || null;
  }, [characters, selectedCharacterId]);

  const filteredCharacters = useMemo(() => {
    if (!characters) return [];
    let list = characters;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    if (onlyConnected) {
      list = list.filter(c => (connectionCount.get(c.id!) || 0) > 0);
    }
    // Urutkan: paling banyak koneksi dulu, lalu abjad. Salin agar tak memutasi live-query.
    return [...list].sort((a, b) => {
      const diff = (connectionCount.get(b.id!) || 0) - (connectionCount.get(a.id!) || 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  }, [characters, searchQuery, onlyConnected, connectionCount]);

  const groupedRelationships = useMemo(() => {
    if (!relationships || !selectedCharacterId) return {};
    
    // Find all relationships where the selected char is either source or target
    const rels = relationships.filter(r => r.sourceId === selectedCharacterId || r.targetId === selectedCharacterId);

    // Grup dibangun dari sumber tunggal RELATIONSHIP_TYPES (8 tipe) agar tak ada
    // tipe yang tersesat ke "Other". Tipe tak dikenal jatuh ke "Other".
    const groups: Record<string, typeof relationships> = {};
    RELATIONSHIP_TYPES.forEach(t => { groups[t.value] = []; });

    rels.forEach(r => {
      if (groups[r.type]) {
        groups[r.type].push(r);
      } else {
        groups['Other'].push(r);
      }
    });

    return groups;
  }, [relationships, selectedCharacterId]);

  const hasAnyRelationships = Object.values(groupedRelationships).some(group => group.length > 0);

  const cancelAdding = () => {
    setIsAdding(false);
    setEditingId(null);
    setTargetId(null);
    setType('Friend');
    setDescription('');
  };

  const saveRelationship = async () => {
    if (!selectedCharacterId || !targetId || selectedCharacterId === targetId) return;
    
    if (editingId) {
      const existing = relationships?.find(r => r.id === editingId);
      if (existing) {
        const isSource = existing.sourceId === selectedCharacterId;
        await updateRelationship(editingId, {
          sourceId: isSource ? selectedCharacterId : targetId,
          targetId: isSource ? targetId : selectedCharacterId,
          type,
          description: description.trim() || undefined
        });
      }
    } else {
      await addRelationship({
        projectId,
        sourceId: selectedCharacterId,
        targetId,
        type,
        description: description.trim() || undefined
      });
    }
    
    cancelAdding();
  };

  const startEditing = (rel: typeof relationships[0]) => {
    if (!rel) return;
    setEditingId(rel.id!);
    const otherId = rel.sourceId === selectedCharacterId ? rel.targetId : rel.sourceId;
    setTargetId(otherId);
    setType(rel.type);
    setDescription(rel.description || '');
    setIsAdding(true);
  };

  const getCharacterName = (id: number) => allEntries?.find(c => c.id === id)?.name || characters?.find(c => c.id === id)?.name || '(entri dihapus)';

  return {
    characters,
    allEntries,
    relationships,
    selectedCharacterId,
    setSelectedCharacterId,
    isAdding,
    setIsAdding,
    editingId,
    targetId,
    setTargetId,
    type,
    setType,
    description,
    setDescription,
    searchQuery,
    setSearchQuery,
    onlyConnected,
    setOnlyConnected,
    connectionCount,
    selectedCharacter,
    filteredCharacters,
    groupedRelationships,
    hasAnyRelationships,
    saveRelationship,
    startEditing,
    cancelAdding,
    deleteRelationship,
    getCharacterName
  };
}
