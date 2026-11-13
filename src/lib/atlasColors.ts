/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pewarnaan penanda Atlas — MURNI & deterministik. Warna DITURUNKAN (bukan
 * disimpan) dari faksi/kategori entri Codex yang ditaut penanda, konsisten dengan
 * cara #15 mendefinisikan faksi (= entri ber-`factionTag`, tanpa id faksi terpisah).
 *
 * Prioritas: `marker.color` eksplisit → hue faksi (bila entri ber-factionTag) →
 * warna kategori Codex → warna default per-jenis penanda.
 *
 * Peta hex kategori = SALINAN LOKAL (sama seperti LoreGraphPanel) karena
 * `codexCategories.ts` hanya menyimpan kelas Tailwind, bukan hex.
 */

import { CodexEntry } from '@/src/types';
import { CategoryDef, getCategoryDef } from '@/src/lib/codexCategories';

const CATEGORY_HEX: Record<string, string> = {
  indigo: '#6366f1', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e',
  sky: '#0ea5e9', slate: '#64748b', violet: '#8b5cf6', teal: '#14b8a6',
  orange: '#f97316', red: '#ef4444', green: '#22c55e', blue: '#3b82f6',
  pink: '#ec4899', cyan: '#06b6d4', lime: '#84cc16', fuchsia: '#d946ef',
};
const FALLBACK_HEX = '#64748b';
/** Format warna yang dipakai UI Atlas. Tolak CSS bebas, URL, dan markup dari impor. */
export function isAtlasColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
}

/** Pertahanan pada boundary render, termasuk callback colorFor kustom. */
export function safeAtlasColor(value: unknown): string {
  return isAtlasColor(value) ? value : FALLBACK_HEX;
}
/** Warna kabut rahasia untuk entri tersembunyi (hidden: true). */
export const FOG_HEX = '#7c3aed';

/** Palet stabil untuk faksi — dipilih via hash tag agar warna konsisten antar sesi. */
const FACTION_PALETTE = [
  '#e11d48', '#2563eb', '#059669', '#d97706',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
  '#ea580c', '#0d9488', '#9333ea', '#ca8a04',
];

/** Warna default per jenis bila penanda tak tertaut Codex & tanpa warna eksplisit. */
const KIND_DEFAULT: Record<string, string> = {
  pin: '#e11d48', // Ruby crimson hangat, anggun & kontras tinggi di peta terang/gelap
  area: '#7c3aed', // Royal violet
  route: '#0284c7', // Ocean sky blue, terbaca jelas di atas peta perkamen maupun peta gelap
};

/** Hash string → index palet (djb2 sederhana, deterministik). */
export function factionHue(tag: string): string {
  let h = 5381;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) + h + tag.charCodeAt(i)) >>> 0;
  return FACTION_PALETTE[h % FACTION_PALETTE.length];
}

/** Warna kategori sebuah entri (hex). */
export function categoryHex(entry: CodexEntry, categories?: CategoryDef[]): string {
  const def = getCategoryDef(entry.category, categories);
  return safeAtlasColor(CATEGORY_HEX[def?.color ?? '']);
}

/**
 * Warna render sebuah penanda. `entry` = entri Codex tertaut (bila ada).
 */
export function resolveMarkerColor(
  kind: string,
  explicitColor: string | undefined,
  entry: CodexEntry | undefined,
  categories?: CategoryDef[],
): string {
  if (isAtlasColor(explicitColor)) return explicitColor;
  if (entry) {
    if (entry.factionTag && entry.factionTag.trim()) return factionHue(entry.factionTag.trim());
    return categoryHex(entry, categories);
  }
  return safeAtlasColor(KIND_DEFAULT[kind]);
}
