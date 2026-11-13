import { db } from '@/src/db';
import { BACKUP_TABLES } from '@/src/lib/backupValidation';
import { flushActiveEditor } from '@/src/features/editor/editorBridge';

/** Hanya operasi IndexedDB di transaksi; Blob dibaca sebagai Blob, belum diserialisasi. */
export async function readBackupSnapshot(projectId?: number): Promise<Record<string, any[]>> {
  await flushActiveEditor();
  const tables = BACKUP_TABLES.map(name => (db as any)[name] as ReturnType<typeof db.table>);
  return db.transaction('r', tables, async () => {
    const data: Record<string, any[]> = {};
    for (const table of tables) {
      if (projectId === undefined) data[table.name] = await table.toArray();
      else if (table.name === 'projects') data.projects = await table.where('id').equals(projectId).toArray();
      else if (table.name === 'snapshots') {
        const ids = data.chapters.map(row => row.id);
        data.snapshots = ids.length ? await table.where('chapterId').anyOf(ids).toArray() : [];
      } else data[table.name] = await table.where('projectId').equals(projectId).toArray();
    }
    if (projectId !== undefined && !data.projects.length) throw new Error('Proyek tidak ditemukan.');
    return data;
  });
}
