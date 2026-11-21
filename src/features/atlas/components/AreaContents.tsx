import { useState } from 'react';
import { useContainedAreas } from '@/src/features/atlas/hooks/useContainedAreas';
import type { MapMarker } from '@/src/types';

interface Props {
  area: MapMarker;
  markers: MapMarker[];
  containedPinIds: number[];
  titleFor: (marker: MapMarker) => string;
  onOpenMarker: (marker: MapMarker) => void;
  onSetImportantLocation: (pinId: number, role?: string) => Promise<void>;
}

const linkStyle = 'min-w-0 text-left text-indigo-700 hover:underline dark:text-indigo-300';
const fieldStyle = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';

export function AreaContents({ area, markers, containedPinIds, titleFor, onOpenMarker, onSetImportantLocation }: Props) {
  const containedAreaIds = useContainedAreas(area, markers);
  const [selectedPin, setSelectedPin] = useState<number>();
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pins = markers.filter(marker => marker.kind === 'pin' && marker.mapId === area.mapId && marker.id !== undefined);
  const pinsById = new Map(pins.map(pin => [pin.id, pin]));
  const insideIds = new Set(containedPinIds);
  const insidePins = pins.filter(pin => pin.id !== undefined && insideIds.has(pin.id));
  const areaIds = new Set(containedAreaIds);
  const insideAreas = markers.filter(marker => marker.id !== undefined && areaIds.has(marker.id));
  const importantLocations = area.meta?.importantLocations ?? [];
  const roles = new Map(importantLocations.map(location => [location.pinId, location.role]));
  const selectedPinExists = pinsById.has(selectedPin);

  const save = async (pinId: number, name?: string) => {
    setBusy(true);
    setError('');
    try {
      await onSetImportantLocation(pinId, name);
      if (pinId === selectedPin) {
        setSelectedPin(undefined);
        setRole('');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Lokasi penting gagal disimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
      <section aria-label="Pin di dalam wilayah" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold">Pin di dalam wilayah</h4>
          <span className="text-slate-500 dark:text-slate-400">{insidePins.length} penanda</span>
        </div>
        {insidePins.length === 0 && <p className="text-slate-500 dark:text-slate-400">Belum ada pin di dalam batas.</p>}
        <ul className="space-y-1.5">
          {insidePins.map(pin => (
            <li key={pin.id} className="flex flex-wrap items-baseline gap-x-2">
              <button type="button" onClick={() => onOpenMarker(pin)} className={linkStyle}>{titleFor(pin)}</button>
              {pin.id !== undefined && roles.has(pin.id) && <span className="text-slate-500 dark:text-slate-400">{roles.get(pin.id)}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Wilayah di dalamnya" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold">Wilayah di dalamnya</h4>
          {containedAreaIds !== null && <span className="text-slate-500 dark:text-slate-400">{insideAreas.length} area</span>}
        </div>
        {containedAreaIds === null && <p role="status" className="text-slate-500 dark:text-slate-400">Memeriksa batas wilayah…</p>}
        {containedAreaIds !== null && insideAreas.length === 0 && <p className="text-slate-500 dark:text-slate-400">Belum ada area di dalam batas.</p>}
        <ul className="space-y-1.5">
          {insideAreas.map(nested => (
            <li key={nested.id}>
              <button type="button" onClick={() => onOpenMarker(nested)} className={linkStyle}>{titleFor(nested)}</button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Lokasi penting" className="space-y-2">
        <h4 className="text-sm font-semibold">Lokasi penting</h4>
        {!importantLocations.length && <p className="text-slate-500 dark:text-slate-400">Belum ada lokasi dengan peran khusus.</p>}
        <ul className="space-y-2">
          {importantLocations.map(location => {
            const pin = pinsById.get(location.pinId);
            if (!pin) return null;
            const name = titleFor(pin);
            return (
              <li key={location.pinId} className="flex items-start justify-between gap-2">
                <div>
                  <button type="button" onClick={() => onOpenMarker(pin)} className={linkStyle}>{name}</button>
                  <p className="text-slate-500 dark:text-slate-400">{location.role}{!insideIds.has(location.pinId) && ' · Di luar batas'}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Lepas peran ${name}`}
                  className="shrink-0 text-rose-700 hover:underline disabled:opacity-50 dark:text-rose-400"
                  onClick={() => { void save(location.pinId); }}
                >
                  Lepas
                </button>
              </li>
            );
          })}
        </ul>
        {pins.length > 0 && (
          <details className="rounded-lg border border-slate-200 dark:border-slate-700">
            <summary className="cursor-pointer px-2.5 py-2 font-medium text-indigo-700 dark:text-indigo-300">Atur peran lokasi</summary>
            <form className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800" onSubmit={event => {
              event.preventDefault();
              if (selectedPin !== undefined && selectedPinExists && role.trim() && !busy) void save(selectedPin, role);
            }}>
              <label className="block space-y-1">
                <span>Pin lokasi penting</span>
                <select className={fieldStyle} value={selectedPinExists ? selectedPin : ''} disabled={busy} onChange={event => {
                  const id = event.target.value ? Number(event.target.value) : undefined;
                  setSelectedPin(id);
                  setRole(id === undefined ? '' : roles.get(id) ?? '');
                }}>
                  <option value="">Pilih pin</option>
                  {pins.map(pin => <option key={pin.id} value={pin.id}>{titleFor(pin)}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span>Peran lokasi</span>
                <input className={fieldStyle} placeholder="Mis. Ibu Kota" value={role} disabled={busy} onChange={event => setRole(event.target.value)} />
              </label>
              <button type="submit" disabled={!selectedPinExists || !role.trim() || busy}
                className="rounded-md bg-indigo-600 px-2.5 py-1.5 font-medium text-white disabled:opacity-50"
              >
                Simpan peran
              </button>
            </form>
          </details>
        )}
        {error && <p role="alert" className="text-rose-700 dark:text-rose-400">{error}</p>}
      </section>
    </div>
  );
}
