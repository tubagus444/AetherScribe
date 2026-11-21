/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  clamp01,
  relToLatLng,
  latLngToRel,
  relPathToLatLngs,
  relToPixel,
  pixelToRel,
  centroid,
  pointInPolygon,
  isPointGeometry,
  calculateRelativeDistance,
  calculateRealDistance,
  calculateTravelTime,
  sampleRoutePath,
  sampleAreaBoundary,
} from './mapGeometry';
import { findAreaBoundaryCrossing } from '@/src/lib/areaBoundaryCrossing';
import { analyzeRegions } from '@/src/lib/atlasAnalytics';
import type { MapMarker } from '@/src/types';

describe('sampleRoutePath', () => {
  const points = [{ x: .1, y: .2 }, { x: .5, y: .8 }, { x: .9, y: .2 }];

  it('mempertahankan rute lama, mode lurus, dan rute dua titik', () => {
    expect(sampleRoutePath(points)).toEqual(points);
    expect(sampleRoutePath(points, 'straight')).toEqual(points);
    expect(sampleRoutePath(points.slice(0, 2), 'curved')).toEqual(points.slice(0, 2));
  });

  it('melewati titik asli sesuai urutan dan menambah panjang pada belokan', () => {
    const path = sampleRoutePath(points, 'curved');
    expect(path[0]).toEqual(points[0]);
    expect(path[(path.length - 1) / 2]).toEqual(points[1]);
    expect(path.at(-1)).toEqual(points[2]);
    expect(calculateRelativeDistance(path)).toBeGreaterThan(calculateRelativeDistance(points));
  });

  it('menahan kurva dalam batas peta dan menangani titik berimpit', () => {
    const edge = { x: 0, y: 1 };
    const path = sampleRoutePath([edge, edge, { x: .01, y: .01 }, { x: 1, y: 0 }], 'curved');
    expect(path.slice(0, 2)).toEqual([edge, edge]);
    expect(path.flatMap(({ x, y }) => [x, y]).every(n => n >= 0 && n <= 1)).toBe(true);
  });
});

describe('batas area Atlas', () => {
  const square = [{ x: .25, y: .25 }, { x: .75, y: .25 }, { x: .75, y: .75 }, { x: .25, y: .75 }];

  it('melengkungkan sisi penutup dan mempertahankan arah sisi di sudut tegas', () => {
    expect(sampleAreaBoundary(square)).toBe(square);
    const smooth = sampleAreaBoundary(square, 'curved');
    const sharp = sampleAreaBoundary([{ ...square[0], sharp: true }, ...square.slice(1)], 'curved');
    expect(smooth.filter(point => square.includes(point))).toEqual(square);
    expect(smooth.at(-1)?.x).toBeLessThan(square[0].x);
    expect(sharp[1].y).toBeGreaterThan(smooth[1].y);
    expect(sharp.at(-1)?.x).toBeGreaterThan(smooth.at(-1)?.x ?? 0);
  });

  it('menandai persilangan sisi dan mengabaikan sambungan normal', () => {
    const [a, b, c, d] = square;
    expect(findAreaBoundaryCrossing([a, c, d, b])).toEqual({ x: .5, y: .5 });
    expect(findAreaBoundaryCrossing(square)).toBeUndefined();
    expect(findAreaBoundaryCrossing(sampleAreaBoundary(square, 'curved'))).toBeUndefined();
  });

  it('menggunakan batas yang digambar untuk menentukan pin di dalam wilayah', () => {
    const base = { projectId: 1, mapId: 1, createdAt: 1 };
    const area: MapMarker = { ...base, id: 1, kind: 'area', geometry: square };
    const village: MapMarker = { ...base, id: 2, kind: 'pin', geometry: { x: .5, y: .21 } };
    const presence = { byEntity: new Map(), perChapterCounts: [] };
    expect(analyzeRegions([area, village], presence, [])[0].containedPins).toEqual([]);
    expect(analyzeRegions([{ ...area, meta: { areaStyle: 'curved' } }, village], presence, [])[0].containedPins).toEqual([2]);
  });
});

describe('clamp01', () => {
  it('menjepit ke [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
  it('NaN → 0', () => {
    expect(clamp01(NaN)).toBe(0);
  });
});

describe('relToLatLng / latLngToRel', () => {
  const W = 800;
  const H = 600;

  it('kiri-atas gambar (0,0) → pojok atas Leaflet [H,0]', () => {
    expect(relToLatLng({ x: 0, y: 0 }, W, H)).toEqual([600, 0]);
  });

  it('kanan-bawah (1,1) → [0,W]', () => {
    expect(relToLatLng({ x: 1, y: 1 }, W, H)).toEqual([0, 800]);
  });

  it('tengah (0.5,0.5) → [H/2, W/2]', () => {
    expect(relToLatLng({ x: 0.5, y: 0.5 }, W, H)).toEqual([300, 400]);
  });

  it('round-trip rel → latlng → rel identik', () => {
    const p = { x: 0.37, y: 0.82 };
    const rt = latLngToRel(relToLatLng(p, W, H), W, H);
    expect(rt.x).toBeCloseTo(p.x, 10);
    expect(rt.y).toBeCloseTo(p.y, 10);
  });

  it('menjepit input di luar 0–1', () => {
    expect(relToLatLng({ x: 2, y: -1 }, W, H)).toEqual([600, 800]);
  });
});

describe('relPathToLatLngs', () => {
  it('memetakan tiap titik', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(relPathToLatLngs(pts, 100, 100)).toEqual([
      [100, 0],
      [0, 100],
    ]);
  });
});

describe('relToPixel / pixelToRel', () => {
  it('round-trip', () => {
    const rt = pixelToRel(relToPixel({ x: 0.25, y: 0.75 }, 400, 200), 400, 200);
    expect(rt).toEqual({ x: 0.25, y: 0.75 });
  });
  it('menghindari bagi nol', () => {
    expect(pixelToRel({ x: 10, y: 10 }, 0, 0)).toEqual({ x: 1, y: 1 });
  });
});

describe('centroid', () => {
  it('rata-rata titik', () => {
    expect(centroid([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ])).toEqual({ x: 0.5, y: 1 / 3 });
  });
  it('kosong → null', () => {
    expect(centroid([])).toBeNull();
  });
});

describe('pointInPolygon', () => {
  const square = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];
  it('titik di dalam', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
  });
  it('titik di luar', () => {
    expect(pointInPolygon({ x: 0.1, y: 0.1 }, square)).toBe(false);
  });
  it('poligon < 3 titik → false', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe('isPointGeometry', () => {
  it('membedakan pin vs array', () => {
    expect(isPointGeometry({ x: 0.5, y: 0.5 })).toBe(true);
    expect(isPointGeometry([{ x: 0, y: 0 }])).toBe(false);
  });
});

describe('Kalkulator Jarak & Waktu Tempuh (Skala Peta)', () => {
  it('calculateRelativeDistance menghitung panjang polyline', () => {
    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 }, // dx = 0.3, dy = 0 => dist = 0.3
      { x: 0.4, y: 0.5 }, // dx = 0, dy = 0.4 => dist = 0.4
    ];
    // Total harus 0.7
    expect(calculateRelativeDistance(points)).toBeCloseTo(0.7, 5);
  });

  it('calculateRelativeDistance mengembalikan 0 bila titik kurang dari 2', () => {
    expect(calculateRelativeDistance([])).toBe(0);
    expect(calculateRelativeDistance([{ x: 0.5, y: 0.5 }])).toBe(0);
  });

  it('calculateRealDistance mengonversi dengan rasio yang tepat', () => {
    const relativeDist = 0.5;
    const scale = { distanceUnit: 'km', ratioToRelative: 1000 }; // 1 unit relatif = 1000 km
    expect(calculateRealDistance(relativeDist, scale)).toBe(500); // 0.5 * 1000 = 500 km
  });

  it('calculateRealDistance mengembalikan 0 bila skala tak valid', () => {
    expect(calculateRealDistance(0.5, undefined)).toBe(0);
  });

  it('calculateTravelTime menghitung waktu (Jarak / Kecepatan)', () => {
    const realDist = 500; // km
    const speed = 50; // km/hari
    expect(calculateTravelTime(realDist, speed)).toBe(10); // 10 hari
  });

  it('calculateTravelTime menghindari bagi nol', () => {
    expect(calculateTravelTime(500, 0)).toBe(0);
    expect(calculateTravelTime(500, -10)).toBe(0);
  });
});
