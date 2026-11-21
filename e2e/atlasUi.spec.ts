import { test, expect, type Page } from '@playwright/test';
import type { RoutePoint } from '../src/types';

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

test('Atlas separates selection from centering and releases it from the map, sidebar, and keyboard', async ({ page }) => {
  await seedMaps(page);
  await page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    await db.mapMarkers.update(1, { geometry: { x: .28, y: .34 } });
  });
  await page.reload();
  const canvas = page.locator('.leaflet-container');
  const image = canvas.locator('.leaflet-image-layer');
  const viewport = () => image.evaluate(element => {
    const { x, y, width } = element.getBoundingClientRect();
    return { x, y, width };
  });
  const pin = canvas.locator('.atlas-beacon-pin');
  const highlight = canvas.locator('.atlas-selected-pin-marker');
  const detail = page.getByRole('complementary', { name: 'Detail penanda Atlas' });
  const initially = await viewport();
  await pin.click();
  await expect(detail.getByRole('heading', { name: 'L04 pin' })).toBeVisible();
  await expect(highlight).toBeVisible();
  expect(await viewport()).toEqual(initially);

  await detail.getByRole('button', { name: 'Pusatkan di peta' }).click();
  await expect.poll(async () => (await viewport()).x).not.toBe(initially.x);
  await expect(detail.getByLabel('Taut Codex')).toBeHidden();
  await detail.getByText('Pengaturan penanda', { exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Hapus penanda' })).toBeVisible();
  await detail.getByRole('button', { name: 'Hapus penanda' }).scrollIntoViewIfNeeded();
  await expect(detail.getByRole('heading', { name: 'L04 pin' })).toBeInViewport();
  await detail.getByRole('button', { name: 'Tutup Detail' }).click();
  await expect(detail).toHaveCount(0);
  await expect(highlight).toHaveCount(0);

  await pin.click();
  await detail.getByRole('button', { name: 'Ubah posisi/bentuk' }).click();
  await expect(canvas.locator('.atlas-vertex')).toBeVisible();
  await canvas.click({ position: { x: 55, y: 150 } });
  await expect(detail.getByRole('button', { name: 'Selesai mengubah' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail.getByRole('button', { name: 'Ubah posisi/bentuk' })).toBeVisible();
  await expect(highlight).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(highlight).toHaveCount(0);

  await pin.click();
  await canvas.click({ position: { x: 55, y: 150 } });
  await expect(detail).toHaveCount(0);
  await expect(highlight).toHaveCount(0);

  await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
  await page.setViewportSize({ width: 600, height: 740 });
  await page.getByText('L04 pin', { exact: true }).first().dblclick();
  await expect(detail.getByRole('heading', { name: 'L04 pin' })).toBeVisible();
  const [canvasBox, detailBox] = await Promise.all([canvas.boundingBox(), detail.boundingBox()]);
  if (!canvasBox || !detailBox) throw new Error('Missing Atlas layout');
  expect(canvasBox.width).toBeGreaterThan(0);
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(detailBox.x + 1);
});

test('area previews a closed boundary, marks crossings, and keeps selected corners sharp', async ({ page }) => {
  await seedMaps(page);
  await page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    await db.mapMarkers.add({ mapId: 1, projectId: 1, kind: 'pin', title: 'Desa tepi batas', geometry: { x: .5, y: .205 }, createdAt: 2 });
  });
  await page.getByRole('button', { name: 'Area', exact: true }).first().click();
  const canvas = page.locator('.leaflet-container');
  const image = page.locator('.leaflet-image-layer');
  const position = async (x: number, y: number) => {
    const [mapBox, imageBox] = await Promise.all([canvas.boundingBox(), image.boundingBox()]);
    if (!mapBox || !imageBox) throw new Error('Atlas map bounds unavailable');
    return { x: imageBox.x - mapBox.x + imageBox.width * x, y: imageBox.y - mapBox.y + imageBox.height * y };
  };
  const point = async (x: number, y: number) => canvas.click({ position: await position(x, y) });
  await point(.25, .25);
  await point(.75, .75);
  await point(.25, .75);
  await point(.75, .25);
  const warning = page.getByRole('status').filter({ hasText: 'Batas area bersilangan' });
  await expect(warning).toBeVisible();
  await expect(canvas.locator('.atlas-area-crossing')).toHaveCount(1);
  await canvas.focus();
  await page.keyboard.press('Backspace');
  await expect(warning).toHaveCount(0);
  const undo = page.getByRole('button', { name: 'Hapus titik terakhir' });
  await undo.click();
  await undo.click();
  await expect(page.getByText(/\(1 titik\)/)).toBeVisible();
  await point(.75, .25);
  await point(.75, .75);
  await point(.25, .75);

  const style = page.getByLabel('Bentuk batas');
  const draft = canvas.locator('path[stroke-dasharray="4 4"][fill-opacity="0.15"]');
  const draftPath = () => draft.getAttribute('d');
  const straight = await draftPath();
  expect(straight).toMatch(/z$/i);
  await style.selectOption('curved');
  await expect.poll(async () => ((await draftPath())?.match(/L/g) ?? []).length).toBeGreaterThan(4);
  const rounded = await draftPath();
  const corner = page.getByRole('button', { name: 'Sudut tegas di titik terakhir' });
  await corner.click();
  await expect(corner).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(draftPath).not.toBe(rounded);
  await canvas.dblclick({ position: await position(.75, .75), modifiers: ['Shift'] });
  await expect(corner).toBeVisible();
  await expect(page.getByText(/\(4 titik\)/)).toBeVisible();
  await canvas.dblclick({ position: await position(.25, .25) });

  const area = () => page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    return (await db.mapMarkers.where('mapId').equals(1).toArray()).find(marker => marker.kind === 'area');
  });
  await expect.poll(async () => (await area())?.geometry.length).toBe(4);
  await expect.poll(area).toMatchObject({ meta: { areaStyle: 'curved' } });
  expect((await area())?.geometry[2]).toMatchObject({ sharp: true });
  expect((await area())?.geometry[3]).toMatchObject({ sharp: true });
  await expect(page.getByText('2 penanda', { exact: true })).toBeVisible();
  await style.selectOption('straight');
  await expect(page.getByText('1 penanda', { exact: true })).toBeVisible();
  await style.selectOption('curved');
  await expect(page.getByText('2 penanda', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Ubah posisi/bentuk' }).click();
  await canvas.locator('.atlas-vertex').first().click();
  const sharp = page.getByRole('checkbox', { name: 'Sudut tegas' });
  await expect(sharp).not.toBeChecked();
  await sharp.click();
  await expect(sharp).toBeChecked();
  await canvas.locator('.atlas-vertex').first().click({ modifiers: ['Shift'] });
  await expect(sharp).not.toBeChecked();
  await canvas.locator('.atlas-vertex').first().click({ modifiers: ['Shift'] });
  await expect(sharp).toBeChecked();
  const saved = await area();
  expect(saved?.geometry[0]).toMatchObject({ sharp: true });
  expect(saved?.geometry[3]).toMatchObject({ sharp: true });
  await page.reload();
  expect(await area()).toEqual(saved);
});

test('Atlas area lists navigable contents and keeps important roles when its boundary changes', async ({ page }) => {
  await seedMaps(page, 'area');
  await page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    const base = { mapId: 1, projectId: 1, createdAt: 2 };
    await db.mapMarkers.bulkAdd([
      { ...base, id: 3, kind: 'pin', title: 'Kota Batu', geometry: { x: .5, y: .21 } },
      { ...base, id: 4, kind: 'pin', title: 'Perkemahan Utara', geometry: { x: .5, y: .4 } },
      { ...base, id: 5, kind: 'area', title: 'Hutan Pinus', geometry: [{ x: .45, y: .35 }, { x: .55, y: .35 }, { x: .5, y: .45 }] },
      { ...base, id: 6, kind: 'area', title: 'Wilayah Tumpang Tindih', geometry: [{ x: .55, y: .35 }, { x: .81, y: .35 }, { x: .7, y: .55 }] },
    ]);
  });
  const openParent = () => page.getByText('L04 area', { exact: true }).first().dblclick();
  await openParent();
  const pins = page.getByRole('region', { name: 'Pin di dalam wilayah' });
  const regions = page.getByRole('region', { name: 'Wilayah di dalamnya' });
  const important = page.getByRole('region', { name: 'Lokasi penting', exact: true });
  const style = page.getByLabel('Bentuk batas');
  await expect(pins.getByRole('button', { name: 'Perkemahan Utara' })).toBeVisible();
  await expect(regions.getByRole('button', { name: 'Hutan Pinus' })).toBeVisible();
  await expect(regions.getByRole('button', { name: 'Wilayah Tumpang Tindih' })).toHaveCount(0);
  await expect(pins.getByRole('button', { name: 'Kota Batu' })).toHaveCount(0);
  await style.selectOption('curved');
  await expect(pins.getByRole('button', { name: 'Kota Batu' })).toBeVisible();
  await important.getByText('Atur peran lokasi', { exact: true }).click();
  await important.getByLabel('Pin lokasi penting').selectOption('3');
  await important.getByLabel('Peran lokasi').fill('Ibu Kota');
  await important.getByRole('button', { name: 'Simpan peran' }).click();
  await expect(pins.getByText('Ibu Kota', { exact: true })).toBeVisible();

  await style.selectOption('straight');
  await expect(pins.getByRole('button', { name: 'Kota Batu' })).toHaveCount(0);
  await expect(important.getByText('Ibu Kota · Di luar batas')).toBeVisible();
  await regions.getByRole('button', { name: 'Hutan Pinus' }).click();
  await expect(page.getByRole('heading', { name: 'Hutan Pinus', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Daftar Wilayah' }).click();
  await openParent();
  await pins.getByRole('button', { name: 'Perkemahan Utara' }).click();
  await expect(page.getByRole('heading', { name: 'Perkemahan Utara', exact: true })).toBeVisible();

  await page.reload();
  await openParent();
  await expect(important.getByText('Ibu Kota · Di luar batas')).toBeVisible();
  await important.getByRole('button', { name: 'Lepas peran Kota Batu' }).click();
  await expect(important.getByText('Belum ada lokasi dengan peran khusus.')).toBeVisible();
});

test('route points, live curve preview, undo, and saved style follow the drawing', async ({ page }) => {
  await seedMaps(page, 'route');
  await expect(page.locator('.atlas-route-point')).toHaveCount(2);
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db } = await import(path);
    await db.maps.update(1, { scale: { ratioToRelative: 1000, distanceUnit: 'km' } });
    await db.projects.update(1, { travelSpeeds: [{ id: 'walk', name: 'Jalan kaki', speedPerDay: 5, unit: 'hari' }] });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Rute', exact: true }).first().click();
  const shape = page.getByLabel('Bentuk rute');
  const undo = page.getByRole('button', { name: 'Hapus titik terakhir' });
  const canvas = page.locator('.leaflet-container');
  const image = page.locator('.leaflet-image-layer');
  const position = async (x: number, y: number) => {
    const [mapBox, imageBox] = await Promise.all([canvas.boundingBox(), image.boundingBox()]);
    if (!mapBox || !imageBox) throw new Error('Atlas map bounds unavailable');
    return { x: imageBox.x - mapBox.x + imageBox.width * x, y: imageBox.y - mapBox.y + imageBox.height * y };
  };
  // The first point overlaps the legacy route and should still be accepted.
  await canvas.click({ position: await position(.25, .25) });
  await canvas.click({ position: await position(.5, .75) });
  await canvas.click({ position: await position(.75, .25) });

  const draft = canvas.locator('path[stroke="#2563eb"][stroke-dasharray="4 4"]');
  const segments = () => draft.evaluate(el => (el.getAttribute('d')?.match(/L/g) ?? []).length);
  expect(await segments()).toBe(2);
  await shape.selectOption('curved');
  await expect.poll(segments).toBeGreaterThan(2);
  await expect(page.getByText(/\(3 titik\)/)).toBeVisible();
  await canvas.focus();
  await page.keyboard.press('Backspace');
  await expect(page.getByText(/\(2 titik\)/)).toBeVisible();
  expect(await segments()).toBe(1);
  await undo.click();
  await expect(page.getByText(/\(1 titik\)/)).toBeVisible();
  await canvas.click({ position: await position(.5, .75) });
  await canvas.dblclick({ position: await position(.75, .25) });

  const savedRoute = () => page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db } = await import(path);
    const marker = await db.mapMarkers.where('mapId').equals(1).last();
    return {
      length: marker?.geometry?.length, style: marker?.meta?.routeStyle,
      speed: marker?.meta?.speedProfileId, showIntermediatePoints: marker?.meta?.showIntermediatePoints,
    };
  });
  await expect.poll(savedRoute).toMatchObject({ length: 3, style: 'curved' });
  const numberedPoints = page.locator('.atlas-route-point').filter({ hasText: /^\d+$/ });
  const intermediatePoints = page.getByRole('checkbox', { name: 'Tampilkan titik antara' });
  await expect(intermediatePoints).not.toBeChecked();
  await expect(numberedPoints).toHaveText(['1', '2']);
  await intermediatePoints.click();
  await expect(intermediatePoints).toBeChecked();
  await expect(numberedPoints).toHaveText(['1', '2', '3']);
  await page.getByLabel('Metode Perjalanan').selectOption('walk');
  const distance = async () => Number((await page.getByText(/^\d[\d.,]* km$/).innerText()).replace(/[^\d]/g, ''));
  const time = async () => Number.parseInt(await page.getByText(/^\d+ hari$/).innerText(), 10);
  const curvedDistance = await distance();
  const curvedTime = await time();
  await shape.selectOption('straight');
  await expect.poll(savedRoute).toMatchObject({ length: 3, style: 'straight', speed: 'walk' });
  await expect.poll(distance).toBeLessThan(curvedDistance);
  await expect.poll(time).toBeLessThan(curvedTime);
  await shape.selectOption('curved');
  await expect.poll(savedRoute).toMatchObject({ length: 3, style: 'curved', speed: 'walk' });
  const routePath = canvas.locator('path[stroke-dasharray="8 4"]');
  await expect.poll(distance).toBe(curvedDistance);
  const pathBeforeHiding = await routePath.getAttribute('d');
  await intermediatePoints.click();
  await expect(intermediatePoints).not.toBeChecked();
  await expect(numberedPoints).toHaveText(['1', '2']);
  await expect(routePath).toHaveAttribute('d', pathBeforeHiding ?? '');
  expect(await distance()).toBe(curvedDistance);
  expect(await time()).toBe(curvedTime);

  await page.getByRole('button', { name: 'Ubah posisi/bentuk' }).click();
  const handles = canvas.locator('.atlas-vertex');
  await expect(handles).toHaveText(['1', '2', '3']);
  await canvas.locator('.atlas-midpoint').first().click();
  await expect.poll(savedRoute).toMatchObject({ length: 4, style: 'curved', speed: 'walk' });
  await expect(handles).toHaveText(['1', '2', '3', '4']);
  await handles.nth(1).click({ button: 'right' });
  await expect.poll(savedRoute).toMatchObject({ length: 3, style: 'curved', speed: 'walk' });

  await page.reload();
  await expect(page.locator('.atlas-route-point')).toHaveCount(4);
  expect(await savedRoute()).toMatchObject({ length: 3, style: 'curved', speed: 'walk', showIntermediatePoints: false });
});

test('Atlas links selected route points to a pin and Codex and keeps their identity', async ({ page }) => {
  await seedMaps(page);
  await page.getByRole('button', { name: 'Rute', exact: true }).first().click();
  await page.getByLabel('Bentuk rute').selectOption('curved');
  const canvas = page.locator('.leaflet-container');
  const image = page.locator('.leaflet-image-layer');
  const position = async (i: number) => {
    const [mapBox, imageBox] = await Promise.all([canvas.boundingBox(), image.boundingBox()]);
    if (!mapBox || !imageBox) throw new Error('Atlas map bounds unavailable');
    return {
      x: imageBox.x - mapBox.x + imageBox.width * (.16 + i * .065),
      y: imageBox.y - mapBox.y + imageBox.height * (i % 2 ? .67 : .34),
    };
  };
  for (let i = 0; i < 9; i++) await canvas.click({ position: await position(i) });
  await canvas.dblclick({ position: await position(9) });

  const data = () => page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    const map = await db.mapMarkers.where('mapId').equals(1).toArray();
    return { points: map.find(marker => marker.kind === 'route')?.geometry as RoutePoint[] | undefined, pin: map.find(marker => marker.kind === 'pin')?.geometry };
  });
  await expect.poll(async () => (await data()).points?.length).toBe(10);
  const original = (await data()).points ?? [];
  await page.getByRole('button', { name: 'Ubah posisi/bentuk' }).click();
  const section = page.getByRole('region', { name: 'Tempat singgah' });
  const point = section.getByLabel('Titik rute');
  const toggle = section.getByRole('checkbox', { name: 'Tampilkan di peta' });
  const selectPoint = async (index: number) => {
    const pointId = original[index]?.pointId;
    if (!pointId) throw new Error('Missing point ID');
    await point.selectOption(pointId);
  };

  await selectPoint(0);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  for (const index of [1, 4]) {
    await selectPoint(index);
    await toggle.click();
    await expect(toggle).toBeChecked();
    const name = section.getByRole('textbox', { name: 'Nama titik' });
    await name.fill(index === 1 ? 'Perkemahan 1' : 'Perkemahan 2');
    await name.blur();
  }
  await section.getByLabel('Codex titik').selectOption('1');
  await selectPoint(9);
  await section.getByLabel('Pin Atlas').selectOption('1');
  await expect(section.getByText('Posisi dan Codex mengikuti pin tertaut.')).toBeVisible();

  await canvas.locator('.atlas-midpoint').first().click();
  await expect.poll(async () => (await data()).points?.length).toBe(11);
  const handles = canvas.locator('.atlas-vertex');
  await handles.nth(1).click({ button: 'right' });
  await expect.poll(async () => (await data()).points?.length).toBe(10);
  const edited = await data();
  expect(edited.points?.[1]).toMatchObject({ pointId: original[1].pointId, name: 'Perkemahan 1', visible: true });
  expect(edited.points?.[4]).toMatchObject({ pointId: original[4].pointId, name: 'Perkemahan 2', visible: true, codexId: 1 });
  expect(edited.points?.[9]).toMatchObject({ pointId: original[9].pointId, pinId: 1, ...edited.pin });

  await page.getByRole('button', { name: 'Selesai mengubah' }).click();
  await expect(canvas.locator('.atlas-route-point')).toHaveCount(2);
  await expect(section.getByRole('button', { name: 'Perkemahan 2' })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Codex', exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'L04 pin', exact: true }).click();
  const connections = page.getByRole('region', { name: 'Rute terhubung' });
  await expect(connections.getByText('Tujuan')).toBeVisible();
  await page.getByRole('button', { name: 'Ubah posisi/bentuk' }).click();
  const pin = canvas.locator('.atlas-vertex');
  const box = await pin.boundingBox();
  if (!box) throw new Error('Missing pin handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 38, box.y + 30, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await data()).pin).not.toEqual(edited.pin);
  const moved = await data();
  expect(moved.points?.[9]).toMatchObject({ pinId: 1, ...moved.pin });

  await page.reload();
  await expect(canvas.locator('.atlas-route-point')).toHaveCount(2);
  await canvas.locator('.atlas-beacon-pin').click();
  await expect(connections.getByText('Tujuan')).toBeVisible();
  await connections.getByRole('button', { name: 'Rute', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Perkemahan 1' })).toBeVisible();
  await section.getByRole('button', { name: 'L04 pin', exact: true }).click();
  await page.getByText('Pengaturan penanda', { exact: true }).click();
  await page.getByRole('button', { name: 'Hapus penanda' }).click();
  await expect.poll(async () => (await data()).pin).toBeUndefined();
  expect((await data()).points?.[9]).toMatchObject({ pinId: undefined, ...moved.pin });
});

test('L04 links a portal, navigates to child and back, then unlinks without deleting maps', async ({ page }) => {
  await seedMaps(page);
  await page.locator('.leaflet-marker-icon').first().click();
  await page.getByText('Pengaturan penanda', { exact: true }).click();
  await page.getByLabel('Tautkan ke Sub-Peta').selectOption('2');
  await expect(page.getByRole('button', { name: /Masuk & Jelajahi Sub-Peta/ })).toBeVisible();
  await page.reload();
  await page.locator('.leaflet-marker-icon').first().click();
  await page.getByRole('button', { name: /Masuk & Jelajahi Sub-Peta/ }).click();
  await expect(page.getByTitle('Ganti atau kelola peta aktif')).toContainText('Child');
  await page.getByTitle('Kembali ke peta induk: Parent', { exact: true }).click();
  await expect(page.getByTitle('Ganti atau kelola peta aktif')).toContainText('Parent');
  await page.getByText('Pengaturan penanda', { exact: true }).click();
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
