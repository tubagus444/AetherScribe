import type { MapMarker, MapPoint, MapVertex, RoutePoint } from '@/src/types';

export type VertexEdit =
  | { kind: 'insert'; after: string; position: MapPoint }
  | { kind: 'move'; pointId: string; position: MapPoint }
  | { kind: 'remove'; pointId: string };

export type RoutePointEdit = VertexEdit | {
  kind: 'details'; pointId: string; patch: Partial<Pick<RoutePoint, 'name' | 'visible' | 'pinId' | 'codexId'>>;
};

export type AreaPointEdit = VertexEdit | { kind: 'corner'; pointId: string; sharp: boolean };

export function routePoints(marker: MapMarker): RoutePoint[] {
  return marker.kind === 'route' && Array.isArray(marker.geometry) ? marker.geometry : [];
}

export function vertexId(point: MapVertex, index: number): string {
  return point.pointId ?? `legacy-${index}`;
}

export function identifyVertices<T extends MapVertex>(points: T[]): T[] {
  return points.map((point, index) => ({ ...point, pointId: vertexId(point, index) }));
}

export function routePointVisible(point: RoutePoint, index: number, count: number, showIntermediate: boolean): boolean {
  return point.visible ?? (index === 0 || index === count - 1 || showIntermediate);
}

export function routePointRole(index: number, count: number): string {
  if (index === 0) return 'Titik awal';
  return index === count - 1 ? 'Tujuan' : 'Persinggahan';
}
