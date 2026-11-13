/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Kanvas peta interaktif Atlas Dunia — Leaflet MURNI (`CRS.Simple`) atas gambar
 * yang di-upload, dipasang lewat `L.imageOverlay` (nol jaringan, tak ada tile).
 * SENGAJA memakai API bawaan Leaflet untuk pan/zoom/hit-test (matang & teruji) —
 * beda dari LoreGraphPanel yang hit-test manual. Lihat RENCANA-ATLAS-DUNIA.md §2.
 *
 * Menggambar penanda buatan-sendiri di atas Leaflet: pin (klik sekali), area/rute
 * (klik-klik tambah titik, dobel-klik selesai, Esc batal). Geometri disimpan
 * relatif 0–1 via `src/lib/mapGeometry.ts` — Leaflet hanya lapisan render.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft } from 'lucide-react';
import { AtlasMap, MapMarker, MapPoint } from '@/src/types';
import {
  relToLatLng,
  relPathToLatLngs,
  latLngToRel,
  isPointGeometry,
} from '@/src/lib/mapGeometry';
import { RegionAnalytic } from '@/src/lib/atlasAnalytics';
import { PresenceIndex } from '@/src/lib/continuity';
import { FOG_HEX, safeAtlasColor } from '@/src/lib/atlasColors';
import { atlasText, vertexIcon, midIcon, regularPinIcon, portalPinIcon, portalAreaBadgeIcon, selectedPinIcon, selectedAreaBadgeIcon, selectedRouteBadgeIcon } from './atlasMarkerIcons';

export type DrawMode = 'pin' | 'area' | 'route' | 'scale' | null;

interface MapCanvasProps {
  map: AtlasMap;
  /** Penanda yang SUDAH difilter oleh pemanggil (data tetap penuh di store). */
  markers: MapMarker[];
  drawMode: DrawMode;
  selectedMarkerId?: number;
  /** Mode ubah geometri penanda terpilih (seret handle titik). */
  editing?: boolean;
  /** Warna render tiap penanda (diturunkan pemanggil dari faksi/kategori Codex). */
  colorFor: (m: MapMarker) => string;
  /** Nama/judul tampilan aktual tiap penanda (mengutamakan nama entri Codex). */
  titleFor?: (m: MapMarker) => string;
  /** Dipanggil saat sebuah geometri baru selesai digambar. */
  onCreateGeometry: (geometry: MapPoint | MapPoint[]) => void;
  onMarkerClick: (m: MapMarker) => void;
  /** Dipanggil saat geometri penanda diubah lewat edit (persist di dragend/ubah struktur). */
  onGeometryChange?: (markerId: number, geometry: MapPoint | MapPoint[]) => void;
  /** Progres gambar area/rute (jumlah titik draft) — untuk hint UI. */
  onDraftChange?: (points: number) => void;
  // Fase 2 Props:
  orphanMarkerIds?: Set<number>;
  highlightOrphans?: boolean;
  fadedMarkerIds?: Set<number>;
  fogMode?: boolean;
  isSecretEntry?: (codexId?: number) => boolean;
  showHeatmap?: boolean;
  regionAnalytics?: RegionAnalytic[];
  presenceIndex?: PresenceIndex | null;
  onOpenSubMap?: (mapId: number) => void;
  parentMap?: AtlasMap | null;
  onReturnToParent?: () => void;
}

export default function MapCanvas({
  map,
  markers,
  drawMode,
  selectedMarkerId,
  editing,
  colorFor,
  titleFor,
  onCreateGeometry,
  onMarkerClick,
  onGeometryChange,
  onDraftChange,
  orphanMarkerIds,
  highlightOrphans,
  fadedMarkerIds,
  fogMode,
  isSecretEntry,
  showHeatmap,
  regionAnalytics,
  presenceIndex,
  onOpenSubMap,
  parentMap,
  onReturnToParent,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const editLayerRef = useRef<L.LayerGroup | null>(null);
  const draftPointsRef = useRef<MapPoint[]>([]);

  // Callback & data terbaru lewat ref → handler Leaflet imperatif tak jadi basi
  // tanpa memasang-ulang listener tiap render.
  const propsRef = useRef({
    colorFor,
    titleFor,
    onCreateGeometry,
    onMarkerClick,
    onGeometryChange,
    onDraftChange,
    drawMode,
    selectedMarkerId,
    orphanMarkerIds,
    highlightOrphans,
    fadedMarkerIds,
    fogMode,
    isSecretEntry,
    onOpenSubMap,
    parentMap,
    onReturnToParent,
  });
  propsRef.current = {
    colorFor,
    titleFor,
    onCreateGeometry,
    onMarkerClick,
    onGeometryChange,
    onDraftChange,
    drawMode,
    selectedMarkerId,
    orphanMarkerIds,
    highlightOrphans,
    fadedMarkerIds,
    fogMode,
    isSecretEntry,
    onOpenSubMap,
    parentMap,
    onReturnToParent,
  };

  // --- Inisialisasi peta (sekali per gambar/peta) ---
  useEffect(() => {
    if (!containerRef.current) return;
    const w = map.width || 1;
    const h = map.height || 1;
    const bounds: L.LatLngBoundsLiteral = [
      [0, 0],
      [h, w],
    ];

    const leaflet = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -5,
      zoomSnap: 0.25,
      attributionControl: false,
      // Kontrol dobel-klik dikelola manual saat menggambar area/rute.
      doubleClickZoom: true,
    });
    mapRef.current = leaflet;

    const objectUrl = URL.createObjectURL(map.imageBlob);
    L.imageOverlay(objectUrl, bounds).addTo(leaflet);
    leaflet.fitBounds(bounds);
    leaflet.setMaxBounds(leaflet.getBounds().pad(0.5));

    heatLayerRef.current = L.layerGroup().addTo(leaflet);
    markerLayerRef.current = L.layerGroup().addTo(leaflet);
    draftLayerRef.current = L.layerGroup().addTo(leaflet);
    editLayerRef.current = L.layerGroup().addTo(leaflet);

    return () => {
      URL.revokeObjectURL(objectUrl);
      leaflet.remove();
      mapRef.current = null;
      heatLayerRef.current = null;
      markerLayerRef.current = null;
      draftLayerRef.current = null;
      editLayerRef.current = null;
      draftPointsRef.current = [];
    };
  }, [map.id, map.imageBlob, map.width, map.height]);

  // --- Pan / pusatkan kamera saat penanda dipilih (mis. dari deep-link Codex atau katalog sidebar) ---
  useEffect(() => {
    if (!selectedMarkerId || !mapRef.current) return;
    const m = markers.find((mk) => mk.id === selectedMarkerId);
    if (!m) return;
    const w = map.width || 1;
    const h = map.height || 1;
    let targetLatLng: L.LatLngTuple | null = null;
    if (m.kind === 'pin' && isPointGeometry(m.geometry)) {
      targetLatLng = relToLatLng(m.geometry, w, h);
    } else if (Array.isArray(m.geometry) && m.geometry.length > 0) {
      // Hitung titik pusat bounding box poligon/rute secara presisi
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const pt of m.geometry) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      targetLatLng = relToLatLng({ x: centerX, y: centerY }, w, h);
    }
    if (targetLatLng) {
      const leaflet = mapRef.current;
      const currentZoom = leaflet.getZoom();
      // Bila zoom terlalu jauh ke luar (kurang dari -0.5), zoom in agar objek langsung terlihat sangat jelas
      if (currentZoom < -0.5) {
        leaflet.flyTo(targetLatLng, -0.25, { animate: true, duration: 0.6 });
      } else {
        leaflet.panTo(targetLatLng, { animate: true, duration: 0.5 });
      }
    }
  }, [selectedMarkerId, map.width, map.height]);

  // --- Render layer heatmap (intensitas aktivitas cerita) ---
  useEffect(() => {
    const heatLayer = heatLayerRef.current;
    if (!heatLayer) return;
    heatLayer.clearLayers();
    if (!showHeatmap) return;

    const w = map.width || 1;
    const h = map.height || 1;

    // 1. Heat circle untuk wilayah berdasarkan score aktivitas
    if (regionAnalytics) {
      for (const reg of regionAnalytics) {
        if (reg.score <= 0) continue;
        const areaMarker = markers.find((m) => m.id === reg.markerId);
        if (!areaMarker || !Array.isArray(areaMarker.geometry) || areaMarker.geometry.length === 0) continue;

        let sumX = 0;
        let sumY = 0;
        const pts = areaMarker.geometry as MapPoint[];
        for (const p of pts) {
          sumX += p.x;
          sumY += p.y;
        }
        const centroid: MapPoint = { x: sumX / pts.length, y: sumY / pts.length };
        const centerLatLng = relToLatLng(centroid, w, h);

        const radius = Math.min(100, Math.max(20, Math.sqrt(reg.score) * 16));
        const heatColor = reg.score > 10 ? '#dc2626' : reg.score > 3 ? '#f97316' : '#eab308';

        L.circleMarker(centerLatLng, {
          radius,
          color: heatColor,
          weight: 0,
          fillColor: heatColor,
          fillOpacity: 0.35,
          interactive: false,
        }).addTo(heatLayer);
      }
    }

    // 2. Heat circle untuk pin dengan sebutan dalam naskah
    if (presenceIndex) {
      for (const m of markers) {
        if (m.kind !== 'pin' || !isPointGeometry(m.geometry) || !m.codexId) continue;
        const p = presenceIndex.byEntity.get(m.codexId);
        const mentions = p?.mentions ?? 0;
        if (mentions <= 0) continue;

        const pinLatLng = relToLatLng(m.geometry, w, h);
        const radius = Math.min(60, Math.max(14, Math.sqrt(mentions) * 10));
        const heatColor = mentions > 10 ? '#dc2626' : mentions > 3 ? '#ea580c' : '#f59e0b';

        L.circleMarker(pinLatLng, {
          radius,
          color: heatColor,
          weight: 0,
          fillColor: heatColor,
          fillOpacity: 0.3,
          interactive: false,
        }).addTo(heatLayer);
      }
    }
  }, [showHeatmap, regionAnalytics, presenceIndex, markers, map.width, map.height]);

  // --- Render penanda tersimpan ---
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const w = map.width || 1;
    const h = map.height || 1;

    for (const m of markers) {
      // Penanda yang sedang diedit digambar di editLayer (dengan handle) — lewati di sini.
      if (editing && m.id === selectedMarkerId) continue;
      const selected = m.id === selectedMarkerId;

      const isOrphan = orphanMarkerIds?.has(m.id ?? 0);
      const isFaded = fadedMarkerIds?.has(m.id ?? 0);
      const isSecret = !!(fogMode && isSecretEntry?.(m.codexId));
      const ghosted = highlightOrphans ? !isOrphan : isFaded;
      const hasSubMap = m.linkedMapId != null;

      const color = isSecret ? FOG_HEX : safeAtlasColor(propsRef.current.colorFor(m));
      const displayTitle = propsRef.current.titleFor
        ? propsRef.current.titleFor(m)
        : (isSecret ? '??? (Lokasi Rahasia)' : (m.title || (m.kind === 'area' ? 'Wilayah' : m.kind === 'route' ? 'Rute' : 'Lokasi')));

      let shape: L.Layer | null = null;

      if (m.kind === 'pin' && isPointGeometry(m.geometry)) {
        if (ghosted) {
          shape = L.circleMarker(relToLatLng(m.geometry, w, h), {
            radius: 5,
            color: '#94a3b8',
            weight: 1,
            fillColor: '#cbd5e1',
            fillOpacity: 0.25,
            opacity: 0.3,
          });
        } else if (selected) {
          // PIN TERPILIH: Sangat menonjol dengan Radar Wave, Halo Amber, dan Floating Pill Nama
          shape = L.marker(relToLatLng(m.geometry, w, h), {
            icon: selectedPinIcon(color, displayTitle, hasSubMap),
            zIndexOffset: 1000,
          });
        } else if (highlightOrphans && isOrphan) {
          shape = L.marker(relToLatLng(m.geometry, w, h), {
            icon: regularPinIcon(color, true),
          });
        } else if (hasSubMap) {
          shape = L.marker(relToLatLng(m.geometry, w, h), {
            icon: portalPinIcon(color, false),
          });
        } else {
          shape = L.marker(relToLatLng(m.geometry, w, h), {
            icon: regularPinIcon(color, false),
          });
        }
      } else if (m.kind === 'area' && Array.isArray(m.geometry)) {
        if (ghosted) {
          shape = L.polygon(relPathToLatLngs(m.geometry, w, h), {
            color: '#94a3b8',
            weight: 1,
            fillColor: '#cbd5e1',
            fillOpacity: 0.05,
            opacity: 0.2,
          });
        } else if (highlightOrphans && isOrphan) {
          shape = L.polygon(relPathToLatLngs(m.geometry, w, h), {
            color: '#f59e0b',
            weight: selected ? 4 : 2.5,
            dashArray: '6 4',
            fillColor: '#f59e0b',
            fillOpacity: selected ? 0.38 : 0.22,
          });
        } else {
          const latlngs = relPathToLatLngs(m.geometry, w, h);
          shape = L.polygon(latlngs, {
            color: selected ? '#f59e0b' : (hasSubMap ? '#6366f1' : color),
            weight: selected ? 4 : (hasSubMap ? 2.5 : 2),
            dashArray: selected ? '8 4' : (isSecret ? '5 5' : (hasSubMap ? '6 3' : undefined)),
            fillColor: color,
            fillOpacity: selected ? 0.38 : (isSecret ? 0.12 : (hasSubMap ? 0.25 : 0.18)),
          });

          // Badge di pusat area: jika memiliki sub-peta atau sedang terpilih
          if (latlngs.length >= 3) {
            const polyCenter = (shape as L.Polygon).getBounds().getCenter();
            if (hasSubMap) {
              const badge = L.marker(polyCenter, {
                icon: portalAreaBadgeIcon(displayTitle || 'Sub-Peta', selected),
                zIndexOffset: selected ? 900 : 0,
                keyboard: false,
              });
              badge.on('click', (e) => {
                L.DomEvent.stopPropagation(e as unknown as Event);
                propsRef.current.onMarkerClick(m);
              });
              badge.on('dblclick', (e) => {
                L.DomEvent.stopPropagation(e as unknown as Event);
                propsRef.current.onOpenSubMap?.(m.linkedMapId!);
              });
              if (!selected) {
                badge.bindTooltip(atlasText(displayTitle + ' (↗ Dobel-klik: Buka Sub-Peta)'), { direction: 'top', offset: [0, -8] });
              }
              badge.addTo(layer);
            } else if (selected) {
              // Jika area biasa tapi sedang terpilih: tampilkan badge nama wilayah di pusat
              const badge = L.marker(polyCenter, {
                icon: selectedAreaBadgeIcon(displayTitle),
                zIndexOffset: 900,
                keyboard: false,
              });
              badge.on('click', (e) => {
                L.DomEvent.stopPropagation(e as unknown as Event);
                propsRef.current.onMarkerClick(m);
              });
              badge.addTo(layer);
            }
          }
        }
      } else if (m.kind === 'route' && Array.isArray(m.geometry)) {
        if (ghosted) {
          shape = L.polyline(relPathToLatLngs(m.geometry, w, h), {
            color: '#94a3b8',
            weight: 2,
            opacity: 0.2,
          });
        } else if (highlightOrphans && isOrphan) {
          shape = L.polyline(relPathToLatLngs(m.geometry, w, h), {
            color: '#f59e0b',
            weight: selected ? 6 : 4,
            dashArray: '8 4',
            opacity: 1,
          });
        } else {
          shape = L.polyline(relPathToLatLngs(m.geometry, w, h), {
            color: selected ? '#f59e0b' : color,
            weight: selected ? 5.5 : 3.5,
            dashArray: selected ? '8 4' : undefined,
            opacity: 0.9,
          });

          if (selected && Array.isArray(m.geometry) && m.geometry.length >= 2) {
            const routeBounds = (shape as L.Polyline).getBounds();
            const routeCenter = routeBounds.getCenter();
            const badge = L.marker(routeCenter, {
              icon: selectedRouteBadgeIcon(displayTitle),
              zIndexOffset: 900,
              keyboard: false,
            });
            badge.on('click', (e) => {
              L.DomEvent.stopPropagation(e as unknown as Event);
              propsRef.current.onMarkerClick(m);
            });
            badge.addTo(layer);
          }
        }
      }

      if (shape) {
        shape.on('click', (e) => {
          L.DomEvent.stopPropagation(e as unknown as Event);
          propsRef.current.onMarkerClick(m);
        });
        shape.on('dblclick', (e) => {
          L.DomEvent.stopPropagation(e as unknown as Event);
          if (hasSubMap) {
            propsRef.current.onOpenSubMap?.(m.linkedMapId!);
          } else {
            propsRef.current.onMarkerClick(m);
          }
        });
        // Tooltip hover hanya ditampilkan saat penanda TIDAK sedang dipilih.
        // Saat dipilih, penanda sudah memiliki floating pill badge permanen yang jelas,
        // sehingga tooltip hover tidak lagi tumpang-tindih atau menghalangi nama penanda.
        if (displayTitle && !selected) {
          const tooltipText = displayTitle + (hasSubMap ? ' (↗ Dobel-klik: Buka Sub-Peta)' : '');
          (shape as any).bindTooltip?.(atlasText(tooltipText), {
            direction: 'top',
            offset: m.kind === 'pin' ? [0, -14] : [0, -6],
          });
        }
        shape.addTo(layer);
      }
    }
  }, [markers, selectedMarkerId, editing, map.width, map.height, map.id, orphanMarkerIds, highlightOrphans, fadedMarkerIds, fogMode]);

  // --- Mode edit geometri penanda terpilih ---
  useEffect(() => {
    const leaflet = mapRef.current;
    const editLayer = editLayerRef.current;
    if (!leaflet || !editLayer) return;
    editLayer.clearLayers();

    const marker = editing && selectedMarkerId != null ? markers.find((m) => m.id === selectedMarkerId) : undefined;
    if (!marker || marker.id == null) return;

    const w = map.width || 1;
    const h = map.height || 1;
    const color = safeAtlasColor(propsRef.current.colorFor(marker));
    const persist = (geom: MapPoint | MapPoint[]) => propsRef.current.onGeometryChange?.(marker.id!, geom);

    // Pin: satu handle yang bisa diseret.
    if (marker.kind === 'pin' && isPointGeometry(marker.geometry)) {
      const handle = L.marker(relToLatLng(marker.geometry, w, h), { draggable: true, icon: vertexIcon(color) });
      handle.on('dragend', () => {
        const ll = handle.getLatLng();
        persist(latLngToRel([ll.lat, ll.lng], w, h));
      });
      handle.addTo(editLayer);
      return;
    }

    // Area/rute: handle per vertex (seret), handle titik-tengah (sisip), klik-kanan (hapus).
    if (Array.isArray(marker.geometry)) {
      const isArea = marker.kind === 'area';
      const minPoints = isArea ? 3 : 2;
      const points: MapPoint[] = marker.geometry.map((p) => ({ ...p }));
      let shape: L.Polyline | L.Polygon;

      const rebuild = () => {
        editLayer.clearLayers();
        const latlngs = relPathToLatLngs(points, w, h);
        shape = (isArea
          ? L.polygon(latlngs, { color, weight: 3, fillColor: color, fillOpacity: 0.25 })
          : L.polyline(latlngs, { color, weight: 4, opacity: 0.9 })
        ).addTo(editLayer);

        // Handle titik-tengah tiap segmen (poligon: termasuk segmen penutup).
        const segCount = isArea ? points.length : points.length - 1;
        for (let i = 0; i < segCount; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const mh = L.marker(relToLatLng(mid, w, h), { icon: midIcon(), keyboard: false });
          mh.on('click', (e) => {
            L.DomEvent.stop(e as unknown as Event);
            points.splice(i + 1, 0, mid);
            persist([...points]);
            rebuild();
          });
          mh.bindTooltip('Klik untuk menambah titik', { direction: 'top' });
          mh.addTo(editLayer);
        }

        // Handle vertex (di atas titik-tengah agar mudah dipilih).
        points.forEach((p, i) => {
          const vh = L.marker(relToLatLng(p, w, h), { draggable: true, icon: vertexIcon(color), keyboard: false });
          vh.on('drag', () => {
            const ll = vh.getLatLng();
            points[i] = latLngToRel([ll.lat, ll.lng], w, h);
            shape.setLatLngs(relPathToLatLngs(points, w, h));
          });
          vh.on('dragend', () => persist([...points]));
          vh.on('contextmenu', (e) => {
            L.DomEvent.stop(e as unknown as Event);
            if (points.length > minPoints) {
              points.splice(i, 1);
              persist([...points]);
              rebuild();
            }
          });
          vh.bindTooltip('Seret memindah · klik-kanan menghapus', { direction: 'top' });
          vh.addTo(editLayer);
        });
      };

      rebuild();
    }

    return () => {
      editLayer.clearLayers();
    };
  }, [editing, selectedMarkerId, markers, map.width, map.height, map.id]);

  // --- Mode menggambar ---
  useEffect(() => {
    const leaflet = mapRef.current;
    const draftLayer = draftLayerRef.current;
    if (!leaflet || !draftLayer) return;

    const w = map.width || 1;
    const h = map.height || 1;
    draftPointsRef.current = [];
    draftLayer.clearLayers();
    propsRef.current.onDraftChange?.(0);

    if (!drawMode) {
      leaflet.getContainer().style.cursor = '';
      return;
    }
    leaflet.getContainer().style.cursor = 'crosshair';
    // Dobel-klik menutup poligon/polyline → matikan zoom-nya selama menggambar.
    if (drawMode !== 'pin') leaflet.doubleClickZoom.disable();

    const redrawDraft = () => {
      draftLayer.clearLayers();
      const pts = draftPointsRef.current;
      if (!pts.length) return;
      const latlngs = relPathToLatLngs(pts, w, h);
      for (const ll of latlngs) {
        L.circleMarker(ll, { radius: 4, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1, weight: 1 }).addTo(draftLayer);
      }
      if (pts.length >= 2) {
        if (drawMode === 'area') {
          L.polygon(latlngs, { color: '#2563eb', weight: 2, fillOpacity: 0.15, dashArray: '4 4' }).addTo(draftLayer);
        } else if (drawMode === 'scale') {
          L.polyline(latlngs, { color: '#f59e0b', weight: 3, dashArray: '4 4' }).addTo(draftLayer);
        } else {
          L.polyline(latlngs, { color: '#2563eb', weight: 2, dashArray: '4 4' }).addTo(draftLayer);
        }
      }
    };

    const finishShape = () => {
      const pts = draftPointsRef.current;
      const min = drawMode === 'area' ? 3 : 2;
      if (pts.length >= min) {
        propsRef.current.onCreateGeometry([...pts]);
      }
      draftPointsRef.current = [];
      draftLayer.clearLayers();
      propsRef.current.onDraftChange?.(0);
    };

    const onClick = (e: L.LeafletMouseEvent) => {
      const rel = latLngToRel([e.latlng.lat, e.latlng.lng], w, h);
      if (drawMode === 'pin') {
        propsRef.current.onCreateGeometry(rel);
        return;
      }
      draftPointsRef.current.push(rel);
      propsRef.current.onDraftChange?.(draftPointsRef.current.length);
      redrawDraft();
      
      // Auto finish for scale when 2 points are reached
      if (drawMode === 'scale' && draftPointsRef.current.length === 2) {
         finishShape();
      }
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      if (drawMode === 'pin') return;
      L.DomEvent.stop(e as unknown as Event);
      finishShape();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        draftPointsRef.current = [];
        draftLayer.clearLayers();
        propsRef.current.onDraftChange?.(0);
      } else if (ev.key === 'Enter') {
        finishShape();
      }
    };

    leaflet.on('click', onClick);
    leaflet.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);

    return () => {
      leaflet.off('click', onClick);
      leaflet.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKey);
      leaflet.doubleClickZoom.enable();
      leaflet.getContainer().style.cursor = '';
      draftLayer.clearLayers();
      draftPointsRef.current = [];
    };
  }, [drawMode, map.width, map.height, map.id]);

  // Pan halus ke penanda saat selectedMarkerId berubah dari luar (mis. kembali lewat breadcrumb / Codex)
  const lastSelectedMarkerIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (selectedMarkerId == null) {
      lastSelectedMarkerIdRef.current = undefined;
      return;
    }
    if (lastSelectedMarkerIdRef.current !== selectedMarkerId) {
      lastSelectedMarkerIdRef.current = selectedMarkerId;
      const marker = markers.find((m) => m.id === selectedMarkerId);
      const leaflet = mapRef.current;
      if (!marker || !leaflet) return;

      const w = map.width || 1;
      const h = map.height || 1;
      let targetLatLng: L.LatLng | null = null;

      if (marker.kind === 'pin' && isPointGeometry(marker.geometry)) {
        const tuple = relToLatLng(marker.geometry, w, h);
        targetLatLng = L.latLng(tuple[0], tuple[1]);
      } else if (Array.isArray(marker.geometry) && marker.geometry.length > 0) {
        const bounds = L.latLngBounds(relPathToLatLngs(marker.geometry, w, h));
        targetLatLng = bounds.getCenter();
      }

      if (targetLatLng) {
        if (!leaflet.getBounds().contains(targetLatLng)) {
          leaflet.panTo(targetLatLng, { animate: true, duration: 0.5 });
        }
      }
    }
  }, [selectedMarkerId, markers, map.width, map.height]);

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <div ref={containerRef} className="h-full w-full bg-neutral-100 dark:bg-neutral-900" />
      {/* Floating Return Pill ke Peta Induk */}
      {parentMap && onReturnToParent && (
        <div className="absolute top-3 left-14 z-[400] flex items-center pointer-events-auto">
          <button
            onClick={onReturnToParent}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 backdrop-blur-md border border-slate-200 dark:border-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group"
            title={`Kembali ke peta induk: ${parentMap.name}`}
          >
            <ArrowLeft size={14} className="text-indigo-400 group-hover:-translate-x-0.5 transition-transform" />
            <span>
              Kembali ke <span className="text-indigo-300 font-bold">{parentMap.name}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
