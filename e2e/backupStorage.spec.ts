import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.route('**/__backup_storage', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__backup_storage');
  await page.evaluate(async () => {
    const fixture = '/e2e/backupBenchmarkFixture.ts';
    await (await import(fixture)).seed({ chapters: 10, words: 2000, images: 1 });
  });
});

for (const mode of ['missing', 'throwing'] as const) {
  test(`L06 ${mode} compression saves readable plain backup and restores chapters/images`, async ({ page }) => {
    const result = await page.evaluate(async mode => {
      const s = '/src/services/backupService.ts', d = '/src/db.ts';
      const { backupService: service } = await import(s), { db } = await import(d);
      const before = await service.collectAllData();
      const descriptor = Object.getOwnPropertyDescriptor(window, 'CompressionStream');
      const nativeWorker = window.Worker;
      // Exercise the main-thread compatibility fallback; worker has its own globals.
      Reflect.set(window, 'Worker', undefined);
      Object.defineProperty(window, 'CompressionStream', { configurable: true, value: mode === 'missing' ? undefined : class { constructor() { throw new Error('Synthetic compression failure'); } } });
      try {
        await service.saveToInternalDB(before);
        const record = await db.backups.orderBy('id').last();
        const parsed = JSON.parse(await service.decodeInternalBackup(record));
        await service.validateInput(parsed, 'all');
        await db.chapters.update(1, { content: '<p>Changed after backup</p>' });
        await service.restoreData(parsed);
        const after = await service.collectAllData();
        const safety = await db.backups.filter(item => item.kind === 'pre-restore').count();
        return { plain: record.compressed === false && typeof record.data === 'string', same: JSON.stringify(before.data) === JSON.stringify(after.data), safety };
      } finally {
        window.Worker = nativeWorker;
        if (descriptor) Object.defineProperty(window, 'CompressionStream', descriptor);
        else Reflect.deleteProperty(window, 'CompressionStream');
      }
    }, mode);
    expect(result).toEqual({ plain: true, same: true, safety: 1 });
  });
}

test('L06 missing Web Crypto rejects checksummed restore before workspace or history changes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = '/src/services/backupService.ts', d = '/src/db.ts';
    const { backupService: service } = await import(s), { db } = await import(d);
    const backup = await service.collectAllData();
    await service.saveToInternalDB(backup);
    await db.chapters.update(1, { content: '<p>Keep current draft</p>' });
    const before = JSON.stringify((await service.collectAllData()).data);
    const history = JSON.stringify(await db.backups.toArray());
    const descriptor = Object.getOwnPropertyDescriptor(window, 'crypto');
    Object.defineProperty(window, 'crypto', { configurable: true, value: undefined });
    let error = '';
    try { await service.restoreData(backup); } catch (caught) { error = String(caught); }
    finally {
      if (descriptor) Object.defineProperty(window, 'crypto', descriptor);
      else Reflect.deleteProperty(window, 'crypto');
    }
    return { checksum: backup.checksum?.length, error, unchanged: before === JSON.stringify((await service.collectAllData()).data), history: history === JSON.stringify(await db.backups.toArray()) };
  });
  expect(result.checksum).toBe(64);
  expect(result.error).toMatch(/crypto|checksum|integritas/i);
  expect(result.unchanged).toBe(true);
  expect(result.history).toBe(true);
});

for (const persistent of [false, true]) {
  test(`L06 ${persistent ? 'persistent' : 'transient'} quota failure protects newest auto and pre-restore`, async ({ page }) => {
    const result = await page.evaluate(async persistent => {
      const s = '/src/services/backupService.ts', d = '/src/db.ts';
      const { backupService: service } = await import(s), { db } = await import(d);
      const backup = await service.collectAllData();
      await service.saveToInternalDB(backup);
      const original = await db.backups.orderBy('id').last();
      await db.backups.clear();
      const { id: ignored, ...record } = original;
      const base = Date.now() - 3 * 86400000;
      const oldest = await db.backups.add({ ...record, timestamp: base });
      await db.backups.add({ ...record, timestamp: base + 86400000 });
      const newest = await db.backups.add({ ...record, timestamp: base + 2 * 86400000 });
      const safety = await db.backups.add({ ...record, timestamp: base + 2 * 86400000, kind: 'pre-restore' });
      const before = JSON.stringify((await service.collectAllData()).data);
      let attempts = 0, error = '';
      const fail = () => { attempts++; if (persistent || attempts === 1) throw new DOMException('Synthetic quota full', 'QuotaExceededError'); };
      db.backups.hook('creating', fail);
      try { await service.saveToInternalDB(backup); } catch (caught) { error = String(caught); }
      finally { db.backups.hook('creating').unsubscribe(fail); }
      const remaining = await db.backups.toArray();
      // Decode and validate every retained record, not just their count.
      for (const item of remaining) await service.validateInput(JSON.parse(await service.decodeInternalBackup(item)), 'all');
      return { attempts, error, oldestGone: !remaining.some(item => item.id === oldest), newestKept: remaining.some(item => item.id === newest), safetyKept: remaining.some(item => item.id === safety), count: remaining.length, unchanged: before === JSON.stringify((await service.collectAllData()).data) };
    }, persistent);
    expect(result.attempts).toBe(persistent ? 3 : 2);
    expect(result.error).toMatch(persistent ? /Penyimpanan penuh/ : /^$/);
    expect(result.oldestGone).toBe(true);
    expect(result.newestKept).toBe(true);
    expect(result.safetyKept).toBe(true);
    expect(result.count).toBe(persistent ? 2 : 4);
    expect(result.unchanged).toBe(true);
  });
}

test('L06 failed pre-restore storage cancels restore and permits retry after recovery', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = '/src/services/backupService.ts', d = '/src/db.ts';
    const { backupService: service } = await import(s), { db } = await import(d);
    const backup = await service.collectAllData();
    await service.saveToInternalDB(backup);
    await db.chapters.update(1, { content: '<p>Keep unsafely backed up draft</p>' });
    const before = JSON.stringify((await service.collectAllData()).data);
    const history = JSON.stringify(await db.backups.toArray());
    const fail = () => { throw new DOMException('Synthetic storage unavailable', 'UnknownError'); };
    db.backups.hook('creating', fail);
    let error = '';
    try { await service.restoreData(backup); } catch (caught) { error = String(caught); }
    finally { db.backups.hook('creating').unsubscribe(fail); }
    const unchanged = before === JSON.stringify((await service.collectAllData()).data);
    const retained = history === JSON.stringify(await db.backups.toArray());
    await service.restoreData(backup);
    const safety = await db.backups.filter(item => item.kind === 'pre-restore').first();
    const undo = JSON.parse(await service.decodeInternalBackup(safety));
    await service.validateInput(undo, 'all');
    return { error, unchanged, retained, restored: JSON.stringify((await service.collectAllData()).data) === JSON.stringify(backup.data), undo: JSON.stringify(undo.data) === before };
  });
  expect(result.error).toMatch(/gagal membuat cadangan pengaman/);
  expect(result).toMatchObject({ unchanged: true, retained: true, restored: true, undo: true });
});
