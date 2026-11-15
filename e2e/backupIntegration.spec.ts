import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.route('**/api/ai/ollama-models', route => route.fulfill({ json: { models: [] } }));
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__backup_integration', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__backup_integration');
  await page.evaluate(async () => {
    const path = '/e2e/backupBenchmarkFixture.ts';
    await (await import(path)).seed({ chapters: 100, words: 2000, images: 1 });
    const d = '/src/db.ts';
    await (await import(d)).db.chapters.update(1, { content: '<p>Worker UI snapshot</p>' });
  });
});

test('L06 production worker saves and restores through settings UI with safety snapshot', async ({ page }) => {
  let workers = 0;
  page.on('worker', worker => { if (worker.url().includes('/src/workers/backupWorker')) workers++; });
  await page.goto('/');
  const editor = page.locator('.tiptap[contenteditable="true"]');
  await expect(editor).toHaveText('Worker UI snapshot');
  await page.getByRole('button', { name: 'Pengaturan Aplikasi', exact: true }).click();
  await page.getByRole('button', { name: 'Data & Cadangan' }).click();
  const trigger = page.getByRole('button', { name: 'Picu Pencadangan Lokal', exact: true });
  await trigger.click();
  await expect(trigger).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Pulihkan', exact: true })).toHaveCount(1);
  expect(workers).toBe(1);
  await page.evaluate(async () => {
    const path = '/src/db.ts'; await (await import(path)).db.chapters.update(2, { content: '<p>Draft before restore</p>' });
  });
  await page.getByRole('button', { name: 'Pulihkan', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Timpa semua data?' });
  await dialog.getByRole('button', { name: 'Ya, pulihkan' }).click();
  await expect(dialog).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const s = '/src/services/backupService.ts', d = '/src/db.ts';
    const { backupService: service } = await import(s), { db } = await import(d);
    const safety = await db.backups.filter(item => item.kind === 'pre-restore').first();
    const undo = JSON.parse(await service.decodeInternalBackup(safety));
    await service.validateInput(undo, 'all');
    return { restored: !(await db.chapters.get(2)).content.includes('Draft before restore'), undo: undo.data.chapters.find(row => row.id === 2).content, image: undo.data.maps[0].imageDataUrl?.startsWith('data:image/png'), liveImage: (await db.maps.get(1)).imageBlob instanceof Blob };
  });
  expect(result).toEqual({ restored: true, undo: '<p>Draft before restore</p>', image: true, liveImage: true });
  expect(workers).toBe(1); // pre-restore never starts a worker
});

test('L06 concurrent internal saves use one worker at a time and preserve each snapshot', async ({ page }) => {
  let active = 0, peak = 0, total = 0;
  page.on('worker', worker => {
    if (!worker.url().includes('/src/workers/backupWorker')) return;
    active++; total++; peak = Math.max(peak, active); worker.on('close', () => active--);
  });
  const result = await page.evaluate(async () => {
    const s = '/src/services/backupService.ts', d = '/src/db.ts';
    const { backupService: service } = await import(s), { db } = await import(d);
    const data = await service.collectAllData();
    await Promise.all([0, 1, 2].map(index => {
      const snapshot = structuredClone(data); snapshot.timestamp += index;
      snapshot.data.chapters[0].content = `<p>Queued snapshot ${index}</p>`;
      return service.saveToInternalDB(snapshot);
    }));
    const rows = await db.backups.orderBy('timestamp').toArray();
    return Promise.all(rows.map(async row => {
      const parsed = JSON.parse(await service.decodeInternalBackup(row));
      await service.validateInput(parsed, 'all'); return parsed.data.chapters[0].content;
    }));
  });
  expect(result).toEqual([0, 1, 2].map(index => `<p>Queued snapshot ${index}</p>`));
  await expect.poll(() => active).toBe(0);
  expect(total).toBe(3); expect(peak).toBe(1);
});

for (const failure of ['startup', 'malformed', 'crash', 'timeout'] as const) {
  test(`L06 production ${failure} falls back and writes valid backup`, async ({ page }) => {
    test.setTimeout(60000);
    if (failure === 'crash') await page.route('**/src/workers/backupWorker.ts*', route => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("Synthetic worker crash")' }));
    const result = await page.evaluate(async failure => {
      const s = '/src/services/backupService.ts', d = '/src/db.ts';
      const { backupService: service } = await import(s), { db } = await import(d);
      const backup = await service.collectAllData();
      const NativeWorker = window.Worker;
      const script = failure === 'timeout' ? 'self.onmessage=()=>{}' : 'self.onmessage=()=>postMessage({type:"prepared",bytes:new ArrayBuffer(20)})';
      const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
      if (failure !== 'crash') window.Worker = class extends NativeWorker {
        constructor() { if (failure === 'startup') throw new Error('Synthetic unavailable'); super(url); }
      };
      try {
        await service.saveToInternalDB(backup);
        const row = await db.backups.orderBy('id').last();
        const parsed = JSON.parse(await service.decodeInternalBackup(row));
        await service.validateInput(parsed, 'all');
        await db.chapters.update(1, { content: '<p>Changed</p>' });
        await service.restoreData(parsed);
        return JSON.stringify((await service.collectAllData()).data) === JSON.stringify(backup.data);
      } finally { window.Worker = NativeWorker; URL.revokeObjectURL(url); }
    }, failure);
    expect(result).toBe(true);
  });
}
