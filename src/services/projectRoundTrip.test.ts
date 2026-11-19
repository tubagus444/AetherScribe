import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { backupService } from './backupService';
import { remapTriage } from '@/src/lib/importRemap';
import { deleteCodexEntry } from './entityDeletion';
import { addChatSession, findWorkshopSession, updateChatSession } from './chatSessionOperations';

beforeEach(async () => {
  await db.projects.add({ id: 1, name: 'Source', description: '', createdAt: 1, lastOpened: 1 });
  await db.chapters.add({ id: 20, projectId: 1, title: 'Chapter', content: 'Text entry:10 gap-10', order: 0, lastModified: 1 });
  await db.codex.add({ id: 10, projectId: 1, name: 'Entity', category: 'character', aliases: [], tags: [], description: '' });
  await db.timeline.add({ id: 30, projectId: 1, title: 'Event', description: '', type: 'plot', order: 0, chapterId: 20, characterIds: [10] });
  await db.relationships.add({ id: 40, projectId: 1, sourceId: 10, targetId: 10, type: 'self' });
  for (const findingId of ['gap-10', 'unused-10', 'rel-40', 'tl-30', 'chrono-invalid-range-30', 'chrono-same-chapter-30-30', 'chrono-retro-chap-30-30']) {
    await db.continuityTriage.add({ projectId: 1, findingId, status: 'acknowledged', timestamp: 1 });
  }
  for (const workshopKey of ['entry:010', 'new:entry:10']) await db.chatSessions.add({ projectId: 1, kind: 'workshop', workshopKey, title: 'Session', messages: [{ role: 'user', content: 'Literal entry:10 gap-10', timestamp: 1 }], lastMessageAt: 1, chapterId: 20, activeChapterId: 20 });
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

it('resumes legacy sessions and canonicalizes new or updated Workshop references', async () => {
  const legacySession = await findWorkshopSession(1, 'entry:10');
  expect(legacySession).toMatchObject({ workshopKey: 'entry:010' });
  const id = await addChatSession({ projectId: 1, kind: 'workshop', workshopKey: 'entry:0010', title: 'New', messages: [], lastMessageAt: 1 });
  expect((await findWorkshopSession(1, 'entry:10'))?.id).toBe(id);
  await updateChatSession(legacySession!.id!, { workshopKey: 'entry:0010' });
  expect((await db.chatSessions.get(legacySession!.id!))?.workshopKey).toBe('entry:10');
  await expect(updateChatSession(id, { workshopKey: 'entry:9007199254740993' })).rejects.toThrow(/Workshop tidak valid/);
});

it('unlinks deleted entries and exports already-dangling legacy sessions with their messages', async () => {
  const dangling = await db.chatSessions.add({
    projectId: 1, kind: 'workshop', workshopKey: 'entry:099', title: 'Old session',
    lastMessageAt: 1, messages: [{ role: 'user', content: 'Teks dari sesi lama', timestamp: 1 }],
  });
  await deleteCodexEntry(10);
  const sessions = await db.chatSessions.toArray();
  expect(sessions[0]).toMatchObject({ kind: 'studio', messages: [{ content: 'Literal entry:10 gap-10' }] });
  expect(sessions[0]).not.toHaveProperty('workshopKey');
  expect(sessions[1]).toMatchObject({ kind: 'workshop', workshopKey: 'new:entry:10' });

  const full = await backupService.collectAllData();
  expect(full.data.chatSessions[2]).toMatchObject({ id: dangling, kind: 'studio' });
  expect(full.data.chatSessions[2]).not.toHaveProperty('workshopKey');
  await expect(backupService.validateInput(full, 'all')).resolves.toBeDefined();
  const exported = await backupService.collectProjectData(1);
  const { projectId } = await backupService.importProjectData(exported);
  const imported = await db.chatSessions.where('projectId').equals(projectId).toArray();
  expect(imported[2]).toMatchObject({ kind: 'studio', messages: [{ content: 'Teks dari sesi lama' }] });
  expect(imported[2]).not.toHaveProperty('workshopKey');
  expect((await db.chatSessions.get(dangling))?.workshopKey).toBe('entry:099');
});

it.each(['entry:-10', 'entry:9007199254740993'])('rejects %s at backup validation', async key => {
  for (const scope of ['all', 'project'] as const) {
    const backup = scope === 'all' ? await backupService.collectAllData() : await backupService.collectProjectData(1);
    delete backup.checksum;
    backup.data.chatSessions[0].workshopKey = key;
    await expect(backupService.validateInput(backup, scope)).rejects.toThrow(/chatSessions.workshopKey/);
  }
});

it('rejects a missing target in project validation and recovers it from a legacy full backup', async () => {
  const project = await backupService.collectProjectData(1);
  delete project.checksum;
  project.data.chatSessions[0].workshopKey = 'entry:099';
  await expect(backupService.validateInput(project, 'project')).rejects.toThrow(/chatSessions.workshopKey/);

  const full = await backupService.collectAllData();
  full.data.chatSessions[0].workshopKey = 'entry:099';
  full.checksum = await backupService.computeChecksum(JSON.stringify(full.data));
  await backupService.restoreData(full);
  expect(full.data.chatSessions[0].workshopKey).toBe('entry:099');
  const recovered = await db.chatSessions.get(full.data.chatSessions[0].id);
  expect(recovered).toMatchObject({ kind: 'studio', messages: [{ content: 'Literal entry:10 gap-10' }] });
  expect(recovered).not.toHaveProperty('workshopKey');
});

it('rejects Workshop links across projects and distinguishes them from deleted targets during export', async () => {
  await db.projects.add({ id: 2, name: 'Other', description: '', createdAt: 1, lastOpened: 1 });
  await db.codex.add({ id: 2, projectId: 2, name: 'Other', category: 'character', aliases: [], tags: [], description: '' });
  const sessionId = (await db.chatSessions.toCollection().first())!.id!;
  await db.chatSessions.update(sessionId, { workshopKey: 'entry:02' });
  const project = await backupService.collectProjectData(1);
  expect(project.data.chatSessions[0].workshopKey).toBe('entry:02');
  expect(() => backupService.serializeExternalBackup(project)).toThrow(/chatSessions.workshopKey/);
  const full = await backupService.collectAllData();
  await expect(backupService.validateInput(full, 'all')).rejects.toThrow(/chatSessions.workshopKey/);
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
