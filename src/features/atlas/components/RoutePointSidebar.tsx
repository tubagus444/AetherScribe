import type { CodexEntry, MapMarker, RoutePoint } from '@/src/types';
import { vertexId, routePointRole, routePoints, routePointVisible, type RoutePointEdit } from '@/src/lib/atlasRoutePoints';
import { showsIntermediateRoutePoints } from '@/src/lib/mapGeometry';
import { cn } from '@/src/lib/utils';

interface Props {
  marker: MapMarker;
  markers: MapMarker[];
  entries: CodexEntry[];
  fogMode?: boolean;
  editing: boolean;
  focusedPointId?: string;
  titleForMarker: (marker: MapMarker) => string;
  titleForPoint: (point: RoutePoint) => string | undefined;
  onFocusPoint: (pointId: string) => void;
  onEditPoint: (edit: RoutePointEdit) => void;
  onOpenMarker: (marker: MapMarker) => void;
  onOpenCodex: (id: number) => void;
}

const fieldStyle = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const linkStyle = 'text-left text-indigo-700 hover:underline dark:text-indigo-300';

export function RoutePointSidebar({
  marker, markers, entries, fogMode, editing, focusedPointId, titleForMarker, titleForPoint,
  onFocusPoint, onEditPoint, onOpenMarker, onOpenCodex,
}: Props) {
  if (marker.kind === 'pin') {
    const routes = markers.flatMap(route => {
      const points = routePoints(route);
      const roles = points.flatMap((point, index) =>
        point.pinId === marker.id ? [routePointRole(index, points.length)] : []);
      return roles.length ? [{ route, roles: [...new Set(roles)] }] : [];
    });
    return (
      <section aria-label="Rute terhubung" className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <h4 className="text-sm font-semibold">Rute terhubung</h4>
        {routes.length === 0 && <p className="text-xs text-slate-500">Pin ini belum terhubung ke rute.</p>}
        <ul className="space-y-2 text-xs">
          {routes.map(({ route, roles }) => (
            <li key={route.id}>
              <button type="button" className={linkStyle} onClick={() => onOpenMarker(route)}>{titleForMarker(route)}</button>
              <p className="text-slate-500 dark:text-slate-400">{roles.join(' · ')}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const points = routePoints(marker);
  if (!points.length) return null;
  const pins = markers.filter(pin => pin.kind === 'pin' && pin.mapId === marker.mapId && pin.id !== undefined);
  const pinById = new Map(pins.map(pin => [pin.id, pin]));
  const showIntermediate = showsIntermediateRoutePoints(marker.meta);
  const rows = points.map((point, index) => ({
    point,
    id: vertexId(point, index),
    title: titleForPoint(point),
    role: routePointRole(index, points.length),
    visible: routePointVisible(point, index, points.length, showIntermediate),
    index,
  }));
  const active = rows.find(row => row.id === focusedPointId) ?? rows[0];
  const save = (patch: Partial<Pick<RoutePoint, 'name' | 'visible' | 'pinId' | 'codexId'>>) => {
    onEditPoint({ kind: 'details', pointId: active.id, patch });
  };

  return (
    <section aria-label="Tempat singgah" className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <h4 className="text-sm font-semibold">Tempat singgah</h4>
      {editing && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
          <label className="block space-y-1">
            <span>Titik rute</span>
            <select className={fieldStyle} value={active.id} onChange={event => onFocusPoint(event.target.value)}>
              {rows.map(row => <option key={row.id} value={row.id}>Titik {row.index + 1}{row.title && ` · ${row.title}`}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-indigo-600" checked={active.visible} onChange={event => save({ visible: event.target.checked })} />
            Tampilkan di peta
          </label>
          <label className="block space-y-1">
            <span>Nama titik</span>
            <input
              key={`${active.id}:${active.point.name ?? ''}`}
              className={fieldStyle}
              defaultValue={active.point.name ?? ''}
              onBlur={event => {
                const name = event.target.value.trim() || undefined;
                if (name !== active.point.name) save({ name });
              }}
            />
          </label>
          <label className="block space-y-1">
            <span>Pin Atlas</span>
            <select className={fieldStyle} value={active.point.pinId ?? ''} onChange={event => {
              const pinId = event.target.value ? Number(event.target.value) : undefined;
              save(pinId === undefined ? { pinId } : { pinId, codexId: undefined });
            }}>
              <option value="">Tanpa pin</option>
              {pins.map(pin => <option key={pin.id} value={pin.id}>{titleForMarker(pin)}</option>)}
            </select>
          </label>
          {active.point.pinId === undefined ? (
            <label className="block space-y-1">
              <span>Codex titik</span>
              <select className={fieldStyle} value={active.point.codexId ?? ''} onChange={event => {
                save({ codexId: event.target.value ? Number(event.target.value) : undefined });
              }}>
                <option value="">Tanpa entri</option>
                {entries.filter(entry => entry.id !== undefined).map(entry => (
                  <option key={entry.id} value={entry.id}>{fogMode && entry.hidden ? 'Lokasi rahasia' : entry.name}</option>
                ))}
              </select>
            </label>
          ) : <p className="text-slate-600 dark:text-slate-300">Posisi dan Codex mengikuti pin tertaut.</p>}
        </div>
      )}
      <ol className="space-y-2 text-xs">
        {rows.filter(row => row.visible || row.title).map(row => {
          const pin = pinById.get(row.point.pinId);
          const codexId = pin?.codexId ?? row.point.codexId;
          return (
            <li key={row.id} className="flex items-start justify-between gap-2">
              <div>
                <button
                  type="button"
                  className={cn(linkStyle, row.id === focusedPointId && 'font-semibold')}
                  onClick={() => editing || !pin ? onFocusPoint(row.id) : onOpenMarker(pin)}
                >
                  {row.title ?? `Titik ${row.index + 1}`}
                </button>
                <p className="text-slate-500 dark:text-slate-400">{row.role}{!row.visible && ' · Tersembunyi'}</p>
              </div>
              {codexId !== undefined && (
                <button type="button" className={linkStyle} onClick={() => onOpenCodex(codexId)}>Codex</button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
