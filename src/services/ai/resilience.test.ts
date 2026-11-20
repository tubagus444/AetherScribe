import { describe, it, expect } from 'vitest';
import {
  computeBackoffDelay,
  shouldAttemptFallback,
  selectFallbackProviders,
  rewriteDedupKey,
  parseJsonArray,
} from './resilience';

describe('computeBackoffDelay', () => {
  it('exponential 2s/4s/8s tanpa jitter', () => {
    expect(computeBackoffDelay(1, () => 0)).toBe(2000);
    expect(computeBackoffDelay(2, () => 0)).toBe(4000);
    expect(computeBackoffDelay(3, () => 0)).toBe(8000);
  });

  it('menambah jitter 0–500ms', () => {
    expect(computeBackoffDelay(1, () => 1)).toBe(2500);
    expect(computeBackoffDelay(1, () => 0.5)).toBe(2250);
  });
});

describe('shouldAttemptFallback', () => {
  it('TIDAK fallback untuk kunci salah / kuota habis', () => {
    expect(shouldAttemptFallback('INVALID_KEY')).toBe(false);
    expect(shouldAttemptFallback('QUOTA_EXCEEDED')).toBe(false);
  });
  it('fallback untuk error koneksi/server/undefined', () => {
    expect(shouldAttemptFallback('API_ERROR')).toBe(true);
    expect(shouldAttemptFallback('TIMEOUT')).toBe(true);
    expect(shouldAttemptFallback(undefined)).toBe(true);
  });
});

describe('selectFallbackProviders', () => {
  const order = ['openrouter', 'google', 'claude', 'groq'] as const;

  it('membuang provider saat ini & yang tak punya key, jaga urutan', () => {
    const hasKey = (p: string) => p !== 'groq'; // groq tanpa key
    expect(selectFallbackProviders(order, 'google', hasKey)).toEqual(['openrouter', 'claude']);
  });

  it('kembalikan kosong bila tak ada kandidat berkunci', () => {
    expect(selectFallbackProviders(order, 'google', () => false)).toEqual([]);
  });
});

describe('rewriteDedupKey', () => {
  it('membedakan permintaan dengan teks sama pada dua bab berbeda', () => {
    expect(rewriteDedupKey('google', 'expand', '', 'teks', 1)).not.toBe(rewriteDedupKey('google', 'expand', '', 'teks', 2));
  });
  it('menggabungkan provider|aksi|prompt|seleksi', () => {
    expect(rewriteDedupKey('google', 'expand', 'buat panjang', 'teks')).toBe('google|expand|buat panjang|teks');
  });
  it('menormalkan prompt/seleksi undefined jadi kosong', () => {
    expect(rewriteDedupKey('claude', 'shorten', undefined, undefined)).toBe('claude|shorten||');
  });
  it('kunci beda saat seleksi beda (regenerate berurutan)', () => {
    expect(rewriteDedupKey('g', 'a', 'p', 'x')).not.toBe(rewriteDedupKey('g', 'a', 'p', 'y'));
  });
});

describe('parseJsonArray', () => {
  it('mem-parse array JSON polos', () => {
    expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('mengupas code fence ```json', () => {
    expect(parseJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('mengupas code fence polos', () => {
    expect(parseJsonArray('```\n["x"]\n```')).toEqual(['x']);
  });

  it('mengekstrak array dari prosa pembungkus', () => {
    expect(parseJsonArray('Berikut hasilnya: [true, false] semoga membantu')).toEqual([true, false]);
  });

  it('menangani spasi/baris baru', () => {
    expect(parseJsonArray('  \n [ "a" , "b" ] \n ')).toEqual(['a', 'b']);
  });

  it('melempar untuk JSON non-array', () => {
    expect(() => parseJsonArray('{"a":1}')).toThrow();
  });

  it('melempar untuk teks tak valid', () => {
    expect(() => parseJsonArray('bukan json sama sekali')).toThrow();
  });
});
