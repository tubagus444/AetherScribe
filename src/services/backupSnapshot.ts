import { db } from '@/src/db';
import { BACKUP_TABLES, PROJECT_IMPORT_TABLES, TABLE_CATALOG } from '@/src/lib/tableCatalog';
import { flushActiveEditor } from '@/src/features/editor/editorBridge';

/** Hanya operasi IndexedDB di transaksi; Blob dibaca sebagai Blob, belum diserialisasi. */
export async function readBackupSnapshot(projectId?: number): Promise<Record<string, any[]>> {
  await flushActiveEditor();
  const tables = projectId === undefined ? BACKUP_TABLES : PROJECT_IMPORT_TABLES;
  return db.transaction('r', tables.map(name => db[name]), async () => {
    const data: Record<string, any[]> = {};
    for (const name of tables) {
      const table = db[name];
      const { scope } = TABLE_CATALOG[name];
      if (projectId === undefined) data[name] = await table.toArray();
      else if (scope === 'project-root') data[name] = await table.where('id').equals(projectId).toArray();
      else if (scope === 'chapter') {
        const ids = data.chapters.map(row => row.id);
        data[name] = ids.length ? await table.where('chapterId').anyOf(ids).toArray() : [];
      } else data[name] = await table.where('projectId').equals(projectId).toArray();
    }
    if (projectId !== undefined && !data.projects.length) throw new Error('Proyek tidak ditemukan.');
    return data;
  });
}
