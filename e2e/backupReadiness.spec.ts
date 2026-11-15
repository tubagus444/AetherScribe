import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__backup_ready', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__backup_ready');
  await page.evaluate(async () => {
    const path = '/e2e/backupBenchmarkFixture.ts'; await (await import(path)).seed({ chapters: 100, words: 2000, images: 1 });
    const dbPath = '/src/db.ts'; const { db } = await import(dbPath);
    await db.codex.add({ id: 1, projectId: 1, name: 'Keep lore', category: 'location', description: '', aliases: [], tags: [] });
    await db.mapMarkers.add({ id: 1, projectId: 1, mapId: 1, codexId: 1, kind: 'pin', geometry: { x: .5, y: .5 }, createdAt: 1 });
    await db.snapshots.add({ id: 1, chapterId: 1, content: 'Keep snapshot', label: '', timestamp: 1 });
  });
});

test('L06 offline worker loading failure uses preloaded fallback without changing data', async ({ page, context }) => {
  await page.evaluate(async () => {
    const s = '/src/services/backupService.ts', c = '/e2e/backupWorkerClient.ts', io = '/src/lib/backupIO.ts';
    const service = (await import(s)).backupService, client = await import(c), reader = (await import(io)).readBackupFile;
    const backup = await service.collectAllData(); await service.saveToInternalDB(backup);
    Reflect.set(window, 'offlineProbe', async () => {
      const result = await client.experimentalFallback(backup);
      const parsed = await reader(new Blob([result.bytes])); await service.validateInput(parsed, 'all');
      return { fallback: result.fallback, same: JSON.stringify((await service.collectAllData()).data) === JSON.stringify(backup.data), active: client.activeRequests() };
    });
  });
  await context.setOffline(true);
  try { expect(await page.evaluate(() => Reflect.get(window, 'offlineProbe')())).toEqual({ fallback: true, same: true, active: 0 }); }
  finally { await context.setOffline(false); }
});

for (const failure of ['startup', 'crash', 'timeout', 'malformed'] as const) {
  test(`L06 experimental ${failure} failure preserves data and prior backup, fallback matches`, async ({ page }) => {
    const result = await page.evaluate(async failure => {
      const clientPath = '/e2e/backupWorkerClient.ts', servicePath = '/src/services/backupService.ts', dbPath = '/src/db.ts';
      const { requestWorker, experimentalFallback, activeRequests } = await import(clientPath);
      const { backupService } = await import(servicePath), { db } = await import(dbPath);
      const backup = await backupService.collectAllData(); await backupService.saveToInternalDB(backup);
      const before = JSON.stringify((await backupService.collectAllData()).data);
      const prior = await db.backups.toArray();
      const script = failure === 'crash' ? 'throw new Error("Synthetic crash")' : failure === 'timeout' ? 'self.onmessage=()=>{}' : 'self.onmessage=()=>postMessage({bytes:42})';
      const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
      const create = () => { if (failure === 'startup') throw new Error('Synthetic startup failure'); return new Worker(url); };
      try {
        let rejected = false;
        try { await requestWorker(backup, create, 500); } catch { rejected = true; }
        const fallback = await experimentalFallback(backup, create, 500);
        const ioPath = '/src/lib/backupIO.ts'; const { readBackupFile } = await import(ioPath);
        const parsed = await readBackupFile(new Blob([fallback.bytes])); await backupService.validateInput(parsed, 'all');
        const original = JSON.parse(await backupService.decodeInternalBackup(prior[0]));
        const after = JSON.stringify((await backupService.collectAllData()).data);
        const retained = await db.backups.toArray();
        return { rejected, fallback: fallback.fallback, matches: JSON.stringify(original) === JSON.stringify(parsed), unchanged: before === after, priorKept: prior[0].id === retained[0].id && prior[0].size === retained[0].size, active: activeRequests() };
      } finally { URL.revokeObjectURL(url); }
    }, failure);
    expect(result).toEqual({ rejected: true, fallback: true, matches: true, unchanged: true, priorKept: true, active: 0 });
  });
}

test('L06 typing during experimental worker preparation preserves live draft and snapshot boundary', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.tiptap[contenteditable="true"]'); await expect(editor).toBeVisible();
  await editor.fill('Snapshot text');
  await page.evaluate(async () => {
    const s = '/src/services/backupService.ts', c = '/e2e/backupWorkerClient.ts';
    const backup = await (await import(s)).backupService.collectAllData();
    // Deterministic in-flight window; this tests snapshot isolation, not typing latency.
    const url = URL.createObjectURL(new Blob([`import '${location.origin}/e2e/backupExperimentWorker.ts'; const handler=self.onmessage; self.onmessage=e=>setTimeout(()=>handler(e),500);`], { type: 'text/javascript' }));
    Reflect.set(window, 'readyPending', true);
    document.addEventListener('input', () => Reflect.set(window, 'typedDuringPending', Reflect.get(window, 'readyPending')), { once: true });
    const promise = (await import(c)).requestWorker(backup, () => new Worker(url, { type: 'module' })).finally(() => { Reflect.set(window, 'readyPending', false); URL.revokeObjectURL(url); });
    Reflect.set(window, 'readyWorker', promise);
    Reflect.set(window, 'readySnapshot', backup.data.chapters[0].content);
  });
  await editor.fill('Typed while backup runs');
  const content = await page.evaluate(async () => {
    const bytes = await Reflect.get(window, 'readyWorker');
    const path = '/src/lib/backupIO.ts'; const backup = await (await import(path)).readBackupFile(new Blob([bytes]));
    return { saved: backup.data.chapters[0].content, snapshot: Reflect.get(window, 'readySnapshot') };
  });
  expect(content.saved).toBe(content.snapshot);
  expect(await page.evaluate(() => Reflect.get(window, 'typedDuringPending'))).toBe(true);
  await expect.poll(() => page.evaluate(async () => { const path = '/src/db.ts'; return (await (await import(path)).db.chapters.get(1))?.content; })).toContain('Typed while backup runs');
  await page.reload(); await expect(editor).toHaveText('Typed while backup runs');
});

test('L06 repeated worker requests release workers and sample main/worker V8 heaps', async ({ page, context, browser }, testInfo) => {
  const main = await context.newCDPSession(page);
  const root = await browser.newBrowserCDPSession();
  const mainHeaps: number[] = [], workerHeaps: number[] = [];
  try {
    for (let cycle = 0; cycle < 6; cycle++) {
      await page.evaluate(async () => {
        const s = '/src/services/backupService.ts', c = '/e2e/backupWorkerClient.ts';
        const backup = await (await import(s)).backupService.collectAllData();
        const client = await import(c), worker = client.createExperimentalWorker();
        // Inspect the live worker before its request; client terminates it afterward.
        Reflect.set(window, 'heapWorker', worker); Reflect.set(window, 'heapBackup', backup);
      });
      await expect.poll(() => page.workers().length).toBe(1);
      const target = (await root.send('Target.getTargets')).targetInfos.find(t => t.type === 'worker' && t.url.includes('backupExperimentWorker'));
      if (!target) throw new Error('Missing worker CDP target');
      const { sessionId } = await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
      const heap = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => { root.off('Target.receivedMessageFromTarget', receive); reject(new Error('Heap inspection timeout')); }, 5000);
        const receive = (event: { sessionId: string; message: string }) => {
          if (event.sessionId !== sessionId) return;
          const result = JSON.parse(event.message);
          if (result.id !== 1) return;
          clearTimeout(timeout); root.off('Target.receivedMessageFromTarget', receive);
          if (result.error) reject(new Error('Worker heap inspection failed')); else resolve(result.result.usedSize);
        };
        root.on('Target.receivedMessageFromTarget', receive);
        void root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: 1, method: 'Runtime.getHeapUsage' }) }).catch(reject);
      });
      workerHeaps.push(heap);
      await root.send('Target.detachFromTarget', { sessionId });
      await page.evaluate(async () => {
        const path = '/e2e/backupWorkerClient.ts'; const client = await import(path);
        await client.requestWorker(Reflect.get(window, 'heapBackup'), () => Reflect.get(window, 'heapWorker'));
        Reflect.deleteProperty(window, 'heapBackup'); Reflect.deleteProperty(window, 'heapWorker');
        if (client.activeRequests() !== 0) throw new Error('Pending request leaked');
      });
      await expect.poll(() => page.workers().length).toBe(0);
      await main.send('HeapProfiler.collectGarbage');
      mainHeaps.push((await main.send('Runtime.getHeapUsage')).usedSize);
    }
    await testInfo.attach('worker-stability.json', { body: JSON.stringify({ mainHeaps, workerHeaps, cycles: 6, scope: 'main post-GC heap and fresh worker pre-request heap; not peak or RSS' }, null, 2), contentType: 'application/json' });
    expect(mainHeaps[5] - mainHeaps[1]).toBeLessThan(8 * 1024 * 1024);
  } finally { await root.detach(); await main.detach(); }
});
