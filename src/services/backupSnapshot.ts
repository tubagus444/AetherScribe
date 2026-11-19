import { db } from '@/src/db';
import { BACKUP_TABLES, PROJECT_IMPORT_TABLES, TABLE_CATALOG } from '@/src/lib/tableCatalog';
import { flushActiveEditor } from '@/src/features/editor/editorBridge';
import { detachWorkshopEntry, parseWorkshopEntryKey } from '@/src/lib/workshopReference';
import type { ChatSession } from '@/src/types';

async function preserveLegacyWorkshopMessages(data: Record<string, any[]>, projectId?: number) {
  const sessions: ChatSession[] = data.chatSessions;
  if (!sessions.length) return;
  const exportedEntries = new Set(data.codex.map(row => row.id));
  const unresolved = sessions.flatMap(session => {
    const id = parseWorkshopEntryKey(session.workshopKey);
    return typeof id === 'number' && !exportedEntries.has(id) ? [{ session, id }] : [];
  });
  if (!unresolved.length) return;

  // A scoped export must distinguish deleted entries from invalid cross-project links.
  const remainingEntries = projectId === undefined ? [] : await db.codex.bulkGet([...new Set(unresolved.map(row => row.id))]);
  const existingIds = new Set(remainingEntries.map(row => row?.id));
  for (const { session, id } of unresolved) {
    if (!existingIds.has(id)) detachWorkshopEntry(session);
  }
}

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
        if (name === 'snapshots') data[name] = data[name].filter(row => row.orphaned !== true);
      } else data[name] = await table.where('projectId').equals(projectId).toArray();
    }
    if (projectId !== undefined && !data.projects.length) throw new Error('Proyek tidak ditemukan.');
    await preserveLegacyWorkshopMessages(data, projectId);
    return data;
  });
}
