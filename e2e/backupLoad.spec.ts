import { test, expect } from '@playwright/test';

test('L06 live typing and simultaneous main/worker heap samples under actual compression', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(120000);
  const base = new URL(testInfo.project.use.baseURL || 'http://127.0.0.1:4177').origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/api/ai/proxy', route => route.fulfill({ status: 503, json: { error: 'Synthetic benchmark: provider disabled' } }));
  await page.route('**/__load', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__load');
  await page.evaluate(async () => { const path = '/e2e/backupBenchmarkFixture.ts'; await (await import(path)).seed({ chapters: 500, words: 5000, images: 4 }); });
  await page.goto('/');
  const editor = page.locator('.tiptap[contenteditable="true"]'); await expect(editor).toBeVisible();
  await editor.fill('Live typing ');
  const main = await context.newCDPSession(page), root = await browser.newBrowserCDPSession();
  const samples: unknown[] = [];
  try {
    for (const mode of ['worker', 'main', 'main', 'worker', 'worker', 'main']) {
      await editor.click(); await page.keyboard.press('ControlOrMeta+End');
      await page.evaluate(async () => {
        const service = '/src/services/backupService.ts', client = '/e2e/backupWorkerClient.ts', preparation = '/e2e/backupPreparation.ts';
        const data = await (await import(service)).backupService.collectAllData();
        Reflect.set(window, 'loadData', data); Reflect.set(window, 'loadPrepare', (await import(preparation)).prepareAuto);
        const worker = (await import(client)).createExperimentalWorker();
        Reflect.set(window, 'loadWorker', worker);
        Reflect.set(window, 'loadDone', false);
      });
      await expect.poll(() => page.workers().length).toBeGreaterThanOrEqual(1);
      await expect.poll(async () => (await root.send('Target.getTargets')).targetInfos.some(t => t.type === 'worker' && t.url.includes('backupExperimentWorker'))).toBe(true);
      const target = (await root.send('Target.getTargets')).targetInfos.find(t => t.type === 'worker' && t.url.includes('backupExperimentWorker'));
      if (!target) throw new Error('Worker not found');
      const { sessionId } = await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
      let sequence = 0;
      const inspect = () => new Promise<{ usedSize: number; backingStorageSize?: number }>((resolve, reject) => {
        const id = ++sequence;
        const listener = (event: { sessionId: string; message: string }) => {
          if (event.sessionId !== sessionId) return;
          const message = JSON.parse(event.message); if (message.id !== id) return;
          clearTimeout(timeout); root.off('Target.receivedMessageFromTarget', listener);
          if (message.error) reject(new Error('Worker inspection failed')); else resolve(message.result);
        };
        const timeout = setTimeout(() => { root.off('Target.receivedMessageFromTarget', listener); reject(new Error('Inspector timeout')); }, 10000);
        root.on('Target.receivedMessageFromTarget', listener);
        void root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method: 'Runtime.getHeapUsage' }) }).catch(reject);
      });
      await main.send('HeapProfiler.collectGarbage');
      const baseline = await main.send('Runtime.getHeapUsage');
      const heaps: { main: number; worker: number; backing: number }[] = [];
      let sampling = true;
      const collector = (async () => {
        while (sampling) {
          const [a, b] = await Promise.all([main.send('Runtime.getHeapUsage'), inspect()]);
          heaps.push({ main: a.usedSize, worker: b.usedSize, backing: (a.backingStorageSize ?? 0) + (b.backingStorageSize ?? 0) });
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      })();
      try {
        // Schedule without awaiting the operation, so typing competes with actual CPU work.
        await page.evaluate(mode => {
          const start = performance.now(), worker = Reflect.get(window, 'loadWorker');
          const finish = (bytes: ArrayBuffer) => { Reflect.set(window, 'loadDuration', performance.now() - start); Reflect.set(window, 'loadBytes', bytes.byteLength); Reflect.set(window, 'loadDone', true); };
          const fail = () => { Reflect.set(window, 'loadError', true); Reflect.set(window, 'loadDone', true); };
          if (mode === 'worker') { worker.onmessage = (event: MessageEvent) => event.data.bytes ? finish(event.data.bytes) : fail(); worker.onerror = fail; worker.postMessage(Reflect.get(window, 'loadData')); }
          else setTimeout(() => { Reflect.get(window, 'loadPrepare')(Reflect.get(window, 'loadData')).then(finish, fail); }, 0);
        }, mode);
        const keyMs: number[] = []; let during = 0;
        for (let key = 0; key < 20; key++) {
          if (!await page.evaluate(() => Reflect.get(window, 'loadDone'))) during++;
          const start = performance.now(); await page.keyboard.type('x'); keyMs.push(performance.now() - start);
        }
        await expect.poll(() => page.evaluate(() => Reflect.get(window, 'loadDone'))).toBe(true);
        expect(await page.evaluate(() => Reflect.get(window, 'loadError'))).not.toBe(true);
        expect(during).toBeGreaterThan(0);
        samples.push({ mode, during, keyMs, elapsedMs: await page.evaluate(() => Reflect.get(window, 'loadDuration')), baselineMainBytes: baseline.usedSize, heapSamples: heaps });
      } finally {
        sampling = false; await collector;
        await root.send('Target.detachFromTarget', { sessionId });
        await page.evaluate(() => { Reflect.get(window, 'loadWorker').terminate(); for (const key of ['loadWorker','loadData','loadPrepare','loadError']) Reflect.deleteProperty(window, key); });
      }
    }
    await expect.poll(() => page.evaluate(async () => { const path = '/src/db.ts'; return (await (await import(path)).db.chapters.get(1))?.content; })).toContain('x'.repeat(120));
    await page.reload(); await expect(editor).toContainText('x'.repeat(120));
    await testInfo.attach('backup-load.json', { body: JSON.stringify({ samples, caveat: 'sampled V8 heap/backing, not RSS or guaranteed peak; key time includes automation/IPC; CDP sampling adds overhead' }, null, 2), contentType: 'application/json' });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(testInfo.outputPath('backup-load.json'), JSON.stringify({ samples }, null, 2));
  } finally { await root.detach(); await main.detach(); }
});
