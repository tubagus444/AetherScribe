import type { MapPoint } from '@/src/types';

interface Segment {
  a: MapPoint;
  b: MapPoint;
  index: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const epsilon = 1e-12;
const cross = (a: MapPoint, b: MapPoint) => a.x * b.y - a.y * b.x;
const subtract = (a: MapPoint, b: MapPoint) => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a: MapPoint, b: MapPoint) => a.x === b.x && a.y === b.y;

function segmentCrossing(first: Segment, second: Segment): MapPoint | undefined {
  const u = subtract(first.b, first.a);
  const v = subtract(second.b, second.a);
  const between = subtract(second.a, first.a);
  const denominator = cross(u, v);
  if (Math.abs(denominator) <= epsilon) {
    if (Math.abs(cross(between, u)) > epsilon) return;
    return [first.a, first.b, second.a, second.b].find(point =>
      [first, second].every(segment => point.x >= segment.left && point.x <= segment.right
        && point.y >= segment.top && point.y <= segment.bottom));
  }
  const t = cross(between, v) / denominator;
  const s = cross(between, u) / denominator;
  if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return { x: first.a.x + t * u.x, y: first.a.y + t * u.y };
}

/** Persilangan pertama antara sisi yang tidak bertetangga pada batas area. */
export function findAreaBoundaryCrossing(path: MapPoint[]): MapPoint | undefined {
  const vertices = path.filter((point, i) => !i || !same(point, path[i - 1]));
  if (vertices.length > 1 && same(vertices[0], vertices[vertices.length - 1])) vertices.pop();
  const count = vertices.length;
  const segments = vertices.map((a, index): Segment => {
    const b = vertices[(index + 1) % count];
    return { a, b, index, left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
  }).sort((a, b) => a.left - b.left);

  for (let i = 0; i < count; i++) {
    const segment = segments[i];
    for (let j = i + 1; j < count && segments[j].left <= segment.right; j++) {
      const other = segments[j];
      const spacing = Math.abs(segment.index - other.index);
      if (spacing === 1 || spacing === count - 1 || other.top > segment.bottom || other.bottom < segment.top) continue;
      const crossing = segmentCrossing(segment, other);
      if (crossing) return crossing;
    }
  }
}
