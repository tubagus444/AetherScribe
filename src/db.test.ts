import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, drainPendingDbIssues } from './db';
import { registerActiveEditor, unregisterActiveEditor, type ActiveEditorBridge } from './features/editor/editorBridge';

describe('F05 database versionchange', () => {
  let bridge: ActiveEditorBridge;
  const reload = vi.fn();
  beforeAll(async () => { await db.open(); });
  afterEach(() => { unregisterActiveEditor(bridge); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(async () => { await db.delete(); });

  it.each([true, false])('waits for flush and reloads only on success=%s', async success => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reload.mockClear();
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), location: { reload } });
    const close = vi.spyOn(db, 'close').mockImplementation(() => {});
    let resolve: () => void;
    let reject: (err: Error) => void;
    const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    bridge = { getChapterId: () => 1, flush: () => pending, reload: vi.fn() };
    registerActiveEditor(bridge);
    // false mencegah Dexie menutup koneksi otomatis sebelum flush selesai.
    expect(db.on('versionchange').fire({} as IDBVersionChangeEvent)).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    if (success) resolve!(); else reject!(new Error('quota'));
    await pending.catch(() => {});
    expect(close).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(reload).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(drainPendingDbIssues()).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: success ? 'warning' : 'error' }),
    ]));
  });
});
