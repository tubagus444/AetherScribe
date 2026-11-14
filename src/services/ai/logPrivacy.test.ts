// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { proxy, log } = vi.hoisted(() => ({ proxy: vi.fn(), log: vi.fn() }));
vi.mock('./proxy', () => ({ callProxy: proxy, getLightModelForProvider: () => undefined }));
vi.mock('@/src/services/errorService', () => ({ ErrorService: { log } }));
vi.mock('@/src/services/contextEngine', () => ({}));
vi.mock('@/src/db', () => ({ db: {} }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

it('facade dispatches a session key and excludes prompts/raw provider responses from logs', async () => {
  localStorage.setItem('ai_key_storage', 'session');
  sessionStorage.setItem('ai_key_openai', 'synthetic-session');
  proxy.mockRejectedValue(Object.assign(new Error('SYNTHETIC-PROVIDER-SECRET'), { code: 'INVALID_KEY', rawMessage: 'SYNTHETIC-PROVIDER-SECRET' }));
  const { callAI } = await import('./index');
  await expect(callAI({ provider: 'openai', userPrompt: 'SYNTHETIC-MANUSCRIPT', systemInstruction: 'SYNTHETIC-SYSTEM' })).rejects.toThrow();
  expect(proxy.mock.calls[0][2]).toBe('synthetic-session');
  const logged = JSON.stringify(log.mock.calls);
  for (const privateValue of ['SYNTHETIC-PROVIDER-SECRET', 'SYNTHETIC-MANUSCRIPT', 'SYNTHETIC-SYSTEM', 'synthetic-session']) expect(logged).not.toContain(privateValue);
  expect(log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { provider: 'openai', code: 'INVALID_KEY' } }));
});
