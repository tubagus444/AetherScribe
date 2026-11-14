export const CLOUD_PROVIDERS = ['google', 'groq', 'openrouter', 'claude', 'huggingface', 'openai'] as const;
export interface ProviderPolicy { localOnly: boolean; allowedFallbacks: string[] }
export function readProviderPolicy(): ProviderPolicy {
  try {
    let selected: unknown = [];
    try { selected = JSON.parse(localStorage.getItem('ai_fallback_providers') || '[]'); } catch { /* izin invalid = kosong */ }
    const local = localStorage.getItem('ai_local_only');
    return {
      localOnly: local === 'true' || (local !== null && local !== 'false'),
      allowedFallbacks: Array.isArray(selected) ? selected.filter((p): p is string => typeof p === 'string' && (CLOUD_PROVIDERS as readonly string[]).includes(p)) : [],
    };
  } catch { return { localOnly: true, allowedFallbacks: [] }; }
}
export function enforceProviderPolicy(provider: string, fallback = false): void {
  const policy = readProviderPolicy();
  if ((policy.localOnly && provider !== 'ollama') || (fallback && !policy.allowedFallbacks.includes(provider))) {
    const error = new Error('Provider diblokir oleh pengaturan privasi AI. Pilih Ollama atau ubah izin provider di Pengaturan.') as Error & { code: string };
    error.code = 'PROVIDER_POLICY'; throw error;
  }
}
