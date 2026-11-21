/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Panel samping detail penanda Atlas — deskripsi Codex tertaut + kehadiran bab
 * (dari `PresenceIndex`, reuse), taut/lepas Codex, sunting judul/catatan/warna,
 * dan hapus. Klik "Buka di Codex" → `openCodexEntry` (deep-link dua-arah §4).
 */

import { useEffect, useState } from 'react';
import { MapPin, Route as RouteIcon, Hexagon, X, Trash2, BookOpen, Link2, Move, Check, Clock, Ruler, AlertTriangle, ExternalLink, EyeOff, ArrowLeft, LocateFixed, ChevronDown } from 'lucide-react';
import { CodexEntry, MapMarker, AtlasMap, RoutePoint, TravelSpeedProfile } from '@/src/types';
import { CategoryDef, getCategoryLabel } from '@/src/lib/codexCategories';
import { stripHtml } from '@/src/lib/editorUtils';
import { cn } from '@/src/lib/utils';
import { RegionAnalytic } from '@/src/lib/atlasAnalytics';
import { calculateRelativeDistance, calculateRealDistance, calculateTravelTime, sampleRoutePath, showsIntermediateRoutePoints } from '@/src/lib/mapGeometry';
import { PathStyleSelect } from './AtlasControls';
import { SubMapPreviewCard } from './SubMapPreviewCard';
import { RoutePointSidebar } from './RoutePointSidebar';
import { AreaContents } from './AreaContents';
import { vertexId, type AreaPointEdit, type RoutePointEdit } from '@/src/lib/atlasRoutePoints';

export interface PresenceChapter {
  id: number;
  title: string;
  /** Nomor tampil (1-based, urutan manuskrip). */
  number: number;
}

interface MarkerSidebarProps {
  marker: MapMarker;
  entry?: CodexEntry;
  categories: CategoryDef[];
  presence: PresenceChapter[];
  regionAnalytic?: RegionAnalytic;
  color: string;
  /** Entri Codex untuk dropdown taut. */
  codexEntries: CodexEntry[];
  /** Mode ubah geometri (seret handle di peta) aktif untuk penanda ini. */
  editing: boolean;
  activeMap: AtlasMap;
  travelSpeeds?: TravelSpeedProfile[];
  /** Status yatim */
  isOrphan?: boolean;
  orphanReason?: 'never_mentioned' | 'unlinked';
  /** Mode kabut rahasia */
  fogMode?: boolean;
  /** Daftar seluruh peta untuk penautan sub-peta */
  allMaps?: AtlasMap[];
  allMarkers?: MapMarker[];
  onOpenSubMap?: (mapId: number) => void;
  onToggleEdit: () => void;
  onCenterMarker: () => void;
  onSave: (patch: Partial<MapMarker>) => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenCodex: (id: number) => void;
  onJumpChapter: (id: number) => void;
  mapMarkers: MapMarker[];
  focusedVertexId?: string;
  titleForMarker: (marker: MapMarker) => string;
  titleForRoutePoint: (point: RoutePoint) => string | undefined;
  onFocusVertex: (pointId: string) => void;
  onEditRoutePoint: (edit: RoutePointEdit) => void;
  onEditAreaPoint: (edit: AreaPointEdit) => void;
  onOpenMarker: (marker: MapMarker) => void;
  onSetImportantLocation: (pinId: number, role?: string) => Promise<void>;
}

const KIND_META: Record<string, { icon: typeof MapPin; label: string }> = {
  pin: { icon: MapPin, label: 'Pin lokasi' },
  area: { icon: Hexagon, label: 'Wilayah' },
  route: { icon: RouteIcon, label: 'Rute' },
};

export default function MarkerSidebar({
  marker,
  entry,
  categories,
  presence,
  regionAnalytic,
  color,
  codexEntries,
  editing,
  activeMap,
  travelSpeeds,
  isOrphan,
  orphanReason,
  fogMode,
  allMaps,
  allMarkers,
  onOpenSubMap,
  onToggleEdit,
  onCenterMarker,
  onSave,
  onDelete,
  onClose,
  onOpenCodex,
  onJumpChapter,
  mapMarkers,
  focusedVertexId,
  titleForMarker,
  titleForRoutePoint,
  onFocusVertex,
  onEditRoutePoint,
  onEditAreaPoint,
  onOpenMarker,
  onSetImportantLocation,
}: MarkerSidebarProps) {
  const [title, setTitle] = useState(marker.title ?? '');
  const [note, setNote] = useState(marker.note ?? '');

  // Reset field lokal saat penanda yang dipilih berganti.
  useEffect(() => {
    setTitle(marker.title ?? '');
    setNote(marker.note ?? '');
  }, [marker.id]);

  const Meta = KIND_META[marker.kind] ?? KIND_META.pin;
  const Icon = Meta.icon;
  const isHiddenSecret = !!(fogMode && entry?.hidden);
  const heading = isHiddenSecret ? '??? (Lokasi Rahasia)' : (entry?.name || marker.title || Meta.label);
  const description = entry?.description ? stripHtml(entry.description) : '';
  const areaStyle = marker.meta?.areaStyle === 'curved' ? 'curved' : 'straight';
  const areaVertices = marker.kind === 'area' && Array.isArray(marker.geometry) ? marker.geometry : [];
  const areaPointIndex = Math.max(0, areaVertices.findIndex((point, index) => vertexId(point, index) === focusedVertexId));
  const areaPoint = areaVertices[areaPointIndex];

  // Hitung jarak & waktu untuk Rute
  const routeStyle = marker.meta?.routeStyle === 'curved' ? 'curved' : 'straight';
  const routePoints = marker.kind === 'route' && Array.isArray(marker.geometry) ? marker.geometry : [];
  const relDist = calculateRelativeDistance(sampleRoutePath(routePoints, routeStyle));
  const realDist = calculateRealDistance(relDist, activeMap.scale);
  const hasScale = !!activeMap.scale;

  const selectedSpeedId = marker.meta?.speedProfileId;
  const selectedSpeed = travelSpeeds?.find(s => s.id === selectedSpeedId);
  const travelTime = realDist > 0 && selectedSpeed ? calculateTravelTime(realDist, selectedSpeed.speedPerDay) : 0;

  const areaBoundary = marker.kind === 'area' && (
    <section aria-label="Batas area" className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <PathStyleSelect label="Bentuk batas" value={areaStyle} onChange={(value) => onSave({ meta: { areaStyle: value } })} />
      {editing && areaStyle === 'curved' && areaPoint && (
        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            Titik batas
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
              value={vertexId(areaPoint, areaPointIndex)}
              onChange={(event) => onFocusVertex(event.target.value)}
            >
              {areaVertices.map((point, index) => (
                <option key={vertexId(point, index)} value={vertexId(point, index)}>Titik {index + 1}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={areaPoint.sharp === true} className="accent-indigo-600" onChange={(event) => {
              onEditAreaPoint({ kind: 'corner', pointId: vertexId(areaPoint, areaPointIndex), sharp: event.target.checked });
            }} />
            Sudut tegas
          </label>
          <p className="text-slate-500 dark:text-slate-400">Klik titik di peta untuk memilihnya. Shift+klik untuk mengubah sudut.</p>
        </div>
      )}
    </section>
  );
  const codexSummary = entry && (
    <div className="space-y-2">
      {isHiddenSecret ? (
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/60 rounded-xl text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
          <EyeOff size={14} className="shrink-0" />
          <span>Deskripsi disamarkan dalam Mode Kabut Rahasia.</span>
        </div>
      ) : (
        description && (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-6">{description}</p>
        )
      )}
      <button
        onClick={() => onOpenCodex(entry.id!)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        <BookOpen size={13} /> Buka di Codex
      </button>
    </div>
  );
  const linkedSubMap = allMaps?.find(candidate => candidate.id === marker.linkedMapId);

  return (
    <aside aria-label="Detail penanda Atlas" className="z-10 flex h-full w-[70%] max-w-80 shrink-0 flex-col border-l border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="shrink-0 space-y-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-slate-600 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-300"
          >
            <ArrowLeft size={14} /> Daftar Wilayah
          </button>
          <button type="button" onClick={onClose} aria-label="Tutup Detail" title="Tutup Detail"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: isHiddenSecret ? '#7c3aed' : color }}>
            <Icon size={16} className="text-white" />
          </span>
          <div className="min-w-0">
            <h3 title={heading} className="truncate text-base font-semibold text-slate-950 dark:text-slate-100">{heading}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{Meta.label}{entry && ` ? ${getCategoryLabel(entry.category, categories)}`}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCenterMarker}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium hover:border-indigo-300 dark:border-slate-700"
          >
            <LocateFixed size={14} /> Pusatkan di peta
          </button>
          <button type="button" onClick={onToggleEdit}
            className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium',
              editing ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 hover:border-emerald-400 dark:border-slate-700')}
          >
            {editing ? <><Check size={14} /> Selesai mengubah</> : <><Move size={14} /> Ubah posisi/bentuk</>}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {editing && (
          <p className="rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {marker.kind === 'pin'
              ? 'Seret pin di peta untuk memindahkannya.'
              : 'Seret titik untuk memindah, klik titik tengah untuk menambah, atau klik kanan untuk menghapus.'}
          </p>
        )}
        {editing && areaBoundary}
        {marker.kind === 'pin' && codexSummary}
        {marker.kind === 'area' && (
          <AreaContents
            key={marker.id}
            area={marker}
            markers={mapMarkers}
            containedPinIds={regionAnalytic?.containedPins ?? []}
            titleFor={titleForMarker}
            onOpenMarker={onOpenMarker}
            onSetImportantLocation={onSetImportantLocation}
          />
        )}

        <RoutePointSidebar
          marker={marker}
          markers={mapMarkers}
          entries={codexEntries}
          fogMode={fogMode}
          editing={editing}
          focusedPointId={focusedVertexId}
          titleForMarker={titleForMarker}
          titleForPoint={titleForRoutePoint}
          onFocusPoint={onFocusVertex}
          onEditPoint={onEditRoutePoint}
          onOpenMarker={onOpenMarker}
          onOpenCodex={onOpenCodex}
        />

        {/* Kalkulator Waktu & Jarak (hanya untuk Rute) */}
        {marker.kind === 'route' && (
          <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1"><Ruler size={12} /> Jarak Rute</span>
              {hasScale ? (
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {realDist.toLocaleString(undefined, { maximumFractionDigits: 1 })} {activeMap.scale!.distanceUnit}
                </span>
              ) : (
                <span className="text-[10px] text-amber-600 dark:text-amber-500 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded">Belum dikalibrasi</span>
              )}
            </div>

            {hasScale && (
              <>
                <label className="block space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Metode Perjalanan</span>
                  <select
                    value={selectedSpeedId ?? ''}
                    onChange={(e) => onSave({ meta: { speedProfileId: e.target.value || undefined } })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
                  >
                    <option value="">— pilih metode —</option>
                    {(travelSpeeds || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.speedPerDay} {activeMap.scale!.distanceUnit}/{s.unit})</option>
                    ))}
                  </select>
                </label>

                {selectedSpeed && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1"><Clock size={12} /> Estimasi Waktu</span>
                    <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {Math.ceil(travelTime)} {selectedSpeed.unit}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}


        {linkedSubMap?.id !== undefined && onOpenSubMap && (
          <button type="button" onClick={() => { if (linkedSubMap.id !== undefined) onOpenSubMap(linkedSubMap.id); }}
            title={linkedSubMap.name}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            <ExternalLink size={14} /> Masuk &amp; Jelajahi Sub-Peta
          </button>
        )}
        {marker.kind !== 'pin' && codexSummary}
        {/* Kehadiran bab */}
        {(entry || regionAnalytic) && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {marker.kind === 'area' ? 'Aktivitas di Wilayah Ini' : 'Muncul di bab'}
            </span>
            {presence.length ? (
              <div className="flex flex-wrap gap-1.5">
                {presence.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => onJumpChapter(ch.id)}
                    title={ch.title}
                    className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                  >
                    {ch.number}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-500">Belum pernah muncul dalam manuskrip.</p>
            )}
          </div>
        )}


        {!editing && areaBoundary}
        {marker.kind === 'route' && (
          <section aria-label="Tampilan rute" className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <PathStyleSelect label="Bentuk rute" value={routeStyle} onChange={(value) => onSave({ meta: { routeStyle: value } })} />
            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="mt-0.5 accent-indigo-600"
                checked={showsIntermediateRoutePoints(marker.meta)}
                onChange={(event) => onSave({ meta: { showIntermediatePoints: event.target.checked } })}
              />
              Tampilkan titik antara
            </label>
          </section>
        )}

        <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
            Pengaturan penanda
            <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-slate-200 p-3 dark:border-slate-700">
            {isOrphan && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle size={14} className="shrink-0" />
                {orphanReason === 'unlinked' ? 'Penanda belum tertaut ke Codex.' : 'Penanda belum muncul di bab mana pun.'}
              </div>
            )}
            {/* Taut Codex */}
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1"><Link2 size={12} /> Taut Codex</span>
              <select
                value={marker.codexId ?? ''}
                onChange={(e) => onSave({ codexId: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
              >
                <option value="">— tak tertaut —</option>
                {codexEntries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {/* Peta Bertingkat (Sub-peta) */}
            {allMaps && allMaps.length > 1 && (
              <SubMapPreviewCard
                subMapId={marker.linkedMapId}
                activeMapId={activeMap.id!}
                allMaps={allMaps}
                allMarkers={allMarkers}
                onChangeLinkedMap={(linkedMapId) => onSave({ linkedMapId })}
              />
            )}
            {/* Judul & catatan fallback */}
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Judul {entry && '(fallback)'}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title !== (marker.title ?? '') && onSave({ title: title.trim() || undefined })}
                placeholder="mis. Gerbang Utara"
                className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Catatan</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== (marker.note ?? '') && onSave({ note: note.trim() || undefined })}
                rows={3}
                placeholder="Catatan bebas untuk penanda ini…"
                className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none focus:outline-none focus:border-indigo-400"
              />
            </label>

            {/* Warna override */}
            <label className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Warna</span>
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={marker.color ?? color}
                  onChange={(e) => onSave({ color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                  aria-label="Warna penanda"
                />
                {marker.color && (
                  <button onClick={() => onSave({ color: undefined })} className="text-[11px] text-slate-400 hover:text-slate-600">reset</button>
                )}
              </span>
            </label>
            <button
              onClick={onDelete}
              className={cn('w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
                'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40')}
            >
              <Trash2 size={14} /> Hapus penanda
            </button>
          </div>
        </details>
      </div>
    </aside>
  );
}
