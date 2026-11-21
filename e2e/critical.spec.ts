import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, page, baseURL }) => {
  // Each test gets Playwright's fresh browser context and native IndexedDB.
  // No real provider, Drive, model download, or user profile may be used.
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== baseURL) return route.abort();
    return route.continue();
  });
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__e2e_seed', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('/__e2e_seed');
  await page.evaluate(async () => {
    const modulePath = '/src/db.ts';
    const { db } = await import(modulePath);
    await db.projects.add({ id: 1, name: 'F24 Synthetic Novel', description: '', createdAt: 1, lastOpened: 1 });
    await db.chapters.add({ id: 1, projectId: 1, title: 'F24 Chapter', content: '<p>F24 starting manuscript</p>', order: 0, lastModified: 1 });
  });
  await page.goto('/');
  await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();
});

test('F05 editor persists a draft across reload', async ({ page }) => {
  const editor = page.locator('.tiptap[contenteditable="true"]');
  await editor.fill('Draft browser F24');
  await expect.poll(() => page.evaluate(async () => {
    const modulePath = '/src/db.ts';
    const { db } = await import(modulePath);
    return (await db.chapters.toArray()).some((chapter: any) => chapter.content.includes('Draft browser F24'));
  })).toBe(true);
  await page.reload();
  await expect(editor).toHaveText('Draft browser F24');
});

test('novel notes share chapter links, colors and archive state with the editor', async ({ page }) => {
  const tabs = page.getByRole('navigation', { name: /Sub-navigasi/ });
  await page.getByRole('button', { name: 'Catatan Revisi' }).click();
  await page.getByRole('button', { name: '+ Catatan Bab', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'F24 Chapter' })).toBeChecked();
  await page.getByLabel('Judul (opsional)').fill('Pengingat');
  await page.getByLabel('Isi catatan').fill('Cek urutan surat');
  await page.getByLabel('Tag (pisahkan dengan koma)').fill('Revisi');
  await page.getByLabel('Warna').selectOption({ label: 'Kuning' });
  await page.getByRole('button', { name: 'Pilih semua bab saat ini' }).click();
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText('Cek urutan surat')).toBeVisible();
  await tabs.getByRole('button', { name: 'Catatan', exact: true }).click();
  await page.getByRole('button', { name: '+ Catatan', exact: true }).click();
  await page.getByLabel('Tag (pisahkan dengan koma)').fill('Ide');
  await page.getByLabel('Tambahkan tag yang sudah ada').selectOption('Revisi');
  await expect(page.getByLabel('Tag (pisahkan dengan koma)')).toHaveValue('Ide, Revisi');
  await expect(page.getByLabel('Tambahkan tag yang sudah ada')).toHaveCount(0);
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Cari catatan' }).fill('surat');
  await page.getByLabel('Filter tag').selectOption({ label: 'Revisi' });
  const card = page.getByText('Cek urutan surat').locator('..');
  await expect(card).toHaveCSS('border-left-color', 'rgb(245, 158, 11)');
  await card.getByRole('button', { name: 'Arsipkan' }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Lihat arsip' }).click();
  await card.getByRole('button', { name: 'Pulihkan' }).click();
  await expect(card).toHaveCount(0);
  await tabs.getByRole('button', { name: 'Editor', exact: true }).click();
  await page.getByRole('button', { name: 'Catatan Revisi' }).click();
  await expect(page.getByText('Cek urutan surat')).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Tutup panel editor' }).click();
  await expect(page.getByText('Cek urutan surat')).toBeHidden();
});

test('chapter Codex follows live text and distinguishes ambiguous aliases', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db } = await import(path);
    const entry = { projectId: 1, category: 'character', description: '', aliases: ['Kapten'], tags: [] };
    await db.codex.bulkAdd([{ ...entry, name: 'Raka' }, { ...entry, name: 'Mira' }]);
  });
  const editor = page.locator('.tiptap[contenteditable="true"]');
  await page.getByRole('button', { name: 'Codex di Bab Ini' }).click();
  await editor.fill('Raka bertemu Kapten.');
  await expect(page.getByRole('heading', { name: 'Penyebutan ambigu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mira', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Raka.*1 penyebutan/ }).click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Raka');
  await editor.fill('Teks baru.');
  await expect(page.getByText('Belum ada entitas Codex yang terdeteksi di bab ini.')).toBeVisible();
  await editor.fill('Mira tiba.');
  await page.getByRole('button', { name: 'Mira', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mira' })).toBeVisible();
});

test('DB01 failed autosave keeps the editor open until navigation can save the draft', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db } = await import(path);
    await db.chapters.add({ projectId: 1, title: 'Bab kedua', content: '<p>Isi bab kedua</p>', order: 1, lastModified: 1 });
    const audit = { attempts: 0, update: db.chapters.update.bind(db.chapters) };
    Reflect.set(window, 'draftNavigationAudit', audit);
    db.chapters.update = async () => {
      audit.attempts++;
      throw new DOMException('Injected quota failure', 'QuotaExceededError');
    };
  });
  const editor = page.locator('.tiptap[contenteditable="true"]');
  await editor.fill('Draf harus tetap terbuka');
  await expect(page.getByRole('status').filter({ hasText: 'Gagal menyimpan' })).toBeVisible();

  const tabs = page.getByRole('navigation', { name: /Sub-navigasi/ });
  const attempts = () => page.evaluate(() => Reflect.get(window, 'draftNavigationAudit').attempts);
  const outline = tabs.getByRole('button', { name: 'Outline', exact: true });
  await outline.click();
  await expect.poll(attempts).toBe(2);
  await expect(editor).toHaveText('Draf harus tetap terbuka');
  expect(await page.evaluate(() => localStorage.getItem('aether_view_mode'))).toBe('write');

  await page.locator('aside').getByText('Bab kedua', { exact: true }).click();
  await expect.poll(attempts).toBe(3);
  await expect(editor).toHaveText('Draf harus tetap terbuka');

  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db } = await import(path);
    db.chapters.update = Reflect.get(window, 'draftNavigationAudit').update;
  });
  await outline.click();
  await expect(editor).toHaveCount(0);
  await tabs.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(editor).toHaveText('Draf harus tetap terbuka');
  await page.reload();
  await expect(editor).toHaveText('Draf harus tetap terbuka');
});

for (const dirty of [false, true]) {
  test(`DB01 backup from an older tab preserves newer text (${dirty ? 'local draft' : 'untouched editor'})`, async ({ page, context }) => {
    const writer = await context.newPage();
    await writer.route('**/__backup_writer', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await writer.goto('/__backup_writer');
    const current = await writer.evaluate(async () => {
      const chapterPath = '/src/services/chapterOperations.ts';
      const queryPath = '/src/services/chapterQueries.ts';
      const { saveChapterContent } = await import(chapterPath);
      const { readChapter } = await import(queryPath);
      await saveChapterContent(1, '<p>Versi terbaru dari tab lain</p>', '<p>F24 starting manuscript</p>');
      const chapter = await readChapter(1);
      return { content: chapter.content, lastModified: chapter.lastModified };
    });

    const editor = page.locator('.tiptap[contenteditable="true"]');
    await expect(editor).toHaveText('F24 starting manuscript');
    if (dirty) {
      await editor.fill('Draf lokal dari tab lama');
      await expect(page.getByRole('status').filter({ hasText: 'Isi bab telah berubah' })).toBeVisible();
    }

    const result = await page.evaluate(async () => {
      const path = '/src/services/backupService.ts';
      const { backupService } = await import(path);
      try {
        const { data } = await backupService.collectAllData();
        return { content: data.chapters[0].content, lastModified: data.chapters[0].lastModified };
      } catch (error) {
        return { error: error.name };
      }
    });

    expect(result).toEqual(dirty ? { error: 'ChapterContentConflictError' } : current);
    if (dirty) await expect(editor).toHaveText('Draf lokal dari tab lama');
    expect(await writer.evaluate(async () => {
      const path = '/src/services/chapterQueries.ts';
      const { readChapter } = await import(path);
      const chapter = await readChapter(1);
      return { content: chapter.content, lastModified: chapter.lastModified };
    })).toEqual(current);
  });
}

test('DB05 chapter list and snapshot history refresh after writes in another tab', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Riwayat Versi' }).click();
  await expect(page.getByText('Belum ada snapshot tersimpan.')).toBeVisible();

  const writer = await context.newPage();
  await writer.route('**/__db05_writer', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await writer.goto('/__db05_writer');
  await writer.evaluate(async () => {
    const chapterPath = '/src/services/chapterOperations.ts';
    const snapshotPath = '/src/services/snapshotService.ts';
    const { updateChapter } = await import(chapterPath);
    const { addSnapshot } = await import(snapshotPath);
    await updateChapter(1, { title: 'Judul dari tab lain' });
    await addSnapshot({ chapterId: 1, content: '<p>Versi lama</p>', label: 'Versi dari tab lain', timestamp: Date.now() });
  });

  await expect(page.getByText('Judul dari tab lain', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Versi dari tab lain', { exact: true })).toBeVisible();
});

test('DB05 failed restore rolls back the safety snapshot and preserves the manuscript', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const dbPath = '/src/db.ts';
    const chapterPath = '/src/services/chapterOperations.ts';
    const snapshotPath = '/src/services/snapshotService.ts';
    const { db } = await import(dbPath);
    const { restoreChapterSnapshot } = await import(chapterPath);
    const { addSnapshot } = await import(snapshotPath);
    const snapshotId = await addSnapshot({ chapterId: 1, content: '<p>Versi lama</p>', label: 'Manual', timestamp: 1 });
    const update = db.chapters.update;
    db.chapters.update = async () => { throw new DOMException('Injected write failure', 'QuotaExceededError'); };
    let failure: { name: string; kind: string } | undefined;
    try {
      await restoreChapterSnapshot(1, snapshotId);
    } catch (error) {
      failure = { name: error.name, kind: error.kind };
    } finally {
      db.chapters.update = update;
    }
    return {
      failure,
      chapter: await db.chapters.get(1),
      snapshotIds: await db.snapshots.toCollection().primaryKeys(),
      snapshotId,
    };
  });
  expect(result.failure).toEqual({ name: 'ChapterStorageError', kind: 'quota' });
  expect(result.chapter.content).toBe('<p>F24 starting manuscript</p>');
  expect(result.snapshotIds).toEqual([result.snapshotId]);
  await expect(page.locator('.tiptap[contenteditable="true"]')).toHaveText('F24 starting manuscript');
});

test('F05 failed save rejects flush, keeps draft, and permits retry', async ({ page }) => {
  await page.evaluate(async () => {
    const modulePath = '/src/db.ts';
    const { db } = await import(modulePath);
    (window as any).restoreChapterUpdate = db.chapters.update.bind(db.chapters);
    db.chapters.update = async () => { throw new Error('F24 synthetic write failure'); };
  });
  await page.locator('.tiptap[contenteditable="true"]').fill('Draft survives failure');
  const failed = await page.evaluate(async () => {
    const bridgePath = '/src/features/editor/editorBridge.ts';
    const { flushActiveEditor } = await import(bridgePath);
    try { await flushActiveEditor(); return false; } catch { return true; }
  });
  expect(failed).toBe(true);
  await expect(page.getByRole('status').filter({ hasText: 'Gagal menyimpan' })).toBeVisible();
  await expect(page.locator('.tiptap[contenteditable="true"]')).toHaveText('Draft survives failure');
  await page.evaluate(async () => {
    const dbPath = '/src/db.ts'; const bridgePath = '/src/features/editor/editorBridge.ts';
    const { db } = await import(dbPath);
    db.chapters.update = (window as any).restoreChapterUpdate;
    const { flushActiveEditor } = await import(bridgePath);
    await flushActiveEditor();
  });
  await expect(page.getByRole('status').filter({ hasText: 'Isi bab tersimpan' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.tiptap[contenteditable="true"]')).toHaveText('Draft survives failure');
});

test('F06 duplication flushes the active editor into native IndexedDB', async ({ page }) => {
  await page.locator('.tiptap[contenteditable="true"]').fill('Unsaved source for duplicate');
  const rows = await page.evaluate(async () => {
    const dbPath = '/src/db.ts'; const operationPath = '/src/services/chapterOperations.ts';
    const bridgePath = '/src/features/editor/editorBridge.ts';
    const { db } = await import(dbPath);
    const { changeChapters } = await import(operationPath);
    const { getActiveEditorChapterId } = await import(bridgePath);
    const source = await db.chapters.get(getActiveEditorChapterId());
    const duplicateId = await changeChapters(source.projectId, 'duplicate', source.id);
    return { source: await db.chapters.get(source.id), duplicate: await db.chapters.get(duplicateId) };
  });
  expect(rows.duplicate.id).not.toBe(rows.source.id);
  expect(rows.duplicate.content).toContain('Unsaved source for duplicate');
  expect(rows.duplicate.content).toBe(rows.source.content);
  expect(rows.duplicate.order).toBe(rows.source.order + 1);
});

test('F10 project round-trip remaps triage; F04 invalid restore is non-destructive', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const dbPath = '/src/db.ts'; const backupPath = '/src/services/backupService.ts';
    const { db } = await import(dbPath);
    const { backupService } = await import(backupPath);
    const project = await db.projects.toCollection().first();
    const codexId = await db.codex.add({ projectId: project.id, name: 'F24 Entity', category: 'character', aliases: [], tags: [], description: '' });
    await db.continuityTriage.add({ projectId: project.id, findingId: `gap-${codexId}`, status: 'acknowledged', timestamp: 1 });
    const backup = await backupService.collectProjectData(project.id);
    const imported = await backupService.importProjectData(JSON.parse(JSON.stringify(backup)));
    const entity = await db.codex.where('projectId').equals(imported.projectId).first();
    const triage = await db.continuityTriage.where('projectId').equals(imported.projectId).toArray();
    const before = JSON.stringify(await db.projects.toArray());
    let rejected = false;
    try { await backupService.restoreData({ version: 999, data: {} }); } catch { rejected = true; }
    return { codexId, newId: entity.id, triage, rejected, unchanged: before === JSON.stringify(await db.projects.toArray()) };
  });
  expect(result.newId).not.toBe(result.codexId);
  expect(result.triage).toEqual([expect.objectContaining({ findingId: `gap-${result.newId}`, status: 'acknowledged' })]);
  expect(result.rejected).toBe(true);
  expect(result.unchanged).toBe(true);
});

test('F08/F09 native Orama worker indexes committed changes and isolates projects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const dbPath = '/src/db.ts'; const searchPath = '/src/services/rag/oramaSync.ts';
    const { db } = await import(dbPath);
    const { oramaSync } = await import(searchPath);
    const project = await db.projects.toCollection().first();
    oramaSync.setupHooks();
    const id = await db.codex.add({ projectId: project.id, name: 'F24Phoenix', category: 'character', aliases: [], tags: [], description: '' });
    const hits = await oramaSync.searchWithScores(project.id, 'F24Phoenix');
    const other = await oramaSync.searchWithScores(project.id + 1000, 'F24Phoenix');
    await db.codex.delete(id);
    const removed = await oramaSync.searchWithScores(project.id, 'F24Phoenix');
    return { id, hits: hits.map((hit: any) => hit.entry.id), other, removed };
  });
  expect(result.hits).toContain(result.id);
  expect(result.other).toEqual([]);
  expect(result.removed).toEqual([]);
});

test('F03 native Blob/gzip backup restores Atlas and retains a safety snapshot', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const dbPath = '/src/db.ts'; const backupPath = '/src/services/backupService.ts';
    const { db } = await import(dbPath);
    const { backupService } = await import(backupPath);
    const project = await db.projects.toCollection().first();
    const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const id = await db.maps.add({ projectId: project.id, name: 'Original Atlas', width: 1, height: 1, createdAt: 1, imageBlob: new Blob([image], { type: 'image/png' }) });
    const backup = await backupService.collectAllData();
    await db.maps.update(id, { name: 'Changed Atlas' });
    await backupService.restoreData(JSON.parse(JSON.stringify(backup)));
    const restored = await db.maps.get(id);
    const snapshots = (await db.backups.toArray()).filter((row: any) => row.kind === 'pre-restore');
    return {
      name: restored.name,
      nativeBlob: restored.imageBlob instanceof Blob,
      bytes: [...new Uint8Array(await restored.imageBlob.arrayBuffer())],
      expected: [...image],
      snapshots: snapshots.length,
      gzip: snapshots.every((row: any) => row.compressed && row.data instanceof Uint8Array && row.data[0] === 0x1f && row.data[1] === 0x8b),
    };
  });
  expect(result.name).toBe('Original Atlas');
  expect(result.nativeBlob).toBe(true);
  expect(result.bytes).toEqual(result.expected);
  expect(result.snapshots).toBeGreaterThan(0);
  expect(result.gzip).toBe(true);
});

test('F16 context facade communicates with a native worker without a model download', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/contextEngine.ts';
    const { countTokens, getCodexMatches } = await import(modulePath);
    const [tokens, matches] = await Promise.all([
      countTokens('Hello world', 'gpt-4o-mini'),
      getCodexMatches([{ text: 'F24Wizard arrives', pos: 0 }], [{ id: 991, projectId: 1, name: 'F24Wizard', aliases: [], category: 'character', tags: [], description: '' }]),
    ]);
    return { tokens, matches };
  });
  expect(result.tokens).toBeGreaterThan(0);
  expect(result.matches).toEqual([{ codexId: 991, start: 0, end: 9 }]);
});

test('F27 settings keep session keys out of persistent storage and clear saved keys', async ({ page }) => {
  await page.route('**/api/ai/ollama-models', route => route.fulfill({ json: { models: [] } }));
  await page.getByRole('button', { name: 'Pengaturan Aplikasi' }).click();
  const mode = page.getByLabel('Penyimpanan API key');
  const key = page.getByLabel('API key OpenAI', { exact: true });
  const save = page.getByRole('button', { name: /Simpan Kredensial|Tersimpan!/ });
  await expect(mode).toHaveValue('session');
  await key.fill('F27-SYNTHETIC-SESSION');
  await save.click();
  expect(await page.evaluate(() => localStorage.getItem('ai_key_openai'))).toBeNull();
  await page.reload();
  await expect(key).toHaveValue('F27-SYNTHETIC-SESSION');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(key).toHaveValue('');
  await key.fill('F27-SYNTHETIC-PERSISTENT');
  await mode.selectOption('persistent');
  await save.click();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(key).toHaveValue('F27-SYNTHETIC-PERSISTENT');
  await page.getByRole('button', { name: 'Hapus semua API key dari browser ini' }).click();
  await expect(key).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('ai_key_openai'))).toBeNull();
});

for (const [legacy, current] of [['arc', 'continuity'], ['orphans', 'completeness'], ['unknown-panel', 'write'], ['workshop', 'codex']]) {
  test(`F26 restores ${legacy} into ${current} without changing manuscript`, async ({ page }) => {
    await page.evaluate(mode => localStorage.setItem('aether_view_mode', mode), legacy);
    await page.reload();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('aether_view_mode'))).toBe(current);
    if (current === 'write') await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();
    else await expect(page.locator('main')).toContainText(current === 'continuity' ? 'Peta Kontinuitas' : current === 'completeness' ? 'Saran Entitas (Yatim)' : 'Codex');
    const records = await page.evaluate(async () => {
      const modulePath = '/src/db.ts'; const { db } = await import(modulePath);
      return { projects: await db.projects.count(), chapters: await db.chapters.toArray() };
    });
    expect(records.projects).toBe(1);
    expect(records.chapters).toHaveLength(1);
    expect(records.chapters[0].content).toContain('F24 starting manuscript');
  });
}

test('Codex health tabs scroll with the panel content', async ({ page }) => {
  await page.evaluate(async () => {
    const modulePath = '/src/db.ts';
    const { db } = await import(modulePath);
    await db.codex.add({ projectId: 1, name: 'Penjaga Arsip', category: 'character', description: '', aliases: [], tags: [] });
    localStorage.setItem('aether_view_mode', 'completeness');
  });
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.reload();

  const panel = page.locator('main');
  const completenessTab = panel.getByRole('button', { name: 'Kelengkapan Dunia', exact: true });
  const orphansTab = panel.getByRole('button', { name: 'Saran Entitas (Yatim)', exact: true });
  const completenessHeading = panel.getByRole('heading', { name: 'Kelengkapan Dunia', exact: true });
  await expect(completenessHeading).toBeVisible();
  const top = (locator: typeof completenessTab) => locator.evaluate(element => element.getBoundingClientRect().top);
  const initialTabTop = await top(completenessTab);
  const initialHeadingTop = await top(completenessHeading);
  await completenessTab.hover();
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => initialHeadingTop - await top(completenessHeading)).toBeGreaterThan(50);
  await expect.poll(async () => {
    const tabShift = initialTabTop - await top(completenessTab);
    const headingShift = initialHeadingTop - await top(completenessHeading);
    return Math.abs(tabShift - headingShift);
  }).toBeLessThan(2);

  await page.getByRole('button', { name: 'Tampilkan/Sembunyikan Sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 560 });
  await orphansTab.click();
  const orphansHeading = panel.getByRole('heading', { name: 'Entitas Yatim', exact: true });
  await expect(orphansHeading).toBeInViewport();
  const orphanTabBottom = await orphansTab.evaluate(element => element.getBoundingClientRect().bottom);
  expect(await top(orphansHeading)).toBeGreaterThan(orphanTabBottom);
  await completenessTab.click();
  await expect(completenessHeading).toBeInViewport();
});

test('F25 native modal contains keyboard focus, handles nesting and restores triggers', async ({ page }) => {
  await page.evaluate(async () => {
    const modulePath = '/e2e/dialogFixture.tsx';
    (window as any).dialogFixture = (await import(modulePath)).mountDialogFixture();
  });
  const trigger = page.getByRole('button', { name: 'Buka dialog uji', exact: true });
  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: 'Dialog uji F25' });
  await expect(dialog).toHaveAccessibleDescription('Konfirmasi fixture sintetis. Buka dialog kedua');
  await expect(dialog.getByRole('button', { name: 'Batal' })).toBeFocused();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Buka dialog kedua' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Dialog kedua' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('button', { name: 'Buka dialog kedua' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('F25 busy modal blocks Escape/backdrop until the operation completes', async ({ page }) => {
  await page.evaluate(async () => {
    const modulePath = '/e2e/dialogFixture.tsx';
    (window as any).dialogFixture = (await import(modulePath)).mountDialogFixture();
  });
  const trigger = page.getByRole('button', { name: 'Buka dialog uji', exact: true });
  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: 'Dialog uji F25' });
  await dialog.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Batal' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as any).dialogFixture.finish());
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('F23 index-only metadata follows real editor writes without losing HTML', async ({ page }) => {
  await page.locator('.tiptap[contenteditable="true"]').fill('F23 one two three');
  const result = await page.evaluate(async () => {
    const bridgePath = '/src/features/editor/editorBridge.ts'; const queryPath = '/src/services/chapterQueries.ts'; const dbPath = '/src/db.ts';
    await (await import(bridgePath)).flushActiveEditor();
    const { db } = await import(dbPath); const { readChapterList, readLatestChapterModified } = await import(queryPath);
    await db.chapters.update(1, { title: 'Renamed native', status: 'done' });
    await db.projects.update(1, { wordGoal: 4 });
    return { rows: await readChapterList(1), latest: await readLatestChapterModified(1), source: await db.chapters.get(1) };
  });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ title: 'Renamed native', status: 'done', _computedWordCount: 4 });
  expect(result.rows[0].content).toBeUndefined();
  expect(result.source.content).toContain('F23 one two three');
  expect(result.latest).toBe(result.source.lastModified);
  await expect(page.getByTitle('Progres Naskah')).toContainText('100%');
  await page.evaluate(() => localStorage.setItem('aether_view_mode', 'dashboard'));
  await page.reload();
  await expect(page.locator('main')).toContainText('4 / 4 kata');
});

test('F23 native v33 upgrade backfills metadata while preserving manuscript', async ({ page }) => {
  await page.route('**/__f23_migrate', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__f23_migrate');
  const result = await page.evaluate(async () => {
    const modulePath = '/e2e/dataPathsFixture.ts';
    return (await import(modulePath)).migrateV33();
  });
  expect(result.version).toBe(39);
  expect(result.rows[0]).toMatchObject({ id: 7, title: 'Legacy', _computedWordCount: 3, lastModified: 9 });
  expect(result.chapter.content).toBe('<p>legacy native browser</p>');
});


test('F28.5 native Atlas draws and edits geometry, filters without deleting, and keeps labels inert', async ({ page }) => {
  await page.evaluate(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); revoke(url); };
    Reflect.set(window, 'atlasActiveUrls', active);
  });
  await page.evaluate(async () => {
    const fixturePath = '/e2e/atlasFixture.tsx';
    await (await import(fixturePath)).mountAtlasFixture();
  });
  const canvas = page.locator('.leaflet-container');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Draw pin', exact: true }).click();
  await canvas.click({ position: { x: 350, y: 230 } });
  await expect(page.getByTestId('atlas-count')).toHaveText('1');
  const geometry = () => page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    return (await db.mapMarkers.toArray()).find(m => m.kind === 'pin')?.geometry;
  });
  const before = await geometry();
  await page.getByRole('button', { name: 'Edit geometry' }).click();
  const handle = page.locator('.leaflet-marker-draggable').first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Missing edit handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 80, box.y + 50, { steps: 8 }); await page.mouse.up();
  await expect.poll(geometry).not.toEqual(before);
  for (const kind of ['area', 'route']) {
    await page.getByRole('button', { name: `Draw ${kind}`, exact: true }).click();
    await canvas.click({ position: { x: 280, y: 160 } });
    await canvas.click({ position: { x: 400, y: 160 } });
    if (kind === 'area') await canvas.click({ position: { x: 400, y: 300 } });
    await canvas.click({ position: { x: 280, y: 300 } });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('atlas-count')).toHaveText(kind === 'area' ? '2' : '3');
  }
  await expect(page.getByTestId('atlas-count')).toHaveText('3');
  await page.getByRole('button', { name: 'Hide pins' }).click();
  await expect(page.getByTestId('atlas-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByTestId('atlas-count')).toHaveText('3');
  await expect(page.locator('[onerror], img[src="x"], script:not([type])')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__atlasXss'))).toBeUndefined();
  await page.getByRole('button', { name: 'Unmount canvas' }).click();
  await expect(canvas).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'atlasActiveUrls').size)).toBe(0);
});


test('F28.5 Atlas panel restores its map and creates/deletes a pin through the real sidebar', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    await db.maps.add({ projectId: 1, name: 'Native panel map', imageBlob: new Blob([image], { type: 'image/png' }), width: 600, height: 400, createdAt: 1 });
    localStorage.setItem('aether_view_mode', 'atlas');
  });
  await page.reload();
  const canvas = page.locator('.leaflet-container');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Pin', exact: true }).first().click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await expect(page.getByRole('button', { name: 'Ubah posisi/bentuk' })).toBeVisible();
  const count = () => page.evaluate(async () => { const path = '/src/db.ts'; return (await import(path)).db.mapMarkers.count(); });
  await expect.poll(count).toBe(1);
  await page.reload();
  await expect(canvas).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  await page.locator('.leaflet-marker-icon').first().click();
  await page.getByText('Pengaturan penanda', { exact: true }).click();
  await page.getByRole('button', { name: 'Hapus penanda' }).click();
  await expect.poll(count).toBe(0);
});
