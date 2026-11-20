import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

// Browser imports use Vite's URL. The type comes from the source module.
type DbModule = typeof import('../src/db');
type PortableBackupModule = typeof import('../src/lib/portableBackup');
type BackupServiceModule = typeof import('../src/services/backupService');

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.route('**/api/ai/ollama-models', route => route.fulfill({ json: { models: [] } }));
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__data_ui', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__data_ui');
  await page.evaluate(async () => {
    const path = '/src/db.ts'; const { db }: DbModule = await import(path);
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
    const path = '/src/db.ts'; const { db }: DbModule = await import(path);
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

test('DB07 validates a downloaded file without IndexedDB and restores it into empty tables', async ({ page, browser, baseURL }) => {
  await settings(page);
  const file = await exported(page, false);
  const source = await state(page);
  const fresh = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    await fresh.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    const target = await fresh.newPage();
    await target.route('**/__portable_backup', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await target.goto('/__portable_backup');
    const result = await target.evaluate(async text => {
      const before = await indexedDB.databases();
      const readerPath = '/src/lib/portableBackup.ts';
      const { readPortableBackup }: PortableBackupModule = await import(readerPath);
      const backup = await readPortableBackup(new Blob([text]), 'all');
      const afterValidation = await indexedDB.databases();
      const servicePath = '/src/services/backupService.ts';
      const { backupService }: BackupServiceModule = await import(servicePath);
      const dbPath = '/src/db.ts';
      const { db }: DbModule = await import(dbPath);
      const empty = await Promise.all(db.tables.map(table => table.count()));
      await backupService.restoreData(backup);
      return { before, afterValidation, empty, imageMode: backup.imageMode };
    }, file.buffer.toString('utf8'));
    expect(result.before).toEqual([]);
    expect(result.afterValidation).toEqual([]);
    expect(result.imageMode).toBe('full');
    expect(result.empty.length).toBeGreaterThan(0);
    expect(result.empty.every(count => count === 0)).toBe(true);
    expect(await state(target)).toEqual(source);
  } finally {
    await fresh.close();
  }
});

test('DB01 restores a downloaded workspace containing a legacy orphan snapshot', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.snapshots.add({ id: 19, chapterId: 999, content: '<p>Draf historis</p>', label: 'Versi lama', timestamp: 1 });
  });
  await settings(page);
  const file = await exported(page, false);
  const expected = { id: 19, chapterId: 999, content: '<p>Draf historis</p>', label: 'Versi lama', timestamp: 1, orphaned: true };
  expect(JSON.parse(file.buffer.toString()).data.snapshots).toContainEqual(expected);
  expect((await state(page)).snapshots.find(row => row.id === 19)).not.toHaveProperty('orphaned');

  await choose(page, false, file);
  const dialog = page.getByRole('alertdialog', { name: 'Timpa semua data?' });
  await dialog.getByRole('button', { name: 'Ya, pulihkan' }).click();
  await expect.poll(async () => (await state(page)).snapshots.find(row => row.id === 19)).toEqual(expected);
  expect((await state(page)).chapters).toHaveLength(2);
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
  expect(after.projects.filter(p => p.id === 1 || p.id === 2)).toEqual(before.projects);
  expect(after.codex.filter(e => e.projectId <= 2)).toEqual(before.codex);
  expect(after.chapters.find(c => c.projectId === imported?.id)?.content).toBe(before.chapters[0].content);
  const copiedCodex = after.codex.find(e => e.projectId === imported?.id);
  expect(copiedCodex?.id).toEqual(expect.any(Number));
  expect(copiedCodex?.id).not.toBe(1);
  expect(after.markers.find(m => m.projectId === imported?.id)?.codexId).toBe(copiedCodex?.id);
  expect(after.timeline.find(e => e.projectId === imported?.id)?.characterIds).toEqual([copiedCodex?.id]);
});

test('Workshop exports preserve legacy messages and reject dangling file links before import confirmation', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.chatSessions.add({ projectId: 1, kind: 'workshop', workshopKey: 'entry:099', title: 'Lokakarya lama',
      lastMessageAt: 1, messages: [{ role: 'user', content: 'Teks lama entry:099', timestamp: 1 }] });
  });
  await settings(page);
  const file = await exported(page, true);
  const parsed = JSON.parse(file.buffer.toString());
  expect(parsed.data.chatSessions[0]).toMatchObject({ kind: 'studio', messages: [{ content: 'Teks lama entry:099' }] });
  expect(parsed.data.chatSessions[0]).not.toHaveProperty('workshopKey');

  delete parsed.checksum;
  parsed.data.chatSessions[0].workshopKey = 'entry:099';
  await choose(page, true, { ...file, buffer: Buffer.from(JSON.stringify(parsed)) });
  await expect(page.getByText(/chatSessions\.workshopKey referensi tidak valid/)).toBeVisible();
  const dialog = page.getByRole('alertdialog', { name: 'Impor sebagai proyek baru?' });
  await expect(dialog).toHaveCount(0);
  expect((await state(page)).projects).toHaveLength(2);

  await choose(page, true, file);
  await dialog.getByRole('button', { name: 'Ya, impor' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    return (await db.chatSessions.toArray()).filter(row => row.projectId !== 1).map(({ kind, workshopKey, messages }) =>
      ({ kind, workshopKey, text: messages[0]?.content }));
  })).toEqual([{ kind: 'studio', text: 'Teks lama entry:099' }]);
});

test('L03 full restore can be cancelled then restores file data and retains safety snapshot', async ({ page }) => {
  await settings(page);
  const file = await exported(page, false), original = await state(page);
  await page.evaluate(async () => { const path = '/src/db.ts'; const { db }: DbModule = await import(path); await db.chapters.update(1, { content: '<p>Changed before restore</p>' }); });
  const before = await state(page);
  await choose(page, false, file);
  const dialog = page.getByRole('alertdialog', { name: 'Timpa semua data?' });
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(await state(page)).toEqual(before);
  await choose(page, false, file);
  await Promise.all([
    page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() }),
    dialog.getByRole('button', { name: 'Ya, pulihkan' }).click(),
  ]);
  expect(await state(page)).toEqual(original);
  expect(await page.evaluate(async () => { const path = '/src/db.ts'; const { db }: DbModule = await import(path); return (await db.backups.toArray()).filter(b => b.kind === 'pre-restore').length; })).toBeGreaterThan(0);
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
      const path = '/src/db.ts'; const { db }: DbModule = await import(path);
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

test('Codex scrolls its toolbar away and shows the entire last card at desktop and phone widths', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.codex.bulkAdd(Array.from({ length: 24 }, (_, index) => ({
      projectId: 1,
      name: `Zanara ${String(index + 1).padStart(2, '0')}`,
      category: 'location',
      description: index % 2 ? 'Sebuah tempat di balik pegunungan. '.repeat(20) : 'Kota kecil.',
      aliases: index % 2 ? ['Pegunungan Putih', 'Gerbang Utara', 'Lembah Teduh'] : [],
      tags: ['jelajah'],
    })));
    localStorage.setItem('aether_view_mode', 'codex');
  });
  await page.reload();

  const list = page.getByLabel('Daftar entri Codex');
  const heading = list.getByRole('heading', { name: 'Kamus Data (Codex)' });
  const first = list.getByRole('article').filter({ hasText: 'L03 Codex 1' });
  const last = list.getByRole('article').filter({ hasText: 'Zanara 24' });

  for (const [width, columns] of [[1536, 3], [1280, 2], [390, 1]]) {
    if (columns === 1) await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
    await page.setViewportSize({ width, height: 560 });
    await list.evaluate(element => { element.scrollTop = 0; });
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(first).toBeInViewport();
    await expect.poll(() => first.evaluate(card => getComputedStyle(card.parentElement!).gridTemplateColumns.split(' ').length)).toBe(columns);
    await expect(list.getByRole('button', { name: 'Asisten AI', exact: true })).toBeInViewport({ ratio: 1 });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('semantic-indexing-progress', { detail: { type: 'embedding_start' } }));
    });
    const indexing = page.getByRole('status').filter({ hasText: /Indexing Lore|Initializing AI models|Initializing semantic search/ });
    await expect(indexing).toBeInViewport({ ratio: 1 });
    const listBox = await list.boundingBox();
    const indexingBox = await indexing.boundingBox();
    expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(indexingBox!.y);

    await expect.poll(async () => {
      await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
      if (await last.count() === 0) return false;
      const cardBox = await last.boundingBox();
      const viewport = await list.boundingBox();
      return !!(cardBox && viewport && cardBox.y >= viewport.y && cardBox.y + cardBox.height <= viewport.y + viewport.height);
    }).toBe(true);
    await expect(heading).not.toBeInViewport();
    await expect(last).toBeInViewport({ ratio: 1 });
    await expect(last.getByText('#jelajah', { exact: true })).toBeInViewport({ ratio: 1 });
    expect(await last.evaluate(card => {
      const { right, bottom } = card.getBoundingClientRect();
      return card.contains(document.elementFromPoint(right - 10, bottom - 10));
    })).toBe(true);
  }

  await last.getByTitle('Ubah Entri', { exact: true }).click();
  await expect(list.getByRole('heading', { name: 'Ubah Entri' })).toBeInViewport();
  const save = list.getByRole('button', { name: 'Simpan Perubahan' });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport({ ratio: 1 });
  await list.getByRole('button', { name: 'Batal', exact: true }).click();
  const search = list.getByRole('textbox', { name: 'Cari entri Codex' });
  await search.fill('Zanara 24');
  await expect(list.getByRole('article')).toHaveCount(1);
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(last).toBeInViewport({ ratio: 1 });
});

test('Codex displays the full category and tag filter labels on desktop and phone widths', async ({ page }) => {
  const categoryLabel = 'Persekutuan Penjaga Arsip Kerajaan di Balik Pegunungan Utara';
  const tag = 'CatatanKronologiPerjalananKePerpustakaanUtamaKerajaanUtara';
  await page.evaluate(async ({ categoryLabel, tag }) => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.codexCategories.add({ projectId: 1, slug: 'penjaga-arsip', label: categoryLabel, icon: 'users', color: 'indigo', order: 1 });
    await db.codex.add({ projectId: 1, name: 'Penjaga Arsip', category: 'penjaga-arsip', description: '', aliases: [], tags: [tag] });
    localStorage.setItem('aether_view_mode', 'codex');
  }, { categoryLabel, tag });
  await page.reload();

  const list = page.getByLabel('Daftar entri Codex');
  const category = list.getByRole('combobox', { name: 'Filter berdasarkan kategori' });
  const tags = list.getByRole('combobox', { name: 'Filter berdasarkan tag' });

  async function expectFilterLabel(label: string, wraps: boolean) {
    const text = list.locator('span[aria-hidden="true"]').filter({ hasText: label });
    await expect(text).toBeInViewport({ ratio: 1 });
    const layout = await text.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = element.getBoundingClientRect();
      const lines = Array.from(range.getClientRects());
      return {
        wraps: lines.length > 1,
        fits: lines.length > 0 && lines.every(line => (
          line.left >= bounds.left && line.right <= bounds.right + 1 && line.bottom <= bounds.bottom + 1
        )),
      };
    });
    expect(layout).toEqual({ fits: true, wraps });
  }

  await expectFilterLabel('Semua Kategori', false);
  await expectFilterLabel('Semua Tag', false);
  await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 640 });
  await expectFilterLabel('Semua Kategori', false);
  await expectFilterLabel('Semua Tag', false);
  await category.selectOption('penjaga-arsip');
  await expectFilterLabel(categoryLabel, true);
  await tags.press('End');
  await expectFilterLabel(`#${tag}`, true);

  await expect(tags).toHaveValue(tag);
  await expect(list.getByRole('article')).toHaveCount(1);
  await expect(list.getByRole('heading', { name: 'Penjaga Arsip', exact: true })).toBeVisible();
});

test('Codex category manager stays above the app header and scrolls a long list', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.codexCategories.bulkAdd(Array.from({ length: 32 }, (_, index) => ({
      projectId: 1,
      slug: `kategori-kustom-${index + 1}`,
      label: `Kategori Kustom ${index + 1}`,
      icon: 'users',
      color: 'indigo',
      order: index + 1,
    })));
    localStorage.setItem('aether_view_mode', 'codex');
  });
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.reload();

  const trigger = page.getByRole('button', { name: 'Kategori', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Kelola Kategori' });
  const close = dialog.getByRole('button', { name: 'Tutup', exact: true });
  const input = dialog.getByRole('textbox', { name: 'Kategori baru' });
  const builtins = dialog.getByRole('heading', { name: 'Kategori bawaan' });
  const custom = dialog.getByRole('region', { name: 'Kategori kustom' });
  const last = custom.getByText('Kategori Kustom 32', { exact: true });

  await expect(close).toBeFocused();
  await expect(close).toBeInViewport({ ratio: 1 });
  await close.click({ trial: true });
  expect((await custom.boundingBox())!.x).toBeGreaterThan((await input.boundingBox())!.x + (await input.boundingBox())!.width);
  await expect(dialog.getByRole('listitem')).toHaveCount(6);
  await expect(dialog.getByRole('listitem').last()).toBeInViewport({ ratio: 1 });

  await custom.hover();
  await page.mouse.wheel(0, 4000);
  await expect(last).toBeInViewport({ ratio: 1 });
  await expect(custom.getByText('Kategori Kustom 1', { exact: true })).not.toBeInViewport();
  await expect(input).toBeInViewport({ ratio: 1 });
  await expect(builtins).toBeInViewport({ ratio: 1 });

  await custom.getByTitle('Hapus kategori', { exact: true }).last().click();
  const confirm = page.getByRole('alertdialog', { name: 'Hapus "Kategori Kustom 32"?' });
  await expect(confirm).toBeInViewport({ ratio: 1 });
  await confirm.getByRole('button', { name: 'Batal', exact: true }).click();
  await expect(last).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 560 });
  await trigger.click();
  await expect(input).toBeInViewport({ ratio: 1 });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 1 });
  await expect(input).not.toBeInViewport();
  await expect(close).toBeInViewport({ ratio: 1 });
  await close.click();
  await expect(dialog).toBeHidden();
});

test('Codex saves optional details and shows the current value and chapter history', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.chapters.add({ id: 5, projectId: 1, title: 'Setelah duel', content: '<p>Adegan duel</p>', order: 1, lastModified: 2 });
    localStorage.setItem('aether_view_mode', 'codex');
  });
  await page.reload();
  await page.getByRole('button', { name: 'Entri Baru', exact: true }).click();
  await page.getByPlaceholder('misal: Kota Angin', { exact: true }).fill('Raka');
  await page.getByPlaceholder('Deskripsikan sejarah atau sifat unik untuk memberi konteks pada AI...').fill('Ksatria yang menjaga kota.');

  const editor = page.getByRole('region', { name: 'Detail tambahan' });
  const add = editor.getByRole('button', { name: 'Tambah detail' });
  await add.click();
  const ability = editor.getByRole('group', { name: 'Detail 1' });
  await ability.getByRole('textbox', { name: 'Nama detail' }).fill('Kemampuan');
  await ability.getByRole('textbox', { name: 'Nilai detail' }).fill('Membaca ingatan');
  await expect(ability.getByRole('checkbox', { name: 'Sertakan dalam konteks AI' })).not.toBeChecked();

  await add.click();
  const condition = editor.getByRole('group', { name: 'Detail 2' });
  await condition.getByRole('textbox', { name: 'Nama detail' }).fill('Kondisi');
  await condition.getByRole('checkbox', { name: 'Sertakan dalam konteks AI' }).check();
  await condition.getByRole('checkbox', { name: 'Aktifkan riwayat per bab' }).check();
  await condition.getByRole('textbox', { name: 'Nilai awal' }).fill('Sehat');
  await condition.getByRole('combobox', { name: 'Tambah catatan bab' }).selectOption('5');
  await condition.getByRole('textbox', { name: 'Catatan Setelah duel' }).fill('Pulih setelah duel');
  await condition.getByRole('combobox', { name: 'Tambah catatan bab' }).selectOption('1');
  await condition.getByRole('textbox', { name: 'Catatan L03 Chapter 1' }).fill('Luka di tangan');
  await page.getByRole('button', { name: 'Buat Entri', exact: true }).click();

  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Raka', exact: true }) });
  await expect(card.getByText('Pulih setelah duel', { exact: true })).toBeVisible();
  await card.click();
  const details = page.getByRole('region', { name: 'Detail tambahan' });
  await expect(details.getByText('Hanya di Codex')).toBeVisible();
  await expect(details.getByText('Disertakan ke AI')).toBeVisible();
  await details.getByText('Riwayat per bab', { exact: true }).click();
  await expect(details.locator('li')).toHaveText([
    /Nilai awal.*Sehat/,
    /Bab 1.*L03 Chapter 1.*Luka di tangan/,
    /Bab 2.*Setelah duel.*Pulih setelah duel/,
  ]);
  await page.getByTitle('Tutup', { exact: true }).click();
  await card.getByTitle('Ubah Entri', { exact: true }).click();
  await editor.getByRole('textbox', { name: 'Catatan Setelah duel' }).fill('Kembali berlatih');
  await page.getByRole('button', { name: 'Simpan Perubahan', exact: true }).click();
  await expect(card.getByText('Kembali berlatih', { exact: true })).toBeVisible();
});

test('Codex keeps the detail header visible while a long entry scrolls on desktop and phone', async ({ page }) => {
  const entryName = 'Negeri dengan Catatan Codex Panjang';
  await page.evaluate(async name => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.codex.update(1, {
      name,
      description: 'Catatan sejarah penduduk dan penguasa negeri ini.\n\n'.repeat(40),
      aliases: Array.from({ length: 24 }, (_, index) => `Nama negeri ${index + 1}`),
      tags: Array.from({ length: 24 }, (_, index) => `catatan-${index + 1}`),
      details: [{ id: 'kronologi', label: 'Kronologi', value: 'Catatan sejarah dari masa pemerintahan lama.\n'.repeat(35), includeInAI: false }],
    });
    await db.codex.add({ id: 3, projectId: 1, name: 'Penjaga Arsip', category: 'character', aliases: [], tags: [], description: `Menjaga arsip ${name}.` });
    await db.chapters.update(1, { content: `<p>Perjalanan ke ${name}.</p>` });
    localStorage.setItem('aether_view_mode', 'codex');
  }, entryName);
  await page.reload();

  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: entryName }) });
  const dialog = page.getByRole('dialog', { name: entryName });
  const body = dialog.getByRole('region', { name: 'Isi entri Codex' });
  const description = dialog.getByRole('region', { name: 'Teks deskripsi' });
  const details = dialog.getByRole('region', { name: 'Detail entri' });
  const field = details.getByRole('region', { name: 'Nilai Kronologi' });
  const detailsTab = dialog.getByRole('tab', { name: 'Deskripsi & Detail' });
  const linksTab = dialog.getByRole('tab', { name: 'Keterkaitan' });
  const links = dialog.getByRole('tabpanel', { name: 'Keterkaitan' });
  const close = dialog.getByRole('button', { name: 'Tutup', exact: true });
  const heading = dialog.getByRole('heading', { name: entryName });

  for (const width of [1280, 390]) {
    if (width === 390) await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
    await page.setViewportSize({ width, height: 500 });
    await expect(card.getByText('+21 alias', { exact: true })).toBeVisible();
    await expect(card.getByText('+21 tag', { exact: true })).toBeVisible();
    await card.getByRole('heading', { name: entryName }).click();
    await expect(heading).toBeInViewport({ ratio: 1 });
    await close.click({ trial: true });
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(10);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(490);
    await expect(body.getByText('Nama negeri 24', { exact: true })).toBeVisible();
    await expect(body.getByText('#catatan-24', { exact: true })).toBeVisible();

    const descriptionBox = (await description.boundingBox())!;
    const fieldBox = (await field.boundingBox())!;
    if (width === 1280) {
      expect(bounds!.width).toBeGreaterThanOrEqual(width - 42);
      expect(fieldBox.x).toBeGreaterThanOrEqual(descriptionBox.x + descriptionBox.width);
      expect(bounds!.y + bounds!.height - (descriptionBox.y + descriptionBox.height)).toBeLessThanOrEqual(26);
      await expect(field).toBeInViewport({ ratio: 1 });
    } else {
      expect(fieldBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height);
    }
    const pane = width === 1280 ? details : body;
    await expect(pane).toHaveCSS('scrollbar-width', 'none');
    await expect(field).toHaveCSS('scrollbar-width', 'none');
    await expect(description).toHaveCSS('scrollbar-width', 'none');
    await field.hover();
    const paneScroll = await pane.evaluate(element => element.scrollTop);
    await page.mouse.wheel(0, 70);
    await expect.poll(() => field.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await pane.evaluate(element => element.scrollTop)).toBe(paneScroll);
    expect(await description.evaluate(element => element.scrollTop)).toBe(0);
    await description.focus();
    await page.keyboard.press('End');
    await expect.poll(() => description.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(1);

    await expect(detailsTab).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('heading', { name: 'Kemunculan' })).toHaveCount(0);
    const descriptionScroll = await description.evaluate(element => {
      element.scrollTo({ top: 80, behavior: 'instant' });
      return element.scrollTop;
    });
    await detailsTab.press('ArrowRight');
    await expect(linksTab).toBeFocused();
    await expect(linksTab).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('region', { name: 'Teks deskripsi' })).toHaveCount(0);
    await expect(links.getByRole('heading', { name: 'Hubungan' })).toBeVisible();
    await expect(links.getByRole('heading', { name: 'Kemunculan' })).toBeVisible();
    await expect(links.getByRole('heading', { name: 'Disebut oleh' })).toBeVisible();
    await expect(links.getByRole('button', { name: 'Penjaga Arsip' })).toBeVisible();
    await links.getByRole('button', { name: 'Cek Kemunculan di Chapter' }).click();
    await expect(links.getByRole('button', { name: 'L03 Chapter 1' })).toBeVisible();
    if (width === 1280) {
      await links.getByTitle('Entri tujuan').selectOption('3');
      await links.getByRole('button', { name: 'Tambah', exact: true }).click();
      await expect(links.getByTitle('Hapus hubungan', { exact: true })).toHaveCount(2);
      await links.getByTitle('Hapus hubungan', { exact: true }).last().click();
      await expect(links.getByTitle('Hapus hubungan', { exact: true })).toHaveCount(1);
    }
    await detailsTab.click();
    expect(await description.evaluate(element => element.scrollTop)).toBe(descriptionScroll);
    await expect(heading).toBeInViewport({ ratio: 1 });
    if (width === 390) {
      await linksTab.click();
      await expect(links.getByRole('button', { name: 'L03 Chapter 1' })).toBeVisible();
      await links.getByRole('button', { name: 'Penjaga Arsip' }).click();
      const related = page.getByRole('dialog', { name: 'Penjaga Arsip' });
      const relatedTab = related.getByRole('tab', { name: 'Deskripsi & Detail' });
      await expect(relatedTab).toHaveAttribute('aria-selected', 'true');
      await expect(relatedTab).toBeFocused();
      await related.getByRole('button', { name: 'Tutup', exact: true }).click();
    } else {
      await close.click();
    }
    await expect(dialog).toBeHidden();
  }
});

test('Codex uploads, previews, replaces and removes a local cover', async ({ page }) => {
  const makeImage = async (color: string) => {
    const dataUrl = await page.evaluate(fill => {
      const canvas = document.createElement('canvas');
      canvas.width = 1500;
      canvas.height = 900;
      const context = canvas.getContext('2d')!;
      context.fillStyle = fill;
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    }, color);
    return { name: 'sampul.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
  };
  const readImages = () => page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    const rows = await db.codexCovers.toArray();
    return Promise.all(rows.map(async row => {
      const bitmap = await createImageBitmap(row.imageBlob);
      const result = { kind: row.kind, width: bitmap.width, size: row.imageBlob.size, id: row.id };
      bitmap.close();
      return result;
    }));
  });

  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'codex'));
  await page.reload();
  await page.getByRole('button', { name: 'Entri Baru', exact: true }).click();
  await page.getByPlaceholder('misal: Kota Angin', { exact: true }).fill('Raka');
  await page.getByPlaceholder('Deskripsikan sejarah atau sifat unik untuk memberi konteks pada AI...').fill('Ksatria yang menjaga kota.');
  const upload = page.getByLabel('Pilih gambar sampul (opsional)');
  const preview = page.getByRole('img', { name: 'Pratinjau sampul' });
  await upload.setInputFiles(await makeImage('indigo'));
  await expect(preview).toBeVisible();
  await page.getByRole('button', { name: 'Buat Entri', exact: true }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Raka', exact: true }) });
  await expect(card.getByRole('img', { name: 'Sampul Raka' })).toBeVisible();
  const before = await readImages();
  expect(before).toHaveLength(2);
  expect(before[0]).toMatchObject({ kind: 'cover', width: 1200 });
  expect(before[1]).toMatchObject({ kind: 'thumbnail', width: 192 });
  expect(before[0].size).toBeLessThanOrEqual(96 * 1024);
  expect(before[1].size).toBeLessThanOrEqual(12 * 1024);

  await card.click();
  const entry = page.getByRole('dialog', { name: 'Raka', exact: true });
  await entry.getByRole('button', { name: 'Lihat sampul' }).click();
  const viewer = page.getByRole('dialog', { name: 'Sampul Raka' });
  await expect(viewer.getByRole('img', { name: 'Sampul Raka' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(entry).toBeVisible();
  await entry.getByRole('button', { name: 'Tutup', exact: true }).click();

  await card.getByTitle('Ubah Entri', { exact: true }).click();
  await expect(preview).toBeVisible();
  await upload.setInputFiles(await makeImage('tomato'));
  await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
  await expect(preview).toBeHidden();
  const after = await readImages();
  expect(after).toHaveLength(2);
  expect(after.map(row => row.id)).not.toEqual(before.map(row => row.id));

  await settings(page);
  for (const project of [false, true]) {
    const file = await exported(page, project);
    expect(file.name).toMatch(/\.json\.gz$/);
    const { data } = JSON.parse(gunzipSync(file.buffer).toString('utf8'));
    expect(data.codexCovers).toHaveLength(2);
    expect(data.codexCovers.every((row: { imageDataUrl?: string }) => row.imageDataUrl?.startsWith('data:image/'))).toBe(true);
  }
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'codex'));
  await page.reload();

  await card.getByTitle('Ubah Entri', { exact: true }).click();
  await page.getByRole('button', { name: 'Hapus sampul' }).click();
  await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
  await expect.poll(readImages).toEqual([]);
  await expect(card.getByRole('img', { name: 'Sampul Raka' })).toHaveCount(0);
});

test('Codex cover capacity exports and restores 500 covers in a standalone file', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const result = await page.evaluate(async () => {
    const dbPath = '/src/db.ts';
    const coverPath = '/src/features/codex/lib/prepareCodexCover.ts';
    const backupPath = '/src/services/backupService.ts';
    const portablePath = '/src/lib/portableBackup.ts';
    const { db }: DbModule = await import(dbPath);
    const { prepareCodexCover }: typeof import('../src/features/codex/lib/prepareCodexCover') = await import(coverPath);
    const { backupService }: BackupServiceModule = await import(backupPath);
    const { readPortableBackup }: PortableBackupModule = await import(portablePath);
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext('2d')!;
    const noise = context.createImageData(canvas.width, canvas.height);
    let seed = 42;
    for (let index = 0; index < noise.data.length; index += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noise.data[index] = seed >>> 24;
      noise.data[index + 1] = (seed >>> 16) & 255;
      noise.data[index + 2] = (seed >>> 8) & 255;
      noise.data[index + 3] = 255;
    }
    context.putImageData(noise, 0, 0);
    const source = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal membuat gambar uji.')), 'image/png'));
    const pair = await prepareCodexCover(new File([source], 'noise.png', { type: 'image/png' }));
    const ids = await db.codex.bulkAdd(Array.from({ length: 500 }, (_, index) => ({
      projectId: 1, name: `Entri sampul ${index + 1}`, category: 'character', description: '', aliases: [], tags: [],
    })), { allKeys: true });
    await db.codexCovers.bulkAdd(ids.flatMap(codexId => ([
      { codexId, projectId: 1, kind: 'cover', imageBlob: pair.cover },
      { codexId, projectId: 1, kind: 'thumbnail', imageBlob: pair.thumbnail },
    ] as const)));

    const full = await backupService.prepareBackupDownload(await backupService.collectAllData());
    await db.codexCovers.clear();
    await backupService.restoreData(await readPortableBackup(full.blob, 'all'));
    const restored = await db.codexCovers.get({ codexId: ids.at(-1), kind: 'cover' });
    return {
      coverBytes: pair.cover.size, thumbnailBytes: pair.thumbnail.size, fileBytes: full.blob.size,
      restoredImages: await db.codexCovers.count(), lastCoverBytes: restored?.imageBlob.size,
    };
  });
  await testInfo.attach('ukuran-sampul-codex', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.coverBytes).toBeGreaterThan(32768);
  expect(result.fileBytes).toBeLessThan(64 * 1024 * 1024);
  expect(result.restoredImages).toBe(1000);
  expect(result.lastCoverBytes).toBe(result.coverBytes);
});

test('DB03 deleting a relationship keeps its Codex endpoints', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.codex.update(1, { category: 'character' });
    await db.codex.add({ id: 3, projectId: 1, name: 'Tokoh lain', description: '', category: 'character', aliases: [], tags: [] });
    await db.relationships.update(1, { targetId: 3, type: 'Friend' });
    await db.relationships.add({ id: 2, projectId: 2, sourceId: 2, targetId: 2, type: 'self' });
    localStorage.setItem('aether_view_mode', 'relationships');
  });
  const before = await state(page);
  await page.reload();
  page.once('dialog', dialog => dialog.accept());
  await page.getByTitle('Hapus hubungan', { exact: true }).click();
  await expect.poll(async () => (await state(page)).relationships.map(row => row.id)).toEqual([2]);
  expect((await state(page)).codex).toEqual(before.codex);
});

test('DB03 restores the selected version and keeps the previous draft', async ({ page }) => {
  const editor = page.locator('.tiptap[contenteditable="true"]');
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.snapshots.update(1, { label: 'Versi lama', content: '<p>Versi lama bab ini</p>' });
  });
  await editor.fill('Draf sebelum pemulihan');
  await page.getByRole('button', { name: 'Riwayat Versi', exact: true }).click();
  await expect(page.getByText('Versi lama', { exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Pulihkan', exact: true }).click();
  await expect(editor).toHaveText('Versi lama bab ini');
  const result = await state(page);
  expect(result.chapters[0].content).toBe('<p>Versi lama bab ini</p>');
  expect(result.snapshots).toContainEqual(expect.objectContaining({
    chapterId: 1, content: '<p>Draf sebelum pemulihan</p>', auto: true,
  }));
});

test('DB03 integrity report finds a foreign chapter link and leaves the text intact', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.timeline.update(1, { chapterId: 2 });
  });
  const before = await state(page);
  await settings(page);
  await page.getByRole('button', { name: 'Periksa Relasi Data', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 masalah relasi ditemukan.' })).toBeVisible();
  await expect(page.getByText('timeline #1 · chapterId · Target berada di proyek lain', { exact: true })).toBeVisible();
  expect(await state(page)).toEqual(before);
});

test('DB02 new project rolls back if its first chapter cannot be created', async ({ page }) => {
  const before = await state(page);
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    const fail = () => { throw new Error('DB02 synthetic chapter failure'); };
    db.chapters.hook('creating', fail);
    Reflect.set(window, 'allowChapterCreation', () => db.chapters.hook('creating').unsubscribe(fail));
  });
  await page.getByTitle('Ganti Proyek/Naskah', { exact: true }).click();
  await page.getByRole('button', { name: 'Buat Naskah Baru', exact: true }).click();
  const title = page.getByPlaceholder('Judul Naskah...');
  const submit = page.getByRole('button', { name: 'Buat Naskah', exact: true });
  await title.fill('DB02 Novel');
  await submit.click();
  await expect(page.getByText('Gagal membuat naskah. Silakan coba lagi.', { exact: true })).toBeVisible();
  await expect(title).toHaveValue('DB02 Novel');
  expect(await state(page)).toEqual(before);

  await page.evaluate(() => Reflect.get(window, 'allowChapterCreation')());
  await submit.click();
  await expect(page.getByRole('heading', { name: 'DB02 Novel', exact: true })).toBeVisible();
  const after = await state(page);
  const newProject = after.projects.find(project => project.name === 'DB02 Novel');
  expect(newProject).toBeDefined();
  expect(after.chapters.filter(chapter => chapter.projectId === newProject?.id)).toHaveLength(1);
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
