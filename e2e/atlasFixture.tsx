import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../src/db';
import MapCanvas from '../src/features/atlas/components/MapCanvas';
import { useAtlasSelection } from '../src/features/atlas/hooks/useAtlasSelection';
import { useAtlasFilters } from '../src/features/atlas/hooks/useAtlasFilters';
import { MapMiniThumbnail } from '../src/features/atlas/components/AtlasControls';
import { createAtlasOperations } from '../src/services/atlasOperations';
import type { AtlasMap } from '../src/types';

export async function mountAtlasFixture() {
  const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
  const ops = createAtlasOperations(1);
  const id = await ops.createMap('Atlas fixture', { blob: new Blob([image], { type: 'image/png' }), width: 600, height: 400, resized: false });
  const atlasMap = await db.maps.get(id);
  if (!atlasMap) throw new Error('Fixture map missing');
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const root = createRoot(host);
  function Fixture({ map }: { map: AtlasMap }) {
    const state = useAtlasSelection();
    const [mounted, setMounted] = useState(true);
    const markers = useLiveQuery(() => db.mapMarkers.where('mapId').equals(id).toArray(), [], []);
    const filters = useAtlasFilters(markers, []);
    return <>
      {(['pin', 'area', 'route'] as const).map(kind => <button key={kind} onClick={() => { state.setEditingGeometry(false); state.setSelectedMarkerId(undefined); state.setDrawMode(kind); }}>Draw {kind}</button>)}
      <button onClick={() => state.setEditingGeometry(true)}>Edit geometry</button>
      <button onClick={() => filters.setOffKinds(new Set(['pin']))}>Hide pins</button>
      <button onClick={() => filters.setOffKinds(new Set())}>Show all</button>
      <button onClick={() => setMounted(false)}>Unmount canvas</button>
      <output data-testid="atlas-count">{filters.visibleMarkers.length}</output>
      {mounted && <><MapMiniThumbnail blob={map.imageBlob} /><div style={{ width: 800, height: 500, position: 'relative' }}>
        <MapCanvas map={map} markers={filters.visibleMarkers} drawMode={state.drawMode}
          selectedMarkerId={state.selectedMarkerId} editing={state.editingGeometry}
          colorFor={() => '#e11d48'} titleFor={m => m.title || m.kind}
          onMarkerClick={m => state.setSelectedMarkerId(m.id)} onDraftChange={state.setDraftCount}
          onCreateGeometry={async geometry => {
            const kind = state.drawMode;
            if (!kind || kind === 'scale') return;
            const key = await ops.addMarker({ mapId: id, kind, geometry, title: '<img src=x onerror="window.__atlasXss=1">' });
            state.setDrawMode(null); state.setSelectedMarkerId(key);
          }}
          onGeometryChange={(key, geometry) => { void ops.updateMarker(key, { geometry }); }} />
      </div></>}
    </>;
  }
  root.render(<Fixture map={atlasMap} />);
  return id;
}
