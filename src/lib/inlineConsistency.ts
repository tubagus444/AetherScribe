/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Kutipan verbatim yang ditandai oleh pemeriksaan AI opsional. */
export interface InlineQuoteFinding {
  /** Potongan teks verbatim dari paragraf yang ditandai. */
  quote: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

/**
 * Temuan salah-eja NAMA KANONIK (Buku Gaya) — deterministik, nol token. Berbeda
 * dari flag (nama benar) & kutipan AI: menggarisbawahi kata yang MIRIP tapi tak
 * persis nama/alias Codex (kandidat typo), dengan saran ejaan. Lihat
 * `src/lib/nameSpelling.ts`.
 */
export interface InlineSpellingFinding {
  /** Kata di teks yang diduga salah eja (casing sesuai kemunculan). */
  word: string;
  /** Ejaan kanonik yang disarankan. */
  suggestion: string;
}

/**
 * Temuan Glosarium (#8) — istilah NON-nama yang tak konsisten ejaannya. Sumber
 * temuan TERPISAH dari Buku Gaya (yang hanya nama Codex); digambar bergaya beda
 * (garis bawah teal putus-putus). Lihat `src/lib/glossary.ts`.
 */
export interface InlineGlossaryFinding {
  /** Kata/frasa di teks (casing sesuai kemunculan). */
  word: string;
  /** Ejaan baku (`term`) yang disarankan. */
  suggestion: string;
  /** variant = ejaan salah yang dideklarasikan; typo = kandidat mirip term. */
  kind: 'variant' | 'typo';
}
