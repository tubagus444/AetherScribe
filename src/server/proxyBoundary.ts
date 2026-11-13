import type { RequestHandler } from 'express';

const origins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
const hosts = new Set(['localhost:3000', '127.0.0.1:3000']);
const providers = new Set(['google', 'claude', 'groq', 'openrouter', 'openai', 'huggingface', 'ollama']);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Hanya endpoint Ollama loopback pada port baku; tidak ada DNS hostname bebas. */
export function allowedOllama(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.port === '11434' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export const proxyBoundary: RequestHandler = (req, res, next) => {
  if (!hosts.has(req.headers.host ?? '') ||
      (req.headers.origin !== undefined && !origins.has(req.headers.origin)) ||
      req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Proxy hanya menerima origin localhost aplikasi.' });
    return;
  }
  next();
};

/** Dipasang setelah JSON parser, sebelum operasi raw input pada handler async. */
export const validateProxyRequest: RequestHandler = (req, res, next) => {
  const input = req.body;
  let valid = object(input);
  if (valid && req.path === '/ai/proxy') {
    valid = providers.has(input.provider) && object(input.body) &&
      (input.body.model === undefined || (typeof input.body.model === 'string' && input.body.model.length > 0 && input.body.model.length <= 256)) &&
      (input.body.stream === undefined || typeof input.body.stream === 'boolean') && allowedOllama(input.ollamaBaseUrl);
    if (valid && input.provider === 'google' && input.body.model !== undefined) {
      valid = /^(models\/)?[a-zA-Z0-9._-]+$/.test(input.body.model);
    }
  } else if (valid && req.path === '/ai/ollama-models') valid = allowedOllama(input.baseUrl);
  if (!valid) { res.status(400).json({ error: 'Struktur request atau tujuan Ollama tidak diizinkan.' }); return; }
  next();
};
