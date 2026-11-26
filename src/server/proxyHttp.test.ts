import { request } from 'node:http';
import type { Server } from 'node:http';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createProxyApp } from '../../server';

let server: Server;
beforeAll(async () => { server = createProxyApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

function postJson(path: string, body: unknown, host: string, apiKey?: string) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP test server is unavailable');
  const headers: Record<string, string> = { host, 'content-type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  return new Promise<{ status: number; body: string; cacheControl?: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, method: 'POST', headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode!, body: data, cacheControl: res.headers['cache-control'] }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

it.each([
  ['/api/ai/proxy', { provider: 'google', body: { model: 42 } }, 'localhost:3000', 400],
  ['/api/ai/ollama-models', { baseUrl: 42 }, 'localhost:3000', 400],
  ['/api/ai/google-models', {}, 'attacker.test:3000', 403],
  ['/api/ai/openrouter-models', {}, 'attacker.test:3000', 403],
] as const)('HTTP %s rejects before contacting upstream', async (path, body, host, status) => {
  const upstream = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected upstream'));
  try {
    const result = await postJson(path, body, host);
    expect(result.status).toBe(status); expect(JSON.parse(result.body).error).toBeTruthy(); expect(upstream).not.toHaveBeenCalled();
  } finally { upstream.mockRestore(); }
});

it('loads the OpenRouter account catalog with the form key or server key', async () => {
  const catalog = { data: [{ id: 'example/text-model' }] };
  const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(catalog));
  const endpoint = '/api/ai/openrouter-models';
  vi.stubEnv('OPENROUTER_API_KEY', '');
  try {
    expect((await postJson(endpoint, {}, 'localhost:3000')).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();

    vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-server-key');
    const serverKey = await postJson(endpoint, {}, 'localhost:3000');
    const formKey = await postJson(endpoint, {}, 'localhost:3000', 'synthetic-form-key');
    for (const result of [serverKey, formKey]) {
      expect(result.status).toBe(200);
      expect(result.cacheControl).toBe('no-store');
      expect(JSON.parse(result.body)).toEqual(catalog);
    }
    expect(upstream.mock.calls.map(([url, init]) => [url, init?.headers])).toEqual([
      ['https://openrouter.ai/api/v1/models/user?output_modalities=text', { Authorization: 'Bearer synthetic-server-key' }],
      ['https://openrouter.ai/api/v1/models/user?output_modalities=text', { Authorization: 'Bearer synthetic-form-key' }],
    ]);
  } finally {
    upstream.mockRestore();
    vi.unstubAllEnvs();
  }
});
