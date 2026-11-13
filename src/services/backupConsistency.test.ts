import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { readBackupSnapshot } from './backupSnapshot';
import { backupService } from './backupService';
import { syncProjectToDrive } from './driveBackupService';
import { registerActiveEditor, unregisterActiveEditor } from '@/src/features/editor/editorBridge';
vi.mock('./googleAuth', () => ({ getAccessToken: async () => 'fixture-key' }));
beforeEach(async () => {
  await db.projects.add({ id: 1, name: 'Old', description: '', createdAt: 1, lastOpened: 1 });
  await db.chapters.add({ id: 1, projectId: 1, title: 'Chapter', content: 'Old', order: 0, lastModified: 1 });
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });

it('F19 flushes current draft before collection and serializes outside IndexedDB transaction', async () => {
  const bridge = { getChapterId: () => 1, flush: async () => { await db.chapters.update(1, { content: 'Latest' }); }, reload: vi.fn() };
  registerActiveEditor(bridge);
  const original = backupService.serializeMaps.bind(backupService);
  vi.spyOn(backupService, 'serializeMaps').mockImplementation(async maps => { expect(Dexie.currentTransaction).toBeNull(); return original(maps); });
  try { expect((await backupService.collectAllData()).data.chapters[0].content).toBe('Latest'); }
  finally { unregisterActiveEditor(bridge); }
});
it('F19 save failure prevents snapshot reads', async () => {
  const bridge = { getChapterId: () => 1, flush: vi.fn().mockRejectedValue(new Error('save failed')), reload: vi.fn() };
  registerActiveEditor(bridge); const read = vi.spyOn(db.projects, 'toArray');
  try { await expect(readBackupSnapshot()).rejects.toThrow('save failed'); expect(read).not.toHaveBeenCalled(); }
  finally { unregisterActiveEditor(bridge); }
});
it('F19 scoped snapshot includes only requested project and its snapshots', async () => {
  await db.projects.add({ id: 2, name: 'Other', description: '', createdAt: 1, lastOpened: 1 });
  await db.chapters.add({ id: 2, projectId: 2, title: 'Other', content: 'Other', order: 0, lastModified: 1 });
  await db.snapshots.add({ chapterId: 2, content: 'Other', label: '', timestamp: 1 });
  const result = await readBackupSnapshot(1);
  expect(result.projects.map(r => r.id)).toEqual([1]); expect(result.chapters.map(r => r.id)).toEqual([1]); expect(result.snapshots).toEqual([]);
});
it('F19 concurrent atomic writer cannot mix table generations', async () => {
  let writer: Promise<unknown> | undefined;
  const original = db.chapters.toArray.bind(db.chapters);
  vi.spyOn(db.chapters, 'toArray').mockImplementationOnce(() => {
    writer = Dexie.ignoreTransaction(() => db.transaction('rw', db.projects, db.chapters, async () => {
      await db.projects.update(1, { name: 'New' }); await db.chapters.update(1, { content: 'New' });
    }));
    return original();
  });
  const snapshot = await readBackupSnapshot();
  await writer;
  expect(snapshot.projects[0].name).toBe('Old'); expect(snapshot.chapters[0].content).toBe('Old');
  expect((await db.chapters.get(1))!.content).toBe('New');
});

it.each(['http', 'network', 'missing-id', 'success', 'prune-failure'])('F20 upload scenario %s retains correct history', async scenario => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  const calls: string[] = [];
  const files = Array.from({ length: 20 }, (_, i) => ({ id: `old${i}`, createdTime: new Date(Date.now() - (i + 1) * 1000).toISOString() }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === 'DELETE') { calls.push('delete'); if (scenario === 'prune-failure') throw new Error('prune failed'); return new Response(null, { status: 204 }); }
    if (url.includes('uploadType')) {
      calls.push('upload'); if (scenario === 'network') throw new Error('network');
      return new Response(JSON.stringify(scenario === 'missing-id' ? {} : { id: 'uploaded' }), { status: scenario === 'http' ? 500 : 200 });
    }
    return new Response(JSON.stringify({ files: url.includes('orderBy') ? files : [{ id: 'folder' }] }));
  });
  const warning = vi.fn();
  if (['network', 'missing-id'].includes(scenario)) await expect(syncProjectToDrive(true, warning)).rejects.toThrow();
  else expect(await syncProjectToDrive(true, warning)).toBe(scenario !== 'http');
  expect(warning).toHaveBeenCalledTimes(scenario === 'prune-failure' ? 1 : 0);
  expect(calls[0]).toBe('upload');
  if (['success', 'prune-failure'].includes(scenario)) expect(calls.filter(c => c === 'delete').length).toBeGreaterThan(0);
  else expect(calls).toEqual(['upload']);
});
