/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CRUD + live-query Atlas Dunia (tabel `maps` & `mapMarkers`). Semua operasi
 * project-scoped; geometri disimpan relatif 0–1 (lihat `src/lib/mapGeometry.ts`).
 */

import { useMemo } from 'react';
import { createAtlasOperations } from '@/src/services/atlasOperations';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { useProject } from '@/src/contexts/ProjectContext';
import { AtlasMap, MapMarker } from '@/src/types';

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

  const operations = useMemo(() => createAtlasOperations(projectId), [projectId]);

  return {
    maps: (maps ?? []) as AtlasMap[],
    markers: (markers ?? []) as MapMarker[],
    mapsLoading: maps === undefined,
    ...operations,
  };
}
