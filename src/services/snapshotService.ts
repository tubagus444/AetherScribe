/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Snapshot otomatis sebelum aksi destruktif (rewrite AI "Ganti Teks", Find &
 * Replace "Ganti Semua", pemulihan versi). Memberi titik balik tanpa pengguna
 * perlu menekan tombol kamera manual.
 */
import { db } from '@/src/db';
import type { Snapshot } from '@/src/types';
import { format } from 'date-fns';
import { validateWriteFields } from '@/src/lib/backupValidation';
import { AUTO_SNAPSHOT_LIMIT } from '@/src/lib/tableCatalog';
import { requireRow } from './writeIntegrity';

export async function addSnapshot(snapshot: Omit<Snapshot, 'id'>) {
  validateWriteFields('snapshots', snapshot, 'create');
  return db.transaction('rw', db.chapters, db.snapshots, async () => {
    await requireRow(db.chapters, snapshot.chapterId);
    return db.snapshots.add(snapshot);
  });
}

export async function deleteSnapshot(chapterId: number, id: number) {
  await db.transaction('rw', db.snapshots, async () => {
    const snapshot = await requireRow(db.snapshots, id);
    if (snapshot.chapterId !== chapterId) throw new Error('Snapshot berasal dari bab lain.');
    await db.snapshots.delete(id);
  });
}

/** Dipanggil dalam transaksi yang mencakup tabel snapshots. */
export async function saveAutoSnapshot(chapterId: number, content: string, reason: string): Promise<number | null> {
  if (!chapterId || chapterId <= 0 || !content?.trim()) return null;
  const id = await addSnapshot({
    chapterId,
    content,
    label: `${reason} — ${format(new Date(), 'd MMM, HH:mm')}`,
    timestamp: Date.now(),
    auto: true,
  });

  // Pangkas snapshot otomatis terlama agar tidak membengkak (snapshot manual
  // sengaja tidak ikut dipangkas).
  const autos = await db.snapshots
    .where('chapterId')
    .equals(chapterId)
    .filter((s) => s.auto === true)
    .sortBy('timestamp');
  if (autos.length > AUTO_SNAPSHOT_LIMIT) {
    const stale = autos.slice(0, autos.length - AUTO_SNAPSHOT_LIMIT).map((s) => s.id!);
    await db.snapshots.bulkDelete(stale);
  }

  return id as number;
}

/** Snapshot pendukung untuk operasi editor yang tetap berjalan saat snapshot gagal. */
export async function createAutoSnapshot(chapterId: number, content: string, reason: string): Promise<number | null> {
  try {
    return await db.transaction('rw', db.chapters, db.snapshots, () => saveAutoSnapshot(chapterId, content, reason));
  } catch (err) {
    console.error('Auto-snapshot gagal:', err);
    return null;
  }
}
