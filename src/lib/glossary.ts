/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Glosarium istilah in-world (#8) — pencocokan konsistensi ejaan istilah NON-nama.
 * Generalisasi Buku Gaya (`nameSpelling.ts`): deterministik, nol token, nol AI.
 *
 * Dua jenis temuan:
 *   • variant — kemunculan ejaan SALAH yang DIDEKLARASIKAN penulis (`GlossaryEntry.variants`).
 *     Presisi mutlak (penulis yang menyatakan), tak menebak. Menyarankan ejaan baku.
 *   • typo — kandidat salah-eja MIRIP `term` baku (jarak edit kecil). Untuk menekan
 *     false-positive, DIBATASI ke token berhuruf kapital (seperti Buku Gaya) & term
 *     satu-kata; istilah huruf-kecil (satuan/pangkat) diandalkan ke mekanisme variant.
 *
 * Bekerja atas TEKS POLOS (HTML sudah di-strip pemanggil), selaras lib lain.
 */

import { editDistance } from '@/src/lib/nameSpelling';
import { GlossaryEntry } from '@/src/types';

export interface GlossaryFinding {
  /** Kata/frasa di teks (casing sesuai kemunculan). */
  word: string;
  /** Ejaan baku yang disarankan (`term`). */
  suggestion: string;
  kind: 'variant' | 'typo';
  definition?: string;
}

const WORD_RE = /[\p{L}][\p{L}'’-]*/gu;
const MIN_LEN = 4;      // token lebih pendek terlalu rawan salah-tanda (typo)
const FREQ_SKIP = 6;    // kata sering-muncul → kemungkinan sah, lewati (typo)
const MAX_ISSUES = 80;

function startsUpper(w: string): boolean {
  const c = w[0];
  return !!c && c === c.toUpperCase() && c !== c.toLowerCase();
}
function distanceThreshold(len: number): number {
  return len >= 8 ? 2 : 1;
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cari kandidat masalah glosarium di `text`. Mengembalikan satu temuan per
 * kata/frasa unik (pemanggil menggarisbawahi semua kemunculannya). Nol token.
 */
export function findGlossaryIssues(text: string, entries: GlossaryEntry[]): GlossaryFinding[] {
  if (!text || !entries.length) return [];

  const findings: GlossaryFinding[] = [];
  const emitted = new Set<string>(); // dedup `${kind}:${word}`

  const termLowers = new Set(
    entries.map((e) => e.term?.trim().toLowerCase()).filter((t): t is string => !!t),
  );

  // --- 1) VARIANT — ejaan salah yang dideklarasikan (presisi mutlak) ---
  for (const e of entries) {
    const term = e.term?.trim();
    if (!term) continue;
    const isStrict = !!e.strictMatch;
    for (const raw of e.variants ?? []) {
      const variant = (raw || '').trim();
      if (variant.length < 2) continue;
      // Varian tak boleh sama persis dengan term baku.
      // Jika non-strict, bandingkan secara case-insensitive; jika strict, bandingkan case-sensitive.
      if (isStrict) {
        if (variant === term) continue;
      } else {
        if (termLowers.has(variant.toLowerCase())) continue;
      }
      let re: RegExp;
      try {
        re = new RegExp(`\\b${escapeRegExp(variant)}\\b`, isStrict ? 'g' : 'gi');
      } catch {
        continue;
      }
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const word = m[0];
        const key = `variant:${word}`;
        if (!emitted.has(key)) {
          emitted.add(key);
          findings.push({ word, suggestion: term, kind: 'variant', definition: e.definition });
          if (findings.length >= MAX_ISSUES) return findings;
        }
        if (m.index === re.lastIndex) re.lastIndex++; // jaga match nol-panjang
      }
    }
  }

  // --- 2) TYPO — near-miss `term` baku (gated: kapital + satu-kata) ---
  // Entri dengan strictMatch dilewati dari fuzzy typo agar istilah pendek/huruf-kecil tidak memicu false-positive.
  const singleTerms = entries
    .filter((e) => !e.strictMatch)
    .map((e) => e.term?.trim())
    .filter((t): t is string => !!t && !/\s/.test(t) && t.length >= MIN_LEN);

  if (singleTerms.length) {
    const knownLower = new Set(singleTerms.map((t) => t.toLowerCase()));
    const byFirst = new Map<string, string[]>();
    for (const t of singleTerms) {
      const f = t[0].toLowerCase();
      const b = byFirst.get(f) ?? [];
      b.push(t);
      byFirst.set(f, b);
    }

    const tokens = text.match(WORD_RE) ?? [];
    const freq = new Map<string, number>();
    for (const tk of tokens) freq.set(tk, (freq.get(tk) ?? 0) + 1);

    for (const [word, count] of freq) {
      if (findings.length >= MAX_ISSUES) break;
      if (word.length < MIN_LEN || !startsUpper(word)) continue;
      if (count >= FREQ_SKIP) continue;
      const lower = word.toLowerCase();
      if (knownLower.has(lower)) continue; // ejaan benar
      if (emitted.has(`typo:${word}`) || emitted.has(`variant:${word}`)) continue;

      const bucket = byFirst.get(lower[0]);
      if (!bucket) continue;

      const max = distanceThreshold(word.length);
      const matches = new Set<string>();
      let suggestion = '';
      let best = max + 1;
      for (const t of bucket) {
        if (Math.abs(t.length - word.length) > max) continue;
        const d = editDistance(lower, t.toLowerCase(), max);
        if (d >= 1 && d <= max) {
          matches.add(t.toLowerCase());
          if (d < best) { best = d; suggestion = t; }
        }
      }
      // Tepat satu kandidat → saran jelas. Ambigu → lewati (jangan menebak).
      if (matches.size === 1 && suggestion) {
        emitted.add(`typo:${word}`);
        const def = entries.find((e) => e.term?.trim() === suggestion)?.definition;
        findings.push({ word, suggestion, kind: 'typo', definition: def });
      }
    }
  }

  return findings;
}
