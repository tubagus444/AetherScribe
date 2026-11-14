import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinel = 'F21_SYNTHETIC_SECRET_DO_NOT_SHIP';
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Jalankan melalui npm run test:production');
function runNpm(args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, env, stdio: 'inherit' });
  assert.equal(result.status, 0, `npm ${args.join(' ')} failed`);
}
runNpm(['run', 'build'], project, { ...process.env, GEMINI_API_KEY: sentinel });
function checkSecrets(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) checkSecrets(target);
    else assert.ok(!readFileSync(target).includes(Buffer.from(sentinel)), `Secret in ${entry.name}`);
  }
}
checkSecrets(path.join(project, 'dist'));

const root = mkdtempSync(path.join(tmpdir(), 'aetherscribe-production-'));
let child;
try {
  for (const name of ['package.json', 'package-lock.json', 'dist']) {
    cpSync(path.join(project, name), path.join(root, name), { recursive: true });
  }
  runNpm(['ci', '--omit=dev', '--no-audit', '--no-fund'], root);
  assert.ok(!existsSync(path.join(root, 'node_modules', 'vite')));
  assert.ok(!existsSync(path.join(root, 'node_modules', 'tsx')));
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
  // A different cwd verifies assets are located relative to the production bundle.
  const launch = path.join(root, 'launch');
  mkdirSync(launch);
  writeFileSync(path.join(launch, '.env'), `PORT=${port}\nNODE_ENV=development\nGROQ_API_KEY=${sentinel}\n`);
  const preload = path.join(root, 'mock-upstream.cjs');
  writeFileSync(preload, `global.fetch = async (_url, options) => {
    if (process.env.NODE_ENV !== 'production' || options.headers.Authorization !== 'Bearer ${sentinel}') throw new Error('Runtime configuration mismatch');
    return { status: 200, json: async () => ({ data: [{ id: 'f21-mock-model' }] }) };
  };`);
  const env = { ...process.env, NODE_ENV: 'development' };
  delete env.PORT;
  delete env.GROQ_API_KEY;
  delete env.NODE_OPTIONS;
  let output = '';
  child = spawn(process.execPath, ['--require', preload, path.join(root, 'dist', 'server.cjs')], { cwd: launch, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, output);
    try { if ((await fetch(base)).status === 200) { ready = true; break; } } catch { /* wait for listener */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Startup timed out: ${output}`);
  const html = await (await fetch(`${base}/novel/deep-link`)).text();
  assert.ok(html.includes('<div id="root">'));
  assert.ok(!html.includes('/@vite/client'));
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(base + asset)).status, 200);
  const api = await fetch(`${base}/api/ai/groq-models`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{}' });
  assert.equal(api.status, 200);
  assert.equal((await api.json()).data[0].id, 'f21-mock-model');
  const forbidden = await fetch(`${base}/api/ai/groq-models`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  const invalid = spawnSync(process.execPath, [path.join(root, 'dist', 'server.cjs')], { cwd: launch, env: { ...env, PORT: 'invalid' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /PORT/);
  const occupied = spawnSync(process.execPath, [path.join(root, 'dist', 'server.cjs')], { cwd: launch, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(occupied.status, 1);
  assert.match(occupied.stderr, /EADDRINUSE/);
  const index = path.join(root, 'dist', 'index.html');
  renameSync(index, index + '.missing');
  try {
    const missing = spawnSync(process.execPath, [path.join(root, 'dist', 'server.cjs')], { cwd: launch, env, encoding: 'utf8', timeout: 5000 });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Build frontend tidak ditemukan/);
  } finally { renameSync(index + '.missing', index); }
  console.log('Production smoke passed: clean dependencies, static SPA/assets, cwd .env, mode, custom port, proxy isolation, invalid/busy port, no secret in dist.');
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
  }
  // root is the absolute directory created by mkdtemp above.
  rmSync(root, { recursive: true, force: true });
}
