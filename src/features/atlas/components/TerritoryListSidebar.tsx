/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Panel samping Katalog & Direktori Wilayah Atlas (Territory & World Index).
 * Menampilkan daftar seluruh wilayah/penanda di peta aktif maupun seluruh peta
 * proyek, dengan pencarian instan, filter jenis, deteksi yatim, dan teleportasi 1-klik.
 */

import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Route as RouteIcon,
  Hexagon,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  Globe,
  Map as MapIcon,
  AlertTriangle,
  BookOpen,
  PanelRightClose,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { AtlasMap, CodexEntry, MapMarker } from '@/src/types';
import { CategoryDef, getCategoryLabel } from '@/src/lib/codexCategories';
import { PresenceIndex } from '@/src/lib/continuity';
import { cn } from '@/src/lib/utils';

export interface TerritoryListSidebarProps {
  activeMap?: AtlasMap;
  allMaps: AtlasMap[];
  markers: MapMarker[];
  allMarkers: MapMarker[];
  codexEntries: CodexEntry[];
  categories: CategoryDef[];
  colorFor: (m: MapMarker) => string;
  orphanMarkerIds: Set<number>;
  fogMode?: boolean;
  presenceIndex?: PresenceIndex | null;
  selectedMarkerId?: number;
  onSelectMarker: (markerId: number, mapId: number) => void;
  onOpenDetail?: (markerId: number, mapId: number) => void;
  onCloseSidebar: () => void;
}

type ScopeMode = 'current' | 'all';
type KindFilter = 'all' | 'area' | 'pin' | 'route';
type SortOption = 'name' | 'kind' | 'chapters';

const KIND_META: Record<string, { icon: React.ElementType; label: string }> = {
  pin: { icon: MapPin, label: 'Pin' },
  area: { icon: Hexagon, label: 'Area' },
  route: { icon: RouteIcon, label: 'Rute' },
};

export function TerritoryListSidebar({
  activeMap,
  allMaps,
  markers,
  allMarkers,
  codexEntries,
  categories,
  colorFor,
  orphanMarkerIds,
  fogMode = false,
  presenceIndex,
  selectedMarkerId,
  onSelectMarker,
  onOpenDetail,
  onCloseSidebar,
}: TerritoryListSidebarProps) {
  const [scope, setScope] = useState<ScopeMode>('current');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [onlyOrphans, setOnlyOrphans] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [collapsedMapIds, setCollapsedMapIds] = useState<Set<number>>(new Set());

  // Indeks entri Codex berdasarkan ID untuk pencarian & info
  const entryById = useMemo(() => {
    const m = new Map<number, CodexEntry>();
    for (const e of codexEntries) if (e.id != null) m.set(e.id, e);
    return m;
  }, [codexEntries]);

  // Hitung jumlah bab kemunculan sebuah penanda
  const getChapterCount = (m: MapMarker, entry?: CodexEntry): number => {
    if (entry?.id && presenceIndex?.byEntity) {
      return presenceIndex.byEntity.get(entry.id)?.indices?.length ?? 0;
    }
    return 0;
  };

  // Nama tampilan penanda (mematuhi fogMode jika entri rahasia)
  const getDisplayName = (m: MapMarker, entry?: CodexEntry): string => {
    if (fogMode && entry?.hidden) return '??? (Lokasi Rahasia)';
    return (
      entry?.name ||
      m.title ||
      (m.kind === 'area'
        ? 'Wilayah tanpa nama'
        : m.kind === 'route'
          ? 'Rute tanpa nama'
          : 'Pin lokasi tanpa nama')
    );
  };

  // Filter & sortir daftar penanda
  const filterMarkers = (markerList: MapMarker[]) => {
    const q = search.trim().toLowerCase();
    return markerList
      .filter((m) => {
        // Filter jenis
        if (kindFilter !== 'all' && m.kind !== kindFilter) return false;

        // Filter yatim
        const isOrphan = m.id != null && orphanMarkerIds.has(m.id);
        if (onlyOrphans && !isOrphan) return false;

        // Filter pencarian
        if (q) {
          const entry = m.codexId != null ? entryById.get(m.codexId) : undefined;
          const name = getDisplayName(m, entry).toLowerCase();
          const note = (m.note || '').toLowerCase();
          const category = entry ? getCategoryLabel(entry.category, categories).toLowerCase() : '';
          const faction = (entry?.factionTag || '').toLowerCase();

          const matches =
            name.includes(q) ||
            note.includes(q) ||
            category.includes(q) ||
            faction.includes(q);
          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const entryA = a.codexId != null ? entryById.get(a.codexId) : undefined;
        const entryB = b.codexId != null ? entryById.get(b.codexId) : undefined;

        if (sortBy === 'chapters') {
          const countA = getChapterCount(a, entryA);
          const countB = getChapterCount(b, entryB);
          if (countB !== countA) return countB - countA;
        } else if (sortBy === 'kind') {
          if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        }

        // Default: Sort by name
        const nameA = getDisplayName(a, entryA).toLowerCase();
        const nameB = getDisplayName(b, entryB).toLowerCase();
        return nameA.localeCompare(nameB);
      });
  };

  // Penanda di peta aktif
  const currentFilteredMarkers = useMemo(
    () => filterMarkers(markers),
    [markers, search, kindFilter, onlyOrphans, sortBy, entryById, categories, fogMode, orphanMarkerIds]
  );

  // Penanda di semua peta, dikelompokkan berdasarkan peta
  const groupedAllMarkers = useMemo(() => {
    const filtered = filterMarkers(allMarkers);
    const groups = new Map<number, MapMarker[]>();

    for (const m of filtered) {
      const list = groups.get(m.mapId) ?? [];
      list.push(m);
      groups.set(m.mapId, list);
    }

    // Pastikan peta aktif muncul paling atas bila memiliki penanda
    const sortedGroups: { map: AtlasMap; markers: MapMarker[] }[] = [];
    for (const map of allMaps) {
      if (!map.id) continue;
      const list = groups.get(map.id);
      if (list && list.length > 0) {
        if (map.id === activeMap?.id) {
          sortedGroups.unshift({ map, markers: list });
        } else {
          sortedGroups.push({ map, markers: list });
        }
      }
    }

    return sortedGroups;
  }, [allMarkers, allMaps, activeMap?.id, search, kindFilter, onlyOrphans, sortBy, entryById, categories, fogMode, orphanMarkerIds]);

  const toggleMapCollapse = (mapId: number) => {
    setCollapsedMapIds((prev) => {
      const next = new Set(prev);
      if (next.has(mapId)) next.delete(mapId);
      else next.add(mapId);
      return next;
    });
  };

  // Hitung jumlah statistik per jenis di peta aktif
  const currentStats = useMemo(() => {
    let areas = 0;
    let pins = 0;
    let routes = 0;
    for (const m of markers) {
      if (m.kind === 'area') areas++;
      else if (m.kind === 'pin') pins++;
      else if (m.kind === 'route') routes++;
    }
    return { areas, pins, routes, total: markers.length };
  }, [markers]);

  return (
    <aside className="z-10 flex h-full w-[70%] max-w-80 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header Utama Sidebar */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers size={15} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider truncate">
              Katalog Wilayah
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {scope === 'current'
                ? `${currentFilteredMarkers.length} di peta aktif`
                : `${allMarkers.length} wilayah di seluruh peta`}
            </p>
          </div>
        </div>

        <button
          onClick={onCloseSidebar}
          title="Sembunyikan Sidebar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Scope Toggle: Peta Ini vs Semua Peta */}
      <div className="p-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/70 text-xs font-medium">
          <button
            onClick={() => setScope('current')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md transition-all cursor-pointer',
              scope === 'current'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            <MapIcon size={13} />
            <span className="truncate">Peta Ini ({markers.length})</span>
          </button>
          <button
            onClick={() => setScope('all')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md transition-all cursor-pointer',
              scope === 'all'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            <Globe size={13} />
            <span className="truncate">Semua ({allMarkers.length})</span>
          </button>
        </div>

        {/* Input Pencarian */}
        <div className="relative mt-2">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              scope === 'current'
                ? 'Cari wilayah di peta ini...'
                : 'Cari di seluruh peta semesta...'
            }
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter Baris: Jenis & Status */}
        <div className="mt-2 flex items-center justify-between gap-1 text-[11px]">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              onClick={() => setKindFilter('all')}
              className={cn(
                'px-2 py-0.5 rounded-md border font-medium transition-colors shrink-0 cursor-pointer',
                kindFilter === 'all'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              Semua
            </button>
            <button
              onClick={() => setKindFilter('area')}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-colors shrink-0 cursor-pointer',
                kindFilter === 'area'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              <Hexagon size={11} /> Area
            </button>
            <button
              onClick={() => setKindFilter('pin')}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-colors shrink-0 cursor-pointer',
                kindFilter === 'pin'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              <MapPin size={11} /> Pin
            </button>
            <button
              onClick={() => setKindFilter('route')}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-colors shrink-0 cursor-pointer',
                kindFilter === 'route'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              <RouteIcon size={11} /> Rute
            </button>
          </div>

          {/* Tombol filter Yatim */}
          <button
            onClick={() => setOnlyOrphans((v) => !v)}
            title="Tampilkan hanya wilayah yang belum punya entri Codex"
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors shrink-0 cursor-pointer',
              onlyOrphans
                ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-semibold'
                : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
            )}
          >
            <AlertTriangle size={11} />
            <span>Yatim</span>
          </button>
        </div>
      </div>

      {/* Ringkasan Sub-Bar / Info Bar */}
      {scope === 'current' && currentStats.total > 0 && (
        <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{currentStats.areas} Area</span>
            <span>•</span>
            <span>{currentStats.pins} Pin</span>
            <span>•</span>
            <span>{currentStats.routes} Rute</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[10px]">Urut:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-[11px] font-medium text-slate-600 dark:text-slate-300 border-none outline-hidden cursor-pointer p-0 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
            >
              <option value="name">A-Z</option>
              <option value="kind">Jenis</option>
              <option value="chapters">Bab</option>
            </select>
          </div>
        </div>
      )}

      {/* Daftar Scrollable */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
        {scope === 'current' ? (
          // TAB: PETA AKTIF
          currentFilteredMarkers.length > 0 ? (
            currentFilteredMarkers.map((marker) => (
              <MarkerListItemCard
                key={marker.id}
                marker={marker}
                entry={marker.codexId != null ? entryById.get(marker.codexId) : undefined}
                categories={categories}
                color={colorFor(marker)}
                isOrphan={marker.id != null && orphanMarkerIds.has(marker.id)}
                fogMode={fogMode}
                chapterCount={getChapterCount(
                  marker,
                  marker.codexId != null ? entryById.get(marker.codexId) : undefined
                )}
                isSelected={marker.id === selectedMarkerId}
                onClick={() => marker.id && onSelectMarker(marker.id, marker.mapId)}
                onDoubleClick={() => marker.id && onOpenDetail?.(marker.id, marker.mapId)}
                onOpenDetail={() => marker.id && onOpenDetail?.(marker.id, marker.mapId)}
              />
            ))
          ) : (
            <EmptyListFeedback
              hasFilter={Boolean(search || kindFilter !== 'all' || onlyOrphans)}
              onReset={() => {
                setSearch('');
                setKindFilter('all');
                setOnlyOrphans(false);
              }}
              scope="current"
            />
          )
        ) : (
          // TAB: SEMUA PETA (GROUPED BY MAP)
          groupedAllMarkers.length > 0 ? (
            <div className="space-y-3">
              {groupedAllMarkers.map(({ map, markers: groupMarkers }) => {
                const isCollapsed = collapsedMapIds.has(map.id!);
                const isActive = map.id === activeMap?.id;

                return (
                  <div
                    key={map.id}
                    className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40"
                  >
                    {/* Header Peta (Accordion) */}
                    <button
                      onClick={() => toggleMapCollapse(map.id!)}
                      className="w-full flex items-center justify-between p-2.5 bg-slate-100/70 dark:bg-slate-800/60 hover:bg-slate-200/60 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isCollapsed ? (
                          <ChevronRight size={14} className="text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown size={14} className="text-slate-400 shrink-0" />
                        )}
                        <MapIcon size={14} className="text-indigo-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {map.name}
                        </span>
                        {isActive && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            Aktif
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 shrink-0">
                        {groupMarkers.length} wilayah
                      </span>
                    </button>

                    {/* Isi Penanda di dalam Peta */}
                    {!isCollapsed && (
                      <div className="p-1.5 space-y-1">
                        {groupMarkers.map((marker) => (
                          <MarkerListItemCard
                            key={marker.id}
                            marker={marker}
                            entry={marker.codexId != null ? entryById.get(marker.codexId) : undefined}
                            categories={categories}
                            color={colorFor(marker)}
                            isOrphan={marker.id != null && orphanMarkerIds.has(marker.id)}
                            fogMode={fogMode}
                            chapterCount={getChapterCount(
                              marker,
                              marker.codexId != null ? entryById.get(marker.codexId) : undefined
                            )}
                            isFromOtherMap={!isActive}
                            mapName={map.name}
                            isSelected={marker.id === selectedMarkerId}
                            onClick={() => marker.id && onSelectMarker(marker.id, map.id!)}
                            onDoubleClick={() => marker.id && onOpenDetail?.(marker.id, map.id!)}
                            onOpenDetail={() => marker.id && onOpenDetail?.(marker.id, map.id!)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyListFeedback
              hasFilter={Boolean(search || kindFilter !== 'all' || onlyOrphans)}
              onReset={() => {
                setSearch('');
                setKindFilter('all');
                setOnlyOrphans(false);
              }}
              scope="all"
            />
          )
        )}
      </div>

      {/* Footer Bantuan Pintas */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
        <span className="truncate">💡 <strong>Klik 1x</strong>: Sorot peta</span>
        <span className="truncate"><strong>Klik 2x</strong>: Detail</span>
      </div>
    </aside>
  );
}

// Kartu penanda individual dalam daftar
interface MarkerListItemCardProps {
  marker: MapMarker;
  entry?: CodexEntry;
  categories: CategoryDef[];
  color: string;
  isOrphan: boolean;
  fogMode: boolean;
  chapterCount: number;
  isFromOtherMap?: boolean;
  mapName?: string;
  isSelected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onOpenDetail?: () => void;
}

function MarkerListItemCard({
  marker,
  entry,
  categories,
  color,
  isOrphan,
  fogMode,
  chapterCount,
  isFromOtherMap,
  mapName,
  isSelected,
  onClick,
  onDoubleClick,
  onOpenDetail,
}: MarkerListItemCardProps) {
  const Meta = KIND_META[marker.kind] ?? KIND_META.pin;
  const Icon = Meta.icon;
  const isHiddenSecret = Boolean(fogMode && entry?.hidden);

  const title = isHiddenSecret
    ? '??? (Lokasi Rahasia)'
    : entry?.name ||
      marker.title ||
      (marker.kind === 'area'
        ? 'Wilayah tanpa nama'
        : marker.kind === 'route'
          ? 'Rute tanpa nama'
          : 'Pin lokasi tanpa nama');

  const categoryLabel = entry ? getCategoryLabel(entry.category, categories) : null;
  const hasSubMap = Boolean(marker.linkedMapId);

  return (
    <div
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenDetail?.() ?? onDoubleClick?.();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (isSelected) {
            onOpenDetail?.();
          } else {
            onClick();
          }
        } else if (e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group relative w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 select-none',
        isSelected
          ? 'border-indigo-500 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
          : 'border-slate-200/70 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-800/60 hover:bg-indigo-50/40 dark:hover:bg-slate-800 shadow-2xs hover:shadow-xs'
      )}
    >
      {/* Ikon Tipe / Warna Penanda */}
      <span
        className={cn(
          'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-2xs transition-transform border border-white/20 dark:border-black/20',
          isSelected ? 'scale-110 ring-2 ring-indigo-400' : 'group-hover:scale-105'
        )}
        style={{ backgroundColor: isHiddenSecret ? '#7c3aed' : color }}
      >
        <Icon size={13} className="text-white drop-shadow-xs" />
      </span>

      {/* Info Teks */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4
            className={cn(
              'text-xs truncate transition-colors',
              isSelected
                ? 'font-bold text-indigo-950 dark:text-indigo-100'
                : 'font-semibold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
            )}
          >
            {title}
          </h4>

          <div className="flex items-center gap-1 shrink-0">
            {isFromOtherMap && (
              <span
                title={`Pindah ke peta "${mapName}"`}
                className="text-slate-400 group-hover:text-indigo-500"
              >
                <ArrowUpRight size={13} />
              </span>
            )}
            {/* Tombol Aksi Detail Langsung */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail?.();
              }}
              title="Buka detail wilayah lengkap (atau klik 2x kartu)"
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer',
                isSelected
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  : 'opacity-0 group-hover:opacity-100 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
              )}
            >
              <span>Detail</span>
              <ArrowUpRight size={11} />
            </button>
          </div>
        </div>

        {/* Sub-label: Kategori Codex / Jenis */}
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {categoryLabel ? `${categoryLabel}` : Meta.label}
          {entry?.factionTag && ` · ${entry.factionTag}`}
        </p>

        {/* Badges Baris Bawah */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {isSelected && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Aktif di peta
            </span>
          )}

          {hasSubMap && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <ArrowUpRight size={10} /> Sub-Peta
            </span>
          )}

          {isOrphan && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <AlertTriangle size={10} /> Yatim
            </span>
          )}

          {chapterCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
              <BookOpen size={10} /> {chapterCount} bab
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Komponen Umpan Balik Kosong
function EmptyListFeedback({
  hasFilter,
  onReset,
  scope,
}: {
  hasFilter: boolean;
  onReset: () => void;
  scope: 'current' | 'all';
}) {
  if (hasFilter) {
    return (
      <div className="h-48 flex flex-col items-center justify-center p-4 text-center">
        <Filter size={24} className="text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Tidak ada wilayah yang cocok
        </p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
          Coba ubah kata kunci pencarian atau sesuaikan filter jenis penanda.
        </p>
        <button
          onClick={onReset}
          className="mt-3 px-3 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-100 transition-colors cursor-pointer"
        >
          Reset Filter
        </button>
      </div>
    );
  }

  return (
    <div className="h-56 flex flex-col items-center justify-center p-4 text-center">
      <Hexagon size={28} className="text-slate-300 dark:text-slate-600 mb-2 stroke-[1.5]" />
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        {scope === 'current' ? 'Belum ada wilayah di peta ini' : 'Belum ada wilayah yang dibuat'}
      </p>
      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed max-w-[220px]">
        {scope === 'current'
          ? 'Gunakan tombol di atas kanvas untuk mulai menggambar poligon area, menempatkan pin, atau menandai rute.'
          : 'Pilih salah satu peta lalu tambahkan penanda untuk mulai mengarsip semesta novel.'}
      </p>
    </div>
  );
}
