import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { arch, cpus, release, totalmem } from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:4182';
const capacity = process.argv.includes('--capacity');
const env = { ...process.env, PORT: '4182', GEMINI_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '', CLAUDE_API_KEY: '', HF_API_KEY: '', HUGGINGFACE_API_KEY: '' };
const server = spawn(process.execPath, ['--import', 'tsx', 'e2e/server.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', value => { logs += value; }); server.stderr.on('data', value => { logs += value; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, logs);
    try { if ((await fetch(base)).ok && logs.includes('http://localhost:4182')) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.route('**/__f23_bench', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto(`${base}/__f23_bench`);
  await page.evaluate(async capacity => {
    const modulePath = capacity ? '/e2e/capacityFixture.ts' : '/e2e/dataPathsFixture.ts';
    if (capacity) window.db08 = await import(modulePath);
    else window.f23 = await import(modulePath);
  }, capacity);
  const session = await context.newCDPSession(page);
  const samples = [];
  if (capacity) {
    const scenarios = [
      { chapters: 10, words: 1000, scenes: 100, sessions: 5, messages: 20, snapshots: 5, maps: 1 },
      { chapters: 100, words: 2000, scenes: 1000, sessions: 30, messages: 60, snapshots: 30, maps: 2 },
      { chapters: 500, words: 5000, scenes: 10000, sessions: 100, messages: 100, snapshots: 120, maps: 4 },
    ];
    for (const scenario of scenarios) {
      const fixture = await page.evaluate(scenario => window.db08.seedCapacity(scenario), scenario);
      const jsonBytes = await page.evaluate(() => window.db08.prepareCapacity());
      await page.evaluate(scenario => window.db08.measureCapacity(scenario), scenario);
      const timings = [];
      for (let iteration = 0; iteration < 5; iteration++) {
        await session.send('HeapProfiler.collectGarbage');
        timings.push(await page.evaluate(scenario => window.db08.measureCapacity(scenario), scenario));
      }
      const heap = {};
      for (const operation of ['serialize', 'verify', 'restore']) {
        const probes = [];
        for (let iteration = 0; iteration < 3; iteration++) {
          await session.send('HeapProfiler.collectGarbage');
          const before = await session.send('Runtime.getHeapUsage');
          let peak = before.usedSize, backing = before.backingStorageSize ?? 0;
          let pending = Promise.resolve();
          const sample = async () => {
            const entry = await session.send('Runtime.getHeapUsage');
            peak = Math.max(peak, entry.usedSize);
            backing = Math.max(backing, entry.backingStorageSize ?? 0);
          };
          const timer = setInterval(() => { pending = pending.then(sample); }, 20);
          try {
            await page.evaluate(operation => window.db08.runCapacityProbe(operation), operation);
          } finally {
            clearInterval(timer);
            await pending;
          }
          await sample();
          probes.push({ heapBytes: peak - before.usedSize, backingBytes: backing - (before.backingStorageSize ?? 0) });
        }
        heap[operation] = probes;
      }
      assert.equal(await page.evaluate(scenario => window.db08.verifyCapacity(scenario), scenario), true);
      samples.push({ ...scenario, ...fixture, jsonBytes, timings, heap });
      console.log(`Capacity: ${scenario.chapters} chapters, ${jsonBytes} JSON bytes, round-trip verified`);
    }
  } else for (const [chapters, words, scenes] of [[10, 1000, 100], [100, 2000, 1000], [500, 5000, 10000]]) {
    await page.evaluate(async ([count, words, scenes]) => { await window.f23.seed(count, words); await window.f23.seedScenes(scenes); }, [chapters, words, scenes]);
    const timing = await page.evaluate(async () => {
      const m = window.f23;
      const before = await m.baselineList(), after = await m.indexedList();
      if (before.length !== after.length || before.some((row, index) => Object.keys(row).some(key => row[key] !== after[index][key]))) throw new Error('Chapter result mismatch');
      if (JSON.stringify(await m.baselineScenes()) !== JSON.stringify(await m.indexedScenes())) throw new Error('Scene result mismatch');
      const values = {};
      for (const name of ['baselineList', 'indexedList', 'baselineLatest', 'indexedLatest', 'baselineScenes', 'indexedScenes']) {
        values[name] = [];
        for (let i = 0; i < 5; i++) { const start = performance.now(); await m[name](); values[name].push(performance.now() - start); }
      }
      return values;
    });
    const heap = {};
    for (const name of ['baselineList', 'indexedList']) {
      await page.evaluate(() => window.f23.release()); await session.send('HeapProfiler.collectGarbage');
      const before = await session.send('Runtime.getHeapUsage');
      await page.evaluate(async name => { await window.f23[name](true); }, name);
      await session.send('HeapProfiler.collectGarbage');
      const after = await session.send('Runtime.getHeapUsage');
      heap[name] = { usedDeltaBytes: after.usedSize - before.usedSize, backingDeltaBytes: (after.backingStorageSize ?? 0) - (before.backingStorageSize ?? 0) };
      assert.equal(await page.evaluate(() => window.f23.retainedCount()), chapters);
    }
    await page.evaluate(() => window.f23.release());
    samples.push({ chapters, wordsPerChapter: words, scenes, vectorDimensions: 384, timing, heap });
  }
  const report = {
    baseCommit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, chromium: browser.version(),
    ...(capacity && { device: { platform: process.platform, release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem() } }),
    conditions: capacity
      ? 'Native IndexedDB in a blank page; five warm timings and three main-thread V8 heap probes (20 ms CDP sampling); no editor UI/model/remote network'
      : 'Native IndexedDB, isolated blank page, same v34 dataset for baseline-equivalent and optimized queries; five warm samples; heap holds fetched rows at query working-set point',
    samples,
  };
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  if (output) { const target = path.resolve(root, output); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
}
