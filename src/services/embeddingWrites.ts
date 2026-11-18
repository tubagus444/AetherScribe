import type { Table } from 'dexie';
import { db } from '@/src/db';
import { requestId } from '@/src/lib/dataContracts';
import type { SceneEmbedding, VectorEmbedding } from '@/src/types';

/** Hasil worker yang tiba sesudah induknya dihapus cukup dilewati. */
async function saveCurrentEmbeddings<Row extends { projectId: number }>(
  table: Table<Row, string>, parentTable: Table<{ projectId: number }, number>,
  rows: Row[], parentId: (row: Row) => unknown,
) {
  const ids = [...new Set(rows.map(parentId).filter(requestId))];
  if (!ids.length) return;
  await db.transaction('rw', [table, parentTable], async () => {
    const parents = await parentTable.bulkGet(ids);
    const owners = new Map(ids.map((id, index) => [id, parents[index]?.projectId]));
    const current = rows.filter(row => {
      const id = parentId(row);
      return requestId(id) && requestId(row.projectId) && owners.get(id) === row.projectId;
    });
    if (current.length) await table.bulkPut(current);
  });
}

export function saveCodexEmbeddings(rows: VectorEmbedding[]) {
  return saveCurrentEmbeddings(db.embeddings, db.codex, rows, row => row.codexId);
}

export function saveSceneEmbeddings(rows: SceneEmbedding[]) {
  return saveCurrentEmbeddings(db.sceneEmbeddings, db.chapters, rows, row => row.chapterId);
}
