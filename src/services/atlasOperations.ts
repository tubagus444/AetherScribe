import { db } from '@/src/db';
import { deleteAtlasMap } from './entityDeletion';
import type { MapMarker } from '@/src/types';
import type { ProcessedMapImage } from '@/src/features/atlas/hooks/useMapImageUpload';

export function createAtlasOperations(projectId?: number) {
  const createMap = async (name: string, img: ProcessedMapImage): Promise<number | undefined> => {
      if (!projectId) return undefined;
      return (await db.maps.add({
        projectId,
        name: name.trim() || 'Peta tanpa nama',
        imageBlob: img.blob,
        width: img.width,
        height: img.height,
        createdAt: Date.now(),
      })) as number;
    };

  const renameMap = async (id: number, name: string) => {
    await db.maps.update(id, { name: name.trim() || 'Peta tanpa nama' });
  };

  // Ganti gambar peta (mis. memulihkan gambar yang hilang dari rolling auto-backup).
  const setMapImage = async (id: number, img: ProcessedMapImage) => {
    await db.maps.update(id, { imageBlob: img.blob, width: img.width, height: img.height });
  };

  const deleteMap = async (id: number) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    await deleteAtlasMap(projectId, id);
  };

  const addMarker = async (marker: Omit<MapMarker, 'id' | 'projectId' | 'createdAt'>): Promise<number | undefined> => {
      if (!projectId) return undefined;
      return (await db.mapMarkers.add({
        ...marker,
        projectId,
        createdAt: Date.now(),
      })) as number;
    };

  const updateMarker = async (id: number, patch: Partial<MapMarker>) => {
    await db.mapMarkers.update(id, patch);
  };

  const deleteMarker = async (id: number) => {
    await db.mapMarkers.delete(id);
  };

  return { createMap, renameMap, setMapImage, deleteMap, addMarker, updateMarker, deleteMarker };
}
