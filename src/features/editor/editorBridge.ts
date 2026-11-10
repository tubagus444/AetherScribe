/**
 * Jembatan ke editor yang sedang aktif (jika ada) untuk operasi lintas-bab seperti
 * Find & Replace global.
 *
 * Editor di-mount HANYA saat `viewMode === 'write'` dan menyimpan konten ke Dexie secara
 * debounce. Bila operasi lain mengubah konten bab yang sedang dibuka langsung di DB,
 * autosave editor bisa MENIMPA balik perubahan itu (risiko kehilangan data). Bridge ini
 * memberi pemanggil dua kait aman:
 *   - `flushActiveEditor()` — persist edit yang belum tersimpan SEBELUM operasi DB.
 *   - `reloadActiveEditor()` — muat ulang konten bab dari DB ke editor SETELAH operasi DB,
 *     tanpa memicu autosave (lihat implementasi di useEditorSave).
 *
 * Hanya satu editor aktif pada satu waktu (single-user, single-pane), jadi cukup satu slot.
 */

export interface ActiveEditorBridge {
  getChapterId: () => number;
  flush: () => Promise<void>;
  reload: () => Promise<void>;
}

let current: ActiveEditorBridge | null = null;

export function registerActiveEditor(bridge: ActiveEditorBridge): void {
  current = bridge;
}

export function unregisterActiveEditor(bridge: ActiveEditorBridge): void {
  if (current === bridge) current = null;
}

/** Id bab yang sedang dibuka di editor, atau null bila editor tak ter-mount. */
export function getActiveEditorChapterId(): number | null {
  return current ? current.getChapterId() : null;
}

/** Persist edit aktif; reject jika save gagal/tidak menemukan bab.
 * Caller wajib membatalkan operasi lanjutan saat reject (no-op tanpa editor).
 */
export async function flushActiveEditor(): Promise<void> {
  if (current) await current.flush();
}

/** Muat ulang konten editor aktif dari DB (no-op bila tak ada editor). */
export async function reloadActiveEditor(): Promise<void> {
  if (current) await current.reload();
}
