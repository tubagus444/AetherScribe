/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Konversi Blob ↔ data URL (base64) — dipakai backup/impor untuk menyelipkan
 * gambar biner (peta Atlas) ke dalam envelope JSON. `Blob` tak selamat lewat
 * `JSON.stringify` (jadi `{}`), jadi wajib dikodekan saat ekspor & didekode saat
 * restore/impor. Data URL menyimpan tipe MIME sekaligus isinya.
 */

/** Blob → data URL (mis. `data:image/webp;base64,...`). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Gagal membaca blob'));
    reader.readAsDataURL(blob);
  });
}

import { BACKUP_LIMITS } from './backupLimits';

/** Hanya gambar raster seperti jalur upload Atlas; tidak pernah melakukan fetch. */
export function validateImageDataUrl(dataUrl: unknown): asserts dataUrl is string {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(BACKUP_LIMITS.imageBytes / 3) * 4 + 64) {
    throw new Error('Gambar cadangan tidak valid atau melebihi 5 MiB.');
  }
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) throw new Error('Gambar cadangan harus berupa data URL PNG/JPEG/WebP/GIF base64.');
  const size = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (size > BACKUP_LIMITS.imageBytes) throw new Error('Gambar cadangan melebihi 5 MiB.');
}

/** Data URL → Blob tanpa jaringan, setelah tipe dan ukuran diperiksa. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  validateImageDataUrl(dataUrl);
  const [header, body] = dataUrl.split(',');
  const binary = atob(body);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new Blob([bytes], { type: header.slice(5, header.indexOf(';')) });
}
