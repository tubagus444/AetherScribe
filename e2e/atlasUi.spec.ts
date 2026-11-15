import { test, expect, type Page } from '@playwright/test';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.setItem('ai_local_only', 'true');
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); revoke(url); };
    Reflect.set(window, 'l04Urls', active);
  });
  await page.route('**/__atlas_ui', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__atlas_ui');
  await page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    for (const id of [1, 2]) {
      await db.projects.add({ id, name: `L04 Project ${id}`, description: '', createdAt: 1, lastOpened: id === 1 ? 100 : 1 });
      await db.chapters.add({ id, projectId: id, title: `Chapter ${id}`, content: '<p>Keep manuscript</p>', order: 0, lastModified: 1 });
    }
    await db.codex.add({ id: 1, projectId: 1, name: 'L04 Location', description: 'Keep lore', category: 'location', aliases: [], tags: [] });
    localStorage.setItem('aether_view_mode', 'atlas');
  });
});

async function seedMaps(page: Page, kind: 'pin' | 'area' | 'route' = 'pin', child = false) {
  await page.evaluate(async ({ png, kind, child }) => {
    const path = '/src/db.ts'; const { db } = await import(path);
    const image = new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' });
    for (const id of [1, 2, 3]) await db.maps.add({ id, projectId: id === 3 ? 2 : 1, name: ['Parent', 'Child', 'Other project'][id - 1], imageBlob: image, width: 600, height: 400, createdAt: 1 });
    const geometry = kind === 'pin' ? { x: .5, y: .5 } : kind === 'area' ? [{ x: .25, y: .25 }, { x: .75, y: .25 }, { x: .5, y: .75 }] : [{ x: .25, y: .25 }, { x: .75, y: .75 }];
    await db.mapMarkers.add({ id: 1, projectId: 1, mapId: child ? 2 : 1, kind, geometry, title: `L04 ${kind}`, codexId: child ? 1 : undefined, createdAt: 1 });
    await db.mapMarkers.add({ id: 2, projectId: 2, mapId: 3, kind: 'pin', geometry: { x: .4, y: .4 }, title: 'Other marker', createdAt: 1 });
  }, { png, kind, child });
  await page.goto('/');
  await expect(page.locator('.leaflet-container')).toBeVisible();
}
async function geometry(page: Page) {
  return page.evaluate(async () => { const path = '/src/db.ts'; return (await (await import(path)).db.mapMarkers.get(1))?.geometry; });
}

test('L04 uploads a raster file, rejects SVG and preserves native image after reload', async ({ page }) => {
  await page.goto('/');
  const upload = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Unggah gambar peta', exact: true }).click();
    await (await chooser).setFiles(file);
  };
  await upload({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByText('SVG belum didukung. Gunakan PNG, JPG, WEBP, atau GIF.', { exact: true })).toBeVisible();
  await upload({ name: 'Uploaded map.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.leaflet-container')).toBeVisible();
  const image = await page.evaluate(async () => {
    const path = '/src/db.ts'; const maps = await (await import(path)).db.maps.toArray();
    return { count: maps.length, width: maps[0].width, height: maps[0].height, blob: maps[0].imageBlob instanceof Blob, size: maps[0].imageBlob?.size };
  });
  expect(image).toMatchObject({ count: 1, width: 1, height: 1, blob: true });
  expect(image.size).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTitle('Ganti atau kelola peta aktif')).toContainText('Uploaded map');
  await expect.poll(() => page.locator('.leaflet-image-layer').evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
});

for (const kind of ['area', 'route'] as const) {
  test(`L04 ${kind} vertex drag/insert/delete persists and enforces minimum vertices`, async ({ page }) => {
    await seedMaps(page, kind);
    await page.getByText(`L04 ${kind}`, { exact: true }).first().dblclick();
    await page.getByRole('button', { name: 'Ubah posisi/bentuk' }).click();
    const vertices = page.locator('.atlas-vertex');
    const min = kind === 'area' ? 3 : 2;
    await expect(vertices).toHaveCount(min);
    const before = await geometry(page), box = await vertices.first().boundingBox();
    if (!box) throw new Error('No vertex handle');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + 35, box.y + 25, { steps: 8 }); await page.mouse.up();
    await expect.poll(() => geometry(page)).not.toEqual(before);
    await page.locator('.atlas-midpoint').first().click();
    await expect(vertices).toHaveCount(min + 1);
    await vertices.first().click({ button: 'right' });
    await expect(vertices).toHaveCount(min);
    const saved = await geometry(page);
    await vertices.first().click({ button: 'right' });
    expect(await geometry(page)).toEqual(saved);
    await page.reload();
    expect(await geometry(page)).toEqual(saved);
    await page.getByText(`L04 ${kind}`, { exact: true }).first().dblclick();
    await page.getByRole('button', { name: 'Ubah posisi/bentuk' }).click();
    await expect(vertices).toHaveCount(min);
  });
}

test('L04 links a portal, navigates to child and back, then unlinks without deleting maps', async ({ page }) => {
  await seedMaps(page);
  await page.locator('.leaflet-marker-icon').first().click();
  await page.getByLabel('Tautkan ke Sub-Peta').selectOption('2');
  await expect(page.getByRole('button', { name: /Masuk & Jelajahi Sub-Peta/ })).toBeVisible();
  await page.reload();
  await page.locator('.leaflet-marker-icon').first().click();
  await page.getByRole('button', { name: /Masuk & Jelajahi Sub-Peta/ }).click();
  await expect(page.getByTitle('Ganti atau kelola peta aktif')).toContainText('Child');
  await page.getByTitle('Kembali ke peta induk: Parent', { exact: true }).click();
  await expect(page.getByTitle('Ganti atau kelola peta aktif')).toContainText('Parent');
  await page.getByTitle('Lepas tautan sub-peta').click();
  await expect(page.getByLabel('Tautkan ke Sub-Peta')).toHaveValue('');
  expect(await page.evaluate(async () => { const path = '/src/db.ts'; const { db } = await import(path); return { count: await db.maps.count(), link: (await db.mapMarkers.get(1))?.linkedMapId }; })).toEqual({ count: 3, link: undefined });
});

test('L04 Codex deep link opens the correct map and selected marker', async ({ page }) => {
  await seedMaps(page, 'pin', true);
  await page.getByRole('button', { name: 'Dunia & Lore', exact: true }).click();
  await page.getByText('L04 Location', { exact: true }).click();
  await page.getByTitle('Lihat di Peta (Child)', { exact: true }).click();
  await expect(page.getByTitle('Ganti atau kelola peta aktif')).toContainText('Child');
  await expect(page.getByRole('button', { name: 'Ubah posisi/bentuk' })).toBeVisible();
  await page.getByRole('button', { name: 'Buka di Codex', exact: true }).click();
  await expect(page.getByTitle('Lihat di Peta (Child)', { exact: true })).toBeVisible();
});

test('L04 switching projects replaces map and markers without changing stored geometry', async ({ page }) => {
  await seedMaps(page);
  const before = await geometry(page);
  const oldUrls: string[] = await page.evaluate(() => [...Reflect.get(window, 'l04Urls')]);
  expect(oldUrls.length).toBeGreaterThan(0);
  await page.getByTitle('Ganti Proyek/Naskah', { exact: true }).click();
  await page.getByRole('button', { name: 'Ganti', exact: true }).click();
  await page.getByRole('heading', { name: 'Naskah Anda', exact: true }).locator('../..').getByRole('button').click();
  await page.getByRole('button', { name: 'Visual & Peta', exact: true }).click();
  await expect(page.getByTitle('Ganti atau kelola peta aktif')).toContainText('Other project');
  await expect(page.getByText('Other marker', { exact: true })).toBeVisible();
  await expect(page.getByText('L04 pin', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pin', exact: true }).first().click();
  await page.locator('.leaflet-container').click({ position: { x: 300, y: 200 } });
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/db.ts'; return (await import(path)).db.mapMarkers.count();
  })).toBe(3);
  expect(await page.evaluate(async () => {
    const path = '/src/db.ts'; const row = (await (await import(path)).db.mapMarkers.toArray()).find(m => m.id !== 1 && m.id !== 2);
    return { projectId: row?.projectId, mapId: row?.mapId };
  })).toEqual({ projectId: 2, mapId: 3 });
  expect(await geometry(page)).toEqual(before);
  await expect.poll(() => page.evaluate(urls => urls.every(url => !Reflect.get(window, 'l04Urls').has(url)), oldUrls)).toBe(true);
});
