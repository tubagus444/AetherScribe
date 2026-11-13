// @vitest-environment jsdom
import React from 'react';
import L from 'leaflet';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapCanvas from './MapCanvas';
import type { AtlasMap, MapMarker } from '@/src/types';

const payload = '<img src="x" onerror="window.__atlasXss=1"><svg onload="window.__atlasXss=2"></svg><script>window.__atlasXss=3</script>& "kutip"';
const map = { id: 1, projectId: 1, name: 'Fixture', width: 600, height: 400, createdAt: 1, imageBlob: new Blob() } as AtlasMap;
const geometry = {
  pin: { x: .5, y: .5 },
  area: [{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .5, y: .8 }],
  route: [{ x: .2, y: .2 }, { x: .8, y: .8 }],
};
const variants: [MapMarker['kind'], boolean][] = [['pin', false], ['pin', true], ['area', false], ['area', true], ['route', false]];
const nativeUrl = URL;
const nativeSvg = L.Browser.svg;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.stubGlobal('URL', class extends nativeUrl {
    static createObjectURL = vi.fn(() => 'blob:atlas-fixture');
    static revokeObjectURL = vi.fn();
  });
  // jsdom memiliki DOM SVG, tetapi tidak menyediakan feature probe createSVGRect.
  (L.Browser as { svg: boolean }).svg = true;
  (window as any).__atlasXss = 0;
});
afterEach(() => { cleanup(); (L.Browser as { svg: boolean }).svg = nativeSvg; vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (window as any).__atlasXss; });

function mount(kind: MapMarker['kind'], portal: boolean, selected: boolean, codexName = false, editing = false, color = '#e11d48') {
  // Simulasikan nilai tersimpan/impor JSON, tanpa sanitasi form maupun DB pengguna.
  const marker: MapMarker = JSON.parse(JSON.stringify({
    id: 1, projectId: 1, mapId: 1, kind, geometry: geometry[kind], title: payload,
    linkedMapId: portal ? 2 : undefined, codexId: codexName ? 7 : undefined, createdAt: 1,
  }));
  const spy = vi.spyOn(L, 'map');
  const onMarkerClick = vi.fn();
  const onOpenSubMap = vi.fn();
  const view = render(<MapCanvas map={map} markers={[marker]} drawMode={null}
    selectedMarkerId={selected ? 1 : undefined} editing={editing}
    colorFor={() => color} titleFor={codexName ? () => payload : undefined}
    onCreateGeometry={vi.fn()} onMarkerClick={onMarkerClick} onOpenSubMap={onOpenSubMap} />);
  return { ...view, leaflet: spy.mock.results[0].value as L.Map, onMarkerClick, onOpenSubMap, marker };
}

function expectInert(container: HTMLElement) {
  expect(container.querySelector('script, img[src="x"], [onerror], [onload]')).toBeNull();
  expect((window as any).__atlasXss).toBe(0);
}

describe.each([false, true])('F01 persisted label from Codex=%s with real Leaflet DOM', codexName => {
  it.each(variants)('renders selected %s portal=%s as literal text', (kind, portal) => {
    const { container } = mount(kind, portal, true, codexName);
    expect(container.textContent).toContain(payload);
    expectInert(container);
  });

  it.each(variants)('renders hover tooltips for %s portal=%s as literal text', (kind, portal) => {
    const { container, leaflet } = mount(kind, portal, false, codexName);
    const targets: L.Layer[] = [];
    leaflet.eachLayer(layer => { if (layer.getTooltip()) targets.push(layer); });
    expect(targets.length).toBeGreaterThan(0);
    for (const layer of targets) {
      act(() => layer.openTooltip());
      expect(layer.getTooltip()!.getElement()!.textContent).toContain(payload);
      expectInert(container);
      act(() => layer.closeTooltip());
    }
  });
});

describe('F01 color and interaction boundaries', () => {
  it.each([['pin', false], ['pin', true], ['area', false], ['route', false]] as const)('rejects injected CSS/HTML in %s portal=%s', (kind, portal) => {
    const { container } = mount(kind, portal, true, false, false, '#fff;"><img src="x" onerror="window.__atlasXss=1">');
    expectInert(container);
  });

  it.each(['pin', 'area', 'route'] as const)('rejects malicious colors on editing handles for %s', kind => {
    const { container, leaflet } = mount(kind, false, true, false, true, '#fff;"><img src="x" onerror="window.__atlasXss=1">');
    expectInert(container);
    leaflet.eachLayer(layer => {
      if (layer instanceof L.Path) expect(layer.options.color).toBe('#64748b');
    });
  });

  it('preserves marker click and portal double-click handlers', () => {
    const { leaflet, marker, onMarkerClick, onOpenSubMap } = mount('pin', true, true);
    const layers: L.Marker[] = [];
    leaflet.eachLayer(layer => { if (layer instanceof L.Marker) layers.push(layer); });
    expect(layers).toHaveLength(1);
    act(() => { layers[0].fire('click'); layers[0].fire('dblclick'); });
    expect(onMarkerClick).toHaveBeenCalledWith(marker);
    expect(onOpenSubMap).toHaveBeenCalledWith(2);
  });

  it('preserves the regular pin/portal decorations and valid marker colors', () => {
    const { container, rerender, marker } = mount('pin', true, false, false, false, '#12ab34');
    expect(container.querySelector('.atlas-portal-marker svg')).not.toBeNull();
    expect(container.querySelector('[style*="rgb(18, 171, 52)"]')).not.toBeNull();
    rerender(<MapCanvas map={map} markers={[{ ...marker, linkedMapId: undefined }]} drawMode={null}
      colorFor={() => '#12ab34'} onCreateGeometry={vi.fn()} onMarkerClick={vi.fn()} />);
    expect(container.querySelector('.atlas-beacon-pin')).not.toBeNull();
    expect(container.querySelector('[style*="rgb(18, 171, 52)"]')).not.toBeNull();
    expectInert(container);
  });
});
