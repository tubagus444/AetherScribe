import { db } from '@/src/db';
import { deleteAtlasMap } from './entityDeletion';
import type { AtlasMap, MapMarker } from '@/src/types';
import type { ProcessedMapImage } from '@/src/features/atlas/hooks/useMapImageUpload';
import { validateMarkerGeometry, validateWriteFields } from '@/src/lib/backupValidation';
import { finite } from '@/src/lib/dataContracts';
import { requireProjectReference, requireRow } from './writeIntegrity';

export async function calibrateMapScale(id: number, scale: NonNullable<AtlasMap['scale']>) {
  validateWriteFields('maps', { scale }, 'patch');
  if (!scale || !finite(scale.ratioToRelative) || scale.ratioToRelative <= 0) throw new Error('Skala peta tidak valid.');
  return db.transaction('rw', db.maps, async () => {
    await requireRow(db.maps, id);
    return db.maps.update(id, { scale });
  });
}

type MarkerInput = Omit<MapMarker, 'id' | 'projectId' | 'createdAt'>;
type MarkerPatch = Partial<MarkerInput>;

async function validateMarkerRefs(patch: MarkerPatch, projectId: number) {
  await requireProjectReference(db.maps, patch.mapId, projectId);
  await requireProjectReference(db.maps, patch.linkedMapId, projectId);
  await requireProjectReference(db.codex, patch.codexId, projectId);
}

export function createAtlasOperations(projectId?: number) {
  const requireMarker = async (id: number) => {
    const marker = await requireRow(db.mapMarkers, id);
    if (marker.projectId === undefined && projectId !== undefined) {
      await requireProjectReference(db.maps, marker.mapId, projectId);
    } else if (marker.projectId !== projectId) {
      throw new Error('Penanda berasal dari proyek lain.');
    }
    return marker;
  };

  const updateMap = async (id: number, patch: Partial<Pick<AtlasMap, 'name' | 'imageBlob' | 'width' | 'height'>>) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    const { imageBlob, ...fields } = patch;
    validateWriteFields('maps', fields, 'patch');
    if ('imageBlob' in patch && !(imageBlob instanceof Blob)) throw new Error('Gambar peta tidak valid.');
    await db.transaction('rw', db.maps, async () => {
      await requireProjectReference(db.maps, id, projectId);
      await db.maps.update(id, patch);
    });
  };

  const createMap = async (name: string, img: ProcessedMapImage): Promise<number | undefined> => {
    if (!projectId) return undefined;
    const fields = { projectId, name: name.trim() || 'Peta tanpa nama', width: img.width, height: img.height, createdAt: Date.now() };
    validateWriteFields('maps', fields, 'create');
    if (!(img.blob instanceof Blob)) throw new Error('Gambar peta tidak valid.');
    return db.transaction('rw', db.projects, db.maps, async () => {
      await requireRow(db.projects, projectId);
      return db.maps.add({ ...fields, imageBlob: img.blob });
    });
  };

  const renameMap = async (id: number, name: string) => {
    await updateMap(id, { name: name.trim() || 'Peta tanpa nama' });
  };

  // Ganti gambar peta (mis. memulihkan gambar yang hilang dari rolling auto-backup).
  const setMapImage = async (id: number, img: ProcessedMapImage) => {
    await updateMap(id, { imageBlob: img.blob, width: img.width, height: img.height });
  };

  const deleteMap = async (id: number) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    await deleteAtlasMap(projectId, id);
  };

  const addMarker = async (marker: MarkerInput): Promise<number | undefined> => {
    if (!projectId) return undefined;
    const { geometry, ...input } = marker;
    const fields = { ...input, projectId, createdAt: Date.now() };
    validateWriteFields('mapMarkers', fields, 'create');
    validateMarkerGeometry({ kind: input.kind, geometry });
    return db.transaction('rw', [db.projects, db.mapMarkers, db.maps, db.codex], async () => {
      await requireRow(db.projects, projectId);
      await validateMarkerRefs(marker, projectId);
      return db.mapMarkers.add({ ...fields, geometry });
    });
  };

  const updateMarker = async (id: number, patch: MarkerPatch) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    const { geometry, ...fields } = patch;
    validateWriteFields('mapMarkers', fields, 'patch', ['mapId', 'kind', 'codexId', 'title', 'note', 'color', 'linkedMapId', 'meta']);
    await db.transaction('rw', [db.mapMarkers, db.maps, db.codex], async () => {
      const current = await requireMarker(id);
      if ('geometry' in patch || 'kind' in patch) {
        validateMarkerGeometry({
          kind: fields.kind ?? current.kind,
          geometry: 'geometry' in patch ? geometry : current.geometry,
        });
      }
      await validateMarkerRefs(fields, projectId);
      await db.mapMarkers.update(id, patch);
    });
  };

  const deleteMarker = async (id: number) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    await db.transaction('rw', db.mapMarkers, db.maps, async () => {
      await requireMarker(id);
      await db.mapMarkers.delete(id);
    });
  };

  return { createMap, renameMap, setMapImage, deleteMap, addMarker, updateMarker, deleteMarker };
}
