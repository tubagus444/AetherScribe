import { request } from 'node:http';
import type { Server } from 'node:http';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createProxyApp } from '../../server';

let server: Server;
beforeAll(async () => { server = createProxyApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
it.each([
  ['/api/ai/proxy', { provider: 'google', body: { model: 42 } }, 'localhost:3000', 400],
  ['/api/ai/ollama-models', { baseUrl: 42 }, 'localhost:3000', 400],
  ['/api/ai/google-models', {}, 'attacker.test:3000', 403],
])('HTTP %s rejects before contacting upstream', async (path, body, host, status) => {
  const upstream = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected upstream'));
  try {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: (server.address() as any).port, path: path as string, method: 'POST', headers: { host: host as string, 'content-type': 'application/json' } }, res => {
        let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => resolve({ status: res.statusCode!, body: data }));
      });
      req.on('error', reject); req.end(JSON.stringify(body));
    });
    expect(result.status).toBe(status); expect(JSON.parse(result.body).error).toBeTruthy(); expect(upstream).not.toHaveBeenCalled();
  } finally { upstream.mockRestore(); }
});
