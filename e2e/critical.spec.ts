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
  await expect(page.locator('.tiptap[contenteditable="true"]')).toHaveText('Draft survives failure');
  await page.evaluate(async () => {
    const dbPath = '/src/db.ts'; const bridgePath = '/src/features/editor/editorBridge.ts';
    const { db } = await import(dbPath);
    db.chapters.update = (window as any).restoreChapterUpdate;
    const { flushActiveEditor } = await import(bridgePath);
    await flushActiveEditor();
  });
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
