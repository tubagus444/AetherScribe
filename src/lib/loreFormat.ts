/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SUMBER TUNGGAL format Knowledge Base (KB) mode caching.
 *
 * Dipakai oleh DUA jalur yang WAJIB tak boleh drift:
 *   - jalur AI nyata: `buildCachedContextSegments` di `services/ai/index.ts`
 *     (teks yang benar-benar dikirim ke provider), dan
 *   - meter token: cabang `fullContext` di `contextWorker.ts`
 *     (estimasi yang ditampilkan ke pengguna).
 *
 * Sebelum pemusatan ini, worker hanya memformat `[nama] (kat): deskripsi` sementara
 * jalur nyata juga menyertakan field kategori (#17) + kebenaran penulis (`secret`) +
 * graf relasi → meter UNDERESTIMATE. Kedua jalur kini memanggil fungsi yang sama.
 *
 * Pemotongan cap dilakukan pada BATAS ENTRI (tak pernah di tengah baris) agar blok
 * `[RAHASIA PENULIS…]` tak terpotong separuh (kebocoran / marker "jangan bocorkan"
 * yatim) dan entri huruf-akhir hilang UTUH, bukan sebagian secara senyap.
 */

import { CodexEntry, Relationship } from '@/src/types';
import { formatFieldsForAI } from '@/src/lib/codexFields';

/**
 * Satu baris lore KB untuk satu entri Codex (mode caching). Deterministik
 * (self-contained, membaca entri saja) → cache prompt provider aman.
 */
export function formatCodexLoreLine(e: CodexEntry, details = ''): string {
  let line = `[${e.name}] (${e.category}): ${e.description}`;
  // Template field per kategori (#17): nilai self-contained (label ter-denormalisasi).
  const fields = formatFieldsForAI(e);
  if (fields) line += `\n${fields}`;
  if (details) line += `\n${details}`;
  // Lapis "Kebenaran Tersembunyi": `secret` = kebenaran penulis, TETAP diumpankan
  // agar AI menangkap kontradiksi/kebocoran, ditandai agar tak bocor ke prosa.
  if (e.secret?.trim()) line += `\n[RAHASIA PENULIS — jangan bocorkan ke prosa/pembaca] ${e.secret.trim()}`;
  return line;
}

/** Membangun blok "RELATIONSHIP GRAPH" (Graph-RAG) dari relasi yang diberikan. */
export function buildRelationshipGraph(relationships: Relationship[], codex: CodexEntry[]): string {
  if (!relationships || relationships.length === 0) return '';
  const idToName = Object.fromEntries(codex.map(c => [c.id, c.name]));
  const parts = relationships.map(r => {
    const srcName = idToName[r.sourceId] || `Entity#${r.sourceId}`;
    const tgtName = idToName[r.targetId] || `Entity#${r.targetId}`;
    return `${srcName} (${r.type}) -> ${tgtName}${r.description ? `: ${r.description}` : ''}`;
  });
  return `\n\nRELATIONSHIP GRAPH:\n${parts.join('\n')}`;
}

const LORE_SEPARATOR = '\n\n';

export interface CodexLoreResult {
  /** Blok lore tergabung (tanpa graf), sudah dipotong pada batas entri. */
  text: string;
  /** true bila ≥1 entri tak termuat karena cap. */
  truncated: boolean;
  /** Jumlah entri yang benar-benar termuat. */
  includedCount: number;
  /** Total entri yang diminta. */
  totalCount: number;
}

/**
 * Rakit blok lore Codex mode caching dengan cap karakter, memotong pada BATAS ENTRI.
 * Pemanggil bertanggung jawab mengurutkan `sortedCodex` deterministik (mis. by name)
 * agar cache prompt & meter byte-identik antar-panggilan.
 */
export function buildCodexLoreString(sortedCodex: CodexEntry[], maxChars: number, formatDetails?: (entry: CodexEntry) => string): CodexLoreResult {
  const totalCount = sortedCodex.length;
  const parts: string[] = [];
  let chars = 0;
  let truncated = false;
  let firstLine = '';

  for (const e of sortedCodex) {
    const line = formatCodexLoreLine(e, formatDetails?.(e));
    if (!parts.length) firstLine = line;
    const add = (parts.length === 0 ? 0 : LORE_SEPARATOR.length) + line.length;
    if (chars + add > maxChars) {
      truncated = true;
      break;
    }
    parts.push(line);
    chars += add;
  }

  // Jaminan: bila bahkan entri pertama melebihi cap, tetap sertakan satu entri
  // (dipotong keras) agar lore tak kosong total — lebih baik dari mengirim "No lore".
  if (parts.length === 0 && totalCount > 0) {
    parts.push(firstLine.substring(0, maxChars));
    truncated = totalCount > 1 || parts[0].length < firstLine.length;
  }

  return {
    text: parts.join(LORE_SEPARATOR),
    truncated,
    includedCount: parts.length,
    totalCount,
  };
}
