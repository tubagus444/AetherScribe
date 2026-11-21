import type { MapMarker, MapPoint } from '@/src/types';

export type AreaBoundaryRequest =
  | { kind: 'crossing'; id: number; path: MapPoint[] }
  | { kind: 'contents'; parent: MapMarker; markers: MapMarker[] };

export type AreaBoundaryResponse =
  | { kind: 'crossing'; id: number; crossing?: MapPoint }
  | { kind: 'contents'; containedAreas: number[] };
