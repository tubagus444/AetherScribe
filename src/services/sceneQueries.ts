import Dexie from 'dexie';
import { db } from '@/src/db';
import type { SceneEmbedding } from '@/src/types';

/** Keyset-paged getAll: avoids both whole-project vector copies and per-row cursor IPC.
 * A single readonly transaction preserves the original stable primary-key order/snapshot.
 */
export async function visitSceneEmbeddings(projectId: number, visit: (row: SceneEmbedding) => void, checkpoint: () => void = () => {}): Promise<void> {
  await db.transaction('r', db.sceneEmbeddings, async () => {
    let lower: any[] = [projectId];
    for (;;) {
      checkpoint();
      const rows = await db.sceneEmbeddings.where('[projectId+id]')
        .between(lower, [projectId, Dexie.maxKey], false, false).limit(256).toArray();
      checkpoint();
      for (const row of rows) { checkpoint(); visit(row); }
      if (rows.length < 256) break;
      lower = [projectId, rows[rows.length - 1].id];
    }
  });
}
