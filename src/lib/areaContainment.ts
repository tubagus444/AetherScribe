import type { MapMarker, MapPoint } from '@/src/types';
import { findAreaBoundaryCrossing } from '@/src/lib/areaBoundaryCrossing';
import { pointInPolygon, sampleAreaBoundary } from '@/src/lib/mapGeometry';

const tolerance = 1e-12;
const cross = (a: MapPoint, b: MapPoint) => a.x * b.y - a.y * b.x;
const subtract = (a: MapPoint, b: MapPoint) => ({ x: a.x - b.x, y: a.y - b.y });

function bounds(path: MapPoint[]) {
  return path.reduce((box, p) => ({
    left: Math.min(box.left, p.x), right: Math.max(box.right, p.x),
    top: Math.min(box.top, p.y), bottom: Math.max(box.bottom, p.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
}

function size(path: MapPoint[]) {
  return Math.abs(path.reduce((total, point, i) => total + cross(point, path[(i + 1) % path.length]), 0)) / 2;
}

function isWithin(point: MapPoint, path: MapPoint[]): boolean {
  if (pointInPolygon(point, path)) return true;
  return path.some((a, i) => {
    const b = path[(i + 1) % path.length];
    return point.x >= Math.min(a.x, b.x) - tolerance && point.x <= Math.max(a.x, b.x) + tolerance
      && point.y >= Math.min(a.y, b.y) - tolerance && point.y <= Math.max(a.y, b.y) + tolerance
      && Math.abs(cross(subtract(point, a), subtract(b, a))) <= tolerance;
  });
}

/** Periksa setiap interval di antara perpotongan dengan batas, termasuk pada area cekung. */
function sideIsWithin(a: MapPoint, b: MapPoint, boundary: MapPoint[]): boolean {
  const direction = subtract(b, a);
  const cuts = [0, 1];
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  for (let i = 0; i < boundary.length; i++) {
    const c = boundary[i], d = boundary[(i + 1) % boundary.length];
    if (Math.max(c.x, d.x) < left || Math.min(c.x, d.x) > right
      || Math.max(c.y, d.y) < top || Math.min(c.y, d.y) > bottom) continue;
    const edge = subtract(d, c);
    const determinant = cross(direction, edge);
    if (Math.abs(determinant) <= tolerance) continue;
    const offset = subtract(c, a);
    const t = cross(offset, edge) / determinant;
    const u = cross(offset, direction) / determinant;
    if (t > tolerance && t < 1 - tolerance && u >= -tolerance && u <= 1 + tolerance) cuts.push(t);
  }
  cuts.sort((first, second) => first - second);
  for (let i = 1; i < cuts.length; i++) {
    const t = (cuts[i - 1] + cuts[i]) / 2;
    if (!isWithin({ x: a.x + t * direction.x, y: a.y + t * direction.y }, boundary)) return false;
  }
  return true;
}

/** Area yang seluruh batasnya tercakup oleh area induk pada peta yang sama. */
export function findContainedAreas(parent: MapMarker, markers: MapMarker[]): number[] {
  if (parent.kind !== 'area' || !Array.isArray(parent.geometry)) return [];
  const boundary = sampleAreaBoundary(parent.geometry, parent.meta?.areaStyle);
  const outerSize = size(boundary);
  if (outerSize <= tolerance || findAreaBoundaryCrossing(boundary)) return [];
  const outer = bounds(boundary);

  return markers.flatMap(marker => {
    if (marker.kind !== 'area' || marker.id === undefined || marker.id === parent.id
      || marker.mapId !== parent.mapId || !Array.isArray(marker.geometry)) return [];
    if (marker.projectId !== undefined && parent.projectId !== undefined && marker.projectId !== parent.projectId) return [];
    const child = sampleAreaBoundary(marker.geometry, marker.meta?.areaStyle);
    const inner = bounds(child);
    if (inner.left < outer.left - tolerance || inner.right > outer.right + tolerance
      || inner.top < outer.top - tolerance || inner.bottom > outer.bottom + tolerance) return [];
    const innerSize = size(child);
    if (innerSize <= tolerance || innerSize >= outerSize - tolerance || findAreaBoundaryCrossing(child)) return [];
    const contained = child.every(point => isWithin(point, boundary))
      && child.every((point, i) => sideIsWithin(point, child[(i + 1) % child.length], boundary));
    return contained ? [marker.id] : [];
  });
}
