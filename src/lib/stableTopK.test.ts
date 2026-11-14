import { expect, it } from 'vitest';
import { StableTopK } from './stableTopK';

it.each([10, 100, 10000])('keeps exact sort/slice results for %i candidates with ties', size => {
  const rows = Array.from({ length: size }, (_, id) => ({ id, score: (((id * 31) % 17) - 8) / 17 }));
  for (const limit of [1, 5, 20]) {
    const best = new StableTopK<typeof rows[number]>(limit);
    for (const row of rows) { best.add(row, row.score); expect(best.size).toBeLessThanOrEqual(limit); }
    expect(best.results()).toEqual([...rows].sort((a, b) => b.score - a.score).slice(0, limit));
  }
});
