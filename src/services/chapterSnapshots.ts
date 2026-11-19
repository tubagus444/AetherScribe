import { format } from 'date-fns';
import { validateWriteFields } from '@/src/lib/backupValidation';
import type { ChapterStorage, ChapterTransactions, SnapshotInput } from '@/src/lib/chapterStorage';
import { assertWriteId } from '@/src/lib/dataContracts';
import { AUTO_SNAPSHOT_LIMIT } from '@/src/lib/tableCatalog';

export async function requireSnapshot(repositories: Pick<ChapterTransactions['history'], 'readSnapshot'>, chapterId: number, id: number) {
  assertWriteId(id, 'ID snapshots');
  const snapshot = await repositories.readSnapshot(id);
  if (!snapshot) throw new Error('Record snapshots tidak ditemukan.');
  if (snapshot.orphaned) throw new Error('Snapshot tanpa bab induk tersedia dalam cadangan penuh.');
  if (snapshot.chapterId !== chapterId) throw new Error('Snapshot berasal dari bab lain.');
  return snapshot;
}

/** Dipanggil dalam transaksi yang sama dengan penulisan isi bab. */
export async function saveAutoSnapshot(repositories: ChapterTransactions['history'], chapterId: number, content: string, reason: string) {
  if (!chapterId || chapterId <= 0 || !content?.trim()) return null;
  const snapshot = {
    chapterId,
    content,
    label: `${reason} — ${format(new Date(), 'd MMM, HH:mm')}`,
    timestamp: Date.now(),
    auto: true,
  };
  validateWriteFields('snapshots', snapshot, 'create');
  const id = await repositories.addSnapshot(snapshot);
  const autos = await repositories.readAutomaticSnapshots(chapterId);
  if (autos.length > AUTO_SNAPSHOT_LIMIT) {
    await repositories.deleteSnapshots(autos.slice(0, autos.length - AUTO_SNAPSHOT_LIMIT).map(row => row.id!));
  }
  return id;
}

export function createSnapshotOperations(storage: ChapterStorage) {
  return {
    async addSnapshot(snapshot: SnapshotInput) {
      validateWriteFields('snapshots', snapshot, 'create', ['chapterId', 'content', 'label', 'timestamp', 'auto']);
      assertWriteId(snapshot.chapterId, 'ID chapters');
      return storage.transact('history', async repositories => {
        if (!await repositories.readChapter(snapshot.chapterId)) throw new Error('Record chapters tidak ditemukan.');
        return repositories.addSnapshot(snapshot);
      });
    },

    async deleteSnapshot(chapterId: number, id: number) {
      await storage.transact('snapshots', async repositories => {
        await requireSnapshot(repositories, chapterId, id);
        await repositories.deleteSnapshots([id]);
      });
    },

    /** Operasi editor yang boleh berjalan meski snapshot pendukung gagal. */
    async createAutoSnapshot(chapterId: number, content: string, reason: string): Promise<number | null> {
      try {
        return await storage.transact('history', async repositories => {
          if (!chapterId || chapterId <= 0 || !content?.trim()) return null;
          assertWriteId(chapterId, 'ID chapters');
          if (!await repositories.readChapter(chapterId)) throw new Error('Record chapters tidak ditemukan.');
          return saveAutoSnapshot(repositories, chapterId, content, reason);
        });
      } catch (error) {
        console.error('Auto-snapshot gagal:', error);
        return null;
      }
    },
  };
}
