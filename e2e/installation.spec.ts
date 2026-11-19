import { test, expect, type Page } from '@playwright/test';

type DbModule = typeof import('../src/db');
type InstallationFixture = typeof import('./installationFixture');

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__installation', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__installation');
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
});

async function records(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: DbModule = await import(path);
    return {
      version: db.verno, projects: await db.projects.toArray(), chapters: await db.chapters.toArray(),
      bible: await db.bible.toArray(), sessions: await db.chatSessions.toArray(), snapshots: await db.snapshots.toArray(),
    };
  });
}

test('L02 empty database bootstraps exactly one usable project and survives editor reload', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.tiptap[contenteditable="true"]');
  await expect(editor).toBeVisible();
  const initial = await records(page);
  expect(initial.version).toBe(34);
  expect(initial.projects).toHaveLength(1);
  expect(initial.chapters).toHaveLength(1);
  expect(initial.bible).toHaveLength(1);
  expect(initial.chapters[0].projectId).toBe(initial.projects[0].id);
  expect(initial.chapters[0].listMetadata?.[0]).toBe(initial.chapters[0].order);
  await editor.fill('L02 first manuscript');
  await expect.poll(async () => (await records(page)).chapters[0].content).toContain('L02 first manuscript');
  await page.reload();
  await expect(editor).toHaveText('L02 first manuscript');
  const reopened = await records(page);
  expect(reopened.projects.map(p => p.id)).toEqual(initial.projects.map(p => p.id));
  expect(reopened.chapters.map(c => c.id)).toEqual(initial.chapters.map(c => c.id));
});

for (const version of [17, 33] as const) {
  test(`L02 v${version} upgrades before React and preserves an editable manuscript`, async ({ page }) => {
    const nativeVersion = await page.evaluate(async version => {
      const path = '/e2e/installationFixture.ts';
      const fixture: InstallationFixture = await import(path);
      return fixture.seedLegacy(version);
    }, version);
    expect(nativeVersion).toBe(version * 10);
    await page.goto('/');
    const editor = page.locator('.tiptap[contenteditable="true"]');
    await expect(editor).toHaveText('Legacy manuscript survives');
    const migrated = await records(page);
    expect(migrated.version).toBe(34);
    expect(migrated.projects).toHaveLength(1);
    expect(migrated.projects[0]).toMatchObject({ id: 7, name: 'Legacy L02' });
    expect(migrated.chapters).toHaveLength(1);
    expect(migrated.chapters[0]).toMatchObject({ id: 9, projectId: 7, content: '<p>Legacy manuscript survives</p>' });
    expect(migrated.chapters[0].listMetadata).toEqual([0, 'Legacy chapter', 'outline', 3, 1]);
    expect(migrated.chapters[0]).not.toHaveProperty('status');
    expect(migrated.snapshots).toEqual([
      { id: 4, chapterId: 9, content: '<p>Original manuscript</p>', label: 'Original', timestamp: 1 },
    ]);
    expect(migrated.sessions[0]).toMatchObject({ id: 3, kind: version === 17 ? 'scribble' : 'studio' });
    await editor.fill('Edited after migration');
    await expect.poll(async () => (await records(page)).chapters[0].content).toContain('Edited after migration');
    await page.reload();
    await expect(editor).toHaveText('Edited after migration');
    expect((await records(page)).projects).toHaveLength(1);
    expect((await records(page)).chapters).toHaveLength(1);
  });
}

test('DB06 abort rolls back v17 upgrade and preserves the manuscript for retry', async ({ page }) => {
  const { before, after, issues } = await page.evaluate(async () => {
    const path = '/e2e/installationFixture.ts';
    const fixture: InstallationFixture = await import(path);
    await fixture.seedLegacy(17, true);
    const before = await fixture.readInstalledDatabase();
    const issues = await fixture.abortUpgradeAfterChapterWrite();
    return { before, after: await fixture.readInstalledDatabase(), issues };
  });

  expect(before.version).toBe(170);
  expect(before.chapters).toHaveLength(2);
  expect(before.sessions[0]).not.toHaveProperty('kind');
  expect(before.chapterIndexes).toEqual(['order', 'projectId']);
  expect(after).toEqual(before);
  expect(issues).toEqual([expect.objectContaining({ level: 'error', message: expect.stringContaining('Gagal membuka database') })]);

  await page.goto('/');
  await expect(page.locator('.tiptap[contenteditable="true"]')).toHaveText('Legacy manuscript survives');
  const retried = await records(page);
  expect(retried.version).toBe(34);
  expect(retried.chapters.map(chapter => chapter.listMetadata)).toEqual([
    [0, 'Legacy chapter', 'outline', 3, 1],
    [1, 'Legacy second chapter', 'draft', 2, 2],
  ]);
  expect(retried.chapters.map(({ listMetadata, ...chapter }) => chapter)).toEqual(before.chapters);
  expect(retried.sessions).toEqual([{ ...before.sessions[0], kind: 'scribble' }]);
  expect(retried.snapshots).toEqual(before.snapshots);
});
