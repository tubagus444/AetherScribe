import { expect, it } from 'vitest';
import { sameQueryResult } from './queryEquality';

it('compares manuscript records without serialization and detects nested edits', () => {
  const original = [{ id: 1, content: 'text '.repeat(10000), values: [1, null, { active: true }] }];
  expect(sameQueryResult(original, structuredClone(original))).toBe(true);
  expect(sameQueryResult(original, [{ ...original[0], content: 'changed' }])).toBe(false);
  expect(sameQueryResult([{ value: undefined }], [{}])).toBe(false);
  expect(sameQueryResult([, 1], [2, 1])).toBe(false);
});
it('is conservative about non-data objects and handles Date/cycles safely', () => {
  expect(sameQueryResult(new Date(1), new Date(1))).toBe(true);
  expect(sameQueryResult(new Blob(['A']), new Blob(['B']))).toBe(false);
  expect(sameQueryResult(new Map([[1, 2]]), new Map([[1, 3]]))).toBe(false);
  const a: any = {}; a.self = a; const b: any = {}; b.self = b;
  expect(sameQueryResult(a, b)).toBe(true);
});
