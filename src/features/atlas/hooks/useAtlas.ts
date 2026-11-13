import { deleteAtlasMap } from '@/src/services/entityDeletion';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CRUD + live-query Atlas Dunia (tabel `maps` & `mapMarkers`). Semua operasi
 * project-scoped; geometri disimpan relatif 0–1 (lihat `src/lib/mapGeometry.ts`).
 */

import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { useProject } from '@/src/contexts/ProjectContext';
import { AtlasMap, MapMarker } from '@/src/types';
import { ProcessedMapImage } from './useMapImageUpload';

export function useAtlas(selectedMapId?: number) {
  const { projectId } = useProject();

  const maps = useLiveQuery(
    () => (projectId ? db.maps.where('projectId').equals(projectId).toArray() : []),
    [projectId],
  );

  const markers = useLiveQuery(
    () =>
      selectedMapId != null
        ? db.mapMarkers.where('mapId').equals(selectedMapId).toArray()
        : [],
    [selectedMapId],
  );

  const createMap = useCallback(
    async (name: string, img: ProcessedMapImage): Promise<number | undefined> => {
      if (!projectId) return undefined;
      return (await db.maps.add({
        projectId,
        name: name.trim() || 'Peta tanpa nama',
        imageBlob: img.blob,
        width: img.width,
        height: img.height,
        createdAt: Date.now(),
      })) as number;
    },
    [projectId],
  );

  const renameMap = useCallback(async (id: number, name: string) => {
    await db.maps.update(id, { name: name.trim() || 'Peta tanpa nama' });
  }, []);

  // Ganti gambar peta (mis. memulihkan gambar yang hilang dari rolling auto-backup).
  const setMapImage = useCallback(async (id: number, img: ProcessedMapImage) => {
    await db.maps.update(id, { imageBlob: img.blob, width: img.width, height: img.height });
  }, []);

  const deleteMap = useCallback(async (id: number) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    await deleteAtlasMap(projectId, id);
  }, [projectId]);

  const addMarker = useCallback(
    async (marker: Omit<MapMarker, 'id' | 'projectId' | 'createdAt'>): Promise<number | undefined> => {
      if (!projectId) return undefined;
      return (await db.mapMarkers.add({
        ...marker,
        projectId,
        createdAt: Date.now(),
      })) as number;
    },
    [projectId],
  );

  const updateMarker = useCallback(async (id: number, patch: Partial<MapMarker>) => {
    await db.mapMarkers.update(id, patch);
  }, []);

  const deleteMarker = useCallback(async (id: number) => {
    await db.mapMarkers.delete(id);
  }, []);

  return {
    maps: (maps ?? []) as AtlasMap[],
    markers: (markers ?? []) as MapMarker[],
    mapsLoading: maps === undefined,
    createMap,
    renameMap,
    setMapImage,
    deleteMap,
    addMarker,
    updateMarker,
    deleteMarker,
  };
}
