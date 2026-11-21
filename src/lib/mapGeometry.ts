/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geometri Atlas Dunia — konversi & util MURNI, deterministik & nol token.
 *
 * Prinsip (RENCANA-ATLAS-DUNIA.md §7): data penanda disimpan sebagai koordinat
 * RELATIF 0–1 agar TAK terkunci ke Leaflet/resolusi gambar. Modul ini adalah satu-
 * satunya jembatan antara ruang relatif itu dan ruang koordinat Leaflet `CRS.Simple`
 * — SENGAJA tak mengimpor Leaflet (tipe `LatLngTuple` = `[number, number]` biasa),
 * sehingga ganti render engine tak menyentuh data maupun tes ini.
 *
 * Konvensi ruang:
 *  - Ruang piksel gambar: origin kiri-atas, x ke kanan, y ke BAWAH (spt raster).
 *  - Ruang relatif: rx = px/width, ry = py/height, keduanya 0..1.
 *  - Ruang Leaflet CRS.Simple: imageOverlay dipasang di bounds
 *    `[[0,0],[height,width]]` → lat 0..height, lng 0..width. Sumbu lat Leaflet naik
 *    ke ATAS layar, sedangkan y gambar turun → maka lat = height*(1-ry) (dibalik),
 *    lng = width*rx. Tuple Leaflet selalu `[lat, lng]`.
 */

import type { MapMarker, MapPoint, MapVertex, RouteStyle } from '@/src/types';

/** Tuple koordinat Leaflet `[lat, lng]` — tanpa bergantung tipe Leaflet. */
export type LatLngTuple = [number, number];

/** Batasi ke rentang [0,1]. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Titik relatif → tuple Leaflet `[lat, lng]` untuk gambar berukuran width×height. */
export function relToLatLng(p: MapPoint, width: number, height: number): LatLngTuple {
  return [height * (1 - clamp01(p.y)), width * clamp01(p.x)];
}

/** Tuple Leaflet `[lat, lng]` → titik relatif 0–1 (kebalikan `relToLatLng`). */
export function latLngToRel(latlng: LatLngTuple, width: number, height: number): MapPoint {
  const [lat, lng] = latlng;
  const w = width || 1;
  const h = height || 1;
  return { x: clamp01(lng / w), y: clamp01(1 - lat / h) };
}

/** Terjemahkan daftar titik relatif → daftar tuple Leaflet (area/route). */
export function relPathToLatLngs(points: MapPoint[], width: number, height: number): LatLngTuple[] {
  return points.map((p) => relToLatLng(p, width, height));
}

export function showsIntermediateRoutePoints(meta?: MapMarker['meta']): boolean {
  return meta?.showIntermediatePoints ?? (meta?.routeStyle !== 'curved');
}

const samplesPerSegment = 16;

function appendCurveSegment(path: MapPoint[], prev: MapPoint, a: MapPoint, b: MapPoint, next: MapPoint) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  // Pendekkan handle di segmen yang jauh lebih pendek daripada segmen tetangganya.
  const startWeight = Math.min(1, length / (Math.hypot(a.x - prev.x, a.y - prev.y) || 1)) / 6;
  const endWeight = Math.min(1, length / (Math.hypot(next.x - b.x, next.y - b.y) || 1)) / 6;
  const c1 = {
    x: clamp01(a.x + (b.x - prev.x) * startWeight),
    y: clamp01(a.y + (b.y - prev.y) * startWeight),
  };
  const c2 = {
    x: clamp01(b.x - (next.x - a.x) * endWeight),
    y: clamp01(b.y - (next.y - a.y) * endWeight),
  };

  path.push(a);
  for (let j = 1; j < samplesPerSegment; j++) {
    const t = j / samplesPerSegment;
    const u = 1 - t;
    const w0 = u ** 3;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t ** 3;
    path.push({
      x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
      y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
    });
  }
}

/** Sampel spline Catmull–Rom yang dipakai bersama oleh kanvas dan kalkulator jarak. */
export function sampleRoutePath(points: MapPoint[], style?: RouteStyle): MapPoint[] {
  if (style !== 'curved' || points.length < 3) return points;

  const path: MapPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    appendCurveSegment(path, points[i - 1] ?? a, a, b, points[i + 2] ?? b);
  }
  path.push(points[points.length - 1]);
  return path;
}

/** Cincin tertutup untuk Leaflet dan analitik, tanpa mengulang titik awal. */
export function sampleAreaBoundary(points: MapVertex[], style?: RouteStyle): MapPoint[] {
  if (style !== 'curved' || points.length < 3) return points;

  const path: MapPoint[] = [];
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const prev = a.sharp ? a : points[(i + count - 1) % count];
    const next = b.sharp ? b : points[(i + 2) % count];
    appendCurveSegment(path, prev, a, b, next);
  }
  return path;
}

/** Titik relatif → piksel absolut pada gambar (mis. untuk ekspor/overlay non-Leaflet). */
export function relToPixel(p: MapPoint, width: number, height: number): MapPoint {
  return { x: clamp01(p.x) * width, y: clamp01(p.y) * height };
}

/** Piksel absolut → titik relatif 0–1. */
export function pixelToRel(px: MapPoint, width: number, height: number): MapPoint {
  const w = width || 1;
  const h = height || 1;
  return { x: clamp01(px.x / w), y: clamp01(px.y / h) };
}

/**
 * Sentroid (rata-rata titik) sebuah poligon/polyline relatif — dipakai untuk
 * menaruh label/ikon di tengah area. Mengembalikan `null` bila kosong.
 */
export function centroid(points: MapPoint[]): MapPoint | null {
  if (!points.length) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Titik di dalam poligon (ray-casting), koordinat relatif. Dipakai kelak untuk
 * hit-test/analitik "adegan di wilayah ini". Poligon < 3 titik → selalu false.
 */
export function pointInPolygon(pt: MapPoint, polygon: MapPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Type guard: geometry pin (satu titik) vs area/route (array titik). */
export function isPointGeometry(g: MapPoint | MapPoint[]): g is MapPoint {
  return !Array.isArray(g);
}

/**
 * Menghitung total jarak relatif (0-1) dari sebuah array titik polyline/rute.
 * Menggunakan Teorema Pythagoras standar di ruang 2D Euclidean.
 */
export function calculateRelativeDistance(points: MapPoint[]): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/**
 * Mengonversi jarak relatif (0-1) ke unit jarak nyata (km, mil) menggunakan skala peta.
 * scale.ratioToRelative = jarak_nyata / jarak_relatif_0_1.
 */
export function calculateRealDistance(relativeDistance: number, scale?: { ratioToRelative: number }): number {
  if (!scale || !scale.ratioToRelative || relativeDistance <= 0) return 0;
  return relativeDistance * scale.ratioToRelative;
}

/**
 * Menghitung waktu tempuh berdasarkan jarak nyata dan profil kecepatan.
 * @returns Waktu dalam satuan waktu profil kecepatan (biasanya 'hari').
 */
export function calculateTravelTime(realDistance: number, speedPerDay: number): number {
  if (speedPerDay <= 0 || realDistance <= 0) return 0;
  return realDistance / speedPerDay;
}
