/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Atlas Dunia (`viewMode 'atlas'`) — panel peta interaktif. Penulis meng-upload
 * gambar peta, menandai pin/area/rute, menaut ke Codex, lalu memfilter per
 * jenis/kategori/faksi. Analitik nol-token: kehadiran bab dari `PresenceIndex`.
 *
 * Orchestrator saja — render peta di `MapCanvas` (Leaflet), detail di
 * `MarkerSidebar`, geometri murni di `src/lib/mapGeometry.ts`, warna di
 * `src/lib/atlasColors.ts`. Data tetap PENUH; filter hanya state komponen
 * (pola LoreGraphPanel).
 */

import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { Map as MapIcon, MapPin, Hexagon, Route as RouteIcon, Plus, Trash2, SlidersHorizontal, Upload, Loader2, Ruler, Gauge, AlertTriangle, Clock, EyeOff, Flame, ChevronRight, GitFork, PanelRightClose, PanelRightOpen, Eye, ChevronDown, Check, Edit2, Search } from 'lucide-react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useProject } from '@/src/contexts/ProjectContext';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useCodexCategories } from '@/src/features/codex/hooks/useCodexCategories';
import { getCategoryLabel } from '@/src/lib/codexCategories';
import { stripHtml } from '@/src/lib/editorUtils';
import { usePresenceIndex } from '@/src/hooks/usePresenceIndex';
import { resolveMarkerColor } from '@/src/lib/atlasColors';
import { cn } from '@/src/lib/utils';
import { AtlasMap, MapMarker, MapPoint, RoutePoint, RouteStyle } from '@/src/types';
import type { AreaPointEdit, RoutePointEdit } from '@/src/lib/atlasRoutePoints';
import { useToast } from '@/src/hooks/useToast';
import { analyzeRegions, findOrphanMarkers, getMarkerFirstAppearanceChapter } from '@/src/lib/atlasAnalytics';
import { findBreadcrumbChain, findParentMap } from '@/src/lib/atlasHierarchy';
import { MapMiniThumbnail, FilterGroup, FilterChip, PathStyleSelect } from './AtlasControls';
import { useAtlasFilters } from '../hooks/useAtlasFilters';
import { useAtlasSelection } from '../hooks/useAtlasSelection';
import { useAtlas } from '../hooks/useAtlas';
import { useMapImageUpload } from '../hooks/useMapImageUpload';
import { calculateRelativeDistance } from '@/src/lib/mapGeometry';
import { TravelSpeedSettingsModal } from './TravelSpeedSettingsModal';
import { ScaleCalibrationModal } from './ScaleCalibrationModal';
import { MapHierarchyModal } from './MapHierarchyModal';
import type { PresenceChapter } from './MarkerSidebar';
import type { MapCanvasHandle } from './MapCanvas';

const MapCanvas = lazy(() => import('./MapCanvas'));
const MarkerSidebar = lazy(() => import('./MarkerSidebar'));
import { TerritoryListSidebar } from './TerritoryListSidebar';

const KIND_BTN: { kind: 'pin' | 'area' | 'route'; icon: typeof MapPin; label: string }[] = [
  { kind: 'pin', icon: MapPin, label: 'Pin' },
  { kind: 'area', icon: Hexagon, label: 'Area' },
  { kind: 'route', icon: RouteIcon, label: 'Rute' },
];
const emptyPresenceIndex = { perChapterCounts: [], byEntity: new Map() };

interface AtlasPanelProps {
  projectId: number;
}

export function AtlasPanel({ projectId }: AtlasPanelProps) {
  const { setActiveChapterId, setViewMode, openCodexEntry, pendingAtlasTarget, clearPendingAtlasTarget } = useNavigation();
  const { codexEntries } = useProjectData(projectId);
  const { categories } = useCodexCategories(projectId);

  const chapters = useProjectChapters(projectId, 'manuscript');

  const { selectedMapId, setSelectedMapId, drawMode, setDrawMode, selectedMarkerId, setSelectedMarkerId, editingGeometry, setEditingGeometry, draftCount, setDraftCount, sidebarView, setSidebarView } = useAtlasSelection();
  const {
    maps, markers, mapsLoading, createMap, renameMap, setMapImage, deleteMap, addMarker, updateMarker,
    editRoutePoint, editAreaPoint, setImportantLocation, deleteMarker,
  } = useAtlas(selectedMapId);
  const { toast } = useToast();
  const { process, processing, error: uploadError } = useMapImageUpload();

  // Seluruh penanda dalam proyek untuk relasi hierarki sub-peta
  const allProjectMarkers = useLiveQuery(
    async () => {
      if (!projectId) return [];
      const list = await db.mapMarkers.where('projectId').equals(projectId).toArray();
      if (list.length === 0) {
        const all = await db.mapMarkers.toArray();
        const mapIds = new Set((await db.maps.where('projectId').equals(projectId).toArray()).map((m) => m.id));
        return all.filter((mk) => mapIds.has(mk.mapId));
      }
      return list;
    },
    [projectId],
  );

  const [showFilters, setShowFilters] = useState(false);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showHierarchyModal, setShowHierarchyModal] = useState(false);
  const [pendingScaleDist, setPendingScaleDist] = useState<number | null>(null);
  const [highlightOrphans, setHighlightOrphans] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineChapter, setTimelineChapter] = useState<number | null>(null);
  const [fogMode, setFogMode] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [editingMapName, setEditingMapName] = useState(false);
  const [currentNameInput, setCurrentNameInput] = useState('');
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [showScaleMenu, setShowScaleMenu] = useState(false);
  const [draftRouteStyle, setDraftRouteStyle] = useState<RouteStyle>('straight');
  const [draftAreaStyle, setDraftAreaStyle] = useState<RouteStyle>('straight');
  const [draftLastSharp, setDraftLastSharp] = useState(false);
  const [focusedVertex, setFocusedVertex] = useState<{ markerId: number; pointId: string }>();
  const mapCanvasRef = useRef<MapCanvasHandle>(null);
  const mapMenuRef = useRef<HTMLDivElement>(null);
  const layersMenuRef = useRef<HTMLDivElement>(null);
  const scaleMenuRef = useRef<HTMLDivElement>(null);

  // Tutup popover toolbar saat klik di luar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mapMenuRef.current && !mapMenuRef.current.contains(e.target as Node)) {
        setShowMapMenu(false);
        setEditingMapName(false);
      }
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target as Node)) {
        setShowLayersMenu(false);
      }
      if (scaleMenuRef.current && !scaleMenuRef.current.contains(e.target as Node)) {
        setShowScaleMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Jumlah lapisan analitik yang sedang aktif menyala
  const activeLayersCount = useMemo(() => {
    let count = 0;
    if (showFilters) count++;
    if (highlightOrphans) count++;
    if (showTimeline) count++;
    if (showHeatmap) count++;
    if (fogMode) count++;
    return count;
  }, [showFilters, highlightOrphans, showTimeline, showHeatmap, fogMode]);

  const fileRef = useRef<HTMLInputElement>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);

  // Ambil travelSpeeds dari project
  const { project } = useProject();

  // Peta aktif = pilihan eksplisit atau peta pertama.
  const activeMap = useMemo(
    () => maps.find((m) => m.id === selectedMapId) ?? maps[0],
    [maps, selectedMapId],
  );

  // Kunci `selectedMapId` ke peta valid begitu daftar termuat. Tanpa ini, setelah
  // refresh/pindah panel `selectedMapId` = undefined sementara peta tetap tampil lewat
  // fallback `maps[0]` → query penanda (dikunci ke `selectedMapId`) mengembalikan []
  // → pin/area/rute TERSIMPAN tapi tak tampil, & penanda baru seolah gagal disimpan.
  useEffect(() => {
    if (maps.length && (selectedMapId == null || !maps.some((m) => m.id === selectedMapId))) {
      setSelectedMapId(maps[0].id);
    }
  }, [maps, selectedMapId]);

  // Sinkronisasi nilai nama peta ke input saat peta aktif berganti
  useEffect(() => {
    if (activeMap) {
      setCurrentNameInput(activeMap.name);
    }
  }, [activeMap?.id, activeMap?.name]);

  // Statistik jumlah penanda per peta
  const markerCountByMap = useMemo(() => {
    const counts = new Map<number, number>();
    if (allProjectMarkers) {
      for (const mk of allProjectMarkers) {
        counts.set(mk.mapId, (counts.get(mk.mapId) || 0) + 1);
      }
    }
    return counts;
  }, [allProjectMarkers]);

  // Daftar peta yang sudah difilter oleh pencarian
  const filteredMaps = useMemo(() => {
    if (!mapSearchQuery.trim()) return maps;
    const q = mapSearchQuery.toLowerCase();
    return maps.filter((m) => m.name.toLowerCase().includes(q));
  }, [maps, mapSearchQuery]);

  // Tangani deep-link target dari Codex ("Lihat di Peta")
  useEffect(() => {
    if (pendingAtlasTarget) {
      setSelectedMapId(pendingAtlasTarget.mapId);
      if (pendingAtlasTarget.markerId != null) {
        setSelectedMarkerId(pendingAtlasTarget.markerId);
        setSidebarView('detail');
        setShowSidebar(true);
        // Pastikan filter tidak menyembunyikan penanda yang dicari
        setOffKinds(new Set());
        setOffCategories(new Set());
        setOffFactions(new Set());
      }
      clearPendingAtlasTarget();
    }
  }, [pendingAtlasTarget, clearPendingAtlasTarget]);

  const { offKinds, setOffKinds, offCategories, setOffCategories, offFactions, setOffFactions, entryById, presentCategories, presentFactions, visibleMarkers } = useAtlasFilters(markers, codexEntries);

  const colorFor = useMemo(
    () => (mk: MapMarker) => resolveMarkerColor(mk.kind, mk.color, mk.codexId != null ? entryById.get(mk.codexId) : undefined, categories),
    [entryById, categories],
  );

  // Teks bab polos di-memo (ref stabil) untuk feed worker.
  const presenceChaptersPlain = useMemo(() => {
    if (!chapters) return null;
    return chapters
      .filter((c) => c.id != null)
      .map((c) => ({ id: c.id!, title: c.title, content: stripHtml(c.content || '') }));
  }, [chapters]);

  // Scan kehadiran (nama+alias) di WORKER agar main thread tak jank pada naskah besar.
  const idx = usePresenceIndex(presenceChaptersPlain, codexEntries);
  const presenceIndex = useMemo(
    () => (presenceChaptersPlain && idx ? { index: idx, chapters: presenceChaptersPlain } : null),
    [presenceChaptersPlain, idx]
  );

  const regionAnalytics = useMemo(() => {
    if (!maps.length) return [];
    return analyzeRegions(markers, presenceIndex?.index ?? emptyPresenceIndex, codexEntries);
  }, [markers, presenceIndex, codexEntries, maps.length]);

  const selectedMarker = markers.find((m) => m.id === selectedMarkerId);
  const canvasMarkers = useMemo(() => selectedMarker && !visibleMarkers.includes(selectedMarker)
    ? [...visibleMarkers, selectedMarker]
    : visibleMarkers, [selectedMarker, visibleMarkers]);
  const focusedVertexId = focusedVertex?.markerId === selectedMarkerId ? focusedVertex?.pointId : undefined;
  const selectedEntry = selectedMarker?.codexId != null ? entryById.get(selectedMarker.codexId) : undefined;

  const selectedRegionAnalytic = useMemo(() => {
    return selectedMarker?.kind === 'area' ? regionAnalytics.find(r => r.markerId === selectedMarker.id) : undefined;
  }, [selectedMarker, regionAnalytics]);

  const presenceChapters: PresenceChapter[] = useMemo(() => {
    if (!presenceIndex) return [];
    let indices: number[] = [];

    if (selectedRegionAnalytic) {
      indices = selectedRegionAnalytic.associatedChapters;
    } else if (selectedEntry?.id) {
      const rec = presenceIndex.index.byEntity.get(selectedEntry.id);
      if (rec) indices = rec.indices;
    }

    return indices.map((i) => ({
      id: presenceIndex.chapters[i].id,
      title: presenceIndex.chapters[i].title,
      number: i + 1,
    }));
  }, [selectedEntry, presenceIndex, selectedRegionAnalytic]);

  // Deteksi penanda yatim (orphan)
  const orphanMarkers = useMemo(() => {
    if (!presenceIndex || !maps.length) return [];
    return findOrphanMarkers(markers, presenceIndex.index, codexEntries, regionAnalytics);
  }, [markers, presenceIndex, codexEntries, regionAnalytics, maps.length]);

  const orphanMarkerIds = useMemo(() => {
    return new Set(orphanMarkers.map((o) => o.markerId));
  }, [orphanMarkers]);

  // Filter peredupan timeline bab
  const fadedMarkerIds = useMemo(() => {
    if (timelineChapter === null || !presenceIndex) return new Set<number>();
    const faded = new Set<number>();
    for (const mk of markers) {
      if (!mk.id) continue;
      const reg = mk.kind === 'area' ? regionAnalytics.find((r) => r.markerId === mk.id) : undefined;
      const firstChapter = getMarkerFirstAppearanceChapter(mk, presenceIndex.index, reg);
      if (firstChapter === null || firstChapter > timelineChapter) {
        faded.add(mk.id);
      }
    }
    return faded;
  }, [timelineChapter, markers, presenceIndex, regionAnalytics]);

  const isSecretEntry = useMemo(
    () => (codexId?: number) => (codexId != null ? entryById.get(codexId)?.hidden === true : false),
    [entryById]
  );

  // Dapatkan nama/judul aktual penanda (mengutamakan nama entri Codex)
  const titleFor = useMemo(
    () => (mk: MapMarker) => {
      if (fogMode && isSecretEntry(mk.codexId)) return '??? (Lokasi Rahasia)';
      const entry = mk.codexId != null ? entryById.get(mk.codexId) : undefined;
      return (
        entry?.name ||
        mk.title ||
        (mk.kind === 'area'
          ? 'Wilayah'
          : mk.kind === 'route'
            ? 'Rute'
            : 'Lokasi')
      );
    },
    [entryById, fogMode, isSecretEntry],
  );

  const pinById = useMemo(() => new Map(markers.filter(marker => marker.kind === 'pin').map(pin => [pin.id, pin])), [markers]);
  const titleForRoutePoint = useMemo(() => (point: RoutePoint) => {
    const pin = point.pinId === undefined ? undefined : pinById.get(point.pinId);
    const codexId = pin?.codexId ?? point.codexId;
    if (fogMode && isSecretEntry(codexId)) return '??? (Lokasi Rahasia)';
    return point.name || (pin ? titleFor(pin) : codexId === undefined ? undefined : entryById.get(codexId)?.name);
  }, [entryById, fogMode, isSecretEntry, pinById, titleFor]);

  const openMarker = (marker: MapMarker) => {
    setFocusedVertex(undefined);
    setSelectedMarkerId(marker.id);
    setSidebarView('detail');
    setDrawMode(null);
    setShowSidebar(true);
  };

  const clearMarkerSelection = () => {
    setFocusedVertex(undefined);
    setEditingGeometry(false);
    setSelectedMarkerId(undefined);
    setSidebarView('list');
  };

  const escapeSelection = () => {
    if (showHierarchyModal || showSpeedModal || pendingScaleDist !== null || showMapMenu || showLayersMenu || showScaleMenu) return false;
    if (editingGeometry) {
      setEditingGeometry(false);
      setFocusedVertex(undefined);
      return true;
    }
    if (selectedMarkerId === undefined) return false;
    clearMarkerSelection();
    return true;
  };

  const handleRoutePointEdit = (id: number, edit: RoutePointEdit) => {
    void editRoutePoint(id, edit).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan titik rute.');
    });
  };

  const handleAreaPointEdit = (id: number, edit: AreaPointEdit) => {
    void editAreaPoint(id, edit).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan titik batas.');
    });
  };

  // Informasi peta induk dari sub-peta aktif
  const parentInfo = useMemo(() => {
    if (!activeMap?.id || !allProjectMarkers) return null;
    return findParentMap(activeMap.id, maps, allProjectMarkers);
  }, [activeMap?.id, maps, allProjectMarkers]);

  // Jejak remah roti dihitung deterministik dari hierarki peta aktual
  const breadcrumbs = useMemo(() => {
    if (!activeMap?.id || !allProjectMarkers) return [];
    return findBreadcrumbChain(activeMap.id, maps, allProjectMarkers);
  }, [activeMap?.id, maps, allProjectMarkers]);

  const handleOpenSubMap = (subMapId: number) => {
    setSelectedMapId(subMapId);
    setSelectedMarkerId(undefined);
    setSidebarView('list');
    setDrawMode(null);
  };

  const handleBreadcrumbClick = (targetMapId: number, fromMarkerId?: number) => {
    setSelectedMapId(targetMapId);
    setSelectedMarkerId(fromMarkerId);
    setSidebarView(fromMarkerId ? 'detail' : 'list');
    setDrawMode(null);
  };

  const handleReturnToParent = () => {
    if (!parentInfo) return;
    setSelectedMapId(parentInfo.parentMap.id);
    setSelectedMarkerId(parentInfo.parentMarker.id);
    setSidebarView('detail');
    setDrawMode(null);
  };

  // --- Handler ---
  const handleUpload = async (file: File) => {
    const processed = await process(file);
    if (!processed) return;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'Peta';
    const id = await createMap(baseName, processed);
    if (id != null) setSelectedMapId(id);
  };

  const handleReupload = async (file: File) => {
    if (!activeMap?.id) return;
    const processed = await process(file);
    if (processed) await setMapImage(activeMap.id, processed);
  };

  const handleCreateGeometry = async (geometry: MapPoint | MapPoint[]) => {
    if (!activeMap?.id || !drawMode) return;

    if (drawMode === 'scale') {
      if (!Array.isArray(geometry) || geometry.length !== 2) return;
      setDrawMode(null);
      // Hitung jarak relatif lalu buka modal
      const relDist = calculateRelativeDistance(geometry);
      setPendingScaleDist(relDist);
      return;
    }

    const id = await addMarker({
      mapId: activeMap.id,
      kind: drawMode,
      geometry,
      meta: drawMode === 'route' ? { routeStyle: draftRouteStyle } : drawMode === 'area' ? { areaStyle: draftAreaStyle } : undefined,
    });
    setDrawMode(null);
    if (id != null) {
      setSelectedMarkerId(id);
      setSidebarView('detail');
    }
  };

  const handleGeometryChange = (markerId: number, geometry: MapPoint | MapPoint[]) => {
    updateMarker(markerId, { geometry });
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const [mapToDelete, setMapToDelete] = useState<AtlasMap | null>(null);

  const confirmDeleteMap = async () => {
    if (!mapToDelete?.id) return;
    await deleteMap(mapToDelete.id);
    setSelectedMapId(undefined);
    setSelectedMarkerId(undefined);
    setSidebarView('list');
    setMapToDelete(null);
  };

  // --- Empty state: belum ada peta ---
  if (mapsLoading) {
    return <div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  if (maps.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <MapIcon size={30} className="text-indigo-500" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h2 className="text-2xl font-serif text-slate-900 dark:text-slate-100">Atlas Dunia</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Unggah gambar peta duniamu, lalu tandai lokasi, wilayah, dan rute yang bisa diklik — tertaut ke Codex & manuskrip. Sepenuhnya lokal, tanpa AI.
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-60"
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Unggah gambar peta
        </button>
        <p className="text-[11px] text-slate-400">PNG · JPG · WEBP · GIF · maks 5 MB</p>
        {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 relative z-[1005] flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        {/* Pemilih Peta Visual Popover */}
        <div className="relative" ref={mapMenuRef}>
          <button
            onClick={() => {
              setShowMapMenu((v) => !v);
              setShowScaleMenu(false);
              setShowLayersMenu(false);
            }}
            className={cn(
              'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm border font-medium transition-colors cursor-pointer max-w-[210px]',
              showMapMenu
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-indigo-300'
            )}
            title="Ganti atau kelola peta aktif"
          >
            <MapIcon size={15} className="text-indigo-500 shrink-0" />
            <span className="truncate">{activeMap?.name || 'Pilih Peta'}</span>
            <ChevronDown size={13} className={cn('transition-transform duration-200 shrink-0 text-slate-400', showMapMenu ? 'rotate-180' : '')} />
          </button>

          {showMapMenu && (
            <div className="absolute left-0 mt-1.5 w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-2 z-[1002] text-xs space-y-2 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
              {/* Header: Ganti Nama Peta Aktif */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Peta Terpilih
                  </span>
                  <div className="flex items-center gap-2">
                    {editingMapName ? (
                      <button
                        onClick={() => {
                          if (activeMap?.id && currentNameInput.trim()) {
                            renameMap(activeMap.id, currentNameInput.trim());
                          }
                          setEditingMapName(false);
                        }}
                        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Simpan
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditingMapName(true)}
                        className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Ubah nama peta aktif"
                      >
                        <Edit2 size={11} /> Ubah Nama
                      </button>
                    )}
                    {activeMap && (
                      <button
                        onClick={() => {
                          setMapToDelete(activeMap);
                          setShowMapMenu(false);
                        }}
                        className="text-[11px] font-medium text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Hapus peta ini"
                      >
                        <Trash2 size={11} /> Hapus
                      </button>
                    )}
                  </div>
                </div>

                {editingMapName ? (
                  <input
                    autoFocus
                    value={currentNameInput}
                    onChange={(e) => setCurrentNameInput(e.target.value)}
                    onBlur={() => {
                      if (activeMap?.id && currentNameInput.trim()) {
                        renameMap(activeMap.id, currentNameInput.trim());
                      }
                      setEditingMapName(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (activeMap?.id && currentNameInput.trim()) {
                          renameMap(activeMap.id, currentNameInput.trim());
                        }
                        setEditingMapName(false);
                      } else if (e.key === 'Escape') {
                        setEditingMapName(false);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-950 border border-indigo-400 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none ring-2 ring-indigo-500/20"
                    placeholder="Nama peta..."
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {activeMap?.name}
                    </p>
                    {activeMap?.scale && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0">
                        📏 1 rel = {activeMap.scale.ratioToRelative} {activeMap.scale.distanceUnit}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Input Pencarian Cepat jika peta > 3 */}
              {maps.length > 3 && (
                <div className="relative px-0.5">
                  <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari peta..."
                    value={mapSearchQuery}
                    onChange={(e) => setMapSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}

              {/* Daftar Peta */}
              <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar pr-0.5">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Daftar Peta ({maps.length})</span>
                </div>

                {filteredMaps.length === 0 ? (
                  <p className="text-center py-4 text-xs text-slate-400 italic">
                    Tidak ditemukan peta "{mapSearchQuery}"
                  </p>
                ) : (
                  filteredMaps.map((m) => {
                    const isActive = m.id === activeMap?.id;
                    const count = markerCountByMap.get(m.id ?? 0) || 0;

                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (m.id) {
                            setSelectedMapId(m.id);
                            setSelectedMarkerId(undefined);
                            setSidebarView('list');
                            setDrawMode(null);
                            setShowMapMenu(false);
                            setEditingMapName(false);
                          }
                        }}
                        className={cn(
                          'w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors cursor-pointer group',
                          isActive
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/80 text-indigo-950 dark:text-indigo-100 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/70 border border-transparent text-slate-700 dark:text-slate-300'
                        )}
                      >
                        {/* Mini Thumbnail */}
                        <MapMiniThumbnail blob={m.imageBlob} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-xs truncate">
                              {m.name}
                            </p>
                            <div className="flex items-center gap-1 ml-auto shrink-0">
                              {isActive && (
                                <Check size={13} className="text-indigo-600 dark:text-indigo-400" />
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMapToDelete(m);
                                  setShowMapMenu(false);
                                }}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                title={`Hapus peta "${m.name}"`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span>{count} penanda</span>
                            {m.scale && <span>· 📏 Berskala</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer: Tombol Pintas ke Pohon Peta & Tambah Peta */}
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <button
                  onClick={() => {
                    setShowHierarchyModal(true);
                    setShowMapMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 font-medium transition-colors cursor-pointer"
                >
                  <GitFork size={12} />
                  <span>Pohon Silsilah Peta ↗</span>
                </button>

                <button
                  onClick={() => {
                    fileRef.current?.click();
                    setShowMapMenu(false);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Unggah Baru</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tombol Pohon Hierarki Peta */}
        {maps.length > 0 && (
          <button
            onClick={() => setShowHierarchyModal(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            title="Lihat Pohon Hierarki Peta Proyek"
          >
            <GitFork size={14} className="text-indigo-500" /> Pohon
          </button>
        )}

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* Alat gambar */}
        {KIND_BTN.map(({ kind, icon: Icon, label }) => (
          <button
            key={kind}
            onClick={() => {
              setDrawMode(drawMode === kind ? null : kind);
              setSelectedMarkerId(undefined);
              setEditingGeometry(false);
              setSidebarView('list');
            }}
            className={cn('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border',
              drawMode === kind
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300')}
          >
            <Icon size={14} /> {label}
          </button>
        ))}

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* Menu Popover: Ukur & Skala */}
        <div className="relative" ref={scaleMenuRef}>
          <button
            onClick={() => {
              setShowScaleMenu((v) => !v);
              setShowLayersMenu(false);
              setShowMapMenu(false);
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border transition-colors cursor-pointer',
              showScaleMenu || drawMode === 'scale' || activeMap?.scale
                ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-medium'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-300'
            )}
            title="Kalibrasi Skala & Kecepatan Perjalanan"
          >
            <Ruler size={14} className={activeMap?.scale ? 'text-amber-500' : ''} />
            <span>Skala</span>
            {activeMap?.scale && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Skala terkalibrasi" />
            )}
            <ChevronDown size={12} className={cn('transition-transform duration-200', showScaleMenu ? 'rotate-180' : '')} />
          </button>

          {showScaleMenu && (
            <div className="absolute left-0 mt-1.5 w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1.5 z-50 text-xs space-y-1 backdrop-blur-md">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                Pengukuran & Perjalanan
              </div>

              {/* Kalibrasi Skala Peta */}
              <button
                onClick={() => {
                  setDrawMode(drawMode === 'scale' ? null : 'scale');
                  setSelectedMarkerId(undefined);
                  setShowScaleMenu(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left cursor-pointer',
                  drawMode === 'scale'
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                )}
              >
                <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <Ruler size={14} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-xs">
                    {drawMode === 'scale' ? 'Batalkan Tarik Garis' : 'Kalibrasi Skala Peta'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {activeMap?.scale
                      ? `Terkalibrasi: 1 rel = ${activeMap.scale.ratioToRelative} ${activeMap.scale.distanceUnit}`
                      : 'Tarik garis untuk menetapkan rasio km/mil'}
                  </p>
                </div>
              </button>

              {/* Profil Kecepatan Transportasi */}
              <button
                onClick={() => {
                  setShowSpeedModal(true);
                  setShowScaleMenu(false);
                }}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Gauge size={14} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-xs">Profil Kecepatan</p>
                  <p className="text-[10px] text-slate-400">Jalan kaki, kuda, kapal, dsb.</p>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Menu Popover: Lapisan & Analisis */}
        <div className="relative" ref={layersMenuRef}>
          <button
            onClick={() => {
              setShowLayersMenu((v) => !v);
              setShowScaleMenu(false);
              setShowMapMenu(false);
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border transition-colors cursor-pointer',
              showLayersMenu || activeLayersCount > 0
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-medium'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
            )}
            title="Lapisan Tampilan & Analisis Kontinuitas"
          >
            <Eye size={14} className={activeLayersCount > 0 ? 'text-indigo-500' : ''} />
            <span>Lapisan</span>
            {activeLayersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white leading-none">
                {activeLayersCount}
              </span>
            )}
            <ChevronDown size={12} className={cn('transition-transform duration-200', showLayersMenu ? 'rotate-180' : '')} />
          </button>

          {showLayersMenu && (
            <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1.5 z-50 text-xs space-y-1 backdrop-blur-md">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                Lapisan & Kontinuitas
              </div>

              {/* 1. Filter Kategori & Faksi */}
              <button
                onClick={() => setShowFilters((s) => !s)}
                className={cn(
                  'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left cursor-pointer',
                  showFilters
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className={showFilters ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
                  <div>
                    <p className="font-semibold text-xs">Filter Faksi & Kategori</p>
                    <p className="text-[10px] text-slate-400">Pilah penanda per kategori lore</p>
                  </div>
                </div>
                <input type="checkbox" checked={showFilters} readOnly className="rounded accent-indigo-600 pointer-events-none" />
              </button>

              {/* 2. Sorot Wilayah Yatim */}
              <button
                onClick={() => setHighlightOrphans((s) => !s)}
                className={cn(
                  'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left cursor-pointer',
                  highlightOrphans
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className={highlightOrphans ? 'text-amber-600' : orphanMarkers.length > 0 ? 'text-amber-500' : 'text-slate-400'} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-xs">Sorot Wilayah Yatim</p>
                      {orphanMarkers.length > 0 && (
                        <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                          {orphanMarkers.length}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">Redupkan lokasi yang sudah ditulis</p>
                  </div>
                </div>
                <input type="checkbox" checked={highlightOrphans} readOnly className="rounded accent-amber-600 pointer-events-none" />
              </button>

              {/* 3. Linimasa Bab Slider */}
              <button
                onClick={() => setShowTimeline((s) => !s)}
                className={cn(
                  'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left cursor-pointer',
                  showTimeline
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <Clock size={14} className={showTimeline ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
                  <div>
                    <p className="font-semibold text-xs">Linimasa Bab (Slider)</p>
                    <p className="text-[10px] text-slate-400">Saring lokasi berdasarkan progres bab</p>
                  </div>
                </div>
                <input type="checkbox" checked={showTimeline} readOnly className="rounded accent-indigo-600 pointer-events-none" />
              </button>

              {/* 4. Heatmap Kehadiran Adegan */}
              <button
                onClick={() => setShowHeatmap((s) => !s)}
                className={cn(
                  'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left cursor-pointer',
                  showHeatmap
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <Flame size={14} className={showHeatmap ? 'text-rose-600' : 'text-slate-400'} />
                  <div>
                    <p className="font-semibold text-xs">Heatmap Aktivitas Cerita</p>
                    <p className="text-[10px] text-slate-400">Gradien konsentrasi adegan bab</p>
                  </div>
                </div>
                <input type="checkbox" checked={showHeatmap} readOnly className="rounded accent-rose-600 pointer-events-none" />
              </button>

              {/* 5. Mode Kabut Rahasia */}
              <button
                onClick={() => setFogMode((s) => !s)}
                className={cn(
                  'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left cursor-pointer',
                  fogMode
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <EyeOff size={14} className={fogMode ? 'text-purple-600' : 'text-slate-400'} />
                  <div>
                    <p className="font-semibold text-xs">Mode Kabut Rahasia</p>
                    <p className="text-[10px] text-slate-400">Samarkan lokasi rahasia spoiler</p>
                  </div>
                </div>
                <input type="checkbox" checked={fogMode} readOnly className="rounded accent-purple-600 pointer-events-none" />
              </button>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => fileRef.current?.click()} disabled={processing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 disabled:opacity-60 cursor-pointer"
            title="Unggah gambar peta baru">
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Peta
          </button>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Toggle Sidebar Katalog Wilayah */}
          <button
            onClick={() => setShowSidebar((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border transition-colors cursor-pointer',
              showSidebar
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-medium'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
            )}
            title={showSidebar ? 'Sembunyikan Daftar Wilayah (Maksimalkan Kanvas)' : 'Buka Daftar Wilayah'}
          >
            {showSidebar ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            <span>Wilayah</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
              {markers.length}
            </span>
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
      </div>

      {/* Breadcrumbs Navigasi Peta Bertingkat */}
      {breadcrumbs.length > 0 && activeMap && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/80 text-xs">
          <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider mr-1">Tingkat:</span>
          {breadcrumbs.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <button
                onClick={() => handleBreadcrumbClick(b.id, b.fromMarkerId)}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                title={b.fromMarkerId ? 'Kembali dan fokuskan ke penanda asal' : undefined}
              >
                {b.name}
              </button>
              <ChevronRight size={12} className="text-slate-400" />
            </span>
          ))}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{activeMap.name}</span>
        </div>
      )}

      {/* Linimasa Bab Slider */}
      {showTimeline && chapters && chapters.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/30 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-300 shrink-0">
            <Clock size={14} />
            <span>Linimasa Bab:</span>
          </div>
          <input
            type="range"
            min={1}
            max={chapters.length}
            value={timelineChapter ?? chapters.length}
            onChange={(e) => setTimelineChapter(Number(e.target.value))}
            className="flex-1 min-w-[140px] max-w-xs accent-indigo-600 cursor-pointer"
          />
          <span className="text-slate-700 dark:text-slate-200 font-medium">
            {timelineChapter !== null
              ? `Hingga Bab ${timelineChapter}: ${chapters[timelineChapter - 1]?.title || ''}`
              : `Semua Bab (1–${chapters.length})`}
          </span>
          {timelineChapter !== null && (
            <button
              onClick={() => setTimelineChapter(null)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px] font-semibold"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Hint gambar + error */}
      {(drawMode || uploadError) && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-xs border-b border-slate-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">
          {uploadError ? <span className="text-rose-600 dark:text-rose-400">{uploadError}</span> : drawMode === 'pin'
            ? 'Klik di peta untuk menaruh pin.'
            : drawMode === 'scale'
            ? `Tarik garis lurus (klik awal dan klik akhir) untuk mengkalibrasi skala peta${draftCount ? ` (${draftCount}/2)` : ''}.`
            : `Klik menambah titik · dobel-klik atau Enter untuk selesai · Esc batal${draftCount ? ` (${draftCount} titik)` : ''}.`}
          {(drawMode === 'route' || drawMode === 'area') && (
            <>
              {drawMode === 'route'
                ? <PathStyleSelect label="Bentuk rute" value={draftRouteStyle} onChange={setDraftRouteStyle} />
                : <PathStyleSelect label="Bentuk batas" value={draftAreaStyle} onChange={setDraftAreaStyle} />}
              <button
                type="button"
                aria-keyshortcuts="Backspace Control+Z Meta+Z"
                disabled={!draftCount}
                onClick={() => mapCanvasRef.current?.undoDraftPoint()}
                className="rounded-md border border-indigo-300 px-2 py-1 font-medium hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:hover:bg-indigo-900"
              >
                Hapus titik terakhir
              </button>
              {drawMode === 'area' && draftAreaStyle === 'curved' && (
                <button
                  type="button"
                  aria-pressed={draftLastSharp}
                  disabled={!draftCount}
                  onClick={() => mapCanvasRef.current?.toggleLastDraftCorner()}
                  className="rounded-md border border-indigo-300 px-2 py-1 font-medium hover:bg-indigo-100 aria-pressed:bg-indigo-200 disabled:opacity-50 dark:border-indigo-700 dark:hover:bg-indigo-900 dark:aria-pressed:bg-indigo-800"
                >
                  Sudut tegas di titik terakhir
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Panel filter lanjutan */}
      {showFilters && (
        <div className="shrink-0 p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 text-xs space-y-2">
          {/* Filter jenis penanda */}
          <FilterGroup title="Jenis">
            {KIND_BTN.map(({ kind, label }) => (
              <FilterChip key={kind} active={!offKinds.has(kind)} onClick={() => toggle(offKinds, setOffKinds, kind)}>{label}</FilterChip>
            ))}
          </FilterGroup>
          {presentCategories.length > 0 && (
            <FilterGroup title="Kategori">
              {presentCategories.map((c) => (
                <FilterChip key={c} active={!offCategories.has(c)} onClick={() => toggle(offCategories, setOffCategories, c)}>{getCategoryLabel(c, categories)}</FilterChip>
              ))}
            </FilterGroup>
          )}
          {presentFactions.length > 0 && (
            <FilterGroup title="Faksi">
              {presentFactions.map((f) => (
                <FilterChip key={f} active={!offFactions.has(f)} onClick={() => toggle(offFactions, setOffFactions, f)}>{f}</FilterChip>
              ))}
            </FilterGroup>
          )}
        </div>
      )}

      {/* Peta + sidebar */}
      <div className="flex-1 flex min-h-0 relative z-0">
        <div className="relative z-0 flex-1 min-w-0">
          {activeMap && !activeMap.imageBlob && (
            <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                Gambar peta ini tidak tersimpan dalam cadangan otomatis (untuk menghemat ruang). Penanda tetap utuh — unggah ulang gambarnya untuk menampilkannya kembali.
              </p>
              <button
                onClick={() => reuploadRef.current?.click()}
                disabled={processing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-60"
              >
                {processing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Unggah ulang gambar
              </button>
              <input ref={reuploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReupload(f); e.target.value = ''; }} />
            </div>
          )}
          {activeMap && activeMap.imageBlob && (
            <Suspense fallback={<div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>}>
              <MapCanvas
                ref={mapCanvasRef}
                key={activeMap.id}
                map={activeMap}
                markers={canvasMarkers}
                drawMode={drawMode}
                draftRouteStyle={draftRouteStyle}
                draftAreaStyle={draftAreaStyle}
                selectedMarkerId={selectedMarkerId}
                editing={editingGeometry}
                colorFor={colorFor}
                titleFor={titleFor}
                onCreateGeometry={handleCreateGeometry}
                onMarkerClick={openMarker}
                onMapBackgroundClick={clearMarkerSelection}
                onEscape={escapeSelection}
                onGeometryChange={handleGeometryChange}
                focusedVertexId={focusedVertexId}
                titleForRoutePoint={titleForRoutePoint}
                onFocusVertex={(markerId, pointId) => setFocusedVertex({ markerId, pointId })}
                onEditRoutePoint={handleRoutePointEdit}
                onEditAreaPoint={handleAreaPointEdit}
                onDraftChange={(count, lastSharp) => { setDraftCount(count); setDraftLastSharp(lastSharp === true); }}
                orphanMarkerIds={orphanMarkerIds}
                highlightOrphans={highlightOrphans}
                fadedMarkerIds={fadedMarkerIds}
                fogMode={fogMode}
                isSecretEntry={isSecretEntry}
                showHeatmap={showHeatmap}
                regionAnalytics={regionAnalytics}
                presenceIndex={presenceIndex ? presenceIndex.index : null}
                onOpenSubMap={handleOpenSubMap}
                parentMap={parentInfo?.parentMap}
                onReturnToParent={handleReturnToParent}
              />
            </Suspense>
          )}
        </div>
        {showSidebar && (
          (sidebarView === 'detail' && selectedMarker) ? (
            <Suspense fallback={null}>
              <MarkerSidebar
                key={selectedMarker.id}
                marker={selectedMarker}
                entry={selectedEntry}
                categories={categories}
                presence={presenceChapters}
                regionAnalytic={selectedRegionAnalytic}
                color={colorFor(selectedMarker)}
                codexEntries={codexEntries}
                editing={editingGeometry}
                activeMap={activeMap}
                travelSpeeds={project?.travelSpeeds}
                isOrphan={selectedMarker.id != null && orphanMarkerIds.has(selectedMarker.id)}
                orphanReason={orphanMarkers.find(o => o.markerId === selectedMarker.id)?.reason}
                fogMode={fogMode}
                allMaps={maps}
                allMarkers={allProjectMarkers ?? []}
                onOpenSubMap={handleOpenSubMap}
                onToggleEdit={() => {
                  setDrawMode(null);
                  if (editingGeometry) setFocusedVertex(undefined);
                  setEditingGeometry(!editingGeometry);
                }}
                onCenterMarker={() => {
                  if (selectedMarker.id !== undefined) mapCanvasRef.current?.centerMarker(selectedMarker.id);
                }}
                onSave={(patch) => selectedMarker.id && updateMarker(selectedMarker.id, patch)}
                onDelete={() => {
                  if (selectedMarker.id) {
                    deleteMarker(selectedMarker.id);
                    clearMarkerSelection();
                  }
                }}
                onClose={clearMarkerSelection}
                onOpenCodex={openCodexEntry}
                onJumpChapter={(id) => { setActiveChapterId(id); setViewMode('write'); }}
                mapMarkers={markers}
                titleForMarker={titleFor}
                titleForRoutePoint={titleForRoutePoint}
                focusedVertexId={focusedVertexId}
                onFocusVertex={(pointId) => {
                  if (selectedMarker.id !== undefined) setFocusedVertex({ markerId: selectedMarker.id, pointId });
                }}
                onEditRoutePoint={(edit) => {
                  if (selectedMarker.id !== undefined) handleRoutePointEdit(selectedMarker.id, edit);
                }}
                onEditAreaPoint={(edit) => {
                  if (selectedMarker.id !== undefined) handleAreaPointEdit(selectedMarker.id, edit);
                }}
                onOpenMarker={openMarker}
                onSetImportantLocation={async (pinId, role) => {
                  if (selectedMarker.id !== undefined) await setImportantLocation(selectedMarker.id, pinId, role);
                }}
              />
            </Suspense>
          ) : (
            <TerritoryListSidebar
              activeMap={activeMap}
              allMaps={maps}
              markers={visibleMarkers}
              allMarkers={allProjectMarkers ?? []}
              codexEntries={codexEntries}
              categories={categories}
              colorFor={colorFor}
              orphanMarkerIds={orphanMarkerIds}
              fogMode={fogMode}
              presenceIndex={presenceIndex ? presenceIndex.index : null}
              selectedMarkerId={selectedMarkerId}
              onSelectMarker={(markerId, mapId) => {
                if (activeMap?.id !== mapId) {
                  setSelectedMapId(mapId);
                }
                setSelectedMarkerId(markerId);
                setDrawMode(null);
              }}
              onOpenDetail={(markerId, mapId) => {
                if (activeMap?.id !== mapId) {
                  setSelectedMapId(mapId);
                }
                setSelectedMarkerId(markerId);
                setSidebarView('detail');
                setDrawMode(null);
                setShowSidebar(true);
              }}
              onCloseSidebar={() => setShowSidebar(false)}
            />
          )
        )}
      </div>

      {showSpeedModal && (
        <TravelSpeedSettingsModal
          projectId={projectId}
          travelSpeeds={project?.travelSpeeds}
          onClose={() => setShowSpeedModal(false)}
        />
      )}

      {pendingScaleDist !== null && activeMap?.id && (
        <ScaleCalibrationModal
          mapId={activeMap.id}
          relativeDistance={pendingScaleDist}
          onClose={() => setPendingScaleDist(null)}
        />
      )}

      {showHierarchyModal && (
        <MapHierarchyModal
          maps={maps}
          allMarkers={allProjectMarkers ?? []}
          activeMapId={activeMap?.id}
          onSelectMap={(mapId, fromMarkerId) => {
            setSelectedMapId(mapId);
            setSelectedMarkerId(fromMarkerId);
            setSidebarView(fromMarkerId ? 'detail' : 'list');
            setDrawMode(null);
          }}
          onClose={() => setShowHierarchyModal(false)}
        />
      )}

      {/* Modal Konfirmasi Hapus Peta Modern */}
      {mapToDelete && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMapToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Hapus Peta "{mapToDelete.name}"?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Peta ini beserta seluruh penanda ({markerCountByMap.get(mapToDelete.id ?? 0) || 0} pin, area, dan rute) yang ada di dalamnya akan dihapus secara permanen dari basis data proyek.
                </p>
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMapToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteMap}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                <span>Ya, Hapus Peta</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
