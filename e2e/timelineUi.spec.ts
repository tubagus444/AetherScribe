import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.route('**/__timeline', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__timeline');
  await page.evaluate(async () => {
    const path = '/src/db.ts', calendarPath = '/src/lib/worldCalendar.ts';
    const { db }: typeof import('../src/db') = await import(path);
    const { calendarPreset } = await import(calendarPath);
    await db.projects.add({ id: 1, name: 'Kronologi', description: '', createdAt: 1, lastOpened: 1, calendar: calendarPreset('fantasy') });
    for (const id of [1, 5]) await db.chapters.add({ id, projectId: 1, title: 'Bab ' + id, content: '<p>Budi membuka warung.</p>', order: id, lastModified: 1 });
    for (const [id, name, category] of [[1, 'Budi', 'character'], [2, 'Warung', 'location']] as const)
      await db.codex.add({ id, projectId: 1, name, category, aliases: [], tags: [], description: '' });
    await db.timeline.add({ projectId: 1, title: 'Catatan lama', eventDate: 'Musim dingin', type: 'world', order: 0, chapterId: 5, description: '', characterIds: [1] });
    localStorage.setItem('ai_local_only', 'true');
    localStorage.setItem('aether_view_mode', 'timeline');
  });
});

for (const width of [1280, 820, 390]) {
  test('ikhtisar 200 peristiwa, rentang, urutan dan tautan pada lebar ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(async () => {
      const path = '/src/db.ts'; const { db }: typeof import('../src/db') = await import(path);
      await db.timeline.bulkAdd(Array.from({ length: 200 }, (_, i) => ({ projectId: 1, title: i === 0 ? 'Peristiwa pertama dengan judul panjang yang perlu ditampilkan dalam dua baris' : 'Peristiwa ' + i, description: 'Detail ' + i,
        type: 'plot' as const, order: i, startDate: { era: 0, year: 1 + Math.floor(i / 20), month: 1, day: 1 + i % 10 } })));
    });
    await page.goto('/');
    const rail = page.getByLabel('Garis waktu');
    await expect(rail).toBeVisible();
    if (width < 768) await page.mouse.click(width - 10, 90);
    expect(await rail.evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
    await expect(rail).toHaveCSS('scrollbar-width', 'none');
    const leftArrow = page.getByRole('button', { name: 'Geser ke kiri' });
    const rightArrow = page.getByRole('button', { name: 'Geser ke kanan' });
    await expect(leftArrow).toBeDisabled();
    const layout = await rail.evaluate(el => {
      const slots = Array.from(el.querySelectorAll('[data-timeline-slot]'));
      const railBounds = el.getBoundingClientRect();
      const firstCard = slots[0].querySelector('button')!;
      const rect = firstCard.getBoundingClientRect();
      const centerX = (bounds: DOMRect) => (bounds.left + bounds.right) / 2;
      const centersAligned = slots.every((slot, index) => {
        const card = slot.querySelector('button')!.getBoundingClientRect();
        const point = slot.querySelector('[data-timeline-point]')!.getBoundingClientRect();
        const connector = slot.querySelector('[data-timeline-connector]')!.getBoundingClientRect();
        const above = index % 2 === 0;
        return Math.abs(centerX(card) - centerX(point)) <= 1 &&
          Math.abs(centerX(card) - centerX(connector)) <= 1 &&
          Math.abs(above ? card.bottom - connector.top : card.top - connector.bottom) <= 1 &&
          connector.height > 0 &&
          Math.abs((above ? connector.bottom : connector.top) - (point.top + point.height / 2)) <= 1;
      });
      const adjacentCardsSeparated = slots.slice(1).every((slot, index) =>
        slot.querySelector('button')!.getBoundingClientRect().left >=
        slots[index].querySelector('button')!.getBoundingClientRect().right);
      const title = firstCard.querySelector('strong')!;
      const titleLines = title.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(title).lineHeight);
      return { centersAligned, adjacentCardsSeparated, titleLines, start: rect.left - railBounds.left,
        firstVisible: rect.right <= railBounds.right, bodyFits: document.documentElement.scrollWidth <= window.innerWidth };
    });
    expect(layout).toMatchObject({ centersAligned: true, adjacentCardsSeparated: true, firstVisible: true, bodyFits: true });
    expect(layout.start).toBeGreaterThanOrEqual(12);
    expect(layout.titleLines).toBeCloseTo(2);
    await rightArrow.click();
    await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Geser ke kiri' }).click();
    await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBe(0);
    await rail.hover();
    await page.mouse.wheel(0, 350);
    await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Lihat seluruh linimasa' }).click();
    expect(await rail.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    await page.getByRole('button', { name: 'Telusuri linimasa' }).click();
    if (width === 390) {
      const client = await page.context().newCDPSession(page);
      const box = await rail.boundingBox();
      if (!box) throw new Error('Garis waktu tidak terlihat');
      const y = box.y + box.height / 2;
      const x = box.x + box.width - 24;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (const distance of [30, 70, 120, 160]) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - distance, y }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await client.detach();
    }
    await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(rightArrow).toBeDisabled();
    await expect(leftArrow).toBeEnabled();
    const end = await rail.evaluate(el => {
      const cards = el.querySelectorAll('button');
      const last = cards[cards.length - 1].getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      return { gutter: bounds.right - last.right, fullyVisible: last.left >= bounds.left };
    });
    expect(end.fullyVisible).toBeTruthy();
    expect(end.gutter).toBeGreaterThanOrEqual(12);
    await page.getByLabel('Pilih periode').selectOption('0/10/1');
    const dateCard = rail.getByRole('button').last();
    await dateCard.scrollIntoViewIfNeeded();
    const readPosition = () => rail.evaluate(el => el.scrollLeft);
    const beforeDetail = await readPosition();
    await expect(dateCard).toContainText('Lihat 2 peristiwa');
    await dateCard.click();
    await expect(dateCard).toHaveAttribute('aria-expanded', 'true');
    const list = page.getByRole('region', { name: 'Peristiwa pada tanggal terpilih' });
    await expect(list.locator('summary')).toHaveCount(2);
    await list.getByRole('button', { name: 'Tutup detail' }).click();
    await expect(dateCard).toBeFocused();
    await expect(dateCard).toHaveAttribute('aria-expanded', 'false');
    expect(await readPosition()).toBe(beforeDetail);
    await dateCard.click();
    await list.locator('summary').last().click();
    await list.getByRole('button', { name: 'Naik' }).click();
    await expect(list.locator('summary').first()).toContainText('Peristiwa 199');
    await list.getByRole('button', { name: 'Edit peristiwa' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Penjelasan').fill('Perubahan detail');
    await form.getByLabel('Cari entitas Codex').fill('Warung');
    await form.getByRole('button', { name: /Warung/ }).click();
    await form.getByLabel('Berlangsung beberapa hari').check();
    await form.getByLabel('Hari akhir').fill('12');
    await form.getByLabel('Bab (opsional)').selectOption('5');
    await form.getByRole('button', { name: 'Simpan peristiwa' }).click();
    await expect(form).toHaveCount(0);
    await expect(list.getByText('Perubahan detail')).toBeVisible();
    await expect(list.getByText(/Entitas Codex terkait · Warung/)).toBeVisible();
    await page.getByRole('button', { name: 'Lihat seluruh linimasa' }).click();
    await expect(rail).toBeVisible();
    await page.getByText('Belum bertanggal (1)', { exact: true }).click();
    await page.getByText('Catatan lama', { exact: false }).last().click();
    await expect(page.getByText('Musim dingin', { exact: true })).toBeVisible();
    if (width === 390) {
      const filter = page.getByRole('combobox', { name: 'Filter peristiwa berdasarkan bab' });
      await expect(filter).toBeHidden();
      await page.getByRole('button', { name: 'Filter bab', exact: true }).click();
      await filter.selectOption('5');
      await expect(page.getByRole('button', { name: 'Filter bab aktif' })).toBeVisible();
      await expect(rail.getByRole('button')).toHaveCount(1);
      await expect(rail.getByRole('button')).toContainText('Peristiwa 199');
    }
  });
}

test('seleksi editor mengisi judul dan bab serta mempertahankan teks setelah batal dan simpan', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'write'));
  await page.goto('/');
  const editor = page.locator('.tiptap[contenteditable=true]');
  await expect(editor).toContainText('Budi membuka warung.');
  await editor.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  for (const save of [false, true]) {
    await page.getByRole('button', { name: 'Catat ke Linimasa' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByLabel('Nama peristiwa')).toHaveValue('Budi membuka warung.');
    await expect(form.getByLabel('Bab (opsional)')).toHaveValue('1');
    if (save) {
      await form.getByLabel('Nama peristiwa').fill('Warung dibuka');
      await form.getByRole('button', { name: /Budi/ }).click();
    }
    await form.getByRole('button', { name: save ? 'Simpan peristiwa' : 'Batal' }).click();
    await expect(editor).toBeFocused();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Budi membuka warung.');
  }
  await expect(editor).toHaveText('Budi membuka warung.');
  await expect(editor.locator('[title*="terlalu dini"]')).toHaveCount(0);
  const saved = await page.evaluate(async () => { const path = '/src/db.ts'; return (await import(path)).db.timeline.toArray(); });
  expect(saved).toHaveLength(2);
  expect(saved[1]).toMatchObject({ title: 'Warung dibuka', chapterId: 1, characterIds: [1] });
});

test('kalender dan linimasa mengubah peristiwa yang sama', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'worldcalendar'));
  await page.goto('/');
  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: 'Peristiwa baru', exact: true }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Hari', { exact: true })).toHaveValue('7');
  await form.getByLabel('Nama peristiwa').fill('Pertemuan di pasar');
  await form.getByRole('button', { name: 'Simpan peristiwa' }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: /Lihat daftar peristiwa/ }).click();
  await page.getByLabel('Garis waktu').getByRole('button', { name: /Pertemuan di pasar/ }).click();
  await page.getByRole('button', { name: 'Edit peristiwa' }).click();
  await form.getByLabel('Hari', { exact: true }).fill('9');
  await form.getByRole('button', { name: 'Simpan peristiwa' }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: 'Kalender', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /9 Pertemuan di pasar/ })).toBeVisible();
  const rows = await page.evaluate(async () => { const path = '/src/db.ts'; return (await import(path)).db.timeline.toArray(); });
  expect(rows).toHaveLength(2);
  expect(rows[1].startDate.day).toBe(9);
});

test('proyek tanpa kalender menyimpan draf setelah kegagalan dan bisa mengatur kalender', async ({ page }) => {
  await page.evaluate(async () => { const path = '/src/db.ts'; await (await import(path)).db.projects.update(1, { calendar: undefined }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Tambah peristiwa', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Nama peristiwa').fill('Kabar dari pelabuhan');
  await form.getByRole('button', { name: /Warung/ }).click();
  // A linked entity is removed by a different tab while the form is open.
  await page.evaluate(async () => { const path = '/src/db.ts'; await (await import(path)).db.codex.delete(2); });
  await form.getByRole('button', { name: 'Simpan peristiwa' }).click();
  await expect(page.getByText('Gagal menyimpan peristiwa.')).toBeVisible();
  await expect(form.getByLabel('Nama peristiwa')).toHaveValue('Kabar dari pelabuhan');
  await form.getByRole('button', { name: /Lepas entitas yang sudah dihapus/ }).click();
  await form.getByRole('button', { name: 'Simpan peristiwa' }).click();
  await expect(form).toHaveCount(0);
  await page.getByText('Kabar dari pelabuhan', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit peristiwa' }).click();
  await form.getByRole('button', { name: 'Atur kalender untuk memberi tanggal' }).click();
  await page.getByRole('button', { name: 'Simpan Kalender' }).click();
  await expect(form.getByLabel('Nama peristiwa')).toHaveValue('Kabar dari pelabuhan');
  await form.getByLabel('Tanggal belum ditentukan').uncheck();
  await form.getByRole('button', { name: 'Simpan peristiwa' }).click();
  await page.getByLabel('Garis waktu').getByRole('button', { name: /Kabar dari pelabuhan/ }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Hapus', exact: true }).click();
  await expect(page.getByText('Kabar dari pelabuhan', { exact: true })).toHaveCount(0);
});
