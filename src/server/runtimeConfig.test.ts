import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadRuntimeEnv, runtimePort } from './runtimeConfig';
import { createProxyBoundary } from './proxyBoundary';

afterEach(() => vi.unstubAllEnvs());
it('validates port before binding', () => {
  expect(runtimePort(undefined)).toBe(3000);
  expect(runtimePort('4321')).toBe(4321);
  for (const value of ['', '0', '65536', '-1', '3.5', '3000x', ' 3000']) {
    expect(() => runtimePort(value)).toThrow('PORT');
  }
});
it('loads cwd .env without overriding process values and fixes entry mode', () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), 'aetherscribe-env-'));
  vi.stubEnv('PORT', '4321'); vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('F21_ENV_PROBE', undefined);
  try {
    writeFileSync(path.join(dir, '.env'), 'PORT=5555\nF21_ENV_PROBE=loaded\nNODE_ENV=development');
    process.chdir(dir);
    loadRuntimeEnv('production');
    expect(process.env.PORT).toBe('4321');
    expect(process.env.F21_ENV_PROBE).toBe('loaded');
    expect(process.env.NODE_ENV).toBe('production');
  } finally { process.chdir(cwd); rmSync(dir, { recursive: true }); }
});
it('restricts proxy origins to configured port and loopback hosts', () => {
  const boundary = createProxyBoundary(4321);
  for (const [host, origin, allowed] of [
    ['localhost:4321', 'http://localhost:4321', true],
    ['127.0.0.1:4321', 'http://127.0.0.1:4321', true],
    ['localhost:3000', 'http://localhost:3000', false],
    ['localhost:4321', 'http://evil.test:4321', false],
    ['evil.test:4321', 'http://localhost:4321', false],
  ] as const) {
    const next = vi.fn(); const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    boundary({ headers: { host, origin } } as any, res as any, next);
    expect(next).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (!allowed) expect(res.status).toHaveBeenCalledWith(403);
  }
});

it('accepts browser-normalized HTTP port 80 only on its configured boundary', () => {
  const next = vi.fn(); const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  createProxyBoundary(80)({ headers: { host: 'localhost', origin: 'http://localhost' } } as any, res as any, next);
  expect(next).toHaveBeenCalledOnce();
});
