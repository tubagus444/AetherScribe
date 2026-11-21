import { db } from '@/src/db';
import { deleteAtlasMap } from './entityDeletion';
import type { AtlasMap, ImportantAreaLocation, MapMarker, MapPoint, RoutePoint } from '@/src/types';
import type { ProcessedMapImage } from '@/src/features/atlas/hooks/useMapImageUpload';
import { validateMarkerGeometry, validateWriteFields } from '@/src/lib/backupValidation';
import { finite } from '@/src/lib/dataContracts';
import { assertWriteId, requireProjectReference, requireRow } from './writeIntegrity';
import { identifyVertices, routePoints, type AreaPointEdit, type RoutePointEdit } from '@/src/lib/atlasRoutePoints';

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

  const requirePinOnMap = async (pinId: number, mapId: number) => {
    const pin = await requireMarker(pinId);
    if (pin.kind !== 'pin' || pin.mapId !== mapId || Array.isArray(pin.geometry)) {
      throw new Error('Pilih pin pada peta yang sama.');
    }
    return pin.geometry;
  };

  const attachRoutePoints = async (mapId: number, points: RoutePoint[], ownerId: number) => {
    const identified = identifyVertices(points);
    validateMarkerGeometry({ kind: 'route', geometry: identified });
    for (const point of identified) {
      if (point.codexId !== undefined) await requireProjectReference(db.codex, point.codexId, ownerId);
      if (point.pinId === undefined) continue;
      const position = await requirePinOnMap(point.pinId, mapId);
      point.x = position.x;
      point.y = position.y;
    }
    return identified;
  };

  const updatePinRoutes = async (pinId: number, mapId: number, position?: MapPoint) => {
    await db.mapMarkers.where('mapId').equals(mapId)
      .filter(route => routePoints(route).some(point => point.pinId === pinId))
      .modify(route => {
        route.geometry = routePoints(route).map(point => {
          if (point.pinId !== pinId) return point;
          return position ? { ...point, x: position.x, y: position.y } : { ...point, pinId: undefined };
        });
      });
  };

  const validateImportantLocations = async (kind: MapMarker['kind'], mapId: number, locations?: ImportantAreaLocation[]) => {
    if (!locations?.length) return;
    if (kind !== 'area') throw new Error('Lokasi penting hanya tersedia untuk area.');
    for (const location of locations) await requirePinOnMap(location.pinId, mapId);
  };

  const detachPin = async (pinId: number, mapId: number) => {
    await updatePinRoutes(pinId, mapId);
    await db.mapMarkers.where('mapId').equals(mapId)
      .filter(area => area.kind === 'area' && !!area.meta?.importantLocations?.some(location => location.pinId === pinId))
      .modify(area => {
        area.meta = { ...area.meta, importantLocations: area.meta?.importantLocations?.filter(location => location.pinId !== pinId) };
      });
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
      await validateImportantLocations(marker.kind, marker.mapId, marker.meta?.importantLocations);
      let points = geometry;
      if (Array.isArray(geometry)) {
        points = marker.kind === 'route' ? await attachRoutePoints(marker.mapId, geometry, projectId) : identifyVertices(geometry);
      }
      return db.mapMarkers.add({ ...fields, geometry: points });
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
      const changes = fields.meta ? { ...patch, meta: { ...current.meta, ...fields.meta } } : patch;
      const kind = fields.kind ?? current.kind;
      const mapId = fields.mapId ?? current.mapId;
      if ('meta' in patch || 'kind' in patch || 'mapId' in patch) {
        const meta = 'meta' in changes ? changes.meta : current.meta;
        await validateImportantLocations(kind, mapId, meta?.importantLocations);
      }
      const nextGeometry = geometry ?? current.geometry;
      if (kind === 'route' && Array.isArray(nextGeometry) && ('geometry' in patch || 'kind' in patch || 'mapId' in patch)) {
        changes.geometry = await attachRoutePoints(mapId, nextGeometry, projectId);
      }
      await db.mapMarkers.update(id, changes);
      if (current.kind === 'pin') {
        if (kind !== 'pin' || mapId !== current.mapId) await detachPin(id, current.mapId);
        else if (geometry && !Array.isArray(geometry)) await updatePinRoutes(id, current.mapId, geometry);
      }
    });
  };

  const editMarkerPoint = async (id: number, kind: 'route' | 'area', edit: RoutePointEdit | AreaPointEdit) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    await db.transaction('rw', [db.mapMarkers, db.maps, db.codex], async () => {
      const marker = await requireMarker(id);
      if (marker.kind !== kind || !Array.isArray(marker.geometry)) throw new Error('Bentuk penanda sudah berubah.');
      const points = identifyVertices(marker.geometry);
      const key = edit.kind === 'insert' ? edit.after : edit.pointId;
      const index = points.findIndex(point => point.pointId === key);
      if (index < 0) throw new Error('Titik sudah tidak tersedia.');
      const point = points[index];

      switch (edit.kind) {
        case 'insert':
          points.splice(index + 1, 0, { ...edit.position, pointId: crypto.randomUUID() });
          break;
        case 'move':
          if (kind === 'route' && point.pinId !== undefined) throw new Error('Pindahkan pin atau lepas tautannya untuk memindahkan titik.');
          points[index] = { ...point, x: edit.position.x, y: edit.position.y };
          break;
        case 'remove':
          points.splice(index, 1);
          break;
        case 'details':
          points[index] = { ...point, ...edit.patch };
          break;
        case 'corner':
          points[index] = { ...point, sharp: edit.sharp };
          break;
      }
      validateMarkerGeometry({ kind, geometry: points });
      const geometry = kind === 'route' ? await attachRoutePoints(marker.mapId, points, projectId) : points;
      await db.mapMarkers.update(id, { geometry });
    });
  };

  const editRoutePoint = (id: number, edit: RoutePointEdit) => editMarkerPoint(id, 'route', edit);
  const editAreaPoint = (id: number, edit: AreaPointEdit) => editMarkerPoint(id, 'area', edit);

  const setImportantLocation = async (areaId: number, pinId: number, role?: string) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    assertWriteId(pinId, 'ID pin');
    const name = role?.trim();
    if (role !== undefined && !name) throw new Error('Masukkan peran lokasi.');
    await db.transaction('rw', db.mapMarkers, db.maps, async () => {
      const area = await requireMarker(areaId);
      if (area.kind !== 'area') throw new Error('Lokasi penting hanya tersedia untuk area.');
      const locations = area.meta?.importantLocations ?? [];
      if (name !== undefined) await requirePinOnMap(pinId, area.mapId);
      const index = locations.findIndex(location => location.pinId === pinId);
      const next = locations.filter(location => location.pinId !== pinId);
      if (name !== undefined) next.splice(index < 0 ? next.length : index, 0, { pinId, role: name });
      const meta = { ...area.meta, importantLocations: next };
      validateWriteFields('mapMarkers', { meta }, 'patch');
      await db.mapMarkers.update(areaId, { meta });
    });
  };

  const deleteMarker = async (id: number) => {
    if (!projectId) throw new Error('Proyek tidak tersedia.');
    await db.transaction('rw', db.mapMarkers, db.maps, async () => {
      const marker = await requireMarker(id);
      if (marker.kind === 'pin') await detachPin(id, marker.mapId);
      await db.mapMarkers.delete(id);
    });
  };

  return { createMap, renameMap, setMapImage, deleteMap, addMarker, updateMarker, editRoutePoint, editAreaPoint, setImportantLocation, deleteMarker };
}
