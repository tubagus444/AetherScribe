import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addRelationship, deleteRelationship } from '@/src/services/loreOperations';
import { setCodexTag, updateCodexEntry } from '@/src/services/codexOperations';
import { db } from '@/src/db';
import type { CodexEntry } from '@/src/types';
import { useCodexCategories } from '@/src/features/codex/hooks/useCodexCategories';
import {
  buildFactions, aggregateFactionRelations, factionPairSentiment, pairKey, buildFactionBoard,
  type Faction, type FactionPairStat, type FactionSentiment, type FactionBoardView,
} from '@/src/lib/factions';

export interface FactionRelationRow {
  faction: Faction;
  stat: FactionPairStat | undefined;
  sentiment: FactionSentiment;
}

export function useFactions(projectId: number) {
  const allEntries = useLiveQuery(
    () => db.codex.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const relationships = useLiveQuery(
    () => db.relationships.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const { categories } = useCodexCategories(projectId);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const factions = useMemo(() => buildFactions(allEntries ?? []), [allEntries]);
  const relData = useMemo(
    () => aggregateFactionRelations(factions, relationships ?? []),
    [factions, relationships],
  );
  // Tampilan kanvas Papan Faksi (node/edge murni; posisi seed dari `factionBoard`).
  const boardView = useMemo<FactionBoardView>(
    () => buildFactionBoard(factions, relData),
    [factions, relData],
  );

  // Auto-pilih faksi pertama.
  useEffect(() => {
    if (factions.length > 0 && (selectedId === null || !factions.some(f => f.id === selectedId))) {
      setSelectedId(factions[0].id);
    } else if (factions.length === 0 && selectedId !== null) {
      setSelectedId(null);
    }
  }, [factions, selectedId]);

  const selected = useMemo(() => factions.find(f => f.id === selectedId) ?? null, [factions, selectedId]);

  const entryById = useMemo(() => {
    const m = new Map<number, CodexEntry>();
    (allEntries ?? []).forEach(e => e.id != null && m.set(e.id, e));
    return m;
  }, [allEntries]);

  const members = useMemo(
    () => (selected?.memberIds ?? []).map(id => entryById.get(id)).filter(Boolean) as CodexEntry[],
    [selected, entryById],
  );

  // Baris hubungan dengan faksi LAIN (dua sinyal), terurut nama.
  const relationRows = useMemo<FactionRelationRow[]>(() => {
    if (!selected) return [];
    return factions
      .filter(f => f.id !== selected.id)
      .map(f => {
        const stat = relData.pairMap.get(pairKey(selected.id, f.id));
        return { faction: f, stat, sentiment: factionPairSentiment(stat) };
      })
      .sort((a, b) => a.faction.name.localeCompare(b.faction.name, 'id'));
  }, [selected, factions, relData]);

  const internal = useMemo(
    () => (selected ? relData.internal.get(selected.id) ?? {} : {}),
    [selected, relData],
  );

  // Kandidat calon anggota (entri non-anggota) untuk penambahan cepat.
  const nonMembers = useMemo(() => {
    if (!selected) return [];
    const memberSet = new Set(selected.memberIds);
    return (allEntries ?? [])
      .filter(e => e.id != null && e.id !== selected.id && !memberSet.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [selected, allEntries]);

  const nameOf = (id: number) => entryById.get(id)?.name ?? '(entri dihapus)';

  const addMember = async (entryId: number) => {
    if (selected) await setCodexTag(entryId, selected.tag, true);
  };
  const removeMember = async (entryId: number) => {
    if (selected) await setCodexTag(entryId, selected.tag, false);
  };

  // Relasi DIDEKLARASIKAN antar dua entri faksi mana pun = tabel relationships biasa.
  const addRelationBetween = async (sourceFactionId: number, targetFactionId: number, type: string, description?: string) => {
    if (sourceFactionId === targetFactionId) return;
    await addRelationship({
      projectId,
      sourceId: sourceFactionId,
      targetId: targetFactionId,
      type,
      description: description?.trim() || undefined,
    });
  };
  // Varian dari sudut pandang faksi terpilih (dipakai daftar/detail v1).
  const addDeclaredRelation = async (otherFactionId: number, type: string, description?: string) => {
    if (!selected) return;
    await addRelationBetween(selected.id, otherFactionId, type, description);
  };
  const deleteRelation = async (id: number) => {
    await deleteRelationship(id);
  };

  // Papan Faksi: simpan posisi kartu (drag selesai) di entri faksi. Inert → tak sentuh KB.
  const setFactionBoard = async (factionId: number, pos: { x: number; y: number }) => {
    await updateCodexEntry(factionId, { factionBoard: { x: Math.round(pos.x), y: Math.round(pos.y) } });
  };

  return {
    loading: allEntries === undefined || relationships === undefined,
    categories,
    factions,
    selected,
    selectedId,
    setSelectedId,
    members,
    relationRows,
    internal,
    nonMembers,
    nameOf,
    addMember,
    removeMember,
    addDeclaredRelation,
    deleteRelation,
    // Papan Faksi (kanvas)
    boardView,
    relData,
    entryById,
    setFactionBoard,
    addRelationBetween,
  };
}
