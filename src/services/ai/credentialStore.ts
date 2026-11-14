export const KEY_PROVIDERS = ['google', 'groq', 'openrouter', 'claude', 'huggingface', 'openai'] as const;
export type KeyProvider = typeof KEY_PROVIDERS[number];
export type CredentialMode = 'session' | 'persistent';
export type ProviderKeys = Record<KeyProvider, string>;
const MODE_KEY = 'ai_key_storage';

export function readCredentialMode(): CredentialMode {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    if (mode !== null) return mode === 'persistent' ? 'persistent' : 'session';
    // Preserve legacy keys until the user explicitly saves another preference.
    return KEY_PROVIDERS.some(provider => localStorage.getItem(`ai_key_${provider}`)) ? 'persistent' : 'session';
  } catch { return 'session'; }
}

export function readCredential(provider: KeyProvider): string {
  try {
    if (readCredentialMode() === 'session') return sessionStorage.getItem(`ai_key_${provider}`) || '';
    const encoded = localStorage.getItem(`ai_key_${provider}`);
    return encoded ? atob(encoded) : '';
  } catch { return ''; }
}

export function readCredentials(): ProviderKeys {
  return Object.fromEntries(KEY_PROVIDERS.map(provider => [provider, readCredential(provider)])) as ProviderKeys;
}

export function saveCredentials(mode: CredentialMode, keys: ProviderKeys): void {
  const target = mode === 'session' ? sessionStorage : localStorage;
  const other = mode === 'session' ? localStorage : sessionStorage;
  // Write the destination first: a failed write must not erase legacy keys.
  for (const provider of KEY_PROVIDERS) {
    const key = keys[provider].trim();
    if (key) target.setItem(`ai_key_${provider}`, mode === 'persistent' ? btoa(key) : key);
    else target.removeItem(`ai_key_${provider}`);
  }
  for (const provider of KEY_PROVIDERS) other.removeItem(`ai_key_${provider}`);
  localStorage.setItem(MODE_KEY, mode);
}

export function clearCredentials(): void {
  for (const provider of KEY_PROVIDERS) {
    localStorage.removeItem(`ai_key_${provider}`);
    sessionStorage.removeItem(`ai_key_${provider}`);
  }
}
