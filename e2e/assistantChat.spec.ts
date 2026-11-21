import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    outputRequests: number[];
    replyChunk: (text: string, reason?: string) => void;
  }
}

for (const width of [1280, 390]) {
  test(`Diskusi AI preserves scroll and reopens incomplete replies at ${width}px`, async ({ context, page, baseURL }) => {
    await page.setViewportSize({ width, height: 850 });
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('aether_view_mode', 'brainstorm');
      localStorage.setItem('ai_local_only', 'true');
      localStorage.setItem('ollama_enabled', 'true');
      localStorage.setItem('ai_provider', 'ollama');
      window.outputRequests = [];
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (input !== '/api/ai/proxy') return fetch(input, init);
        const tokens = JSON.parse(String(init?.body)).body.max_tokens;
        window.outputRequests.push(tokens);
        if (tokens > 4500) return Promise.resolve(new Response(JSON.stringify({ error: 'max_tokens must be at most 4500' }), { status: 400 }));
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

    await page.route('**/__seed_chat', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('/__seed_chat');
    await page.evaluate(async () => {
      const path = '/src/db.ts';
      const { db }: typeof import('../src/db') = await import(path);
      await db.projects.add({ id: 1, name: 'Novel', description: '', createdAt: 1, lastOpened: 1 });
      await db.chapters.add({ id: 1, projectId: 1, title: 'Bab uji', content: '<p>Naskah</p>', order: 0, lastModified: 1 });
      await db.chatSessions.add({ projectId: 1, activeChapterId: 1, title: 'Sesi uji', kind: 'studio', lastMessageAt: 1,
        messages: [{ role: 'model', content: 'Pesan lama.\n\n'.repeat(70), timestamp: 1 }] });
    });
    await page.goto('/');
    const openSession = async () => {
      if (width < 768) await page.getByRole('complementary').getByRole('button', { name: 'Diskusi AI' }).click();
      await page.getByText('Sesi uji', { exact: true }).click();
    };
    await openSession();
    await page.getByRole('button', { name: 'Bab uji', exact: true }).click();
    await page.getByRole('button', { name: 'Umum (Seluruh Cerita)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Umum (Seluruh Cerita)', exact: true })).toBeVisible();
    await expect(page.getByText('Pesan lama.', { exact: true }).last()).toBeAttached();
    const composer = page.getByPlaceholder('Sampaikan ide liar Anda di sini...');
    const emptyHeight = await composer.evaluate(el => el.clientHeight);
    expect(emptyHeight).toBeLessThanOrEqual(65);
    await composer.fill('Baris panjang\n'.repeat(20));
    expect(await composer.evaluate(el => el.clientHeight)).toBeGreaterThan(emptyHeight);
    expect(await composer.evaluate(el => el.clientHeight)).toBeLessThanOrEqual(160);
    await composer.fill('Bahas bab ini');
    await page.getByRole('button', { name: 'Kirim Ide' }).click();
    await expect(page.getByText('Sedang menulis jawaban...')).toBeVisible();
    await page.waitForFunction(() => typeof window.replyChunk === 'function');
    const box = page.locator('div.overflow-y-auto').filter({ has: page.locator('.markdown-body') }).last();
    await page.evaluate(() => window.replyChunk('Awal balasan.'));
    await expect(page.getByText('Awal balasan.', { exact: true })).toBeVisible();
    await expect(page.getByText('Sedang menulis jawaban...')).toHaveCount(0);
    expect(await box.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(3);
    await box.evaluate(el => { el.scrollTop = 100; });
    await expect.poll(() => box.evaluate(el => el.scrollTop)).toBe(100);
    await page.evaluate(() => window.replyChunk(' Terpotong', 'length'));
    await expect(page.getByText('Jawaban mencapai batas panjang.')).toBeAttached();
    expect(await box.evaluate(el => el.scrollTop)).toBe(100);
    await page.reload();
    await openSession();
    await expect(page.getByRole('button', { name: 'Umum (Seluruh Cerita)', exact: true })).toBeVisible();
    await expect(page.getByText('Jawaban mencapai batas panjang.')).toBeVisible();
    await expect(page.getByText('Awal balasan. Terpotong')).toBeVisible();
    const resume = page.getByRole('button', { name: 'Lanjutkan jawaban' });
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.click();
    const length = page.getByRole('combobox', { name: /Panjang jawaban/ });
    await expect(length).toHaveValue('4096');
    for (const preset of ['2048', '8192']) {
      await length.selectOption(preset);
      await expect(length).toHaveValue(preset);
    }
    await length.selectOption('custom');
    await page.getByLabel('Jumlah token khusus').fill('6000');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(length.locator('option:checked')).toContainText('6.000');
    expect(await page.evaluate(() => window.outputRequests)).toEqual([]);
    await menu.click();
    await resume.click();
    await page.waitForFunction(() => typeof window.replyChunk === 'function');
    expect(await page.evaluate(() => window.outputRequests)).toEqual([6000, 4500]);
    await page.evaluate(() => window.replyChunk('lalu selesai.', 'stop'));
    await expect(page.getByText('Awal balasan. Terpotong lalu selesai.')).toBeVisible();
    await expect(resume).toHaveCount(0);
    await menu.click();
    await expect(page.getByText('Batas model 4.500 token')).toBeVisible();
    await page.reload();
    await openSession();
    await expect(page.getByText('Awal balasan. Terpotong lalu selesai.')).toBeVisible();
    await menu.click();
    await expect(page.getByLabel('Jumlah token khusus')).toHaveValue('6000');
  });
}

test('Nova Assistant reloads saved messages when the editor panel reopens', async ({ context, page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('aether_view_mode', 'write');
    localStorage.setItem('ai_local_only', 'true');
    localStorage.setItem('ollama_enabled', 'true');
    localStorage.setItem('ai_provider', 'ollama');
  });
  const limits: number[] = [];
  await page.route('**/api/ai/proxy', route => {
    limits.push(route.request().postDataJSON().body.max_tokens);
    const first = limits.length === 1;
    const frame = { choices: [{ delta: { content: first ? 'Balasan Nova' : 'tersimpan.' }, finish_reason: first ? 'length' : 'stop' }] };
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify(frame) + '\n\n' });
  });
  await page.route('**/__seed_nova', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('/__seed_nova');
  await page.evaluate(async () => {
    const path = '/src/db.ts';
    const { db }: typeof import('../src/db') = await import(path);
    await db.projects.add({ id: 1, name: 'Novel', description: '', createdAt: 1, lastOpened: 1 });
    await db.chapters.add({ id: 1, projectId: 1, title: 'Bab uji', content: '<p>Naskah</p>', order: 0, lastModified: 1 });
    await db.chatSessions.add({ projectId: 1, chapterId: 1, kind: 'studio', title: 'Sesi lain', lastMessageAt: 1,
      messages: [{ role: 'user', content: 'Pesan Studio', timestamp: 1 }] });
  });

  await page.goto('/');
  const open = page.getByRole('button', { name: 'Asisten AI', exact: true }).and(page.locator('[aria-pressed]'));
  await open.click();
  await expect(page.getByText(/Halo! Saya Scribble Assistant/)).toBeVisible();
  await expect(page.getByText('Pesan Studio')).toHaveCount(0);
  const input = page.getByPlaceholder('Tanyakan apa saja tentang lore-mu...');
  const settings = page.getByRole('button', { name: 'Atur panjang jawaban' });
  await settings.click();
  const length = page.getByRole('combobox', { name: /Panjang jawaban/ });
  await expect(length).toHaveValue('4096');
  await length.selectOption('8192');
  await expect(length).toHaveValue('8192');
  await settings.click();
  await input.fill('Ide adegan dari Nova');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Salin', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tutup asisten' }).click();
  await expect(input).toHaveCount(0);
  await open.click();
  await expect(page.getByText('Ide adegan dari Nova')).toBeVisible();
  await expect(page.getByText('Jawaban mencapai batas panjang.')).toBeVisible();
  await settings.click();
  await expect(length).toHaveValue('8192');
  await length.selectOption('2048');
  await expect(length).toHaveValue('2048');
  await settings.click();
  await page.getByRole('button', { name: 'Lanjutkan jawaban' }).click();
  await expect(page.getByText('Balasan Nova tersimpan.')).toBeVisible();
  expect(limits).toEqual([8192, 2048]);
  await page.reload();
  if (!(await input.isVisible())) await open.click();
  await expect(page.getByText('Balasan Nova tersimpan.')).toBeVisible();
});
