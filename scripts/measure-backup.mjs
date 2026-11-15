import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:4183';
const env = { ...process.env, PORT: '4183', GEMINI_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '', CLAUDE_API_KEY: '', HF_API_KEY: '', HUGGINGFACE_API_KEY: '' };
const server = spawn(process.execPath, ['--import', 'tsx', 'e2e/server.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', value => { logs += value; }); server.stderr.on('data', value => { logs += value; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, logs);
    try { if ((await fetch(base)).ok && logs.includes('http://localhost:4183')) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.route('**/__backup_bench', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto(`${base}/__backup_bench`);
  const session = await context.newCDPSession(page);
  const samples = [];
  for (const scenario of [{chapters:10,words:1000,images:0},{chapters:100,words:2000,images:0},{chapters:500,words:5000,images:0},{chapters:500,words:5000,images:4}]) {
    const fixture = await page.evaluate(async scenario => { const modulePath='/e2e/backupBenchmarkFixture.ts'; return (await import(modulePath)).seed(scenario); }, scenario);
    const runs=[];
    for(let iteration=0;iteration<3;iteration++) {
      await page.evaluate(async()=>{const modulePath='/e2e/backupBenchmarkFixture.ts';(await import(modulePath)).release();});
      await session.send('HeapProfiler.collectGarbage');
      const before=await session.send('Runtime.getHeapUsage');
      let peak=before.usedSize, peakBacking=before.backingStorageSize??0;
      let pending=Promise.resolve();
      const timer=setInterval(()=>{pending=pending.then(async()=>{const h=await session.send('Runtime.getHeapUsage');peak=Math.max(peak,h.usedSize);peakBacking=Math.max(peakBacking,h.backingStorageSize??0);}).catch(()=>{});},50);
      let timing;
      try { timing=await page.evaluate(async()=>{const modulePath='/e2e/backupBenchmarkFixture.ts';return (await import(modulePath)).measure();}); }
      finally { clearInterval(timer); await pending; }
      const after=await session.send('Runtime.getHeapUsage');peak=Math.max(peak,after.usedSize);peakBacking=Math.max(peakBacking,after.backingStorageSize??0);
      await session.send('HeapProfiler.collectGarbage');
      const held=await session.send('Runtime.getHeapUsage');
      runs.push({...timing,heap:{sampledPeakDeltaBytes:peak-before.usedSize,sampledPeakBackingDeltaBytes:peakBacking-(before.backingStorageSize??0),retainedDeltaBytes:held.usedSize-before.usedSize}});
    }
    const integrity=await page.evaluate(async()=>{const modulePath='/e2e/backupBenchmarkFixture.ts';return (await import(modulePath)).verify();});
    samples.push({...scenario,...fixture,runs,integrity});
    console.log(`Measured ${scenario.chapters} chapters x ${scenario.words} words, ${scenario.images} images; integrity passed`);
  }
  const report={baseCommit:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTree:true,node:process.version,chromium:browser.version(),conditions:'Isolated blank browser page and native IndexedDB, Vite dev modules, no React editor/model/network; 3 sequential samples including first run, 16ms timer heartbeat, CDP heap sampling 50ms (not total process/native memory), forced GC outside timed operations',samples};
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  if (output) { const target = path.resolve(root, output); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
}
