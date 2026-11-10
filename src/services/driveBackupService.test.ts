import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { restoreFromDrive } from './driveBackupService';

vi.mock('./googleAuth', () => ({ getAccessToken: async () => 'synthetic-token' }));
beforeEach(async () => {
  await db.projects.put({ id: 1, name: 'Workspace aktif', description: '', createdAt: 1, lastOpened: 1 });
});
afterEach(async () => { vi.restoreAllMocks(); for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });

describe('F04 Drive restore via the shared service boundary', () => {
  it.each(['project', 'future', 'malformed'])('rejects %s downloads without touching the workspace', async invalid => {
    const backup: any = {
      version: invalid === 'future' ? 9 : 7, timestamp: 1,
      scope: invalid === 'project' ? 'project' : 'all',
      data: { projects: [{ id: 2, name: 'Import', description: '', createdAt: 1, lastOpened: 1 }], chapters: [], codex: [] },
    };
    if (invalid === 'malformed') backup.data.projects = [{ id: 2 }];
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(backup)));
    await expect(restoreFromDrive('fixture')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await db.projects.get(1))!.name).toBe('Workspace aktif');
    expect(await db.backups.count()).toBe(0);
  });

  it('rejects a large advertised download before reading its body', async () => {
    const response = new Response('{}', { headers: { 'content-length': String(65 * 1024 * 1024) } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(restoreFromDrive('fixture')).rejects.toThrow(/64 MiB/);
    expect((await db.projects.get(1))!.name).toBe('Workspace aktif');
  });
});
