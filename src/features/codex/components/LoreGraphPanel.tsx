/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Graf Lore Visual Interaktif (#14) — visualisasi node-edge di atas `buildLoreGraphView`
 * (`src/lib/loreGraph.ts`). Nol token, nol AI, nol tabel baru: seluruh graf DITURUNKAN dari
 * Codex + relasi + janji plot yang sudah ada. Render pakai `react-force-graph-2d` (canvas +
 * d3-force, sudah di dependencies). Klik node membuka dialog detail di atas graf.
 *
 * Komputasi graf (scan Aho-Corasick O(n²)) dijalankan di Web Worker via `useLoreGraphWorker`
 * agar main thread tetap responsif saat codex ratusan entri. Debounce 300ms mencegah burst.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { forceX, forceY } from 'd3-force';
import { Share2, Database, ArrowRight, Users, Quote, Crosshair, Maximize2, EyeOff, Loader2 } from 'lucide-react';
import { db } from '@/src/db';
import { useChapterList } from '@/src/hooks/useChapterQueries';
import { useOptimizedLiveQuery } from '@/src/hooks/useOptimizedLiveQuery';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useUI } from '@/src/contexts/UIContext';
import { useCodexCategories } from '@/src/features/codex/hooks/useCodexCategories';
import { CodexDetailModal } from '@/src/features/codex/components/CodexDetailModal';
import { LoreGraphSearch } from '@/src/features/codex/components/LoreGraphSearch';
import { getCategoryDef, getCategoryLabel } from '@/src/lib/codexCategories';
import { indexDetailChapters } from '@/src/lib/codexDetails';
import { RELATIONSHIP_TYPES } from '@/src/features/codex/relationshipTypes';
import { useLoreGraphWorker } from '@/src/features/codex/hooks/useLoreGraphWorker';
import { type LoreGraphNode, type LoreLinkVia } from '@/src/lib/loreGraph';

interface LoreGraphPanelProps {
  projectId: number;
}

/**
 * Hex per kunci warna kategori (`CategoryDef.color`) untuk render kanvas — registry pusat
 * hanya menyimpan kelas Tailwind, kanvas butuh hex (pola sama `TYPE_STYLE.hex` di
 * RelationshipMapper). Nilai = Tailwind `-500`.
 */
const CATEGORY_HEX: Record<string, string> = {
  indigo: '#6366f1', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e',
  sky: '#0ea5e9', slate: '#64748b', violet: '#8b5cf6', teal: '#14b8a6',
  orange: '#f97316', red: '#ef4444', green: '#22c55e', blue: '#3b82f6',
  pink: '#ec4899', cyan: '#06b6d4', lime: '#84cc16', fuchsia: '#d946ef',
};
const FALLBACK_HEX = '#64748b';

/** Gaya edge per jenis tautan. */
const VIA_STYLE: Record<LoreLinkVia, { label: string; hex: string; dash: number[] | null; icon: React.ReactNode }> = {
  relationship: { label: 'Relasi', hex: '#6366f1', dash: null, icon: <Users size={12} /> },
  mention: { label: 'Sebutan', hex: '#94a3b8', dash: [3, 3], icon: <Quote size={12} /> },
  payoff: { label: 'Payoff Janji', hex: '#f59e0b', dash: [6, 3], icon: <Crosshair size={12} /> },
};
const ALL_VIA: LoreLinkVia[] = ['relationship', 'mention', 'payoff'];

/**
 * Hex per TIPE relasi (di-key oleh `value` dari sumber tunggal `relationshipTypes.ts`) —
 * selaras dengan `TYPE_STYLE.hex` di RelationshipMapper agar warna garis relasi konsisten
 * antar-panel. Metadata visual per-tipe boleh di komponen (CLAUDE.md), di-key oleh value.
 */
const REL_TYPE_HEX: Record<string, string> = {
  Friend: '#3b82f6', Enemy: '#ef4444', Family: '#8b5cf6', Lover: '#ec4899',
  Ally: '#10b981', 'Resides In': '#f59e0b', Owns: '#06b6d4', Other: '#94a3b8',
};
/** Warna sebuah edge: relasi diwarnai per-tipe, lainnya per-via. */
const linkHex = (l: { via: LoreLinkVia; label?: string }): string =>
  l.via === 'relationship' ? (REL_TYPE_HEX[l.label ?? ''] ?? VIA_STYLE.relationship.hex) : VIA_STYLE[l.via].hex;

// Node yang dipakai runtime react-force-graph (menambah x/y/vx/vy di objek yang sama).
type GNode = LoreGraphNode & { color: string; categoryLabel: string; x?: number; y?: number };
type GLink = { source: number | GNode; target: number | GNode; via: LoreLinkVia; label?: string };
type GraphFocus = { id: number; center: { x: number; y: number }; zoom: number };

/** Ambil id kedua ujung link — force-graph me-resolve source/target dari angka jadi objek. */
const linkEndIds = (l: GLink): [number, number] => {
  const idOf = (v: number | GNode) => (typeof v === 'object' ? v.id : v);
  return [idOf(l.source), idOf(l.target)];
};

export function LoreGraphPanel({ projectId }: LoreGraphPanelProps) {
  const { openCodexEntry, setViewMode } = useNavigation();
  const { theme } = useUI();
  const { categories } = useCodexCategories(projectId);
  const chapters = useChapterList(projectId);
  const detailChapters = useMemo(() => indexDetailChapters(chapters ?? []), [chapters]);

  const entries = useOptimizedLiveQuery(() => db.codex.where('projectId').equals(projectId).toArray(), [projectId]);
  const relationships = useOptimizedLiveQuery(() => db.relationships.where('projectId').equals(projectId).toArray(), [projectId]);
  const promises = useOptimizedLiveQuery(() => db.plotPromises.where('projectId').equals(projectId).toArray(), [projectId]);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const selectedEntry = selectedEntryId === null
    ? undefined
    : entries?.find(entry => entry.id === selectedEntryId && entry.projectId === projectId);
  const closeDetail = useCallback(() => setSelectedEntryId(null), []);

  // Signature stabil dari data yang MEMENGARUHI graf. `useLiveQuery` memancarkan array baru
  // tiap emit (walau isi identik) → tanpa ini `base`/`graphData` bikin objek node baru terus
  // → simulasi force RESTART tiap render → node tak pernah menetap (kanvas tampak kosong).
  const sig = useMemo(() => JSON.stringify({
    e: (entries || []).map(e => [e.id, e.name, e.category, e.hidden, e.aliases, e.description, e.secret]),
    r: (relationships || []).map(r => [r.sourceId, r.targetId, r.type]),
    p: (promises || []).map(p => [p.id, p.codexId, p.payoffCodexId, p.title]),
    c: (categories || []).map(c => [c.slug, c.color]),
  }), [entries, relationships, promises, categories]);

  // --- Graf dasar (semua node/edge) — dibangun di Web Worker, debounce 300ms ---------------
  const { data: workerResult, computing } = useLoreGraphWorker(entries, relationships, promises, sig);

  const base = useMemo(() => {
    if (!workerResult) return { nodes: [] as GNode[], links: [] as GLink[] };
    const nodes: GNode[] = workerResult.nodes.map(n => {
      const colorKey = getCategoryDef(n.category, categories)?.color ?? 'slate';
      return { ...n, color: CATEGORY_HEX[colorKey] ?? FALLBACK_HEX, categoryLabel: getCategoryLabel(n.category, categories) };
    });
    return { nodes, links: workerResult.links as GLink[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerResult, categories]);

  // Kategori yang benar-benar ada (untuk chip filter).
  const presentCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of base.nodes) if (!map.has(n.category)) map.set(n.category, n.categoryLabel);
    return [...map.entries()].map(([slug, label]) => ({ slug, label }));
  }, [base.nodes]);

  // Tipe relasi yang benar-benar dipakai (untuk legenda per-tipe, urutan `RELATIONSHIP_TYPES`).
  const presentRelTypes = useMemo(() => {
    const used = new Set<string>();
    for (const l of base.links) if (l.via === 'relationship' && l.label) used.add(l.label);
    return RELATIONSHIP_TYPES.filter(t => used.has(t.value));
  }, [base.links]);

  // --- Filter state -------------------------------------------------------------------
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [activeVia, setActiveVia] = useState<Set<LoreLinkVia>>(new Set(ALL_VIA));
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const [jump, setJump] = useState<{ id: number } | null>(null);
  const [focus, setFocus] = useState<GraphFocus | null>(null);

  const clearHighlight = () => {
    setHighlightedId(null);
    setRevealedId(null);
    setJump(null);
  };

  // --- Graf tersaring — objek node BARU tiap deps berubah (force re-layout) ------------
  const graphData = useMemo(() => {
    const links = base.links.filter(l => activeVia.has(l.via));
    // Node terlihat: kategori aktif; edge hanya antar node terlihat.
    const visibleIds = new Set(base.nodes.filter(n => !hiddenCats.has(n.category)).map(n => n.id));
    let liveLinks = links.filter(l => visibleIds.has(l.source as number) && visibleIds.has(l.target as number));

    // Degree ulang atas edge yang benar-benar tampil (untuk "hanya terhubung" & ukuran node).
    const deg = new Map<number, number>();
    for (const l of liveLinks) {
      deg.set(l.source as number, (deg.get(l.source as number) ?? 0) + 1);
      deg.set(l.target as number, (deg.get(l.target as number) ?? 0) + 1);
    }
    const nodes = base.nodes
      .filter(n => visibleIds.has(n.id))
      .filter(n => !onlyConnected || (deg.get(n.id) ?? 0) > 0)
      .map(n => ({ ...n, degree: deg.get(n.id) ?? 0 }));

    if (onlyConnected) {
      const keep = new Set(nodes.map(n => n.id));
      liveLinks = liveLinks.filter(l => keep.has(l.source as number) && keep.has(l.target as number));
    }
    const filteredIds = new Set(nodes.map(n => n.id));
    if (revealedId !== null && !filteredIds.has(revealedId)) {
      const revealed = base.nodes.find(n => n.id === revealedId);
      if (revealed) nodes.push({ ...revealed, degree: 0 });
    }
    return { nodes, links: liveLinks.map(l => ({ ...l })), filteredIds };
  }, [base, hiddenCats, activeVia, onlyConnected, revealedId]);

  const locateNode = (id: number) => {
    setFocus(null);
    setHighlightedId(id);
    setRevealedId(graphData.filteredIds.has(id) ? null : id);
    setJump({ id });
  };

  const isolatedCount = useMemo(() => base.nodes.filter(n => n.degree === 0).length, [base.nodes]);

  // --- Ukuran kanvas — CALLBACK REF, bukan effect --------------------------------------
  // Komponen `return null` selagi `useLiveQuery` memuat, jadi div kanvas belum ada pada
  // commit pertama. Effect ber-deps `[]` yang berjalan saat itu melihat ref null lalu tak
  // pernah jalan lagi → ResizeObserver tak terpasang → `size` selamanya 0×0 → `ForceGraph2D`
  // tak ter-mount. Callback ref memasang observer TEPAT saat elemen menempel (kapan pun).
  const [size, setSize] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const wrapElRef = useRef<HTMLDivElement | null>(null);
  const setWrapEl = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    wrapElRef.current = el;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const preserveCameraOnSettle = useRef(false);
  // Paskan HANYA setelah simulasi berhenti (`onEngineStop`) — memaskan saat node masih di
  // titik asal membuat bbox nol → zoom meledak → node melayang keluar viewport. Selama
  // menetap, kamera default (zoom 1, terpusat) menampilkan node menyebar dari tengah.

  // Gaya penarik-tengah lembut: tanpa link, node terisolasi hanya ditolak muatan (charge)
  // dan melayang jauh. forceX/forceY(0) menarik SETIAP node ke pusat agar yang terisolasi
  // tetap dekat. Dipasang lewat ref, lalu simulasi dipanaskan ulang. Dep `size.w > 0`
  // WAJIB: pada load awal ForceGraph di-gate `size.w > 0` (mula-mula 0) → belum ter-mount
  // → `fgRef.current` null saat effect pertama jalan. Tanpa dep ini gaya tak terpasang
  // sampai `graphData` berganti (mis. toggle filter) — itulah kenapa awalnya melayang jauh.
  const canvasReady = size.w > 0;
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg?.d3Force) return;
    preserveCameraOnSettle.current = false;
    fg.d3Force('x', forceX(0).strength(0.07));
    fg.d3Force('y', forceY(0).strength(0.07));
    fg.d3ReheatSimulation?.();
  }, [graphData, canvasReady]);

  const adjacency = useMemo(() => {
    const neighbors = new Map<number, Set<number>>();
    for (const link of graphData.links) {
      const [source, target] = linkEndIds(link);
      if (!neighbors.has(source)) neighbors.set(source, new Set());
      if (!neighbors.has(target)) neighbors.set(target, new Set());
      neighbors.get(source)?.add(target);
      neighbors.get(target)?.add(source);
    }
    return neighbors;
  }, [graphData]);
  const focusId = focus?.id ?? null;
  const focusIds = useMemo(() => focusId === null ? null : new Set([focusId, ...(adjacency.get(focusId) ?? [])]), [focusId, adjacency]);
  const highlightedNode = graphData.nodes.find(node => node.id === highlightedId);
  useEffect(() => {
    if (focusId !== null && !highlightedNode) setFocus(null);
  }, [focusId, highlightedNode]);

  const fitView = useCallback(() => {
    fgRef.current?.zoomToFit(0, Math.min(60, size.w / 5, size.h / 5), node => !focusIds || focusIds.has(node.id));
  }, [focusIds, size]);
  const centerNode = useCallback((id: number) => {
    const fg = fgRef.current;
    const node = graphData.nodes.find(n => n.id === id);
    if (!fg || node?.x == null || node.y == null) return false;
    fg.zoom(2.5);
    fg.centerAt(node.x, node.y);
    return true;
  }, [graphData]);
  useEffect(() => {
    if (jump && canvasReady) centerNode(jump.id);
  }, [jump, canvasReady, centerNode]);

  const startFocus = () => {
    const fg = fgRef.current;
    if (!fg || highlightedId === null) return;
    setJump(null);
    setFocus({ id: highlightedId, center: fg.centerAt(), zoom: fg.zoom() });
  };
  useEffect(() => {
    if (focusIds && canvasReady) fitView();
  }, [focusIds, canvasReady, fitView]);

  const endFocus = () => {
    if (!focus) return;
    preserveCameraOnSettle.current = true;
    setFocus(null);
    setHighlightedId(focus.id);
    fgRef.current?.zoom(focus.zoom);
    fgRef.current?.centerAt(focus.center.x, focus.center.y);
  };

  // Cari node di titik layar (relatif kanvas) SENDIRI, mem-bypass hit-test bawaan force-graph
  // — di lib versi ini + React 19 hanya SATU node teregistrasi di shadow-canvas (bug
  // colorTracker), sehingga baik klik maupun hover/tooltip bawaan cuma jalan untuk satu node.
  // `graph2ScreenCoords` terbukti akurat, jadi klik & tooltip kita hitung dari koordinat.
  // Dipakai bersama oleh onClick & onMouseMove wrapper (lihat kanvas).
  const nodeAtScreen = useCallback((x: number, y: number): GNode | null => {
    const fg = fgRef.current;
    if (!fg) return null;
    const k = fg.zoom();
    let hit: GNode | null = null, best = Infinity;
    for (const n of graphData.nodes) {
      if (focusIds && !focusIds.has(n.id)) continue;
      const sc = fg.graph2ScreenCoords(n.x ?? 0, n.y ?? 0);
      const d = Math.hypot(sc.x - x, sc.y - y);
      const rScreen = (3 + Math.min(8, n.degree * 1.1)) * k + 8; // radius node × zoom + padding
      if (d <= rScreen && d < best) { best = d; hit = n; }
    }
    return hit;
  }, [graphData, focusIds]);

  // Tooltip kustom (bawaan force-graph rusak, lihat di atas). Simpan node + posisi kursor.
  const [hovered, setHovered] = useState<{ node: GNode; x: number; y: number } | null>(null);

  // Node yang di-sorot (id + tetangga langsung) — REF agar drawNode/linkColor membacanya
  // tiap frame tanpa memicu re-render React. Diisi di onMouseMove wrapper.
  const hoverRef = useRef<{ id: number; neighbors: Set<number> } | null>(null);

  const dark = theme === 'dark';
  const labelColor = dark ? '#e2e8f0' : '#1e293b';
  const haloColor = dark ? '#0f172a' : '#f8fafc';

  const drawNode = useCallback((node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (focusIds && !focusIds.has(node.id)) return;
    const r = 3 + Math.min(8, node.degree * 1.1);
    const x = node.x ?? 0, y = node.y ?? 0;
    // Sorot-tetangga: saat sebuah node di-hover, node ini "aktif" bila ia sendiri atau
    // tetangga langsungnya; sisanya diredupkan agar fokus ke ego-network.
    const h = hoverRef.current;
    const highlighted = node.id === highlightedId;
    const active = highlighted || !h || node.id === h.id || h.neighbors.has(node.id);
    const isFocus = highlighted || node.id === h?.id;
    const baseAlpha = node.degree === 0 ? 0.5 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = node.color;
    ctx.globalAlpha = active ? baseAlpha : 0.12;
    ctx.fill();
    if (isFocus) {
      // Cincin fokus di node yang di-hover.
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = highlighted ? (dark ? '#a5b4fc' : '#4338ca') : (dark ? '#e2e8f0' : '#0f172a');
      ctx.stroke();
    } else if (node.hidden) {
      // Entri rahasia (mystery-box) → cincin putus-putus agar penulis mengenalinya.
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1.2 / scale;
      ctx.strokeStyle = dark ? '#a78bfa' : '#7c3aed';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    // Label tampil saat cukup zoom, ATAU saat node aktif dalam sorot (walau zoom kecil).
    if (active && (scale > 1.1 || h || highlighted)) {
      const fontSize = Math.max(3, 11 / scale);
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = node.name.length > 22 ? node.name.slice(0, 21) + '…' : node.name;
      ctx.lineWidth = 3 / scale;
      ctx.strokeStyle = haloColor;
      ctx.strokeText(label, x, y + r + 1.5);
      ctx.fillStyle = labelColor;
      ctx.fillText(label, x, y + r + 1.5);
    }
  }, [dark, labelColor, haloColor, focusIds, highlightedId]);

  // Area klik lewat jalur BAWAAN `nodeVal` (radius default = √nodeVal × nodeRelSize).
  // `nodePointerAreaPaint` kustom terbukti tak diterapkan di versi lib ini → force-graph
  // memakai area default seukuran nodeRelSize (≈1px) sehingga node besar nyaris tak bisa
  // diklik. Di sini nodeVal disetel agar radius klik = radius node terlihat + padding.
  const nodeVal = useCallback((node: GNode) => {
    const rr = 3 + Math.min(8, node.degree * 1.1) + 5;
    return rr * rr;
  }, []);

  if (!entries || !relationships || !promises) return null;

  if (entries.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-24 px-6 text-center">
        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
          <Database className="text-indigo-500 dark:text-indigo-400" size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Belum Ada Data Dunia</h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-8">
          Isi Kamus Data (Codex) dan hubungkan entri lewat relasi/sebutan — graf ini memetakan jaringannya secara otomatis.
        </p>
        <button
          onClick={() => setViewMode('codex')}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-indigo-700 transition-all active:scale-95"
        >
          Buka Kamus Data <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="mb-4 flex items-start gap-3 shrink-0">
        <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl shrink-0">
          <Share2 className="text-indigo-600 dark:text-indigo-400" size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-0.5">Dunia &amp; Lore</p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Graf Lore</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Jaringan seluruh dunia — {base.nodes.length} entri, {base.links.length} tautan
            {isolatedCount > 0 && <span className="text-amber-600 dark:text-amber-400">, {isolatedCount} terisolasi</span>}. Pilih node untuk melihat detailnya.
          </p>
        </div>
      </header>

      <div className="mb-3 shrink-0">
        <LoreGraphSearch
          entries={entries}
          categories={categories}
          visibleIds={focusIds ?? graphData.filteredIds}
          disabled={!workerResult}
          onLocate={locateNode}
        />
      </div>

      {/* Toolbar filter */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 shrink-0 text-xs">
        {/* Kategori */}
        <div className="flex flex-wrap items-center gap-1.5">
          {presentCategories.map(cat => {
            const off = hiddenCats.has(cat.slug);
            const colorKey = getCategoryDef(cat.slug, categories)?.color ?? 'slate';
            const hex = CATEGORY_HEX[colorKey] ?? FALLBACK_HEX;
            return (
              <button
                key={cat.slug}
                disabled={!!focus}
                onClick={() => {
                  clearHighlight();
                  const next = new Set(hiddenCats);
                  off ? next.delete(cat.slug) : next.add(cat.slug);
                  setHiddenCats(next);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium transition-all disabled:opacity-60 ${
                  off
                    ? 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 opacity-60'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900'
                }`}
                title={off ? `Tampilkan ${cat.label}` : `Sembunyikan ${cat.label}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: off ? 'transparent' : hex, border: off ? `1.5px solid ${hex}` : 'none' }} />
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        {/* Jenis tautan */}
        <div className="flex items-center gap-1.5">
          {ALL_VIA.map(via => {
            const on = activeVia.has(via);
            const st = VIA_STYLE[via];
            return (
              <button
                key={via}
                disabled={!!focus}
                onClick={() => {
                  clearHighlight();
                  const next = new Set(activeVia);
                  on ? next.delete(via) : next.add(via);
                  setActiveVia(next);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium transition-all disabled:opacity-60 ${
                  on ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-60'
                }`}
                title={on ? `Sembunyikan ${st.label}` : `Tampilkan ${st.label}`}
              >
                <span style={{ color: st.hex }}>{st.icon}</span>
                {st.label}
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        <label className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyConnected}
            disabled={!!focus}
            onChange={e => { clearHighlight(); setOnlyConnected(e.target.checked); }}
            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
          />
          Hanya yang terhubung
        </label>

        <button
          onClick={() => {
            preserveCameraOnSettle.current = true;
            setJump(null);
            fitView();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition-all"
          title="Paskan tampilan"
        >
          <Maximize2 size={12} /> Paskan
        </button>
      </div>

      {/* Kanvas graf — klik & hover ditangani di WRAPPER (bukan force-graph) via deteksi
          koordinat sendiri, karena hit-test bawaan lib hanya mengenali satu node. */}
      <div
        ref={setWrapEl}
        tabIndex={-1}
        className="relative flex-1 min-h-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 overflow-hidden"
        style={{ cursor: hovered ? 'pointer' : 'default' }}
        onMouseMove={(e) => {
          if (!(e.target instanceof HTMLCanvasElement)) return;
          const el = wrapElRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left, y = e.clientY - rect.top;
          const n = nodeAtScreen(x, y);
          hoverRef.current = n ? { id: n.id, neighbors: adjacency.get(n.id) ?? new Set() } : null;
          setHovered(n ? { node: n, x, y } : null);
        }}
        onMouseLeave={() => { hoverRef.current = null; setHovered(null); }}
        onClick={(e) => {
          if (!(e.target instanceof HTMLCanvasElement)) return;
          const el = wrapElRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const n = nodeAtScreen(e.clientX - rect.left, e.clientY - rect.top);
          if (!n) return;
          el.focus({ preventScroll: true });
          hoverRef.current = null;
          setHovered(null);
          if (!focus) {
            setJump(null);
            setHighlightedId(n.id);
          }
          setSelectedEntryId(n.id);
        }}
      >
        {graphData.nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 px-6 text-center">
            <span className="flex items-center gap-2"><EyeOff size={16} /> Tidak ada node yang cocok dengan filter aktif.</span>
          </div>
        ) : size.w > 0 && (
          <ForceGraph2D<GNode, GLink>
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            // Redraw kontinu agar sorot-tetangga (dibaca dari hoverRef tiap frame) langsung
            // tampak. Graf ini kecil-sedang jadi biayanya ringan.
            autoPauseRedraw={false}
            nodeRelSize={1}
            nodeVal={nodeVal}
            nodeCanvasObject={drawNode}
            // Klik/hover ditangani di wrapper (deteksi koordinat sendiri). Drag dimatikan
            // agar gestur di kanvas tak diserobot d3-drag.
            enableNodeDrag={false}
            enablePointerInteraction={false}
            linkVisibility={link => !focus || linkEndIds(link).includes(focus.id)}
            linkColor={(l: GLink) => {
              const h = hoverRef.current;
              if (h) {
                const [s, t] = linkEndIds(l);
                if (s !== h.id && t !== h.id) return dark ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.12)';
              }
              return linkHex(l);
            }}
            linkLineDash={(l: GLink) => VIA_STYLE[l.via].dash}
            linkWidth={(l: GLink) => {
              const base = l.via === 'relationship' ? 1.5 : 1;
              const h = hoverRef.current;
              if (!h) return base;
              const [s, t] = linkEndIds(l);
              return (s === h.id || t === h.id) ? base + 1 : base;
            }}
            linkDirectionalParticles={0}
            cooldownTicks={120}
            onEngineStop={() => {
              if (jump && centerNode(jump.id)) return;
              if (!preserveCameraOnSettle.current) fitView();
            }}
          />
        )}

        {/* Indikator komputasi — graf lama tetap terlihat, spinner kecil memberi sinyal
            bahwa worker sedang memproses data baru (debounce 300ms + build). */}
        {computing && (
          <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/70 dark:border-slate-700/70 shadow-sm">
            <Loader2 size={14} className="animate-spin text-indigo-500" />
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Memperbarui graf…</span>
          </div>
        )}

        {/* Tooltip kustom (bawaan force-graph tak andal di lib ini) */}
        {hovered && (
          <div
            className="absolute z-30 pointer-events-none px-2 py-1 rounded-md bg-slate-900/90 dark:bg-slate-800/95 text-white text-[11px] font-medium shadow-lg whitespace-nowrap"
            style={{
              left: hovered.x + 14,
              top: hovered.y + 14,
              transform: hovered.x > size.w * 0.72 ? 'translateX(calc(-100% - 28px))' : undefined,
            }}
          >
            <span className="font-semibold">{hovered.node.name}</span>
            <span className="opacity-70"> — {hovered.node.categoryLabel}</span>
            <span className="opacity-70">{hovered.node.degree === 0 ? ' · terisolasi' : ` · ${hovered.node.degree} tautan`}</span>
          </div>
        )}

        {/* Legenda — warna node per-kategori + jenis/tipe garis tautan */}
        <div className="absolute bottom-3 left-3 flex flex-col gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-lg px-2.5 py-2 border border-slate-200/70 dark:border-slate-800/70 shadow-sm pointer-events-none max-h-[60%] overflow-hidden">
          {/* Kategori (warna node) */}
          {presentCategories.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Kategori</span>
              {presentCategories.map(cat => {
                const colorKey = getCategoryDef(cat.slug, categories)?.color ?? 'slate';
                const hex = CATEGORY_HEX[colorKey] ?? FALLBACK_HEX;
                return (
                  <div key={cat.slug} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                    <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{cat.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tautan (garis) */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Tautan</span>
            {activeVia.has('relationship') && presentRelTypes.map(t => (
              <div key={t.value} className="flex items-center gap-2">
                <span className="w-5 h-0 border-t-2" style={{ borderColor: REL_TYPE_HEX[t.value] ?? VIA_STYLE.relationship.hex, borderStyle: 'solid' }} />
                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{t.label}</span>
              </div>
            ))}
            {(['mention', 'payoff'] as LoreLinkVia[]).filter(v => activeVia.has(v)).map(via => {
              const st = VIA_STYLE[via];
              return (
                <div key={via} className="flex items-center gap-2">
                  <span className="w-5 h-0 border-t-2" style={{ borderColor: st.hex, borderStyle: 'dashed' }} />
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        {highlightedNode && (
          <div className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 rounded-xl border border-indigo-100 bg-white px-2.5 py-1 text-xs text-indigo-800 shadow-sm dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-200">
            <span role="status" className="min-w-0 break-words font-semibold">
              {focus ? `Fokus ${highlightedNode.name} · ${(focusIds?.size ?? 1) - 1} node terhubung`
                : highlightedNode.name + (revealedId === highlightedNode.id ? ' · Ditampilkan sementara' : '')}
            </span>
            <button type="button" onClick={() => setSelectedEntryId(highlightedNode.id)} className="rounded-lg px-1.5 py-1.5 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900">Lihat detail</button>
            {focus ? (
              <button type="button" onClick={endFocus} className="rounded-lg px-1.5 py-1.5 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900">Kembali ke graf</button>
            ) : (
              <>
                {adjacency.has(highlightedNode.id) && (
                  <button type="button" onClick={startFocus} className="rounded-lg px-1.5 py-1.5 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900">Fokus hubungan langsung</button>
                )}
                <button type="button" onClick={clearHighlight} className="rounded-lg px-1.5 py-1.5 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900">Hapus sorotan</button>
              </>
            )}
          </div>
        )}
      </div>
      {selectedEntry && entries && relationships && workerResult && (
        <CodexDetailModal
          entry={selectedEntry}
          entries={entries}
          relationships={relationships}
          projectId={projectId}
          categories={categories}
          detailChapters={detailChapters}
          backlinks={workerResult.backlinks}
          onClose={closeDetail}
          onOpenEntry={entry => setSelectedEntryId(entry.id ?? null)}
          onOpenInCodex={() => {
            if (selectedEntryId === null) return;
            closeDetail();
            openCodexEntry(selectedEntryId);
          }}
        />
      )}
    </div>
  );
}
