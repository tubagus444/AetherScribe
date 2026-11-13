/** Ikon Leaflet dibangun sebagai DOM. Data judul tidak pernah diparse sebagai HTML. */
import L from 'leaflet';
import { safeAtlasColor } from '@/src/lib/atlasColors';

/** cssText hanya untuk konstanta internal. Data warna dipasang lewat property CSS. */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function atlasText(text: string): HTMLElement {
  const node = document.createElement('span');
  node.textContent = text;
  return node;
}

function icon(className: string, size: number | [number, number], root: HTMLElement): L.DivIcon {
  const [width, height] = typeof size === 'number' ? [size, size] : size;
  return L.divIcon({ className, iconSize: [width, height], iconAnchor: [width / 2, height / 2], html: root });
}

function coloredSpan(css: string, color: string): HTMLSpanElement {
  const node = element('span', css);
  node.style.backgroundColor = safeAtlasColor(color);
  return node;
}

/** SVG dekoratif hanya berisi atribut konstan, tanpa markup dari data pengguna. */
function portalSymbol(area = false): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({
    width: area ? '11' : '9', height: area ? '11' : '9', viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': area ? '2.5' : '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  })) svg.setAttribute(key, value);
  const parts = area
    ? [['polygon', { points: '12 2 2 7 12 12 22 7 12 2' }], ['polyline', { points: '2 17 12 22 22 17' }], ['polyline', { points: '2 12 12 17 22 12' }]] as const
    : [['polyline', { points: '15 3 21 3 21 9' }], ['polyline', { points: '9 21 3 21 3 15' }], ['line', { x1: '21', y1: '3', x2: '14', y2: '10' }], ['line', { x1: '3', y1: '21', x2: '10', y2: '14' }]] as const;
  for (const [tag, attrs] of parts) {
    const path = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) path.setAttribute(key, value);
    svg.append(path);
  }
  return svg;
}

export function vertexIcon(color: string): L.DivIcon {
  const root = element('div', 'width:14px;height:14px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.35);cursor:grab');
  root.style.backgroundColor = safeAtlasColor(color);
  return icon('atlas-vertex', 14, root);
}

export function midIcon(): L.DivIcon {
  return icon('atlas-midpoint', 11, element('div', 'width:11px;height:11px;background:#fff;border:2px dashed #2563eb;border-radius:50%;opacity:.85;cursor:copy'));
}

export function regularPinIcon(color: string, isOrphan?: boolean): L.DivIcon {
  const root = element('div', 'position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center');
  root.append(
    element('span', 'position:absolute;inset:0;border-radius:9999px;background:rgba(0,0,0,0.28)'),
    coloredSpan('position:absolute;inset:1.5px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)', isOrphan ? '#f59e0b' : color),
    element('span', 'position:relative;width:4px;height:4px;border-radius:9999px;background:rgba(255,255,255,.85)'),
  );
  return icon('atlas-beacon-pin', 22, root);
}

export function portalPinIcon(color: string, selected: boolean): L.DivIcon {
  const root = element('div', 'position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer');
  const ring = element('span', 'position:absolute;inset:1px;border-radius:9999px;border:2px solid #818cf8;background:rgba(15,23,42,.88)');
  ring.style.borderColor = selected ? '#f59e0b' : '#818cf8';
  ring.style.boxShadow = selected ? '0 0 14px rgba(245,158,11,.95)' : '0 0 10px rgba(99,102,241,.75)';
  const core = coloredSpan('position:relative;width:15px;height:15px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:inset 0 1px 2px rgba(0,0,0,.4)', color);
  core.append(portalSymbol());
  root.append(element('span', 'position:absolute;inset:0;border-radius:9999px;background:rgba(99,102,241,.3);animation:ping 2s cubic-bezier(0,0,.2,1) infinite'), ring, core);
  return icon('atlas-portal-marker', 28, root);
}

export function portalAreaBadgeIcon(title: string, selected: boolean): L.DivIcon {
  const root = element('div');
  if (selected) root.style.setProperty('border-color', '#f59e0b', 'important');
  root.append(portalSymbol(true), element('span', 'max-width:80px;overflow:hidden;text-overflow:ellipsis', title),
    element('span', 'font-size:9px;background:#4f46e5;color:#fff;padding:1px 4px;border-radius:4px;margin-left:2px;font-weight:bold', '↗ Sub'));
  return icon('atlas-portal-area-badge', [120, 26], root);
}

export function selectedPinIcon(color: string, title: string, hasSubMap: boolean): L.DivIcon {
  const root = element('div', 'position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer');
  const spotlight = element('span', 'position:absolute;width:28px;height:28px;border-radius:9999px');
  spotlight.className = 'atlas-selected-pin-spotlight';
  const core = coloredSpan('position:relative;width:15px;height:15px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center', color);
  if (hasSubMap) core.append(element('span', 'font-size:8px;color:#fff;font-weight:900', '↗'));
  const floating = element('div', 'position:absolute;bottom:36px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none;z-index:999;filter:drop-shadow(0 3px 8px rgba(0,0,0,.3))');
  const badge = element('div');
  badge.className = 'atlas-selected-pin-badge';
  badge.append(element('span', 'width:7px;height:7px;border-radius:9999px;background:#f59e0b;display:inline-block;animation:pulse 1s infinite'),
    element('span', 'max-width:140px;overflow:hidden;text-overflow:ellipsis', title));
  if (hasSubMap) badge.append(element('span', 'font-size:9px;background:#4f46e5;color:#fff;padding:0 3px;border-radius:3px', 'Sub-Peta'));
  const arrow = element('div');
  arrow.className = 'atlas-selected-pin-arrow';
  floating.append(badge, arrow);
  root.append(
    element('span', 'position:absolute;width:56px;height:56px;border-radius:9999px;background:rgba(245,158,11,.22);border:2.5px solid rgba(245,158,11,.9);animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite'),
    element('span', 'position:absolute;width:40px;height:40px;border-radius:9999px;background:rgba(245,158,11,.28);border:2px solid rgba(245,158,11,.95);animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite;animation-delay:.5s'),
    spotlight, core, floating,
  );
  return icon('atlas-selected-pin-marker', 44, root);
}

export function selectedAreaBadgeIcon(title: string): L.DivIcon {
  const root = element('div');
  root.append(element('span', 'color:#f59e0b;font-size:13px', '🏰'), element('span', 'max-width:115px;overflow:hidden;text-overflow:ellipsis', title));
  return icon('atlas-selected-area-badge', [160, 30], root);
}

export function selectedRouteBadgeIcon(title: string): L.DivIcon {
  const root = element('div');
  root.append(element('span', 'color:#f59e0b', '🛣️'), element('span', 'max-width:95px;overflow:hidden;text-overflow:ellipsis', title));
  return icon('atlas-selected-route-badge', [140, 28], root);
}
