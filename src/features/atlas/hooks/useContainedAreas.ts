import { useEffect, useMemo, useState } from 'react';
import { findContainedAreas } from '@/src/lib/areaContainment';
import type { MapMarker } from '@/src/types';
import type { AreaBoundaryRequest, AreaBoundaryResponse } from '../workers/areaBoundaryProtocol';

type ContentsQuery = Extract<AreaBoundaryRequest, { kind: 'contents' }>;

export function useContainedAreas(parent: MapMarker, markers: MapMarker[]) {
  const query = useMemo<ContentsQuery>(() => ({
    kind: 'contents', parent,
    markers: markers.filter(marker => marker.kind === 'area' && marker.id !== parent.id && marker.mapId === parent.mapId),
  }), [parent, markers]);
  const [result, setResult] = useState<{ query: ContentsQuery; ids: number[] }>();

  useEffect(() => {
    if (!query.markers.length) return;
    const fallback = () => setResult({ query, ids: findContainedAreas(query.parent, query.markers) });
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/areaBoundaryWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      fallback();
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<AreaBoundaryResponse>) => {
      if (data.kind === 'contents') setResult({ query, ids: data.containedAreas });
    };
    worker.onerror = fallback;
    worker.postMessage(query);
    return () => { worker.terminate(); };
  }, [query]);

  if (!query.markers.length) return [];
  return result?.query === query ? result.ids : null;
}
