import { describe, expect, it } from 'vitest';
import { findContainedAreas } from '@/src/lib/areaContainment';
import type { MapMarker, MapPoint } from '@/src/types';

function area(id: number, coordinates: [number, number][], mapId = 1): MapMarker {
  return { id, projectId: 1, mapId, kind: 'area', createdAt: 1, geometry: coordinates.map(([x, y]): MapPoint => ({ x, y })) };
}

describe('findContainedAreas', () => {
  it('uses visible curves, includes a shared border, and excludes coincident or cross-map areas', () => {
    const parent = area(1, [[.25, .25], [.75, .25], [.75, .75], [.25, .75]]);
    const shared = area(2, [[.25, .45], [.32, .45], [.32, .55], [.25, .55]]);
    const nearTop = area(3, [[.45, .205], [.55, .205], [.55, .235], [.45, .235]]);
    const others = [shared, nearTop, { ...parent, id: 4 }, { ...shared, id: 5, mapId: 2 }];
    expect(findContainedAreas(parent, others)).toEqual([2]);
    expect(findContainedAreas({ ...parent, meta: { areaStyle: 'curved' } }, others)).toEqual([2, 3, 4]);
  });

  it('rejects a child whose side crosses an indentation even when its vertices are inside', () => {
    const parent = area(1, [[0, 0], [1, 0], [1, 1], [.65, 1], [.65, .4], [.35, .4], [.35, 1], [0, 1]]);
    const straddlesNotch = area(2, [[.2, .8], [.8, .8], [.5, .2]]);
    const child = area(3, [[.1, .5], [.25, .5], [.25, .8], [.1, .8]]);
    expect(findContainedAreas(parent, [straddlesNotch, child])).toEqual([3]);
  });
});
