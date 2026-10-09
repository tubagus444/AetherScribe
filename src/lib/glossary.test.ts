/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { findGlossaryIssues } from './glossary';
import type { GlossaryEntry } from '@/src/types';

function entry(p: Partial<GlossaryEntry>): GlossaryEntry {
  return { projectId: 1, term: '', createdAt: 0, updatedAt: 0, ...p };
}

describe('findGlossaryIssues — variant (deklarasi ejaan salah)', () => {
  const gloss = [entry({ term: 'liga', variants: ['liege', 'leage'] })];

  it('menandai varian yang muncul + menyarankan term baku', () => {
    const found = findGlossaryIssues('Ia menempuh sepuluh leage ke utara.', gloss);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ word: 'leage', suggestion: 'liga', kind: 'variant' });
  });

  it('case-insensitive: varian berkapital tetap ditandai (casing asli dipertahankan)', () => {
    const found = findGlossaryIssues('Leage pertama dilalui.', gloss);
    expect(found[0]).toMatchObject({ word: 'Leage', kind: 'variant' });
  });

  it('term baku itu sendiri tidak ditandai', () => {
    expect(findGlossaryIssues('Sepuluh liga jauhnya.', gloss)).toHaveLength(0);
  });

  it('varian yang kebetulan sama dengan sebuah term baku diabaikan', () => {
    const g = [entry({ term: 'liga', variants: ['mil'] }), entry({ term: 'mil' })];
    // "mil" adalah term baku entri lain → tak boleh dibendera sebagai varian salah
    expect(findGlossaryIssues('Jarak satu mil.', g)).toHaveLength(0);
  });

  it('varian frasa (multi-kata) ikut terdeteksi', () => {
    const g = [entry({ term: 'aku memikul bebanmu', variants: ['aku membawa bebanmu'] })];
    const found = findGlossaryIssues('Ia berkata, "aku membawa bebanmu".', g);
    expect(found[0]).toMatchObject({ word: 'aku membawa bebanmu', kind: 'variant' });
  });
});

describe('findGlossaryIssues — strictMatch opt-in', () => {
  it('strictMatch: hanya menandai varian dengan casing persis', () => {
    const g = [entry({ term: 'Ki', variants: ['chi'], strictMatch: true })];
    // "chi" cocok persis → ditandai
    expect(findGlossaryIssues('Ia memusatkan chi.', g)).toHaveLength(1);
    // "Chi" atau "CHI" huruf besar/kapital → TIDAK ditandai karena strictMatch
    expect(findGlossaryIssues('Marga Chi dari utara.', g)).toHaveLength(0);
    expect(findGlossaryIssues('CHI tingkat tinggi.', g)).toHaveLength(0);
  });

  it('strictMatch: mengizinkan varian yang hanya berbeda casing dari term baku', () => {
    const g = [entry({ term: 'Mana', variants: ['mana'], strictMatch: true })];
    // "mana" (huruf kecil) ditandai sebagai salah dengan saran "Mana"
    const found = findGlossaryIssues('Energi mana mulai habis.', g);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ word: 'mana', suggestion: 'Mana', kind: 'variant' });

    // "Mana" yang sudah baku tidak ditandai
    expect(findGlossaryIssues('Energi Mana melimpah.', g)).toHaveLength(0);
  });

  it('strictMatch: tidak masuk ke fuzzy typo guessing', () => {
    const g = [entry({ term: 'Mana', strictMatch: true })];
    // Kata mirip "Mano" tidak memicu typo guessing karena strictMatch aktif
    expect(findGlossaryIssues('Mano melangkah pergi.', g)).toHaveLength(0);
  });
});

describe('findGlossaryIssues — typo (near-miss term baku)', () => {
  it('menandai kandidat salah-eja berkapital yang mirip term', () => {
    const g = [entry({ term: 'Threnody' })];
    const found = findGlossaryIssues('Sebuah Threnodi terdengar.', g);
    expect(found.find((f) => f.kind === 'typo')).toMatchObject({ word: 'Threnodi', suggestion: 'Threnody' });
  });

  it('TIDAK menandai istilah huruf-kecil (gating anti-FP)', () => {
    const g = [entry({ term: 'ashfall' })];
    // 'ashfoll' huruf kecil → dilewati (typo hanya untuk token Kapital)
    expect(findGlossaryIssues('turun ashfoll tebal', g)).toHaveLength(0);
  });

  it('ejaan benar (persis term) tidak ditandai', () => {
    const g = [entry({ term: 'Threnody' })];
    expect(findGlossaryIssues('Threnody yang sama.', g)).toHaveLength(0);
  });

  it('kandidat ambigu (≥2 term dalam ambang) dilewati', () => {
    const g = [entry({ term: 'Baran' }), entry({ term: 'Baren' })];
    // 'Barin' berjarak 1 ke keduanya → ambigu → tak menebak
    expect(findGlossaryIssues('Sang Barin datang.', g)).toHaveLength(0);
  });
});

describe('findGlossaryIssues — umum', () => {
  it('teks/glosarium kosong → tak ada temuan', () => {
    expect(findGlossaryIssues('', [entry({ term: 'liga' })])).toEqual([]);
    expect(findGlossaryIssues('teks', [])).toEqual([]);
  });
});
