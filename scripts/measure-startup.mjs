import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const base = 'http://127.0.0.1:4181';
const env = { ...process.env, PORT: '4181', GEMINI_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '', CLAUDE_API_KEY: '', HF_API_KEY: '', HUGGINGFACE_API_KEY: '' };
const server = spawn(process.execPath, ['dist/server.cjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
let browser;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, logs);
    try { if ((await fetch(base)).ok && logs.includes('http://localhost:4181')) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ channel: 'chromium' });
  const prepare = async serviceWorkers => {
    const context = await browser.newContext({ serviceWorkers, viewport: { width: 1280, height: 720 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(() => localStorage.setItem('ai_local_only', 'true'));
    return context;
  };
  // Bootstrap the real schema in an isolated profile, then freeze one synthetic fixture.
  const seed = await prepare('block'); const seedPage = await seed.newPage();
  await seedPage.goto(base);
  await seedPage.locator('.tiptap[contenteditable="true"]').waitFor();
  await seedPage.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('AetherScribeDB'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames], 'readwrite');
      for (const name of db.objectStoreNames) tx.objectStore(name).clear();
      tx.objectStore('projects').put({ id: 1, name: 'F22 Synthetic', description: '', createdAt: 1, lastOpened: 1 });
      tx.objectStore('chapters').put({ id: 1, projectId: 1, title: 'F22 Chapter', content: '<p>' + 'Fixture novel browser. '.repeat(1000) + '</p>', order: 0, lastModified: 1 });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
    localStorage.setItem('aether_view_mode', 'write');
  });
  const fixture = await seed.storageState({ indexedDB: true }); await seed.close();
  const samples = [];
  for (let index = 0; index < 5; index++) {
    const context = await browser.newContext({ storageState: fixture, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(); const session = await context.newCDPSession(page);
    await session.send('Performance.enable');
    const start = performance.now(); await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.tiptap[contenteditable="true"]').waitFor();
    const editorReadyMs = performance.now() - start;
    const metrics = (await session.send('Performance.getMetrics')).metrics;
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(item => ({ name: item.name, bytes: item.encodedBodySize })));
    samples.push({ editorReadyMs, scriptMs: metrics.find(item => item.name === 'ScriptDuration').value * 1000, jsBytes: resources.filter(item => item.name.endsWith('.js')).reduce((sum, item) => sum + item.bytes, 0) });
    await context.close();
  }
  const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const entry = html.match(/src="([^"]+\.js)"/)[1];
  const entryBytes = readFileSync(path.join(root, 'dist', entry));
  const assets = readdirSync(path.join(root, 'dist/assets'));
  const worker = assets.find(file => /^contextWorker-.*\.js$/.test(file));
  const report = {
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) || 'working-tree',
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, chromium: browser.version(), fixtureWords: 3000,
    conditions: '5 fresh isolated contexts, localhost, unthrottled, service worker blocked for startup timings; same synthetic IndexedDB fixture',
    entryBytes: entryBytes.length, entryGzipBytes: gzipSync(entryBytes).length,
    contextWorkerBytes: statSync(path.join(root, 'dist/assets', worker)).size,
    samples, medianEditorReadyMs: median(samples.map(sample => sample.editorReadyMs)), medianScriptMs: median(samples.map(sample => sample.scriptMs)), medianJsBytes: median(samples.map(sample => sample.jsBytes)),
  };
  if (process.argv.includes('--verify-offline')) {
    const context = await browser.newContext({ storageState: fixture, serviceWorkers: 'allow' });
    const page = await context.newPage();
    await page.goto(base); await page.locator('.tiptap[contenteditable="true"]').waitFor();
    await page.evaluate(async () => {
      await Promise.race([
        (async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker activation timed out')), 30_000)),
      ]);
    });
    await context.setOffline(true);
    await page.reload(); await page.locator('.tiptap[contenteditable="true"]').waitFor();
    const workerResult = await page.evaluate(async workerPath => {
      const worker = new Worker(workerPath, { type: 'module' });
      try {
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Offline worker timeout')), 15_000);
          worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
          worker.onmessage = ({ data }) => { if (data.id === 222) { clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data.result); } };
          worker.postMessage({ type: 'COUNT_TOKENS', id: 222, payload: { text: 'Hello world', model: 'gpt-4o-mini' } });
        });
      } finally { worker.terminate(); }
    }, `/assets/${worker}`);
    assert.equal(workerResult, 2);
    await page.getByTitle('Ekspor Proyek', { exact: true }).click();
    await page.getByRole('heading', { name: 'Ekspor Naskah' }).waitFor();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Buat Ekspor MD', exact: true }).click();
    const file = await download;
    assert.ok(file.suggestedFilename().endsWith('.md'));
    report.offline = { controlledReload: true, nativeWorkerTokens: workerResult, lazyExportDownload: file.suggestedFilename() };
    await context.close();
  }
  if (output) {
    const reportPath = path.resolve(root, output);
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
}
