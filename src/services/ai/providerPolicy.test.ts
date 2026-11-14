import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readProviderPolicy, enforceProviderPolicy } from './providerPolicy';
const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }));
vi.mock('./proxy', () => ({ callProxy: proxy, getLightModelForProvider: () => undefined }));
vi.mock('@/src/services/contextEngine', () => ({}));
vi.mock('@/src/services/errorService', () => ({ ErrorService: { log: vi.fn() } }));
vi.mock('@/src/db', () => ({ db: { aiUsageLogs: { add: vi.fn().mockResolvedValue(1) } } }));
const stored = new Map<string, string>();
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); stored.clear();
  stored.set('ai_provider', 'ollama'); stored.set('ai_key_openai', btoa('fixture')); stored.set('ai_key_google', btoa('fixture'));
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  proxy.mockImplementation(async provider => { if (provider === 'ollama') throw new Error('offline'); return 'cloud result'; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const params = { userPrompt: 'synthetic manuscript', systemInstruction: 'fixture' };
async function run(overrides = {}) {
  vi.resetModules(); const { callAI } = await import('./index');
  const settled = callAI({ ...params, ...overrides }).then(result => ({ result }), error => ({ error }));
  await vi.advanceTimersByTimeAsync(60_000); return settled;
}
it('Ollama never falls back to stored cloud keys by default', async () => {
  expect((await run() as any).error).toBeDefined();
  expect(proxy.mock.calls.every(call => call[0] === 'ollama')).toBe(true);
});
it('explicit fallback permission only uses the selected provider', async () => {
  stored.set('ai_fallback_providers', JSON.stringify(['openai']));
  expect(await run()).toEqual({ result: 'cloud result' });
  expect(proxy.mock.calls.map(call => call[0])).toContain('openai');
  expect(proxy.mock.calls.map(call => call[0])).not.toContain('google');
});
it('local-only overrides fallback permissions', async () => {
  stored.set('ai_local_only', 'true'); stored.set('ai_fallback_providers', '["openai"]');
  await run(); expect(proxy.mock.calls.every(call => call[0] === 'ollama')).toBe(true);
});
it('local-only blocks explicit cloud provider overrides without a proxy call', async () => {
  stored.set('ai_local_only', 'true');
  const result = await run({ provider: 'openai' });
  expect((result as any).error.code).toBe('PROVIDER_POLICY'); expect(proxy).not.toHaveBeenCalled();
});
it('revoking consent during retry prevents cloud dispatch', async () => {
  stored.set('ai_fallback_providers', '["openai"]');
  await run({ onRetry: () => stored.set('ai_local_only', 'true') });
  expect(proxy.mock.calls.every(call => call[0] === 'ollama')).toBe(true);
});
it('malformed or unknown permissions grant no fallback', () => {
  stored.set('ai_fallback_providers', '{bad'); expect(readProviderPolicy().allowedFallbacks).toEqual([]);
  stored.set('ai_fallback_providers', '["evil",1,"openai"]'); expect(readProviderPolicy().allowedFallbacks).toEqual(['openai']);
});
it('primary cloud remains usable when local-only is off', async () => {
  expect(await run({ provider: 'google' })).toEqual({ result: 'cloud result' });
});
it('unavailable storage fails closed', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
  expect(() => enforceProviderPolicy('openai')).toThrow();
  expect(() => enforceProviderPolicy('ollama')).not.toThrow();
});
it('invalid local-only setting fails closed', () => {
  stored.set('ai_local_only', 'corrupt');
  expect(() => enforceProviderPolicy('google')).toThrow();
});
it('direct proxy callers also cannot bypass local-only mode', async () => {
  stored.set('ai_local_only', 'true');
  const real = await vi.importActual<typeof import('./proxy')>('./proxy');
  const network = vi.spyOn(globalThis, 'fetch');
  await expect(real.callProxy('openai', params)).rejects.toMatchObject({ code: 'PROVIDER_POLICY' });
  expect(network).not.toHaveBeenCalled();
});
