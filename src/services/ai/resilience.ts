/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Helper murni jalur AI (backoff, keputusan fallback, dedup, parsing respons).
 * Diekstrak dari `index.ts` agar bisa diuji tanpa jaringan.
 */

/**
 * Delay exponential backoff untuk percobaan ke-`attempt` (1-based): 2s, 4s, 8s, …
 * plus jitter 0–500ms. `jitter` disuntik untuk determinisme di tes.
 */
export function computeBackoffDelay(attempt: number, jitter: () => number = Math.random): number {
  return Math.pow(2, attempt) * 1000 + jitter() * 500;
}

/**
 * Apakah layak mencoba provider cadangan. Kunci salah / kuota habis TAK di-fallback
 * (percuma mengulang kredensial yang sama), hanya error koneksi/server/rate-limit.
 */
export function shouldAttemptFallback(code: string | undefined): boolean {
  return code !== 'INVALID_KEY' && code !== 'QUOTA_EXCEEDED';
}

/**
 * Urutan provider cadangan yang layak: menjaga urutan preferensi, membuang provider
 * saat ini (sudah dicoba) & yang tak punya API key.
 */
export function selectFallbackProviders(
  order: readonly string[],
  current: string,
  hasKey: (provider: string) => boolean,
): string[] {
  return order.filter((p) => p !== current && hasKey(p));
}

/**
 * Kunci dedup panggilan rewrite in-flight — panggilan identik (provider+aksi+prompt+
 * seleksi) yang masih berjalan berbagi satu promise. Panggilan berurutan tak terpengaruh
 * (entri dihapus saat selesai), jadi "regenerate" tetap memberi variasi baru.
 */
export function rewriteDedupKey(
  provider: string,
  action: string,
  prompt: string | undefined,
  selection: string | undefined,
  chapterId?: number,
): string {
  if (chapterId !== undefined) return JSON.stringify([provider, action, prompt ?? '', selection ?? '', chapterId]);
  return `${provider}|${action}|${prompt ?? ''}|${selection ?? ''}`;
}

/**
 * Mengupas respons model (kerap dibungkus code fence/prosa) menjadi array JSON.
 * Melempar bila hasil bukan array valid.
 */
export function parseJsonArray(raw: string): unknown[] {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.substring(start, end + 1);
  }

  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('Hasil ekstraksi bukan array JSON.');
  return data;
}
