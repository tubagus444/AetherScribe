import { useCallback, useEffect, useRef, useState } from 'react';
import { findAreaBoundaryCrossing } from '@/src/lib/areaBoundaryCrossing';
import type { MapPoint } from '@/src/types';
import type { AreaBoundaryRequest, AreaBoundaryResponse } from '../workers/areaBoundaryProtocol';

export function useAreaBoundaryCrossing() {
  const workerRef = useRef<Worker | null>(null);
  const request = useRef<{ id: number; path: MapPoint[] }>({ id: 0, path: [] });
  const [crossing, setCrossing] = useState<MapPoint>();

  useEffect(() => {
    if (typeof Worker !== 'function') return;
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/areaBoundaryWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      return;
    }
    workerRef.current = worker;
    worker.onmessage = ({ data }: MessageEvent<AreaBoundaryResponse>) => {
      if (data.kind === 'crossing' && data.id === request.current.id) setCrossing(data.crossing);
    };
    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
      setCrossing(findAreaBoundaryCrossing(request.current.path));
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const check = useCallback((path: MapPoint[]) => {
    const id = request.current.id + 1;
    request.current = { id, path };
    if (path.length < 4) setCrossing(undefined);
    else if (workerRef.current) {
      setCrossing(undefined);
      workerRef.current.postMessage({ kind: 'crossing', id, path } satisfies AreaBoundaryRequest);
    } else setCrossing(findAreaBoundaryCrossing(path));
  }, []);

  return { crossing, check };
}
