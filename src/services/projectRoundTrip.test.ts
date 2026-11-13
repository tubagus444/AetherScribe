import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { backupService } from './backupService';
import { remapTriage } from '@/src/lib/importRemap';

beforeEach(async () => {
  await db.projects.add({ id: 1, name: 'Source', description: '', createdAt: 1, lastOpened: 1 });
  await db.chapters.add({ id: 20, projectId: 1, title: 'Chapter', content: 'Text entry:10 gap-10', order: 0, lastModified: 1 });
  await db.codex.add({ id: 10, projectId: 1, name: 'Entity', category: 'character', aliases: [], tags: [], description: '' });
  await db.timeline.add({ id: 30, projectId: 1, title: 'Event', description: '', type: 'plot', order: 0, chapterId: 20, characterIds: [10] });
  await db.relationships.add({ id: 40, projectId: 1, sourceId: 10, targetId: 10, type: 'self' });
  for (const findingId of ['gap-10', 'unused-10', 'rel-40', 'tl-30', 'chrono-invalid-range-30', 'chrono-same-chapter-30-30', 'chrono-retro-chap-30-30']) {
    await db.continuityTriage.add({ projectId: 1, findingId, status: 'acknowledged', timestamp: 1 });
  }
  for (const workshopKey of ['entry:10', 'new:entry:10']) await db.chatSessions.add({ projectId: 1, kind: 'workshop', workshopKey, title: 'Session', messages: [{ role: 'user', content: 'Literal entry:10 gap-10', timestamp: 1 }], lastMessageAt: 1, chapterId: 20, activeChapterId: 20 });
});
afterEach(async () => { vi.restoreAllMocks(); for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });

it('exports/imports triage and workshop references with new IDs and preserves literal texts', async () => {
  const backup = JSON.parse(JSON.stringify(await backupService.collectProjectData(1)));
  expect(backup.data.continuityTriage).toHaveLength(7);
  const { projectId } = await backupService.importProjectData(backup);
  const entry = (await db.codex.where('projectId').equals(projectId).first())!;
  const chapter = (await db.chapters.where('projectId').equals(projectId).first())!;
  const event = (await db.timeline.where('projectId').equals(projectId).first())!;
  const relation = (await db.relationships.where('projectId').equals(projectId).first())!;
  const triage = await db.continuityTriage.where('projectId').equals(projectId).toArray();
  expect(triage.map(r => r.findingId)).toEqual([`gap-${entry.id}`, `unused-${entry.id}`, `rel-${relation.id}`, `tl-${event.id}`, `chrono-invalid-range-${event.id}`, `chrono-same-chapter-${event.id}-${event.id}`, `chrono-retro-chap-${event.id}-${event.id}`]);
  expect(triage.every(r => r.status === 'acknowledged' && r.timestamp === 1)).toBe(true);
  const sessions = await db.chatSessions.where('projectId').equals(projectId).toArray();
  expect(sessions.map(s => s.workshopKey)).toEqual([`entry:${entry.id}`, 'new:entry:10']);
  expect(sessions[0].messages[0].content).toBe('Literal entry:10 gap-10');
  expect(sessions[0].chapterId).toBe(chapter.id);
  expect(chapter.content).toBe('Text entry:10 gap-10');
  expect(await db.continuityTriage.where('projectId').equals(1).count()).toBe(7);
  const second = await backupService.importProjectData(await backupService.collectProjectData(projectId));
  expect(await db.continuityTriage.where('projectId').equals(second.projectId).count()).toBe(7);
});

it.each(['unknown-finding', 'missing-workshop-target'])('rolls back import on %s', async invalid => {
  const backup = await backupService.collectProjectData(1); delete backup.checksum;
  if (invalid === 'unknown-finding') backup.data.continuityTriage![0].findingId = 'future-format:10';
  else backup.data.chatSessions[0].workshopKey = 'entry:999';
  await expect(backupService.importProjectData(backup)).rejects.toThrow();
  expect(await db.projects.count()).toBe(1); expect(await db.codex.count()).toBe(1);
  expect(await db.continuityTriage.count()).toBe(7);
});

it('legacy project backup without triage remains importable', async () => {
  const backup = await backupService.collectProjectData(1); delete backup.data.continuityTriage; delete backup.checksum;
  backup.version = 7; delete backup.imageMode;
  const { projectId } = await backupService.importProjectData(backup);
  expect(await db.continuityTriage.where('projectId').equals(projectId).count()).toBe(0);
});

it('remaps the legacy relation endpoint form and drops stale known finding IDs', () => {
  const rows = remapTriage({ continuityTriage: [
    { projectId: 1, findingId: 'rel-10-10', status: 'dismissed', timestamp: 1 },
    { projectId: 1, findingId: 'gap-999', status: 'dismissed', timestamp: 1 },
  ] } as any, { projectId: 2, codexIdMap: new Map([[10, 11]]), chapterIdMap: new Map(), mapIdMap: new Map() });
  expect(rows.map(r => r.findingId)).toEqual(['rel-11-11']);
});
