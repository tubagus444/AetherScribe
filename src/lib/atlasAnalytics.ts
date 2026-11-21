/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Atlas Analytics — layer murni (tanpa tabel baru/komponen UI) untuk menghitung
 * analitik peta dunia, seperti "Bab/Adegan apa saja yang terjadi di Region X".
 * Diturunkan dengan menyilangkan geometri MapMarker (pointInPolygon) dengan PresenceIndex.
 */

import { MapMarker, MapPoint, CodexEntry } from '@/src/types';
import { PresenceIndex } from '@/src/lib/continuity';
import { pointInPolygon, isPointGeometry, sampleAreaBoundary } from '@/src/lib/mapGeometry';

export interface RegionAnalytic {
  /** ID dari penanda tipe 'area' */
  markerId: number;
  /** Nama area (diambil dari Codex bila tertaut, fallback ke title) */
  areaName: string;
  /** Tautan ke entri Codex (misalnya entri Faksi/Kerajaan) jika ada */
  codexId?: number;
  /** ID dari marker tipe 'pin' (karakter/item) yang koordinatnya berada di dalam poligon area ini */
  containedPins: number[];
  /** Array unik dan terurut (ascending) dari indeks bab yang terkait dengan area ini */
  associatedChapters: number[];
  /** Total sebutan gabungan (dari area itu sendiri maupun pin-pin di dalamnya) */
  score: number;
}

/**
 * Menghitung analitik "Adegan per Wilayah" dengan menyilangkan data wilayah pada peta,
 * pin karakter/benda yang berada di dalamnya, dengan data kehadiran lintasan (PresenceIndex).
 * 
 * @param markers Daftar penanda (area, pin, rute) dari satu peta (AtlasMap).
 * @param presence Indeks kehadiran hasil dari `buildPresenceIndexAsync`.
 * @param codexEntries Seluruh daftar entri Codex untuk resolusi nama.
 */
export function analyzeRegions(
  markers: MapMarker[],
  presence: PresenceIndex,
  codexEntries: CodexEntry[]
): RegionAnalytic[] {
  const areas = markers.filter(m => m.kind === 'area' && Array.isArray(m.geometry));
  const pins = markers.filter(m => m.kind === 'pin' && isPointGeometry(m.geometry));

  const codexMap = new Map<number, CodexEntry>();
  for (const entry of codexEntries) {
    if (entry.id !== undefined) codexMap.set(entry.id, entry);
  }

  return areas.map(area => {
    const poly = sampleAreaBoundary(Array.isArray(area.geometry) ? area.geometry : [], area.meta?.areaStyle);
    const bounds = poly.reduce((box, point) => ({
      left: Math.min(box.left, point.x), right: Math.max(box.right, point.x),
      top: Math.min(box.top, point.y), bottom: Math.max(box.bottom, point.y),
    }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    // Hitung pin apa saja yang "jatuh" ke dalam perbatasan wilayah ini
    const containedPins = pins.filter(pin => {
      const point = pin.geometry as MapPoint;
      return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom
        && pointInPolygon(point, poly);
    });
    
    const chapterSet = new Set<number>();
    let score = 0;

    // 1. Aktivitas Area itu sendiri (jika area ini merujuk ke entri Faksi/Negara)
    if (area.codexId) {
      const p = presence.byEntity.get(area.codexId);
      if (p) {
        p.indices.forEach(idx => chapterSet.add(idx));
        score += p.mentions;
      }
    }

    // 2. Aktivitas Karakter/Pin yang ada di dalam Area
    for (const pin of containedPins) {
      if (pin.codexId) {
        const p = presence.byEntity.get(pin.codexId);
        if (p) {
          p.indices.forEach(idx => chapterSet.add(idx));
          score += p.mentions;
        }
      }
    }

    // Resolusi penamaan: Prioritas Codex -> Fallback ke judul marker -> Fallback statis
    let areaName = area.title || 'Area Tak Bernama';
    if (area.codexId) {
      const codexRef = codexMap.get(area.codexId);
      if (codexRef && codexRef.name) {
        areaName = codexRef.name;
      }
    }

    return {
      markerId: area.id || 0,
      areaName,
      codexId: area.codexId,
      containedPins: containedPins.map(p => p.id!).filter(id => id !== undefined),
      associatedChapters: Array.from(chapterSet).sort((a, b) => a - b),
      score
    };
  });
}

export interface OrphanMarkerInfo {
  markerId: number;
  kind: 'pin' | 'area' | 'route';
  name: string;
  codexId?: number;
  reason: 'never_mentioned' | 'unlinked';
}

/**
 * Mendeteksi penanda yang berstatus "yatim" (orphan):
 * 1. Penanda yang belum tertaut Codex sama sekali (`unlinked`).
 * 2. Penanda tipe pin/route yang menautkan Codex tapi tidak pernah muncul di bab mana pun (kemunculan = 0).
 * 3. Penanda tipe area yang tidak memiliki sebutan Codex dan tidak mengandung pin aktif di dalamnya (score = 0).
 */
export function findOrphanMarkers(
  markers: MapMarker[],
  presence: PresenceIndex,
  codexEntries: CodexEntry[],
  regionAnalytics?: RegionAnalytic[]
): OrphanMarkerInfo[] {
  const regions = regionAnalytics ?? analyzeRegions(markers, presence, codexEntries);
  const regionScoreMap = new Map<number, number>();
  for (const r of regions) {
    regionScoreMap.set(r.markerId, r.score);
  }

  const codexMap = new Map<number, CodexEntry>();
  for (const entry of codexEntries) {
    if (entry.id !== undefined) codexMap.set(entry.id, entry);
  }

  const orphans: OrphanMarkerInfo[] = [];

  for (const marker of markers) {
    if (!marker.id) continue;
    const markerName = (marker.codexId ? codexMap.get(marker.codexId)?.name : null) || marker.title || 'Penanda Tanpa Nama';

    if (!marker.codexId) {
      orphans.push({
        markerId: marker.id,
        kind: marker.kind,
        name: markerName,
        reason: 'unlinked'
      });
      continue;
    }

    if (marker.kind === 'area') {
      const score = regionScoreMap.get(marker.id) ?? 0;
      if (score === 0) {
        orphans.push({
          markerId: marker.id,
          kind: marker.kind,
          name: markerName,
          codexId: marker.codexId,
          reason: 'never_mentioned'
        });
      }
    } else {
      // pin or route
      const p = presence.byEntity.get(marker.codexId);
      const mentions = p?.mentions ?? 0;
      if (mentions === 0) {
        orphans.push({
          markerId: marker.id,
          kind: marker.kind,
          name: markerName,
          codexId: marker.codexId,
          reason: 'never_mentioned'
        });
      }
    }
  }

  return orphans;
}

/**
 * Menghitung nomor bab (1-based) pertama kali sebuah penanda diperkenalkan di naskah.
 * Mengembalikan null jika belum pernah muncul di naskah.
 */
export function getMarkerFirstAppearanceChapter(
  marker: MapMarker,
  presence: PresenceIndex,
  regionAnalytic?: RegionAnalytic
): number | null {
  if (marker.kind === 'area' && regionAnalytic) {
    if (regionAnalytic.associatedChapters.length > 0) {
      return regionAnalytic.associatedChapters[0] + 1; // 1-based
    }
  }

  if (marker.codexId) {
    const p = presence.byEntity.get(marker.codexId);
    if (p && p.indices.length > 0) {
      return p.indices[0] + 1; // 1-based
    }
  }

  return null;
}

