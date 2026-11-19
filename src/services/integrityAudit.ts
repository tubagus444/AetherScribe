import { db } from '@/src/db';
import { requestId } from '@/src/lib/dataContracts';
import { domainTables } from './entityDeletion';
import { parseWorkshopEntryKey } from '@/src/lib/workshopReference';

export interface IntegrityIssue {
  table: string;
  recordId: string | number | undefined;
  field: string;
  reason: 'invalid' | 'missing' | 'cross-project' | 'detached';
}

export async function auditProjectIntegrity(): Promise<IntegrityIssue[]> {
  return db.transaction('r', domainTables(), async () => {
    const projects = new Set(await db.projects.toCollection().primaryKeys());
    const chapters = new Map<number, number>();
    const codex = new Map<number, number>();
    const maps = new Map<number, number>();
    await db.chapters.each(row => { if (row.id !== undefined) chapters.set(row.id, row.projectId); });
    await db.codex.each(row => { if (row.id !== undefined) codex.set(row.id, row.projectId); });
    await db.maps.each(row => { if (row.id !== undefined) maps.set(row.id, row.projectId); });
    const issues: IntegrityIssue[] = [];

    for (const table of domainTables()) {
      if (table.name === 'projects') continue;
      await table.each(row => {
        const report = (field: string, reason: IntegrityIssue['reason']) => {
          issues.push({ table: table.name, recordId: row.id, field, reason });
        };
        if (table.name !== 'snapshots') {
          if (!requestId(row.projectId)) report('projectId', 'invalid');
          else if (!projects.has(row.projectId)) report('projectId', 'missing');
        }
        const reference = (field: string, index: Map<number, number>, required = false, value: unknown = row[field]) => {
          if (value === undefined && !required) return;
          if (!requestId(value)) report(field, 'invalid');
          else if (!index.has(value)) report(field, 'missing');
          else if (requestId(row.projectId) && index.get(value) !== row.projectId) report(field, 'cross-project');
        };
        switch (table.name) {
          case 'snapshots':
            if (row.orphaned === true) report('chapterId', 'detached');
            else reference('chapterId', chapters, true);
            break;
          case 'sceneEmbeddings':
            reference('chapterId', chapters, true);
            break;
          case 'chatSessions': {
            reference('chapterId', chapters);
            reference('activeChapterId', chapters);
            const entryId = parseWorkshopEntryKey(row.workshopKey);
            if (entryId !== undefined) reference('workshopKey', codex, true, entryId);
            break;
          }
          case 'timeline':
            reference('chapterId', chapters);
            if (Array.isArray(row.characterIds)) {
              for (const [index, id] of row.characterIds.entries()) reference(`characterIds[${index}]`, codex, true, id ?? NaN);
            } else if (row.characterIds !== undefined) report('characterIds', 'invalid');
            break;
          case 'relationships':
            reference('sourceId', codex, true);
            reference('targetId', codex, true);
            break;
          case 'embeddings':
            reference('codexId', codex, true, typeof row.codexId === 'string' && /^\d+$/.test(row.codexId) ? Number(row.codexId) : row.codexId);
            break;
          case 'plotPromises':
            reference('plantedChapterId', chapters);
            reference('codexId', codex);
            reference('payoffCodexId', codex);
            break;
          case 'mapMarkers':
            reference('mapId', maps, true);
            reference('linkedMapId', maps);
            reference('codexId', codex);
            break;
        }
      });
    }
    return issues;
  });
}
