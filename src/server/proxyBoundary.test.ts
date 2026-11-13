import { describe, it, expect, vi } from 'vitest';
import { allowedOllama, proxyBoundary, validateProxyRequest } from './proxyBoundary';

describe('F02/F18 proxy boundaries', () => {
  it.each([undefined, 'http://localhost:11434', 'http://127.0.0.1:11434/', 'http://[::1]:11434'])('accepts local target %s', url => expect(allowedOllama(url)).toBe(true));
  it.each([null, 12, [], 'http://example.com:11434', 'http://127.0.0.1:80', 'file:///etc/passwd', 'http://user@localhost:11434', 'http://localhost:11434/path', 'http://localhost:11434/?x=1'])('rejects unsafe target %j', url => expect(allowedOllama(url)).toBe(false));
  it.each([null, [], 1, { provider: 'google', body: { model: 123 } }, { provider: 'ollama', body: {}, ollamaBaseUrl: 123 }, { provider: 'unknown', body: {} }, { provider: 'openai', body: [] }])('returns 400 for malformed input %j', body => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; const next = vi.fn();
    validateProxyRequest({ body, path: '/ai/proxy' } as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(400); expect(next).not.toHaveBeenCalled();
  });
  it.each([{ host: 'evil.test:3000' }, { host: 'localhost:3000', origin: 'https://evil.test' }, { host: 'localhost:3000', 'sec-fetch-site': 'cross-site' }])('rejects unauthorized caller %j', headers => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; const next = vi.fn();
    proxyBoundary({ headers } as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
  });
});
