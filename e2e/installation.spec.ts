import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
  await page.route('**/__installation', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__installation');
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
});

async function records(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const path = '/src/db.ts'; const { db } = await import(path);
    return { version: db.verno, projects: await db.projects.toArray(), chapters: await db.chapters.toArray(), bible: await db.bible.toArray(), sessions: await db.chatSessions.toArray() };
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
  await editor.fill('L02 first manuscript');
  await expect.poll(async () => (await records(page)).chapters[0].content).toContain('L02 first manuscript');
  await page.reload();
  await expect(editor).toHaveText('L02 first manuscript');
  const reopened = await records(page);
  expect(reopened.projects.map(p => p.id)).toEqual(initial.projects.map(p => p.id));
  expect(reopened.chapters.map(c => c.id)).toEqual(initial.chapters.map(c => c.id));
});

for (const version of [17, 33]) {
  test(`L02 v${version} upgrades before React and preserves an editable manuscript`, async ({ page }) => {
    const nativeVersion = await page.evaluate(async version => {
      const path = '/e2e/installationFixture.ts';
      return (await import(path)).seedLegacy(version);
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
    expect(migrated.chapters[0].listMetadata?.[3]).toBe(3);
    expect(migrated.sessions[0]).toMatchObject({ id: 3, kind: version === 17 ? 'scribble' : 'studio' });
    await editor.fill('Edited after migration');
    await expect.poll(async () => (await records(page)).chapters[0].content).toContain('Edited after migration');
    await page.reload();
    await expect(editor).toHaveText('Edited after migration');
    expect((await records(page)).projects).toHaveLength(1);
    expect((await records(page)).chapters).toHaveLength(1);
  });
}
