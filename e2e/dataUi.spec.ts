import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.route('**/api/ai/ollama-models', route => route.fulfill({ json: { models: [] } }));
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__data_ui', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__data_ui');
  await page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    for (const id of [1, 2]) {
      await db.projects.add({ id, name: id === 1 ? 'L03 Main' : 'L03 Other', description: '', createdAt: 1, lastOpened: id === 1 ? 10 : 1 });
      await db.chapters.add({ id, projectId: id, title: `L03 Chapter ${id}`, content: `<p>Keep manuscript ${id}</p>`, order: 0, lastModified: 1 });
      await db.codex.add({ id, projectId: id, name: `L03 Codex ${id}`, category: 'location', aliases: [], description: 'Keep lore', tags: [] });
    }
    await db.snapshots.add({ id: 1, chapterId: 1, content: 'Keep snapshot', label: '', timestamp: 1 });
    await db.timeline.add({ id: 1, projectId: 1, chapterId: 1, title: 'Keep event', description: 'Keep narrative', order: 0, type: 'plot', characterIds: [1] });
    await db.relationships.add({ id: 1, projectId: 1, sourceId: 1, targetId: 1, type: 'self' });
    const canvas = document.createElement('canvas');
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Missing fixture image')), 'image/png');
    });
    await db.maps.add({ id: 1, projectId: 1, name: 'Keep map', width: canvas.width, height: canvas.height, createdAt: 1, imageBlob });
    await db.mapMarkers.add({ id: 1, projectId: 1, mapId: 1, codexId: 1, kind: 'pin', geometry: { x: .5, y: .5 }, createdAt: 1 });
  });
  await page.goto('/');
  await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();
});

async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    return {
      projects: (await db.projects.toArray()).map(p => ({ id: p.id, name: p.name })),
      chapters: (await db.chapters.toArray()).map(c => ({ id: c.id, projectId: c.projectId, content: c.content })),
      codex: await db.codex.toArray(), snapshots: await db.snapshots.toArray(),
      timeline: await db.timeline.toArray(), relationships: await db.relationships.toArray(), markers: await db.mapMarkers.toArray(),
      images: await Promise.all((await db.maps.toArray()).map(async map => ({
        id: map.id, type: map.imageBlob?.type,
        bytes: map.imageBlob && Array.from(new Uint8Array(await map.imageBlob.arrayBuffer())),
      }))),
    };
  });
}
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Pengaturan Aplikasi', exact: true }).click();
  await page.getByRole('button', { name: 'Data & Cadangan' }).click();
  await expect(page.getByText('Operasi Manual', { exact: true })).toBeVisible();
}
async function exported(page: Page, project: boolean) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: project ? 'Ekspor Novel Ini' : 'Ekspor Semua Cadangan', exact: true }).click();
  const download = await waiting;
  const path = await download.path();
  if (!path) throw new Error('Download missing');
  return { name: download.suggestedFilename(), mimeType: 'application/json', buffer: await readFile(path) };
}
async function choose(page: Page, project: boolean, file: { name: string; mimeType: string; buffer: Buffer }) {
  const waiting = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: project ? 'Impor Novel (sebagai proyek baru)' : 'Kembalikan dari JSON', exact: true }).click();
  await (await waiting).setFiles(file);
}

test('DB01 restores a full downloaded file into a fresh browser context', async ({ page, browser, baseURL }) => {
  await settings(page);
  const file = await exported(page, false);
  await expect(page.getByText(/Unduhan terakhir dimulai/)).toBeVisible();
  const source = await state(page);
  expect(source.images[0].bytes?.length).toBeGreaterThan(0);

  const fresh = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    await fresh.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await fresh.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
    const target = await fresh.newPage();
    await target.route('**/__empty_workspace', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await target.goto('/__empty_workspace');
    expect((await state(target)).projects).toEqual([]);
    expect((await state(target)).images).toEqual([]);
    await target.goto('/');
    await settings(target);
    await choose(target, false, file);
    const dialog = target.getByRole('alertdialog', { name: 'Timpa semua data?' });
    await dialog.getByRole('button', { name: 'Ya, pulihkan' }).click();
    await expect.poll(() => state(target)).toEqual(source);
  } finally {
    await fresh.close();
  }
});

for (const supported of [true, false]) {
  test(`DB01 persistence ${supported ? 'denied' : 'unavailable'} allows file backup`, async ({ page }) => {
    await page.evaluate(supported => {
      Object.defineProperty(navigator, 'storage', {
        value: supported ? { persisted: async () => false, persist: async () => false } : undefined,
      });
    }, supported);
    await settings(page);
    if (supported) await page.getByRole('button', { name: 'Minta Perlindungan Penyimpanan' }).click();
    await expect(page.getByText(supported ? /Peramban menolak permintaan/ : /Perlindungan penyimpanan tidak tersedia/)).toBeVisible();
    const file = await exported(page, false);
    expect(file.buffer.length).toBeGreaterThan(0);
  });
}

test('DB01 Drive failure preserves the last successful backup and asks for login again', async ({ page }) => {
  let uploadStatus = 200;
  await page.route('https://www.googleapis.com/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/upload/')) {
      await route.fulfill({ status: uploadStatus, json: { id: 'db01-upload' } });
    } else if (url.pathname.endsWith('/userinfo')) {
      await route.fulfill({ json: { name: 'DB01', email: 'db01@example.test' } });
    } else {
      const isFolderQuery = url.searchParams.get('q')?.startsWith('name');
      await route.fulfill({ json: { files: isFolderQuery ? [{ id: 'db01-folder' }] : [] } });
    }
  });
  await page.evaluate(() => {
    localStorage.setItem('google_client_id', 'db01-client');
    Reflect.set(window, 'google', { accounts: { oauth2: {
      initTokenClient: () => ({
        callback: (_response: { access_token: string }) => {},
        requestAccessToken() { this.callback({ access_token: 'db01-token' }); },
      }),
    } } });
  });
  await settings(page);
  await page.getByRole('button', { name: 'Login Google', exact: true }).click();
  const send = page.getByRole('button', { name: 'Kirim Cadangan' });
  await send.click();
  const lastSuccess = page.getByText(/Cadangan berhasil terakhir/);
  await expect(lastSuccess).toBeVisible();
  const successText = await lastSuccess.textContent();
  uploadStatus = 401;
  await send.click();
  await expect(page.getByText(/Gagal · Sesi Google berakhir/)).toBeVisible();
  await expect(lastSuccess).toHaveText(successText!);
  await page.getByRole('button', { name: 'Login Ulang Google', exact: true }).click();
  uploadStatus = 200;
  await send.click();
  await expect(page.getByText(/Gagal · Sesi Google berakhir/)).toHaveCount(0);
});

test('L03 project export/import file chooser permits cancellation then remaps a new project', async ({ page }) => {
  await settings(page);
  const file = await exported(page, true), before = await state(page);
  await choose(page, true, file);
  const dialog = page.getByRole('alertdialog', { name: 'Impor sebagai proyek baru?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(await state(page)).toEqual(before);
  await choose(page, true, file);
  await dialog.getByRole('button', { name: 'Ya, impor' }).click();
  await expect.poll(async () => (await state(page)).projects.length).toBe(3);
  await expect(dialog).toHaveCount(0);
  const after = await state(page);
  expect(after.chapters.filter(c => c.projectId <= 2)).toEqual(before.chapters);
  const imported = after.projects.find(p => p.id !== 1 && p.id !== 2);
  expect(imported).toBeDefined();
  expect(after.projects.filter(p => p.id <= 2)).toEqual(before.projects);
  expect(after.codex.filter(e => e.projectId <= 2)).toEqual(before.codex);
  expect(after.chapters.find(c => c.projectId === imported?.id)?.content).toBe(before.chapters[0].content);
  const copiedCodex = after.codex.find(e => e.projectId === imported?.id);
  expect(copiedCodex?.id).toEqual(expect.any(Number));
  expect(copiedCodex?.id).not.toBe(1);
  expect(after.markers.find(m => m.projectId === imported?.id)?.codexId).toBe(copiedCodex?.id);
  expect(after.timeline.find(e => e.projectId === imported?.id)?.characterIds).toEqual([copiedCodex?.id]);
});

test('L03 full restore can be cancelled then restores file data and retains safety snapshot', async ({ page }) => {
  await settings(page);
  const file = await exported(page, false), original = await state(page);
  await page.evaluate(async () => { const path = '/src/db.ts'; await (await import(path)).db.chapters.update(1, { content: '<p>Changed before restore</p>' }); });
  const before = await state(page);
  await choose(page, false, file);
  const dialog = page.getByRole('alertdialog', { name: 'Timpa semua data?' });
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(await state(page)).toEqual(before);
  await choose(page, false, file);
  await dialog.getByRole('button', { name: 'Ya, pulihkan' }).click();
  await expect.poll(async () => (await state(page)).chapters[0].content).toBe('<p>Keep manuscript 1</p>');
  expect(await state(page)).toEqual(original);
  expect(await page.evaluate(async () => { const path = '/src/db.ts'; return (await (await import(path)).db.backups.toArray()).filter(b => b.kind === 'pre-restore').length; })).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole('button', { name: 'Menulis', exact: true }).click();
  await expect(page.locator('.tiptap[contenteditable="true"]')).toHaveText('Keep manuscript 1');
});

test('L03 invalid files and wrong-scope files are rejected without mutation', async ({ page }) => {
  await settings(page);
  const project = await exported(page, true), full = await exported(page, false), before = await state(page);
  for (const [isProject, file] of [[true, full], [false, project], [false, { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') }]] as const) {
    await choose(page, isProject, file);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect.poll(() => page.locator('input[type="file"]').evaluateAll(inputs => inputs.every(input => !(input as HTMLInputElement).value))).toBe(true);
    expect(await state(page)).toEqual(before);
  }
});

for (const project of [true, false]) {
  test(`L03 ${project ? 'import' : 'restore'} write failure rolls back through the real confirmation dialog`, async ({ page }) => {
    await settings(page);
    const file = await exported(page, project), before = await state(page);
    await choose(page, project, file);
    await page.evaluate(async () => {
      const path = '/src/db.ts'; const { db } = await import(path);
      const fail = () => { throw new Error('L03 synthetic transaction failure'); };
      db.chapters.hook('creating', fail);
      Reflect.set(window, 'undoL03Failure', () => db.chapters.hook('creating').unsubscribe(fail));
    });
    const dialog = page.getByRole('alertdialog', { name: project ? 'Impor sebagai proyek baru?' : 'Timpa semua data?' });
    await dialog.getByRole('button', { name: project ? 'Ya, impor' : 'Ya, pulihkan' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('L03 synthetic transaction failure', { exact: true })).toBeVisible();
    expect(await state(page)).toEqual(before);
    await page.evaluate(() => Reflect.get(window, 'undoL03Failure')());
    await choose(page, project, file);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  });
}


test('L03 chapter deletion requires confirmation and cleans references without touching another project', async ({ page }) => {
  const before = await state(page);
  await page.getByRole('complementary').getByText('L03 Chapter 1', { exact: true }).hover();
  await page.getByTitle('Delete', { exact: true }).first().click();
  expect(await state(page)).toEqual(before);
  await page.reload();
  await page.getByRole('complementary').getByText('L03 Chapter 1', { exact: true }).hover();
  await page.getByTitle('Delete', { exact: true }).first().click();
  await page.getByTitle('Click again to confirm', { exact: true }).click();
  await expect.poll(async () => (await state(page)).chapters.map(c => c.id)).toEqual([2]);
  const after = await state(page);
  expect(after.snapshots).toEqual([]);
  expect(after.timeline[0]).toMatchObject({ description: 'Keep narrative' });
  expect(after.timeline[0].chapterId).toBeUndefined();
  expect(after.chapters[0]).toEqual(before.chapters[1]);
});

test('L03 Codex delete cancellation preserves data then confirmation unlinks references', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'codex'));
  await page.reload();
  await expect(page.getByText('L03 Codex 1', { exact: true })).toBeVisible();
  const before = await state(page);
  await page.getByTitle('Hapus Entri', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(await state(page)).toEqual(before);
  await page.getByTitle('Hapus Entri', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Hapus', exact: true }).click();
  await expect.poll(async () => (await state(page)).codex.map(e => e.id)).toEqual([2]);
  const after = await state(page);
  expect(after.relationships).toEqual([]);
  expect(after.markers[0].codexId).toBeUndefined();
  expect(after.timeline[0].characterIds).toEqual([]);
  expect(after.chapters).toEqual(before.chapters);
});

test('L03 project deletion can be cancelled and preserves the remaining project', async ({ page }) => {
  const before = await state(page);
  await page.getByTitle('Ganti Proyek/Naskah', { exact: true }).click();
  await page.getByTitle('Hapus Naskah', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(await state(page)).toEqual(before);
  await page.getByTitle('Hapus Naskah', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
  await expect.poll(async () => (await state(page)).projects.map(p => p.id)).toEqual([2]);
  const after = await state(page);
  expect(after.chapters).toEqual([before.chapters[1]]);
  expect(after.codex).toEqual([before.codex[1]]);
  expect(after.markers).toEqual([]);
  expect(after.timeline).toEqual([]);
  expect(after.snapshots).toEqual([]);
  await expect(page.getByRole('button', { name: 'Konfirmasi', exact: true })).toHaveCount(0);
});
