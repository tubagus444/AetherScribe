/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewMode } from '@/src/types';

export type StudioId = 'writing' | 'world' | 'visual' | 'analysis' | 'assistant' | 'system';

export interface StudioTabDef {
  mode: ViewMode;
  label: string;
  shortLabel?: string;
  icon: string; // nama kunci ikon lucide
  description?: string;
}

export interface StudioDef {
  id: StudioId;
  label: string;
  icon: string;
  defaultMode: ViewMode;
  description: string;
  tabs: StudioTabDef[];
}

export const STUDIOS: StudioDef[] = [
  {
    id: 'writing',
    label: 'Menulis',
    icon: 'FileText',
    defaultMode: 'write',
    description: 'Editor naskah, perencanaan bab, dan progres penulisan harian.',
    tabs: [
      { mode: 'write', label: 'Editor Naskah', shortLabel: 'Editor', icon: 'FileText' },
      { mode: 'notes', label: 'Catatan Novel', shortLabel: 'Catatan', icon: 'BookMarked' },
      { mode: 'outline', label: 'Papan Rencana', shortLabel: 'Outline', icon: 'LayoutList' },
      { mode: 'dashboard', label: 'Statistik & Progres', shortLabel: 'Statistik', icon: 'BarChart2' },
    ],
  },
  {
    id: 'world',
    label: 'Dunia & Lore',
    icon: 'Database',
    defaultMode: 'codex',
    description: 'Ensiklopedi karakter, lokasi, glosarium, faksi, dan kronologi dunia.',
    tabs: [
      { mode: 'codex', label: 'Kamus Data (Codex)', shortLabel: 'Codex', icon: 'Database' },
      { mode: 'glossary', label: 'Glosarium Istilah', shortLabel: 'Glosarium', icon: 'BookMarked' },
      { mode: 'bible', label: 'Buku Cerita (Bible)', shortLabel: 'Story Bible', icon: 'Book' },
      { mode: 'factions', label: 'Faksi & Kelompok', shortLabel: 'Faksi', icon: 'Users' },
      { mode: 'timeline', label: 'Timeline Cerita', shortLabel: 'Timeline', icon: 'CalendarClock' },
      { mode: 'worldcalendar', label: 'Kalender Dunia', shortLabel: 'Kalender', icon: 'CalendarDays' },
      { mode: 'completeness', label: 'Kesehatan Codex', shortLabel: 'Kesehatan', icon: 'ClipboardList' },
      { mode: 'workshop', label: 'Lokakarya Codex', shortLabel: 'Lokakarya', icon: 'Sparkles' },
    ],
  },
  {
    id: 'visual',
    label: 'Visual & Peta',
    icon: 'Map',
    defaultMode: 'atlas',
    description: 'Peta spasial interaktif, graf jejaring lore, dan visualisasi relasi.',
    tabs: [
      { mode: 'atlas', label: 'Atlas Dunia', shortLabel: 'Peta Atlas', icon: 'Map' },
      { mode: 'graph', label: 'Graf Jejaring Lore', shortLabel: 'Graf Lore', icon: 'Waypoints' },
      { mode: 'relationships', label: 'Relasi Karakter', shortLabel: 'Peta Relasi', icon: 'Share2' },
    ],
  },
  {
    id: 'analysis',
    label: 'Analisis & Naskah',
    icon: 'ShieldCheck',
    defaultMode: 'continuity',
    description: 'Audit konsistensi alur cerita, heatmap tensi adegan, dan janji plot.',
    tabs: [
      { mode: 'continuity', label: 'Peta Kontinuitas', shortLabel: 'Kontinuitas', icon: 'Network' },
      { mode: 'consistency', label: 'Cek Konsistensi AI', shortLabel: 'Cek AI', icon: 'ShieldCheck' },
      { mode: 'heatmap', label: 'Heatmap Tensi', shortLabel: 'Heatmap', icon: 'Flame' },
      { mode: 'promises', label: 'Janji Plot', shortLabel: 'Janji Plot', icon: 'Crosshair' },
      { mode: 'prose', label: 'Wawasan Prosa', shortLabel: 'Gaya Prosa', icon: 'Gauge' },
      { mode: 'search', label: 'Cari Adegan Semantik', shortLabel: 'Cari Adegan', icon: 'Telescope' },
    ],
  },
  {
    id: 'assistant',
    label: 'Asisten AI',
    icon: 'BrainCircuit',
    defaultMode: 'brainstorm',
    description: 'Sesi konsultasi narasi interaktif dan snippet bantuan kreatif.',
    tabs: [
      { mode: 'brainstorm', label: 'Studio Asisten', shortLabel: 'Diskusi AI', icon: 'BrainCircuit' },
      { mode: 'actions', label: 'Snippet & Tindakan', shortLabel: 'Snippet', icon: 'Sparkles' },
    ],
  },
  {
    id: 'system',
    label: 'Sistem',
    icon: 'Settings',
    defaultMode: 'settings',
    description: 'Pengaturan aplikasi, panduan penggunaan, dan catatan error.',
    tabs: [
      { mode: 'settings', label: 'Pengaturan', shortLabel: 'Pengaturan', icon: 'Settings' },
      { mode: 'guide', label: 'Panduan Pengguna', shortLabel: 'Panduan', icon: 'HelpCircle' },
      { mode: 'errors', label: 'Log Error', shortLabel: 'Log Error', icon: 'AlertTriangle' },
    ],
  },
];

/** Pemetaan cepat ViewMode ke StudioId */
const VIEW_MODE_TO_STUDIO: Record<ViewMode, StudioId> = {
  // Writing
  write: 'writing',
  notes: 'writing',
  outline: 'writing',
  dashboard: 'writing',
  // World
  codex: 'world',
  glossary: 'world',
  bible: 'world',
  factions: 'world',
  timeline: 'world',
  worldcalendar: 'world',
  completeness: 'world',
  workshop: 'world',
  // Visual
  atlas: 'visual',
  graph: 'visual',
  relationships: 'visual',
  // Analysis
  continuity: 'analysis',
  consistency: 'analysis',
  heatmap: 'analysis',
  promises: 'analysis',
  prose: 'analysis',
  search: 'analysis',
  arc: 'analysis', // legacy fallback
  orphans: 'world', // legacy fallback
  // Assistant
  brainstorm: 'assistant',
  actions: 'assistant',
  // System
  settings: 'system',
  guide: 'system',
  errors: 'system',
};

/** Mengambil StudioId dari ViewMode */
export function getStudioForViewMode(mode: ViewMode): StudioId {
  return VIEW_MODE_TO_STUDIO[normalizeViewMode(mode, true)] || 'writing';
}

/** Mengambil definisi Studio dari StudioId */
export function getStudioDef(studioId: StudioId): StudioDef {
  return STUDIOS.find((s) => s.id === studioId) || STUDIOS[0];
}

const LAST_TAB_STORAGE_PREFIX = 'aether_last_tab_';

/** Mendapatkan tab terakhir yang aktif di sebuah studio, atau fallback ke default */
export function getLastActiveTabForStudio(studioId: StudioId): ViewMode {
  const studio = getStudioDef(studioId);
  try {
    const raw = localStorage.getItem(`${LAST_TAB_STORAGE_PREFIX}${studioId}`);
    const saved = raw === 'workshop' ? null : normalizeViewMode(raw);
    if (saved && studio.tabs.some((t) => t.mode === saved)) {
      return saved;
    }
  } catch {
    // Ignore storage issues
  }
  return studio.defaultMode;
}

/** Menyimpan tab aktif terakhir per studio */
export function rememberLastActiveTab(studioId: StudioId, mode: ViewMode): void {
  // Jangan simpan mode transien seperti workshop
  if (mode === 'workshop') return;
  try {
    const normalized = normalizeViewMode(mode);
    if (getStudioDef(studioId).tabs.some(tab => tab.mode === normalized)) {
      localStorage.setItem(`${LAST_TAB_STORAGE_PREFIX}${studioId}`, normalized);
    }
  } catch {
    // Ignore
  }
}

/** Only modes with a renderer may enter navigation; workshop requires a live target. */
export function normalizeViewMode(value: unknown, allowWorkshop = false): ViewMode {
  if (value === 'arc') return 'continuity';
  if (value === 'orphans') return 'completeness';
  if (value === 'workshop' && !allowWorkshop) return 'codex';
  return STUDIOS.some(studio => studio.tabs.some(tab => tab.mode === value)) ? value as ViewMode : 'write';
}
