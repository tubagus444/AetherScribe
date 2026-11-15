import { useMemo, useState } from 'react';
import type { CodexEntry, MapMarker } from '@/src/types';

export function useAtlasFilters(markers: MapMarker[], codexEntries: CodexEntry[]) {
  // Filter: set jenis/kategori/faksi yang DIMATIKAN (data tetap penuh).
  const [offKinds, setOffKinds] = useState<Set<string>>(new Set());
  const [offCategories, setOffCategories] = useState<Set<string>>(new Set());
  const [offFactions, setOffFactions] = useState<Set<string>>(new Set());

  const entryById = useMemo(() => {
    const m = new Map<number, CodexEntry>();
    for (const e of codexEntries) if (e.id != null) m.set(e.id, e);
    return m;
  }, [codexEntries]);

  // Kategori & faksi yang HADIR di antara penanda peta ini (untuk daftar filter).
  const { presentCategories, presentFactions } = useMemo(() => {
    const cats = new Set<string>();
    const facs = new Set<string>();
    for (const mk of markers) {
      const e = mk.codexId != null ? entryById.get(mk.codexId) : undefined;
      if (!e) continue;
      cats.add(e.category);
      if (e.factionTag && e.factionTag.trim()) facs.add(e.factionTag.trim());
    }
    return { presentCategories: [...cats], presentFactions: [...facs] };
  }, [markers, entryById]);

  const visibleMarkers = useMemo(() => {
    return markers.filter((mk) => {
      if (offKinds.has(mk.kind)) return false;
      const e = mk.codexId != null ? entryById.get(mk.codexId) : undefined;
      if (e) {
        if (offCategories.has(e.category)) return false;
        if (e.factionTag && offFactions.has(e.factionTag.trim())) return false;
      }
      return true;
    });
  }, [markers, offKinds, offCategories, offFactions, entryById]);

  return { offKinds, setOffKinds, offCategories, setOffCategories, offFactions, setOffFactions, entryById, presentCategories, presentFactions, visibleMarkers };
}
