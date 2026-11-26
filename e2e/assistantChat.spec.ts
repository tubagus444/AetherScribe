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

for (const attachment of ['summary', 'excerpt'] as const) {
  test(`Diskusi AI sends the selected Codex entry and reuses the original ${attachment}`, async ({ context, page, baseURL }) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('aether_view_mode', 'brainstorm');
      localStorage.setItem('ai_local_only', 'true');
      localStorage.setItem('ollama_enabled', 'true');
      localStorage.setItem('ai_provider', 'ollama');
    });
    const userPrompts: string[] = [];
    await page.route('**/api/ai/proxy', route => {
      const { messages } = route.request().postDataJSON().body;
      userPrompts.push(messages.at(-1).content);
      const frame = { choices: [{ delta: { content: `Balasan ${userPrompts.length} selesai.` }, finish_reason: 'stop' }] };
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify(frame) + '\n\n' });
    });

    await page.route('**/__seed_attachments', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('/__seed_attachments');
    await page.evaluate(async () => {
      const path = '/src/db.ts';
      const { db }: typeof import('../src/db') = await import(path);
      await db.projects.add({ id: 1, name: 'Novel', description: '', createdAt: 1, lastOpened: 1 });
      await db.chapters.bulkAdd([
        { id: 1, projectId: 1, title: 'Bab awal', content: '<p>Cuplikan asli dermaga.</p>', summary: 'Ringkasan asli mercusuar.', order: 0, lastModified: 1 },
        { id: 2, projectId: 1, title: 'Bab lain', content: '<p>Cuplikan baru lembah.</p>', summary: 'Ringkasan baru gunung.', order: 1, lastModified: 1 },
      ]);
      await db.codex.bulkAdd([
        { id: 1, projectId: 1, category: 'character', name: 'Ratu', description: 'Penguasa istana utara.', aliases: [], tags: [] },
        { id: 2, projectId: 1, category: 'character', name: 'Ratu Senja', description: 'Penjaga gerbang senja.', aliases: [], tags: [] },
      ]);
      await db.chatSessions.add({ id: 1, projectId: 1, activeChapterId: 1, title: 'Sesi lampiran', kind: 'studio', mode: 'plot-check',
        smartAutoEnabled: false, lastMessageAt: 2, messages: [{ role: 'model', content: 'Mari berdiskusi.', timestamp: 2 }] });
    });
    await page.goto('/');
    const session = page.getByText('Sesi lampiran', { exact: true });
    await session.click();
    const composer = page.getByPlaceholder('Sampaikan ide liar Anda di sini...');
    const loreMenu = page.getByTitle('Lampirkan Lore', { exact: true });
    const selectCodex = (name: string) => page.getByRole('button').filter({ has: page.getByText(name, { exact: true }) });
    const chapterAttachment = page.getByRole('button', { name: `@chapter-${attachment}`, exact: true });
    const chips = page.getByRole('group', { name: 'Lampiran Codex' });

    await composer.fill('Bahas petunjuk ini.');
    await loreMenu.click();
    await selectCodex('Ratu').click();
    await chips.getByRole('button', { name: 'Lepas lampiran Ratu', exact: true }).click();
    await loreMenu.click();
    await selectCodex('Ratu Senja').click();
    await expect(chips).toHaveText('Ratu Senja');
    await expect(composer).toHaveValue('Bahas petunjuk ini.');
    await loreMenu.click();
    await chapterAttachment.click();
    await page.getByRole('button', { name: 'Kirim Ide' }).click();
    await expect(page.getByText('Balasan 1 selesai.', { exact: true })).toBeVisible();
    await expect(page.getByText('Ratu Senja', { exact: true })).toBeVisible();
    await expect(chips).toHaveCount(0);
    expect(userPrompts).toHaveLength(1);
    expect(userPrompts[0]).toContain('[Lore - Ratu Senja: Penjaga gerbang senja.]');
    expect(userPrompts[0]).not.toContain('Penguasa istana utara.');
    expect(userPrompts[0]).toContain(attachment === 'summary' ? 'Ringkasan asli mercusuar.' : 'Cuplikan asli dermaga.');

    await page.evaluate(async () => {
      const path = '/src/db.ts';
      const { db }: typeof import('../src/db') = await import(path);
      await db.codex.update(2, { name: 'Ratu Fajar', description: 'Versi Codex yang baru.' });
      await db.chatSessions.update(1, { activeChapterId: 2 });
    });
    await page.reload();
    await session.click();
    await expect(page.getByRole('button', { name: 'Bab lain', exact: true })).toBeVisible();
    await expect(page.getByText('Ratu Senja', { exact: true })).toBeVisible();
    await composer.fill('Draf yang belum dikirim.');
    await loreMenu.click();
    await chapterAttachment.click();
    await page.getByRole('button', { name: 'Buat Ulang', exact: true }).click();
    await expect(page.getByText('Balasan 2 selesai.', { exact: true })).toBeVisible();
    expect(userPrompts).toEqual([userPrompts[0], userPrompts[0]]);
    await expect(composer).toHaveValue(`Draf yang belum dikirim. @chapter-${attachment} `);
  });
}

for (const width of [1280, 390]) {
  test(`Diskusi AI restores session drafts while searching older titles at ${width}px`, async ({ context, page, baseURL }) => {
    await page.setViewportSize({ width, height: 850 });
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('aether_view_mode', 'brainstorm');
      localStorage.setItem('ai_local_only', 'true');
      localStorage.setItem('ollama_enabled', 'true');
      localStorage.setItem('ai_provider', 'ollama');
    });
    const prompts: string[] = [];
    await page.route('**/api/ai/proxy', route => {
      prompts.push(route.request().postDataJSON().body.messages.at(-1).content);
      const frame = { choices: [{ delta: { content: 'Draf terkirim.' }, finish_reason: 'stop' }] };
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify(frame) + '\n\n' });
    });
    await page.route('**/__seed_drafts', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('/__seed_drafts');
    await page.evaluate(async () => {
      const path = '/src/db.ts';
      const { db }: typeof import('../src/db') = await import(path);
      await db.projects.bulkAdd([
        { id: 1, name: 'Novel', description: '', createdAt: 1, lastOpened: 2 },
        { id: 2, name: 'Novel lain', description: '', createdAt: 1, lastOpened: 1 },
      ]);
      await db.chatSessions.bulkAdd([
        ...Array.from({ length: 51 }, (_, i) => ({
          projectId: 1, title: i === 50 ? 'Arsip lama Sesi 51' : `Sesi ${i + 1}`,
          lastMessageAt: 51 - i, messages: [],
        })),
        { projectId: 1, title: 'Arsip lama Nova', kind: 'scribble', lastMessageAt: 100, messages: [] },
        { projectId: 1, title: 'Arsip lama Workshop', kind: 'workshop', lastMessageAt: 100, messages: [] },
        { projectId: 2, title: 'Arsip lama proyek lain', kind: 'studio', lastMessageAt: 100, messages: [] },
      ]);
      await db.codex.add({
        projectId: 1, category: 'character', name: 'Sagara', description: 'Penjaga pelabuhan.', aliases: [], tags: [],
      });
    });
    await page.goto('/');
    if (width === 390) await page.getByRole('complementary').getByRole('button', { name: 'Diskusi AI' }).click();

    const rows = page.getByTitle('Klik dua kali untuk ganti nama');
    const latest = rows.filter({ hasText: /^Sesi 1$/ });
    const older = rows.filter({ hasText: /^Arsip lama Sesi 51$/ });
    const search = page.getByPlaceholder('Cari percakapan...');
    const composer = page.getByPlaceholder('Sampaikan ide liar Anda di sini...');
    const chips = page.getByRole('group', { name: 'Lampiran Codex' });
    const showHistory = async () => {
      if (width === 390) await page.getByRole('button', { name: 'Kembali ke daftar percakapan' }).click();
    };

    await expect(rows).toHaveCount(50);
    await expect(older).toHaveCount(0);
    await latest.click();
    await composer.fill('Draf sesi terbaru');
    await page.getByTitle('Lampirkan Lore', { exact: true }).click();
    await page.getByRole('button').filter({ has: page.getByText('Sagara', { exact: true }) }).click();
    await expect(chips).toHaveText('Sagara');
    await showHistory();
    await search.fill('  ARSIP LAMA  ');
    await expect(rows).toHaveText(['Arsip lama Sesi 51']);
    await older.click();
    await expect(composer).toHaveValue('');
    await expect(chips).toHaveCount(0);
    await composer.fill('Draf sesi lama');
    await showHistory();
    await search.clear();
    await expect(rows).toHaveCount(50);
    await latest.click();
    await expect(composer).toHaveValue('Draf sesi terbaru');
    await expect(chips).toHaveText('Sagara');
    await page.getByRole('button', { name: 'Kirim Ide' }).click();
    await expect(page.getByText('Draf terkirim.', { exact: true })).toBeVisible();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Draf sesi terbaru');
    expect(prompts[0]).toContain('Penjaga pelabuhan.');
    await showHistory();
    await search.fill('arsip lama');
    await older.click();
    await expect(composer).toHaveValue('Draf sesi lama');
    await showHistory();
    await search.clear();
    await rows.filter({ hasText: /^Draf sesi terbaru$/ }).click();
    await expect(composer).toHaveValue('');
    await expect(chips).toHaveCount(0);
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

for (const failure of ['error', 'interrupted'] as const) {
  test(`Nova retries only the latest failed turn (${failure}) without duplicating the question`, async ({ context, page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 850 });
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('aether_view_mode', 'write');
      localStorage.setItem('ai_local_only', 'true');
      localStorage.setItem('ollama_enabled', 'true');
      localStorage.setItem('ai_provider', 'ollama');
    });
    const requests: { role: string; content: string }[][] = [];
    await page.route('**/api/ai/proxy', route => {
      requests.push(route.request().postDataJSON().body.messages);
      const frame = { choices: [{ delta: { content: 'Balasan pengganti selesai.' }, finish_reason: 'stop' }] };
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify(frame) + '\n\n' });
    });
    await page.route('**/__seed_nova_retry', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('/__seed_nova_retry');
    await page.evaluate(async failure => {
      const path = '/src/db.ts';
      const { db }: typeof import('../src/db') = await import(path);
      await db.projects.add({ id: 1, name: 'Novel', description: '', createdAt: 1, lastOpened: 1 });
      await db.chapters.add({ id: 1, projectId: 1, title: 'Bab uji', content: '<p>Naskah</p>', order: 0, lastModified: 1 });
      await db.chatSessions.add({
        projectId: 1, chapterId: 1, title: 'Chapter 1 Scribble', kind: 'scribble', lastMessageAt: 4,
        messages: [
          { id: '1', role: 'user', content: 'Pertanyaan lama', timestamp: 1 },
          { id: '2', role: 'model', content: 'Kesalahan lama', isError: true, timestamp: 2 },
          { id: '3', role: 'user', content: 'Pertanyaan terbaru', timestamp: 3 },
          { id: '4', role: 'model', content: 'Balasan gagal terbaru', timestamp: 4,
            ...(failure === 'error' ? { isError: true } : { finishStatus: 'interrupted' as const }) },
        ],
      });
    }, failure);
    await page.goto('/');
    const open = page.getByRole('button', { name: 'Asisten AI', exact: true }).and(page.locator('[aria-pressed]'));
    await open.click();
    const retry = page.getByRole('button', { name: 'Coba Lagi', exact: true });
    const input = page.getByPlaceholder('Tanyakan apa saja tentang lore-mu...');
    await expect(page.getByText('Kesalahan lama', { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(1);
    await expect(page.getByText('Balasan gagal terbaru', { exact: true }).locator('../..').getByRole('button', { name: 'Coba Lagi' })).toBeVisible();
    await input.fill('Draf lain yang belum dikirim');
    await retry.click();
    await expect(page.getByText('Balasan pengganti selesai.', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0].filter(message => message.role === 'user').map(message => message.content)).toEqual([
      'Pertanyaan lama', expect.stringMatching(/USER MESSAGE: Pertanyaan terbaru$/),
    ]);
    await expect(input).toHaveValue('Draf lain yang belum dikirim');
    await expect(page.getByText('Pertanyaan terbaru', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Balasan gagal terbaru', { exact: true })).toHaveCount(0);
    await expect(retry).toHaveCount(0);
    await page.getByRole('button', { name: 'Tutup asisten' }).click();
    await open.click();
    await expect(page.getByText('Balasan pengganti selesai.', { exact: true })).toBeVisible();
    await expect(page.getByText('Kesalahan lama', { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
  });
}
