/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { analyzePromises, analyzePayoffs, extractKeywordCandidates } from './plotPromises';
import { CodexEntry, PlotPromise } from '@/src/types';

// 6 bab (idx 0..5). Belati (Codex #1) disebut di Bab 1 & 2 saja.
function makeChapters(mentions: Record<number, string>) {
  return Array.from({ length: 6 }, (_, i) => ({
    id: 100 + i,
    title: `Bab ${i + 1}`,
    content: mentions[i] ?? 'Teks biasa tanpa elemen apa pun.',
  }));
}

const codex: CodexEntry[] = [
  { id: 1, projectId: 1, name: 'Belati Berukir', category: 'item', aliases: ['Belati'] } as CodexEntry,
];

function promise(over: Partial<PlotPromise>): PlotPromise {
  return {
    projectId: 1, title: 'Janji', status: 'open',
    createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('analyzePromises', () => {
  it('janji ber-codexId yang tertidur → state "dormant" + dormancy benar', () => {
    const chapters = makeChapters({ 0: 'Ada Belati di sini.', 1: 'Belati lagi.' });
    const { analyses } = analyzePromises([promise({ codexId: 1 })], chapters, codex);
    const a = analyses[0];
    expect(a.state).toBe('dormant');
    expect(a.firstIndex).toBe(0);
    expect(a.lastIndex).toBe(1);
    expect(a.dormancy).toBe(4); // 5 - 1
    expect(a.mentions).toBe(2);
  });

  it('janji yang disebut di bab terakhir → "active"', () => {
    const chapters = makeChapters({ 0: 'Belati.', 5: 'Belati muncul lagi di klimaks.' });
    const { analyses } = analyzePromises([promise({ codexId: 1 })], chapters, codex);
    expect(analyses[0].state).toBe('active');
    expect(analyses[0].dormancy).toBe(0);
  });

  it('status "paid" menimpa turunan walau tertidur', () => {
    const chapters = makeChapters({ 0: 'Belati.' });
    const { analyses } = analyzePromises([promise({ codexId: 1, status: 'paid' })], chapters, codex);
    expect(analyses[0].state).toBe('paid');
  });

  it('status "abandoned" menimpa turunan', () => {
    const chapters = makeChapters({ 0: 'Belati.' });
    const { analyses } = analyzePromises([promise({ codexId: 1, status: 'abandoned' })], chapters, codex);
    expect(analyses[0].state).toBe('abandoned');
  });

  it('janji tak pernah muncul → "unseen"', () => {
    const chapters = makeChapters({});
    const { analyses } = analyzePromises([promise({ codexId: 99 })], chapters, codex);
    expect(analyses[0].state).toBe('unseen');
    expect(analyses[0].mentions).toBe(0);
  });

  it('janji berbasis keyword (non-entitas) terlacak via scan teks', () => {
    const chapters = makeChapters({ 0: 'Sebuah ramalan kuno diucapkan.' });
    const { analyses } = analyzePromises(
      [promise({ keywords: ['ramalan'] })],
      chapters,
      codex,
    );
    const a = analyses[0];
    expect(a.mentions).toBe(1);
    expect(a.firstIndex).toBe(0);
    expect(a.state).toBe('dormant'); // muncul di Bab 1 saja, tertidur sampai akhir
  });

  it('ambang dormancy dapat disetel', () => {
    const chapters = makeChapters({ 0: 'Belati.', 1: 'Belati.' });
    const { analyses } = analyzePromises(
      [promise({ codexId: 1 })], chapters, codex, { dormancyThreshold: 8 },
    );
    expect(analyses[0].state).toBe('active'); // dormancy 4 < 8
  });
});

describe('analyzePayoffs', () => {
  // Rahasia (codex #7) yang dibayar oleh beberapa kait berbasis keyword.
  const chapters = makeChapters({ 0: 'Ada ramalan.', 1: 'Bisikan hantu.' });

  it('mengabaikan janji tanpa payoffCodexId', () => {
    const { analyses } = analyzePromises([promise({ keywords: ['ramalan'] })], chapters, codex);
    expect(analyzePayoffs(analyses)).toHaveLength(0);
  });

  it('mengelompokkan kait per target & menghitung yang muncul di prosa', () => {
    const { analyses } = analyzePromises(
      [
        promise({ keywords: ['ramalan'], payoffCodexId: 7 }), // muncul (Bab 1)
        promise({ keywords: ['bisikan'], payoffCodexId: 7 }), // muncul (Bab 2)
      ],
      chapters, codex,
    );
    const payoffs = analyzePayoffs(analyses);
    expect(payoffs).toHaveLength(1);
    expect(payoffs[0].codexId).toBe(7);
    expect(payoffs[0].setupCount).toBe(2);
    expect(payoffs[0].seenSetups).toBe(2);
    expect(payoffs[0].state).toBe('planted');
  });

  it('semua kait tak muncul di prosa → "unplanted" (alarm)', () => {
    const { analyses } = analyzePromises(
      [promise({ keywords: ['takpernahada'], payoffCodexId: 7 })],
      chapters, codex,
    );
    const payoffs = analyzePayoffs(analyses);
    expect(payoffs[0].state).toBe('unplanted');
    expect(payoffs[0].seenSetups).toBe(0);
  });

  it('kait muncul tapi di bawah ambang → "thin"', () => {
    const { analyses } = analyzePromises(
      [promise({ keywords: ['ramalan'], payoffCodexId: 7 })], // 1 muncul, min default 2
      chapters, codex,
    );
    expect(analyzePayoffs(analyses)[0].state).toBe('thin');
  });

  it('ambang minSeenSetups dapat disetel', () => {
    const { analyses } = analyzePromises(
      [promise({ keywords: ['ramalan'], payoffCodexId: 7 })],
      chapters, codex,
    );
    expect(analyzePayoffs(analyses, { minSeenSetups: 1 })[0].state).toBe('planted');
  });

  it('mengurutkan target paling genting dulu (unplanted → thin → planted)', () => {
    const { analyses } = analyzePromises(
      [
        promise({ keywords: ['ramalan'], payoffCodexId: 5 }),       // thin
        promise({ keywords: ['takada'], payoffCodexId: 8 }),        // unplanted
      ],
      chapters, codex,
    );
    const payoffs = analyzePayoffs(analyses);
    expect(payoffs.map(p => p.state)).toEqual(['unplanted', 'thin']);
  });
});

describe('extractKeywordCandidates', () => {
  it('mengekstrak frasa multi-kata dan kata berkapital dari judul dan deskripsi', () => {
    const title = 'Belati Berukir dari Lembah Kabut';
    const desc = 'Pemberian Tetua Arya sebelum perang meletus.';
    const candidates = extractKeywordCandidates(title, desc);

    expect(candidates).toContain('Belati Berukir');
    expect(candidates).toContain('Lembah Kabut');
    expect(candidates).toContain('Tetua Arya');
    // Stop words seperti "Dari", "Sebelum" tidak boleh muncul sebagai kandidat kata tunggal
    expect(candidates).not.toContain('dari');
    expect(candidates).not.toContain('Sebelum');
  });

  it('mencocokkan istilah glosarium (termasuk huruf kecil)', () => {
    const title = 'Misteri artefak dan aliran mana kuno';
    const glossary = [{ term: 'mana' }, { term: 'artefak kuno' }];
    const candidates = extractKeywordCandidates(title, undefined, glossary);

    expect(candidates).toContain('mana');
  });

  it('menghindari duplikasi kandidat yang sama', () => {
    const title = 'Pedang Naga dan Pedang Naga';
    const candidates = extractKeywordCandidates(title);
    expect(candidates.filter(c => c === 'Pedang Naga')).toHaveLength(1);
  });

  it('mengembalikan array kosong jika input kosong', () => {
    expect(extractKeywordCandidates('')).toEqual([]);
  });
});
