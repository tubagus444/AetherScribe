import { db } from '@/src/db';
import type { TriageStatus } from '@/src/types';
import { validateWriteFields } from '@/src/lib/backupValidation';
import { assertWriteId, requireRow } from './writeIntegrity';

/** Query hanya memakai indeks projectId yang tersedia. Transaksi mencegah race upsert. */
export async function writeTriage(projectId: number, findingId: string, status?: TriageStatus): Promise<void> {
  const timestamp = Date.now();
  assertWriteId(projectId, 'ID proyek');
  validateWriteFields('continuityTriage', { findingId, timestamp, ...(status === undefined ? {} : { status }) }, 'patch');
  await db.transaction('rw', db.projects, db.continuityTriage, async () => {
    if (status !== undefined) await requireRow(db.projects, projectId);
    const rows = await db.continuityTriage.where('projectId').equals(projectId).filter(row => row.findingId === findingId).toArray();
    if (status === undefined) {
      await db.continuityTriage.bulkDelete(rows.map(row => row.id!));
    } else {
      if (rows.length) {
        await db.continuityTriage.update(rows[0].id!, { status, timestamp });
        await db.continuityTriage.bulkDelete(rows.slice(1).map(row => row.id!));
      } else await db.continuityTriage.add({ projectId, findingId, status, timestamp });
    }
  });
}
