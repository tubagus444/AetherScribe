import { findAreaBoundaryCrossing } from '@/src/lib/areaBoundaryCrossing';
import { findContainedAreas } from '@/src/lib/areaContainment';
import type { AreaBoundaryRequest, AreaBoundaryResponse } from './areaBoundaryProtocol';

self.onmessage = ({ data }: MessageEvent<AreaBoundaryRequest>) => {
  const response: AreaBoundaryResponse = data.kind === 'crossing'
    ? { kind: 'crossing', id: data.id, crossing: findAreaBoundaryCrossing(data.path) }
    : { kind: 'contents', containedAreas: findContainedAreas(data.parent, data.markers) };
  self.postMessage(response);
};
