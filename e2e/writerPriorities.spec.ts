import { expect, test, type Page } from '@playwright/test';

type DbModule = typeof import('../src/db');

const editor = (page: Page) => page.locator('.tiptap[contenteditable="true"]');
const search = (page: Page) => page.getByRole('dialog', { name: 'Pencarian global' });

function editorSelection(page: Page) {
  return editor(page).evaluate(element => {
    const { editor } = element as HTMLElement & { editor: import('@tiptap/core').Editor };
    const { doc, selection } = editor.state;
    return { head: selection.head, text: doc.textBetween(selection.from, selection.to) };
  });
}

async function dismissMobileSidebar(page: Page, touch = false) {
  const backdrop = page.locator('div.fixed.inset-0.z-40.backdrop-blur-sm');
  const position = { x: 370, y: 400 };
  if (touch) await backdrop.tap({ position });
  else await backdrop.click({ position });
  await expect(backdrop).toBeHidden();
}

async function openSearch(page: Page, term: string) {
  await page.keyboard.press('Control+k');
  await search(page).getByRole('searchbox').fill(term);
}

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__seed_priorities', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__seed_priorities');
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    const calendarPath = '/src/lib/worldCalendar.ts';
    const { calendarPreset }: typeof import('../src/lib/worldCalendar') = await import(calendarPath);
    await db.projects.add({ id: 1, name: 'Novel uji', description: '', createdAt: 1, lastOpened: 1, calendar: calendarPreset('fantasy') });
    await db.chapters.bulkAdd([
      { id: 1, projectId: 1, title: 'Pembukaan', content: '<p>Awal cerita.</p><p>Kutipan asli.</p>', order: 0, lastModified: 1 },
      { id: 2, projectId: 1, title: 'Bab Dermaga', content: '<p>Gelombang reda.</p>'.repeat(35)
        + '<p>Kapal pertama: peti <strong>emas</strong> &amp; perak.</p><p>Kapal kedua: peti emas &amp; perak.</p>'
        + '<p>Laut tenang.</p>'.repeat(15), order: 1, lastModified: 1 },
    ]);
    const template = { projectId: 1, icon: 'users', color: 'indigo' };
    await db.codexCategories.bulkAdd([
      { ...template, id: 1, slug: 'pusaka', label: 'Pusaka', order: 0, fields: [{ key: 'asal', label: 'Asal', type: 'text' }] },
      { ...template, id: 2, slug: 'barang', label: 'Barang', order: 1, fields: [{ key: 'asal', label: 'Asal', type: 'text' }] },
    ]);
    const entry = { projectId: 1, aliases: [], tags: [] };
    await db.codex.bulkAdd([
      { ...entry, id: 1, name: 'Tombak', category: 'pusaka', description: 'Pusaka penjaga.', customFields: [{ key: 'asal', label: 'Asal', value: 'Desa Awan' }] },
      { ...entry, id: 2, name: 'Raka', category: 'character', description: 'Kapten kapal.' },
      { ...entry, id: 3, name: 'Raka', category: 'character', description: 'Pembuat peta.' },
    ]);
  });
});

async function seedCodexFacts(page: Page, mode: 'codex' | 'write') {
  await page.evaluate(async mode => {
    localStorage.setItem('aether_view_mode', mode);
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.chapters.update(1, { content: '<p>Sagara baru tiba di pelabuhan.</p>' });
    await db.chapters.update(2, { order: 2 });
    await db.chapters.add({ id: 3, projectId: 1, order: 1, title: 'Gerbang Utara', content: '<p>Sagara menjaga gerbang.</p>', lastModified: 1 });
    const fields = [{ key: 'keahlian', label: 'Keahlian', type: 'text' as const }];
    await db.codexCategories.add({ projectId: 1, slug: 'prajurit', label: 'Prajurit', order: 2, icon: 'users', color: 'indigo', fields });
    await db.codex.add({
      projectId: 1, name: 'Sagara', category: 'prajurit', description: 'Datang dari pesisir.', aliases: ['Anak Ombak'], tags: ['utama'],
      customFields: [{ key: 'keahlian', label: 'Keahlian', value: 'Navigasi bintang' }],
      details: [
        { id: 'pangkat', label: 'Pangkat', value: 'Kurir', includeInAI: false, revisions: [
          { id: 'pangkat-2', chapterId: 2, value: 'Panglima' },
          { id: 'pangkat-detached', detachedChapterTitle: 'Bab lama', value: 'Laksamana' },
          { id: 'pangkat-3', chapterId: 3, value: 'Penjaga' },
        ] },
        { id: 'afiliasi', label: 'Afiliasi', value: '', includeInAI: false, revisions: [
          { id: 'afiliasi-2', chapterId: 2, value: 'Armada Timur' },
        ] },
      ],
    });
  }, mode);
}

for (const width of [1280, 390]) {
  test(`Codex mencari fakta terkini dan menampilkan riwayat sampai bab pilihan pada ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await seedCodexFacts(page, 'codex');
    await page.goto('/');
    if (width === 390) await dismissMobileSidebar(page);
    const query = page.getByRole('textbox', { name: 'Cari entri Codex' });
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Sagara', exact: true }) });
    for (const term of ['PANGKAT', '  Panglima  ']) {
      await query.fill(term);
      await expect(card.getByText('Pangkat · Panglima', { exact: true })).toBeVisible();
    }
    for (const term of ['Kurir', 'Penjaga', 'Laksamana']) {
      await query.fill('Panglima');
      await expect(card.getByText('Pangkat · Panglima', { exact: true })).toBeVisible();
      await query.fill(term);
      await expect(card).toHaveCount(0);
    }
    for (const term of ['Keahlian', 'Navigasi bintang']) {
      await query.fill(term);
      await expect(card.getByText('Keahlian · Navigasi bintang', { exact: true })).toBeVisible();
    }
    await query.fill('Anak Ombak');
    await expect(card).toBeVisible();
    await expect(card.getByText('Cocok dengan fakta')).toHaveCount(0);

    await card.getByRole('heading', { name: 'Sagara', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sagara' });
    const scope = dialog.getByRole('combobox', { name: 'Lihat sampai bab…' });
    const rank = dialog.getByRole('region', { name: 'Nilai Pangkat' });
    await expect(scope).toHaveValue('');
    await expect(scope.locator('option')).toHaveText(['Nilai terkini', 'Bab 1 · Pembukaan', 'Bab 2 · Gerbang Utara', 'Bab 3 · Bab Dermaga']);
    await expect(rank).toHaveText('Panglima');
    await dialog.getByText('Riwayat per bab', { exact: true }).first().click();
    const history = dialog.getByRole('list', { name: 'Riwayat Pangkat' });
    await expect(history).toContainText('Laksamana');
    await scope.selectOption('3');
    await expect(rank).toHaveText('Penjaga');
    await expect(history.getByRole('listitem')).toHaveText([/Nilai awal.*Kurir/, /Bab 2.*Gerbang Utara.*Penjaga/]);
    await expect(dialog.getByRole('region', { name: 'Nilai Afiliasi' })).toHaveText('Belum tercatat sampai bab ini.');
    await expect(dialog.getByText('Navigasi bintang', { exact: true })).toBeVisible();
    await scope.selectOption('1');
    await expect(rank).toHaveText('Kurir');
    await scope.selectOption('');
    await expect(rank).toHaveText('Panglima');
    await expect(history).toContainText('Laksamana');
  });

  test(`Codex di Bab Ini memilih bab aktif dan memungkinkan acuan kilas balik pada ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await seedCodexFacts(page, 'write');
    await page.goto('/');
    if (width === 390) await dismissMobileSidebar(page);
    await page.getByRole('button', { name: 'Codex di Bab Ini', exact: true }).click();
    await page.getByRole('button', { name: 'Sagara', exact: true }).click();
    const scope = page.getByRole('combobox', { name: 'Lihat sampai bab…' });
    await expect(scope).toHaveValue('1');
    await expect(page.getByText('Kurir', { exact: true })).toBeVisible();
    await expect(page.getByText('Panglima', { exact: true })).toHaveCount(0);
    await scope.selectOption('3');
    await expect(page.getByText('Penjaga', { exact: true })).toBeVisible();
    await scope.selectOption('');
    await expect(page.getByText('Panglima', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Kembali ke daftar', exact: true }).click();
    await page.getByRole('button', { name: 'Sagara', exact: true }).click();
    await expect(scope).toHaveValue('1');
  });
}

for (const width of [1280, 390]) {
  test(`Lanjutkan menulis memulihkan titik edit setelah membaca bab referensi pada ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(async () => {
      const path = '/src/db.ts';
      const { db }: DbModule = await import(path);
      const chapterStart = '<p>Awal bab kerja.</p>' + '<p>Paragraf sebelum titik kerja.</p>'.repeat(45);
      const chapterEnd = '<p>Paragraf setelah titik kerja.</p>'.repeat(35);
      await db.chapters.update(1, { content: chapterStart + '<p>Titik kerja penulis</p>' + chapterEnd });
      // The newest stored chapter is not necessarily the one last edited on this device.
      await db.chapters.update(2, { lastModified: Date.now() + 60_000 });
      await db.snapshots.add({
        chapterId: 1, content: chapterStart + '<p>Titik kerja penulis?</p>' + chapterEnd,
        label: 'Versi sebelum edit', timestamp: 1,
      });
    });
    await page.goto('/');
    const toggleSidebar = page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' });
    const dashboardTab = page.getByRole('navigation', { name: /Sub-navigasi/ }).getByRole('button', { name: 'Statistik', exact: true });
    const continuation = page.getByRole('button', { name: /Lanjutkan menulis.*Pembukaan/ });
    if (width === 390) await dismissMobileSidebar(page);

    const paragraph = editor(page).getByText('Titik kerja penulis', { exact: true });
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('!');
    await expect(editor(page).getByText('Titik kerja penulis!', { exact: true })).toBeVisible();
    const saved = await editorSelection(page);
    await editor(page).getByText('Awal bab kerja.', { exact: true }).click();
    expect((await editorSelection(page)).head).not.toBe(saved.head);

    if (width === 390) await toggleSidebar.click();
    await page.getByRole('complementary').getByText('Bab Dermaga', { exact: true }).click();
    await expect(editor(page)).toContainText('Gelombang reda.');
    await dashboardTab.click();
    await expect(continuation).toBeVisible();
    await page.reload();
    if (width === 390) await dismissMobileSidebar(page);
    await continuation.click();
    await expect(editor(page)).toBeFocused();
    await expect.poll(() => editorSelection(page)).toEqual(saved);
    await expect(editor(page).getByText('Titik kerja penulis!', { exact: true })).toBeInViewport({ ratio: 1 });

    if (width === 1280) {
      await page.getByRole('button', { name: 'Riwayat Versi', exact: true }).click();
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Pulihkan', exact: true }).click();
      await expect(editor(page)).toContainText('Titik kerja penulis?');
      await dashboardTab.click();
      await continuation.click();
      await expect(editor(page).getByText('Awal bab kerja.', { exact: true })).toBeInViewport({ ratio: 1 });
      expect((await editorSelection(page)).head).not.toBe(saved.head);
    }
  });

  test(`catatan revisi menyaring yang terbuka dan mempertahankan urutan pada ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(async () => {
      const path = '/src/db.ts';
      const { db }: DbModule = await import(path);
      await db.chapters.update(1, { content: [
        '<p><span data-comment-id="awal" data-note="Perbaiki pembuka">Kutipan pertama</span></p>',
        '<p><span data-comment-id="tengah" data-note="Sudah diperbaiki" data-resolved="true">Kutipan kedua</span></p>',
        '<p><span data-comment-id="akhir" data-note="Perjelas penutup">Kutipan ketiga</span></p>',
      ].join('') });
    });
    await page.goto('/');
    if (width === 390) await dismissMobileSidebar(page);
    await page.getByRole('button', { name: 'Catatan Revisi', exact: true }).click();
    await page.getByRole('button', { name: 'Catatan Teks', exact: true }).click();
    const filter = page.getByRole('group', { name: 'Filter catatan revisi' });
    const quotes = page.getByTitle('Lompat ke teks ini', { exact: true });
    await expect(quotes).toHaveText(['"Kutipan pertama"', '"Kutipan kedua"', '"Kutipan ketiga"']);
    await filter.getByRole('button', { name: '2 terbuka', exact: true }).click();
    await expect(quotes).toHaveText(['"Kutipan pertama"', '"Kutipan ketiga"']);
    await quotes.last().click();
    await expect.poll(() => editorSelection(page).then(selection => selection.text)).toBe('Kutipan ketiga');

    const resolve = page.getByRole('button', { name: 'Tandai selesai', exact: true });
    await resolve.first().click();
    await expect(quotes).toHaveText(['"Kutipan ketiga"']);
    await resolve.click();
    await expect(page.getByText('Semua catatan revisi sudah selesai.')).toBeVisible();
    await expect(quotes).toHaveCount(0);
    await expect(filter.getByRole('button', { name: '0 terbuka' })).toHaveAttribute('aria-pressed', 'true');
    await filter.getByRole('button', { name: 'Semua', exact: true }).click();
    await expect(quotes).toHaveText(['"Kutipan pertama"', '"Kutipan kedua"', '"Kutipan ketiga"']);
  });
}

for (const width of [1280, 390]) {
  test('pencarian membuka entri yang dipilih dan menyorot cuplikan di ' + width + ' px', async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    if (width === 390) await dismissMobileSidebar(page);
    await openSearch(page, 'Raka');
    const codex = search(page).getByRole('region', { name: 'Hasil Codex' });
    await expect(codex.getByRole('button')).toHaveText([/Kapten kapal/, /Pembuat peta/]);
    await codex.getByRole('button', { name: /Pembuat peta/ }).click();
    const detail = page.getByRole('dialog', { name: /Raka/ });
    await expect(detail.getByText('Pembuat peta.', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Tutup', exact: true }).click();

    await openSearch(page, 'peti emas & perak');
    const chapterResults = search(page).getByRole('region', { name: 'Hasil bab' });
    await expect(chapterResults.locator('mark')).toHaveText('peti emas & perak');
    await chapterResults.getByRole('button', { name: /Kapal pertama/ }).click();
    const marked = editor(page).locator('p').filter({ hasText: 'Kapal pertama' }).locator('[data-chapter-search-highlight]');
    await expect.poll(() => marked.allTextContents().then(parts => parts.join(''))).toBe('peti emas & perak');
    await expect(marked.first()).toBeInViewport({ ratio: 1 });
    await expect(editor(page).locator('p').filter({ hasText: 'Kapal kedua' }).locator('[data-chapter-search-highlight]')).toHaveCount(0);
    await expect(editor(page).locator('[data-chapter-search-highlight]')).toHaveCount(0, { timeout: 8000 });
    await openSearch(page, 'Pembukaan');
    const titleResult = search(page).getByRole('button', { name: 'Pembukaan', exact: true });
    await expect(titleResult.locator('mark')).toHaveCount(0);
    await titleResult.click();
    await expect(editor(page)).toContainText('Awal cerita.');
    await expect(editor(page).locator('[data-chapter-search-highlight]')).toHaveCount(0);
  });
}

for (const width of [1280, 390]) {
  test.describe(`Interaksi kartu pada ${width} px`, () => {
    test.use({ viewport: { width, height: 850 }, hasTouch: width === 390 });

    test('kartu Codex langsung membuka Kemunculan dan menemukan bab lewat alias', async ({ page }) => {
      await page.evaluate(async () => {
        localStorage.setItem('aether_view_mode', 'codex');
        const path = '/src/db.ts';
        const { db }: DbModule = await import(path);
        await db.codex.update(1, { aliases: ['Galang Pusaka'] });
        await db.chapters.update(2, { content: '<p>Ia mengangkat Galang Pusaka dari dermaga.</p>' });
        await db.relationships.bulkAdd(Array.from({ length: 12 }, () => ({
          projectId: 1, sourceId: 1, targetId: 2, type: 'Friend',
        })));
      });
      await page.goto('/');
      if (width === 390) await dismissMobileSidebar(page, true);
      const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Tombak', exact: true }) });
      const shortcut = card.getByRole('button', { name: 'Cek Kemunculan di Chapter' });
      if (width === 390) await shortcut.tap();
      else await shortcut.press('Enter');
      const dialog = page.getByRole('dialog', { name: /Tombak/ });
      await expect(dialog.getByRole('tab', { name: 'Keterkaitan' })).toHaveAttribute('aria-selected', 'true');
      const heading = dialog.getByRole('heading', { name: 'Kemunculan', exact: true });
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport({ ratio: 1 });
      const chapter = dialog.getByRole('button', { name: 'Bab Dermaga', exact: true });
      await expect(chapter).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole('button', { name: 'Cek Kemunculan di Chapter' })).toHaveCount(0);
      await expect(dialog.getByText('Muncul di 1 Chapter:')).toBeVisible();

      await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(shortcut).toBeFocused();
      await card.getByRole('heading', { name: 'Tombak', exact: true }).click();
      await expect(dialog.getByRole('tab', { name: 'Deskripsi & Detail' })).toHaveAttribute('aria-selected', 'true');
      await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
      await expect(dialog).toBeHidden();

      if (width === 1280) {
        const noMatches = page.getByRole('article').filter({ hasText: 'Kapten kapal.' });
        await noMatches.getByRole('button', { name: 'Cek Kemunculan di Chapter' }).click();
        const emptyDialog = page.getByRole('dialog', { name: /Raka/ });
        await expect(emptyDialog.getByText('Belum ditemukan di chapter mana pun.')).toBeVisible();
        await emptyDialog.getByRole('button', { name: 'Tutup', exact: true }).click();
        await expect(emptyDialog).toBeHidden();
      }

      await card.getByRole('button', { name: 'Cek Kemunculan di Chapter' }).click();
      await chapter.click();
      await expect(editor(page)).toContainText('Ia mengangkat Galang Pusaka dari dermaga.');
    });

    test('menu Opsi Snippet terlihat dan bisa mengubah serta menghapus kartu', async ({ page }) => {
      await page.evaluate(async () => {
        localStorage.setItem('aether_view_mode', 'actions');
        const path = '/src/db.ts';
        const { db }: DbModule = await import(path);
        await db.aiActions.bulkAdd([
          { projectId: 1, label: 'Tenun uji', prompt: 'Perjelas kutipan.' },
          { projectId: 1, label: 'Kartu lain', prompt: 'Rapikan kalimat.' },
        ]);
      });
      await page.goto('/');
      if (width === 390) {
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
        await dismissMobileSidebar(page, true);
      }
      const options = page.getByRole('button', { name: 'Opsi Tenun uji', exact: true });
      await options.scrollIntoViewIfNeeded();
      await expect(options).toBeInViewport();
      await expect(options).toHaveCSS('opacity', '1');
      if (width === 390) await options.tap();
      else {
        await options.press('Enter');
        await expect(options).toHaveAttribute('aria-expanded', 'true');
        await options.press('Escape');
        await expect(options).toHaveAttribute('aria-expanded', 'false');
        await expect(options).toBeFocused();
        await options.press('Enter');
      }
      const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Tenun uji', exact: true }) });
      const edit = card.getByRole('button', { name: 'Ubah', exact: true });
      if (width === 390) await edit.tap();
      else await edit.click();
      const label = page.getByPlaceholder('mis. Bikin Mencekam');
      await expect(label).toBeFocused();
      await expect(label).toHaveValue('Tenun uji');
      await label.fill('Tenun perbaikan');
      await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
      const updated = page.getByRole('button', { name: 'Opsi Tenun perbaikan', exact: true });
      if (width === 390) await updated.tap();
      else await updated.click();
      const remove = page.getByRole('button', { name: 'Hapus', exact: true });
      if (width === 390) await remove.tap();
      else await remove.click();
      await expect(updated).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Opsi Kartu lain', exact: true })).toBeVisible();
    });
  });
}

test('pencarian tetap terbuka jika penyimpanan draf menghalangi navigasi', async ({ page }) => {
  await page.goto('/');
  await expect(editor(page)).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/features/editor/editorBridge.ts';
    const { registerActiveEditor }: typeof import('../src/features/editor/editorBridge') = await import(path);
    registerActiveEditor({
      getChapterId: () => 1,
      flush: async () => { throw new Error('Penyimpanan uji gagal'); },
      reload: async () => {},
    });
  });
  await openSearch(page, 'Raka');
  const result = search(page).getByRole('button', { name: /Pembuat peta/ });
  await result.click();
  await expect(result).toBeEnabled();
  await expect(search(page).getByText('Tujuan belum bisa dibuka. Coba lagi.')).toBeVisible();
  await expect(search(page)).toBeVisible();
  await expect(editor(page)).toContainText('Awal cerita.');
});

test('pencarian kembali membuka bab biasa ketika sasaran sudah hilang dari editor aktif', async ({ page }) => {
  await page.goto('/');
  const content = editor(page);
  await expect(content).toContainText('Kutipan asli.');
  await openSearch(page, 'kutipan asli');
  const result = search(page).getByRole('button', { name: /Pembukaan/ });
  await expect(result.locator('mark')).toHaveText('Kutipan asli');
  await content.evaluate(element => {
    const { editor } = element as HTMLElement & { editor: import('@tiptap/core').Editor };
    editor.commands.setContent('<p>Kalimat yang berbeda.</p>', { emitUpdate: false });
  });
  await result.click();
  await expect(search(page)).toBeHidden();
  await expect(page.getByText('Bab dibuka. Letak cuplikan hasil pencarian sudah berubah.', { exact: true })).toBeVisible();
  await expect(content.locator('[data-chapter-search-highlight]')).toHaveCount(0);
});

test('nilai templat Codex bertahan saat disunting dan dipindah kategori', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'codex'));
  await page.goto('/');
  await page.getByTitle('Kelola kategori Codex', { exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Kelola Kategori' });
  const sourceCategory = manager.getByRole('region', { name: 'Kategori kustom' })
    .getByText(/^Pusaka/).locator('..').locator('..');
  const manageFields = sourceCategory.getByTitle('Kelola field terstruktur (mis. Habitat, Kelemahan)');
  await manageFields.click();
  await sourceCategory.getByTitle('Hapus field', { exact: true }).click();
  await expect(sourceCategory.getByTitle('Hapus field', { exact: true })).toHaveCount(0);
  await manager.getByRole('button', { name: 'Tutup', exact: true }).click();

  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Tombak', exact: true }) });
  const edit = card.getByTitle('Ubah Entri', { exact: true });
  const form = page.locator('[data-codex-form]');
  const save = form.getByRole('button', { name: 'Simpan Perubahan' });
  const remove = form.getByRole('button', { name: 'Hapus nilai lama Asal' });
  await edit.click();
  await expect(form.getByText('Desa Awan', { exact: false })).toBeVisible();
  await form.getByPlaceholder('Deskripsikan sejarah atau sifat unik untuk memberi konteks pada AI...').fill('Pusaka penjaga yang masih utuh.');
  await save.click();
  await expect(form).toHaveCount(0);
  await expect(card.getByText('Desa Awan', { exact: true })).toBeVisible();

  await page.getByTitle('Kelola kategori Codex', { exact: true }).click();
  await manageFields.click();
  await sourceCategory.getByPlaceholder('Nama field, mis. Habitat').fill('Asal');
  await sourceCategory.getByRole('button', { name: 'Field', exact: true }).click();
  await expect(sourceCategory.getByTitle('Hapus field', { exact: true })).toBeVisible();
  await manager.getByRole('button', { name: 'Tutup', exact: true }).click();
  await edit.click();
  await expect(form.getByRole('textbox', { name: 'Asal', exact: true })).toHaveValue('Desa Awan');
  await form.getByRole('combobox', { name: 'Kategori', exact: true }).selectOption('barang');
  await expect(form.getByRole('textbox', { name: 'Asal', exact: true })).toHaveValue('');
  await form.getByRole('textbox', { name: 'Asal', exact: true }).fill('Pelabuhan Baru');
  await save.click();
  await expect(form).toHaveCount(0);
  await edit.click();
  await expect(form.getByRole('textbox', { name: 'Asal', exact: true })).toHaveValue('Pelabuhan Baru');
  await expect(remove).toBeVisible();
  await remove.click();
  await form.getByRole('button', { name: 'Batal', exact: true }).click();
  await edit.click();
  await expect(remove).toBeVisible();
  await remove.click();
  await save.click();
  await expect(form).toHaveCount(0);
  await edit.click();
  await expect(remove).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: 'Asal', exact: true })).toHaveValue('Pelabuhan Baru');
});

test('form Codex mempertahankan koma dan spasi saat mengetik alias dan tag', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'codex'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Entri Baru', exact: true }).click();
  const form = page.locator('[data-codex-form]');
  const aliases = form.getByRole('textbox', { name: 'Alias', exact: true });
  const tags = form.getByRole('textbox', { name: 'Tag', exact: true });
  await form.getByPlaceholder('misal: Kota Angin').fill('Laras');
  await form.getByPlaceholder(/Deskripsikan sejarah/).fill('Penjaga arsip kerajaan.');
  await aliases.pressSequentially('Rara, Bu Laras');
  await tags.pressSequentially('tokoh utama, penjaga arsip');
  await expect(aliases).toHaveValue('Rara, Bu Laras');
  await expect(tags).toHaveValue('tokoh utama, penjaga arsip');
  await form.getByRole('button', { name: 'Buat Entri', exact: true }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Laras', exact: true }) });
  await expect(card.getByText('Rara', { exact: true })).toBeVisible();
  await expect(card.getByText('Bu Laras', { exact: true })).toBeVisible();
  await expect(card.getByText('#tokoh utama', { exact: true })).toBeVisible();
  await expect(card.getByText('#penjaga arsip', { exact: true })).toBeVisible();
  await card.getByTitle('Ubah Entri', { exact: true }).click();
  await expect(aliases).toHaveValue('Rara, Bu Laras');
  await expect(tags).toHaveValue('tokoh utama, penjaga arsip');
  await aliases.fill(' , Bu Laras ,, ');
  await tags.clear();
  await form.getByRole('button', { name: 'Simpan Perubahan' }).click();
  await expect(form).toHaveCount(0);
  await expect(card.getByText('Rara', { exact: true })).toHaveCount(0);
  await card.getByTitle('Ubah Entri', { exact: true }).click();
  await expect(aliases).toHaveValue('Bu Laras');
  await expect(tags).toHaveValue('');
});

test('tanggal lahir Codex tersimpan saat dibuat, diubah, dan dihapus', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'codex'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Entri Baru', exact: true }).click();
  const form = page.locator('[data-codex-form]');
  const setDate = form.getByRole('button', { name: 'Tetapkan tanggal lahir' });
  const era = form.getByLabel('Era Lahir');
  const year = form.getByLabel('Tahun Lahir');
  const month = form.getByLabel('Bulan Lahir');
  const day = form.getByLabel('Hari Lahir');
  await form.getByPlaceholder('misal: Kota Angin').fill('Laras');
  await form.getByPlaceholder(/Deskripsikan sejarah/).fill('Penjaga arsip kerajaan.');
  await setDate.click();
  await era.selectOption('1');
  await year.fill('127');
  await month.selectOption('3');
  await day.fill('17');
  await form.getByRole('button', { name: 'Buat Entri', exact: true }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Laras', exact: true }) });
  const edit = card.getByTitle('Ubah Entri', { exact: true });
  const save = form.getByRole('button', { name: 'Simpan Perubahan' });
  await edit.click();
  await expect(era).toHaveValue('1');
  await expect(year).toHaveValue('127');
  await expect(month).toHaveValue('3');
  await expect(day).toHaveValue('17');

  await era.selectOption('2');
  await year.fill('128');
  await month.selectOption('4');
  await day.fill('21');
  await save.click();
  await expect(form).toHaveCount(0);
  await page.reload();
  await edit.click();
  await expect(era).toHaveValue('2');
  await expect(year).toHaveValue('128');
  await expect(month).toHaveValue('4');
  await expect(day).toHaveValue('21');

  await form.getByRole('button', { name: 'Hapus', exact: true }).click();
  await save.click();
  await expect(form).toHaveCount(0);
  await page.reload();
  await edit.click();
  await expect(setDate).toBeVisible();
  await expect(day).toHaveCount(0);
});

async function setupSnippet(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ollama_enabled', 'true');
    localStorage.setItem('ai_provider', 'ollama');
    window.outputRequests = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (input !== '/api/ai/proxy') return realFetch(input, init);
      window.outputRequests.push(JSON.parse(String(init?.body)).body.max_tokens);
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          window.replyChunk = (content, reason) => {
            const frame = { choices: [{ delta: { content }, finish_reason: reason }] };
            controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(frame) + '\n\n'));
            if (reason) controller.close();
          };
        },
      })));
    };
  });
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    await db.aiActions.add({ projectId: 1, label: 'Tenun uji', prompt: 'Perjelas kutipan' });
  });
}

async function selectSnippetParagraph(page: Page) {
  const content = editor(page);
  await content.focus();
  await content.locator('p').nth(1).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
}

test('Snippet mengunci aksi saat stream dan meminta konfirmasi sasaran baru', async ({ page }) => {
  await setupSnippet(page);
  await page.goto('/');
  const content = editor(page);
  await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
  const paragraph = content.locator('p').nth(1);
  const select = () => selectSnippetParagraph(page);
  await expect(paragraph).toHaveText('Kutipan asli.');
  await select();
  const menu = page.locator('#selection-floating-menu');
  await menu.getByRole('button', { name: 'Buka menu Asisten AI' }).click();
  await menu.getByText('Tenun uji', { exact: true }).click();
  await page.waitForFunction(() => typeof window.replyChunk === 'function');
  expect(await page.evaluate(() => window.outputRequests)).toEqual([4096]);
  await expect(menu.getByRole('status')).toHaveText('Menunggu balasan AI…');
  await expect(menu.getByRole('button', { name: 'Batalkan', exact: true })).toBeVisible();
  await page.evaluate(() => window.replyChunk('Kutipan'));
  await expect(menu.getByText('Kutipan', { exact: true })).toBeVisible();
  await expect(menu.getByRole('status')).toHaveText('AI sedang menyusun hasil…');
  await expect(menu.getByRole('button', { name: 'Ganti Teks' })).toBeDisabled();
  await expect(menu.getByRole('button', { name: 'Sisipkan di Bawah' })).toBeDisabled();

  await select();
  await page.keyboard.insertText('Kutipan disunting.');
  await expect(paragraph).toHaveText('Kutipan disunting.');
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate(() => window.replyChunk(' yang baru.', 'stop'));
  await expect(menu.getByText('Kutipan yang baru.', { exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Ganti Teks' })).toBeDisabled();
  await select();
  await menu.getByRole('button', { name: 'Gunakan Seleksi Ini' }).click();
  await expect(menu.getByRole('status')).toHaveText('Hasil siap diterapkan.');
  await expect(menu.getByRole('button', { name: 'Ganti Teks' })).toBeEnabled();
  await menu.getByRole('button', { name: 'Ganti Teks' }).click();
  await expect(paragraph).toHaveText('Kutipan yang baru.');
  await expect(content.locator('p').first()).toHaveText('Awal cerita.');

  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    const saved = await db.chapters.get(1);
    const snapshots = await db.snapshots.where('chapterId').equals(1).toArray();
    return {
      text: saved?.content,
      snapshot: snapshots.some(row => row.auto && row.content.includes('Kutipan disunting.')),
    };
  })).toEqual({
    text: '<p>Awal cerita.</p><p>Kutipan yang baru.</p>',
    snapshot: true,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
  await expect(paragraph).toHaveText('Kutipan yang baru.');
  await select();
  await menu.getByRole('button', { name: 'Buka menu Asisten AI' }).click();
  await menu.getByText('Tenun uji', { exact: true }).click();
  await page.waitForFunction(() => typeof window.replyChunk === 'function');
  await page.evaluate(() => window.replyChunk('Potongan balasan.', 'length'));
  await expect(menu.getByText('Potongan balasan.', { exact: true })).toBeVisible();
  await expect(menu.getByRole('status')).toHaveText('Balasan mencapai batas panjang dan belum lengkap.');
  await expect(menu.getByRole('button', { name: 'Ganti Teks' })).toBeDisabled();
  await expect(menu.getByRole('button', { name: 'Sisipkan di Bawah' })).toBeDisabled();
  await expect(paragraph).toHaveText('Kutipan yang baru.');
});

test('Snippet menyorot hanya sisipan di ponsel dan menghapus sorotan setelah pindah bab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await setupSnippet(page);
  await page.goto('/');
  const content = editor(page);
  await expect(content).toContainText('Kutipan asli.');
  await dismissMobileSidebar(page);
  await selectSnippetParagraph(page);
  const menu = page.locator('#selection-floating-menu');
  await menu.getByRole('button', { name: 'Buka menu Asisten AI' }).click();
  await menu.getByText('Tenun uji', { exact: true }).click();
  await page.waitForFunction(() => typeof window.replyChunk === 'function');
  await expect(menu.getByText('Menunggu balasan AI…', { exact: true })).toBeInViewport({ ratio: 1 });
  await page.evaluate(() => window.replyChunk('Paragraf tambahan.\n\nLanjutan baru.', 'stop'));
  await menu.getByRole('button', { name: 'Sisipkan di Bawah' }).click();

  const highlight = content.locator('[data-snippet-insertion-highlight]');
  await expect(highlight).toHaveText('Paragraf tambahan. Lanjutan baru.');
  await expect(highlight).toBeInViewport({ ratio: 1 });
  await expect(page.getByText('Teks baru disisipkan.', { exact: true })).toBeVisible();
  await openSearch(page, 'Bab Dermaga');
  await search(page).getByRole('button', { name: 'Bab Dermaga', exact: true }).click();
  await expect(content).toContainText('Gelombang reda.');
  await expect(highlight).toHaveCount(0);
  await openSearch(page, 'Pembukaan');
  await search(page).getByRole('button', { name: 'Pembukaan', exact: true }).click();
  await expect(content).toContainText('Paragraf tambahan.');
  await expect(highlight).toHaveCount(0);
});
