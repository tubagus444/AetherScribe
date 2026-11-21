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

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft } from 'lucide-react';
import { AtlasMap, MapMarker, MapPoint, MapVertex, RoutePoint, RouteStyle } from '@/src/types';
import {
  relToLatLng,
  relPathToLatLngs,
  latLngToRel,
  isPointGeometry,
  sampleRoutePath,
  sampleAreaBoundary,
  showsIntermediateRoutePoints,
} from '@/src/lib/mapGeometry';
import { RegionAnalytic } from '@/src/lib/atlasAnalytics';
import { PresenceIndex } from '@/src/lib/continuity';
import { FOG_HEX, safeAtlasColor } from '@/src/lib/atlasColors';
import { vertexId, routePointVisible, type AreaPointEdit, type RoutePointEdit, type VertexEdit } from '@/src/lib/atlasRoutePoints';
import { useAreaBoundaryCrossing } from '@/src/features/atlas/hooks/useAreaBoundaryCrossing';
import { atlasText, vertexIcon, midIcon, routePointIcon, regularPinIcon, portalPinIcon, portalAreaBadgeIcon, selectedPinIcon, selectedAreaBadgeIcon, selectedRouteBadgeIcon } from './atlasMarkerIcons';

export type DrawMode = 'pin' | 'area' | 'route' | 'scale' | null;

export interface MapCanvasHandle {
  undoDraftPoint: () => void;
  toggleLastDraftCorner: () => void;
  centerMarker: (markerId: number) => void;
}

interface MapCanvasProps {
  ref?: Ref<MapCanvasHandle>;
  map: AtlasMap;
  /** Penanda yang SUDAH difilter oleh pemanggil (data tetap penuh di store). */
  markers: MapMarker[];
  drawMode: DrawMode;
  draftRouteStyle?: RouteStyle;
  draftAreaStyle?: RouteStyle;
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
  onMapBackgroundClick?: () => void;
  onEscape?: () => boolean;
  /** Dipanggil saat geometri penanda diubah lewat edit (persist di dragend/ubah struktur). */
  onGeometryChange?: (markerId: number, geometry: MapPoint | MapPoint[]) => void;
  focusedVertexId?: string;
  onFocusVertex?: (markerId: number, pointId: string) => void;
  onEditRoutePoint?: (markerId: number, edit: RoutePointEdit) => void;
  onEditAreaPoint?: (markerId: number, edit: AreaPointEdit) => void;
  titleForRoutePoint?: (point: RoutePoint) => string | undefined;
  /** Progres gambar area/rute (jumlah titik draft) — untuk hint UI. */
  onDraftChange?: (points: number, lastSharp?: boolean) => void;
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
  ref,
  map,
  markers,
  drawMode,
  draftRouteStyle,
  draftAreaStyle,
  selectedMarkerId,
  editing,
  colorFor,
  titleFor,
  onCreateGeometry,
  onMarkerClick,
  onMapBackgroundClick,
  onEscape,
  onGeometryChange,
  focusedVertexId,
  onFocusVertex,
  onEditRoutePoint,
  onEditAreaPoint,
  titleForRoutePoint,
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
  const draftPointsRef = useRef<MapVertex[]>([]);
  const { crossing, check: checkAreaBoundary } = useAreaBoundaryCrossing();

  // Callback & data terbaru lewat ref → handler Leaflet imperatif tak jadi basi
  // tanpa memasang-ulang listener tiap render.
  const propsRef = useRef({
    colorFor,
    titleFor,
    onCreateGeometry,
    onMarkerClick,
    onMapBackgroundClick,
    onEscape,
    onGeometryChange,
    onFocusVertex,
    onEditRoutePoint,
    onEditAreaPoint,
    onDraftChange,
    drawMode,
    draftRouteStyle,
    draftAreaStyle,
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
    onMapBackgroundClick,
    onEscape,
    onGeometryChange,
    onFocusVertex,
    onEditRoutePoint,
    onEditAreaPoint,
    onDraftChange,
    drawMode,
    draftRouteStyle,
    draftAreaStyle,
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
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => leaflet.invalidateSize({ pan: false, debounceMoveend: true }))
      : undefined;
    resizeObserver?.observe(leaflet.getContainer());

    return () => {
      resizeObserver?.disconnect();
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
    const visiblePinIds = new Set(markers.filter(marker => marker.kind === 'pin').map(marker => marker.id));

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
        const latlngs = relPathToLatLngs(sampleAreaBoundary(m.geometry, m.meta?.areaStyle), w, h);
        if (ghosted) {
          shape = L.polygon(latlngs, {
            smoothFactor: 0,
            color: '#94a3b8',
            weight: 1,
            fillColor: '#cbd5e1',
            fillOpacity: 0.05,
            opacity: 0.2,
          });
        } else if (highlightOrphans && isOrphan) {
          shape = L.polygon(latlngs, {
            smoothFactor: 0,
            color: '#f59e0b',
            weight: selected ? 4 : 2.5,
            dashArray: '6 4',
            fillColor: '#f59e0b',
            fillOpacity: selected ? 0.38 : 0.22,
          });
        } else {
          shape = L.polygon(latlngs, {
            smoothFactor: 0,
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
        const orphanHighlighted = highlightOrphans && isOrphan;
        const routeColor = ghosted ? '#94a3b8' : selected || orphanHighlighted ? '#f59e0b' : color;
        const path = sampleRoutePath(m.geometry, m.meta?.routeStyle);
        const route = L.polyline(relPathToLatLngs(path, w, h), {
          color: routeColor,
          weight: ghosted ? 2 : orphanHighlighted ? (selected ? 6 : 4) : selected ? 5.5 : 3.5,
          dashArray: !ghosted && (selected || orphanHighlighted) ? '8 4' : undefined,
          opacity: ghosted ? 0.2 : orphanHighlighted ? 1 : 0.9,
          smoothFactor: 0,
        });
        shape = route;

        const lastIndex = m.geometry.length - 1;
        const showIntermediatePoints = showsIntermediateRoutePoints(m.meta);
        let visibleNumber = 0;
        m.geometry.forEach((point, index) => {
          const kind = index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle';
          const visible = routePointVisible(point, index, lastIndex + 1, showIntermediatePoints);
          if (!visible || (point.pinId !== undefined && visiblePinIds.has(point.pinId))) return;
          visibleNumber++;
          const title = !isSecret ? titleForRoutePoint?.(point) : undefined;
          const vertex = L.marker(relToLatLng(point, w, h), {
            icon: routePointIcon(routeColor, kind, selected ? visibleNumber : undefined),
            interactive: title !== undefined,
            keyboard: false,
            opacity: ghosted ? 0.25 : 1,
          });
          if (title) {
            vertex.bindTooltip(atlasText(title), { direction: 'top' });
            vertex.on('click', () => {
              propsRef.current.onMarkerClick(m);
              if (m.id !== undefined) propsRef.current.onFocusVertex?.(m.id, vertexId(point, index));
            });
          }
          vertex.addTo(layer);
        });

        if (selected && !ghosted && !orphanHighlighted && lastIndex >= 1) {
          const badge = L.marker(route.getBounds().getCenter(), {
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
  }, [markers, selectedMarkerId, editing, map.width, map.height, map.id, orphanMarkerIds, highlightOrphans, fadedMarkerIds, fogMode, titleForRoutePoint]);

  // --- Mode edit geometri penanda terpilih ---
  useEffect(() => {
    const leaflet = mapRef.current;
    const editLayer = editLayerRef.current;
    if (!leaflet || !editLayer) return;
    editLayer.clearLayers();

    const marker = editing && selectedMarkerId != null ? markers.find((m) => m.id === selectedMarkerId) : undefined;
    if (!marker || marker.id == null) return;
    const markerId = marker.id;

    const w = map.width || 1;
    const h = map.height || 1;
    const color = safeAtlasColor(propsRef.current.colorFor(marker));
    const persist = (geom: MapPoint | MapPoint[]) => propsRef.current.onGeometryChange?.(markerId, geom);

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
      const isRoute = marker.kind === 'route';
      const minPoints = isArea ? 3 : 2;
      const points = marker.geometry.map((p) => ({ ...p }));
      const getPath = () => isArea ? sampleAreaBoundary(points, marker.meta?.areaStyle) : sampleRoutePath(points, marker.meta?.routeStyle);
      const editVertex = (edit: VertexEdit) => {
        const handler = isArea ? propsRef.current.onEditAreaPoint : propsRef.current.onEditRoutePoint;
        handler?.(markerId, edit);
        return handler !== undefined;
      };

      const rebuild = () => {
        editLayer.clearLayers();
        const path = getPath();
        if (isArea) checkAreaBoundary(path);
        const latlngs = relPathToLatLngs(path, w, h);
        const shape = (isArea
          ? L.polygon(latlngs, { color, weight: 3, fillColor: color, fillOpacity: 0.25, smoothFactor: 0 })
          : L.polyline(latlngs, { color, weight: 4, opacity: 0.9, smoothFactor: 0 })
        ).addTo(editLayer);

        // Handle titik-tengah tiap segmen (poligon: termasuk segmen penutup).
        const segCount = isArea ? points.length : points.length - 1;
        for (let i = 0; i < segCount; i++) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          const mid = path.length === points.length
            ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
            : path[(i + 0.5) * (path.length - (isArea ? 0 : 1)) / segCount];
          const mh = L.marker(relToLatLng(mid, w, h), { icon: midIcon(), keyboard: false });
          mh.on('click', (e) => {
            L.DomEvent.stop(e as unknown as Event);
            if (editVertex({ kind: 'insert', after: vertexId(a, i), position: mid })) return;
            points.splice(i + 1, 0, mid);
            persist([...points]);
            rebuild();
          });
          mh.bindTooltip('Klik untuk menambah titik', { direction: 'top' });
          mh.addTo(editLayer);
        }

        // Handle vertex (di atas titik-tengah agar mudah dipilih).
        points.forEach((p, i) => {
          const pointId = vertexId(p, i);
          const linked = isRoute && p.pinId !== undefined;
          const vh = L.marker(relToLatLng(p, w, h), {
            draggable: !linked, icon: vertexIcon(color, i + 1, isArea && p.sharp), keyboard: false,
          });
          vh.on('click', (e: L.LeafletMouseEvent) => {
            propsRef.current.onFocusVertex?.(markerId, pointId);
            if (isArea && e.originalEvent?.shiftKey && e.originalEvent.detail <= 1) {
              propsRef.current.onEditAreaPoint?.(markerId, { kind: 'corner', pointId, sharp: !p.sharp });
            }
          });
          if (isArea) vh.on('dragstart', () => checkAreaBoundary([]));
          vh.on('drag', () => {
            const ll = vh.getLatLng();
            points[i] = { ...points[i], ...latLngToRel([ll.lat, ll.lng], w, h) };
            shape.setLatLngs(relPathToLatLngs(getPath(), w, h));
          });
          vh.on('dragend', () => {
            if (!editVertex({ kind: 'move', pointId, position: points[i] })) {
              if (isArea) checkAreaBoundary(getPath());
              persist([...points]);
            }
          });
          vh.on('contextmenu', (e) => {
            L.DomEvent.stop(e as unknown as Event);
            if (points.length > minPoints) {
              if (editVertex({ kind: 'remove', pointId })) return;
              points.splice(i, 1);
              persist([...points]);
              rebuild();
            }
          });
          vh.bindTooltip(linked ? 'Klik untuk mengatur titik tertaut' : 'Seret memindah · klik-kanan menghapus', { direction: 'top' });
          vh.addTo(editLayer);
        });
      };

      rebuild();
    }

    return () => {
      editLayer.clearLayers();
      if (marker.kind === 'area') checkAreaBoundary([]);
    };
  }, [editing, selectedMarkerId, markers, map.width, map.height, map.id, checkAreaBoundary]);

  const focusedMarker = markers.find(marker => marker.id === selectedMarkerId);
  const focusedPoint = focusedVertexId !== undefined && Array.isArray(focusedMarker?.geometry)
    ? focusedMarker.geometry.find((point, index) => vertexId(point, index) === focusedVertexId)
    : undefined;
  const focusedX = focusedPoint?.x;
  const focusedY = focusedPoint?.y;
  useEffect(() => {
    const leaflet = mapRef.current;
    if (!leaflet || focusedX === undefined || focusedY === undefined) return;
    const position = relToLatLng({ x: focusedX, y: focusedY }, map.width || 1, map.height || 1);
    const ring = L.circleMarker(position, {
      radius: 14, color: '#f59e0b', weight: 3, fill: false, interactive: false,
    }).addTo(leaflet);
    if (!leaflet.getBounds().pad(-0.15).contains(position)) leaflet.panTo(position);
    return () => { ring.remove(); };
  }, [focusedVertexId, focusedX, focusedY, map.width, map.height, map.id, map.imageBlob]);

  const isDrawingOrEditingArea = drawMode === 'area' || (editing && focusedMarker?.kind === 'area');
  useEffect(() => {
    const leaflet = mapRef.current;
    if (!leaflet || !isDrawingOrEditingArea) return;
    const container = leaflet.getContainer();
    const boxZoomWasEnabled = leaflet.boxZoom.enabled();
    if (boxZoomWasEnabled) leaflet.boxZoom.disable();

    const preventShiftDoubleClick = (event: MouseEvent) => {
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Tangkap sebelum Leaflet menganggap klik cepat sebagai zoom out atau akhir draf.
    container.addEventListener('dblclick', preventShiftDoubleClick, true);
    return () => {
      container.removeEventListener('dblclick', preventShiftDoubleClick, true);
      if (boxZoomWasEnabled && mapRef.current === leaflet) leaflet.boxZoom.enable();
    };
  }, [isDrawingOrEditingArea, map.id, map.imageBlob, map.width, map.height]);

  useEffect(() => {
    const leaflet = mapRef.current;
    if (!leaflet || !crossing || !isDrawingOrEditingArea) return;
    const marker = L.circleMarker(relToLatLng(crossing, map.width || 1, map.height || 1), {
      radius: 7, color: '#fff', fillColor: '#dc2626', fillOpacity: 1, weight: 2,
      className: 'atlas-area-crossing', interactive: false,
    }).addTo(leaflet);
    return () => { marker.remove(); };
  }, [crossing, isDrawingOrEditingArea, map.width, map.height, map.id, map.imageBlob]);

  const redrawDraft = useCallback(() => {
    const layer = draftLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const points = draftPointsRef.current;
    if (!drawMode) return;

    const w = map.width || 1;
    const h = map.height || 1;
    const path = drawMode === 'area'
      ? sampleAreaBoundary(points, propsRef.current.draftAreaStyle)
      : sampleRoutePath(points, drawMode === 'route' ? propsRef.current.draftRouteStyle : undefined);
    if (drawMode === 'area') checkAreaBoundary(path);
    if (!points.length) return;
    const latlngs = relPathToLatLngs(path, w, h);
    const color = drawMode === 'scale' ? '#f59e0b' : '#2563eb';
    if (points.length >= 2) {
      const options = { color, weight: drawMode === 'scale' ? 3 : 2, dashArray: '4 4', interactive: false };
      if (drawMode === 'area' && points.length >= 3) {
        L.polygon(latlngs, { ...options, fillOpacity: 0.15, smoothFactor: 0 }).addTo(layer);
      } else {
        L.polyline(latlngs, { ...options, smoothFactor: 0 }).addTo(layer);
      }
    }
    for (const point of points) {
      L.circleMarker(relToLatLng(point, w, h), {
        radius: point.sharp ? 6 : 4,
        color: '#fff', fillColor: point.sharp ? '#f59e0b' : color, fillOpacity: 1, weight: 1, interactive: false,
      }).addTo(layer);
    }
  }, [drawMode, map.width, map.height, checkAreaBoundary]);

  const updateDraft = useCallback(() => {
    const points = draftPointsRef.current;
    propsRef.current.onDraftChange?.(points.length, points.at(-1)?.sharp);
    redrawDraft();
  }, [redrawDraft]);

  const undoDraftPoint = useCallback(() => {
    if ((drawMode !== 'route' && drawMode !== 'area') || !draftPointsRef.current.length) return;
    draftPointsRef.current.pop();
    updateDraft();
  }, [drawMode, updateDraft]);

  const toggleLastDraftCorner = useCallback(() => {
    const last = draftPointsRef.current.at(-1);
    if (drawMode !== 'area' || !last) return;
    last.sharp = !last.sharp;
    updateDraft();
  }, [drawMode, updateDraft]);

  const centerMarker = useCallback((markerId: number, onlyIfOutside = false) => {
    const leaflet = mapRef.current;
    const marker = markers.find(candidate => candidate.id === markerId);
    if (!leaflet || !marker) return;
    const w = map.width || 1;
    const h = map.height || 1;
    if (!Array.isArray(marker.geometry)) {
      const point = relToLatLng(marker.geometry, w, h);
      if (!onlyIfOutside || !leaflet.getBounds().contains(point)) leaflet.panTo(point);
      return;
    }
    const path = marker.kind === 'area'
      ? sampleAreaBoundary(marker.geometry, marker.meta?.areaStyle)
      : sampleRoutePath(marker.geometry, marker.meta?.routeStyle);
    const bounds = L.latLngBounds(relPathToLatLngs(path, w, h));
    if (bounds.isValid() && (!onlyIfOutside || !leaflet.getBounds().intersects(bounds))) {
      leaflet.fitBounds(bounds, { padding: [24, 24], maxZoom: leaflet.getZoom() });
    }
  }, [markers, map.width, map.height]);

  useImperativeHandle(ref, () => ({ undoDraftPoint, toggleLastDraftCorner, centerMarker }),
    [undoDraftPoint, toggleLastDraftCorner, centerMarker]);

  const revealedMarkerId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (selectedMarkerId === undefined) {
      revealedMarkerId.current = undefined;
      return;
    }
    if (revealedMarkerId.current === selectedMarkerId || !focusedMarker) return;
    revealedMarkerId.current = selectedMarkerId;
    if (focusedVertexId === undefined) centerMarker(selectedMarkerId, true);
  }, [selectedMarkerId, focusedMarker, focusedVertexId, centerMarker]);

  useEffect(() => {
    const leaflet = mapRef.current;
    if (!leaflet || drawMode) return;
    const onBackgroundClick = () => {
      if (!editing && propsRef.current.selectedMarkerId !== undefined) propsRef.current.onMapBackgroundClick?.();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      if (propsRef.current.onEscape?.()) event.preventDefault();
    };
    leaflet.on('click', onBackgroundClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      leaflet.off('click', onBackgroundClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawMode, editing, map.id, map.imageBlob, map.width, map.height]);

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

    const finishShape = () => {
      const pts = draftPointsRef.current;
      const min = drawMode === 'area' ? 3 : 2;
      if (pts.length < min) return;
      if (pts.length >= min) {
        propsRef.current.onCreateGeometry([...pts]);
      }
      draftPointsRef.current = [];
      updateDraft();
    };

    const onClick = (e: L.LeafletMouseEvent) => {
      const rel = latLngToRel([e.latlng.lat, e.latlng.lng], w, h);
      if (drawMode === 'pin') {
        propsRef.current.onCreateGeometry(rel);
        return;
      }
      if (drawMode === 'route' || drawMode === 'area') {
        const last = draftPointsRef.current.at(-1);
        if (e.originalEvent?.detail > 1) return;
        if (drawMode === 'area' && e.originalEvent?.shiftKey) {
          const clicked = draftPointsRef.current.find(point => leaflet
            .latLngToContainerPoint(relToLatLng(point, w, h)).distanceTo(e.containerPoint) <= 10);
          if (clicked) clicked.sharp = !clicked.sharp;
          else draftPointsRef.current.push({ ...rel, sharp: true });
          updateDraft();
          return;
        }
        if (last?.x === rel.x && last.y === rel.y) return;
        const first = draftPointsRef.current[0];
        if (drawMode === 'area' && first?.x === rel.x && first.y === rel.y) return;
      }
      draftPointsRef.current.push(rel);
      updateDraft();
      
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
      if (ev.defaultPrevented) return;
      const target = ev.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return;
      const undo = ev.key === 'Backspace' || ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z');
      if ((drawMode === 'route' || drawMode === 'area') && undo && draftPointsRef.current.length) {
        ev.preventDefault();
        undoDraftPoint();
        return;
      }
      if (ev.key === 'Escape') {
        draftPointsRef.current = [];
        updateDraft();
      } else if (ev.key === 'Enter' && !(target instanceof Element && target.closest('button, a'))) {
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
      if (drawMode === 'area') checkAreaBoundary([]);
    };
  }, [drawMode, map.width, map.height, map.id, map.imageBlob, updateDraft, undoDraftPoint, checkAreaBoundary]);

  useEffect(() => {
    redrawDraft();
  }, [draftRouteStyle, draftAreaStyle, redrawDraft]);

  return (
    <div className={`relative h-full w-full overflow-hidden select-none ${drawMode === 'route' || drawMode === 'area' ? 'atlas-drawing-path' : ''}`}>
      <div ref={containerRef} className="h-full w-full bg-neutral-100 dark:bg-neutral-900" />
      {isDrawingOrEditingArea && crossing && (
        <p role="status" className="pointer-events-none absolute bottom-3 left-3 right-3 z-[450] mx-auto w-fit rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 shadow dark:border-red-900 dark:bg-slate-900 dark:text-red-300">
          Batas area bersilangan. Titik persilangan ditandai merah.
        </p>
      )}
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
