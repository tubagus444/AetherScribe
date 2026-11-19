/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** SHA-256 hex of the exact UTF-8 text used by the v8 envelope and Atlas assets. */
export async function backupChecksum(text: string): Promise<string | undefined> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return undefined;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return undefined; }
}

/**
 * Rakit string JSON cadangan penuh dengan MENYISIPKAN `dataString` (hasil satu kali
 * `JSON.stringify(data)`) alih-alih men-stringify ulang objek `data` yang besar.
 *
 * Kenapa: jalur rolling backup internal dulu men-stringify data besar DUA kali per
 * siklus (sekali untuk checksum, sekali untuk payload envelope) → puncak memori &
 * jank main thread tiap 30 menit pada naskah besar. Dengan memisahkan serialisasi
 * data (sekali) dari perakitan envelope (operasi string kecil), kita memangkasnya.
 *
 * `meta` = field envelope SELAIN `data` (version/timestamp/checksum/scope/projectName).
 * Objek kecil, aman di-stringify. Hasil = `{ ...meta, "data": <dataString> }` sebagai
 * teks — byte-identik dengan `JSON.stringify({ ...meta, data })` untuk key yang sama.
 */
export function assembleBackupJson(meta: Record<string, unknown>, dataString: string): string {
  const metaString = JSON.stringify(meta); // hanya objek KECIL
  const inner = metaString.slice(1, -1); // buang kurung kurawal pembungkus
  return inner ? `{${inner},"data":${dataString}}` : `{"data":${dataString}}`;
}
