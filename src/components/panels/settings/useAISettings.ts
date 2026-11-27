import { useState, useEffect } from 'react';
import {
  KEY_PROVIDERS, readCredentialMode, readCredentials, saveCredentials, clearCredentials,
  type CredentialMode, type ProviderKeys,
} from '@/src/services/ai/credentialStore';
import { readProviderPolicy } from '@/src/services/ai/providerPolicy';
import type { ContextDepth } from '@/src/types';
import { DEFAULT_MAX_CACHED_LORE_CHARS, DEFAULT_CLAUDE_CACHE_TTL, DEFAULT_REWRITE_TEMPERATURE, type ClaudeCacheTtl } from '@/src/lib/aiTuning';

export type { ProviderKeys } from '@/src/services/ai/credentialStore';
export type ProviderModels = ProviderKeys & { ollama: string };

function readDraft() {
  const read = (key: string) => localStorage.getItem(key) ?? '';
  const modelProviders = [...KEY_PROVIDERS, 'ollama'] as const;
  return {
    provider: read('ai_provider') || 'google',
    contextDepth: (read('ai_context_depth') || 'balanced') as ContextDepth,
    keys: readCredentials(),
    models: Object.fromEntries(modelProviders.map(provider => [provider, read(`ai_model_${provider}`)])) as ProviderModels,
    lightModels: Object.fromEntries(KEY_PROVIDERS.map(provider => [provider, read(`ai_light_model_${provider}`)])) as ProviderKeys,
    ollamaBaseUrl: read('ollama_base_url') || 'http://localhost:11434',
    ollamaEnabled: read('ollama_enabled') === 'true',
    maxLoreChars: read('ai_max_cached_lore_chars') || String(DEFAULT_MAX_CACHED_LORE_CHARS),
    cacheTtl: read('ai_claude_cache_ttl') === '5m' ? '5m' : DEFAULT_CLAUDE_CACHE_TTL,
    rewriteTemp: read('ai_rewrite_temperature') || String(DEFAULT_REWRITE_TEMPERATURE),
    credentialMode: readCredentialMode(),
  };
}

type AISettingsDraft = ReturnType<typeof readDraft>;

function sameDraft(draft: AISettingsDraft, saved: AISettingsDraft): boolean {
  return draft.provider === saved.provider
    && draft.contextDepth === saved.contextDepth
    && draft.ollamaBaseUrl === saved.ollamaBaseUrl
    && draft.ollamaEnabled === saved.ollamaEnabled
    && draft.maxLoreChars === saved.maxLoreChars
    && draft.cacheTtl === saved.cacheTtl
    && draft.rewriteTemp === saved.rewriteTemp
    && draft.credentialMode === saved.credentialMode
    && draft.models.ollama === saved.models.ollama
    && KEY_PROVIDERS.every(provider => draft.keys[provider] === saved.keys[provider]
      && draft.models[provider] === saved.models[provider]
      && draft.lightModels[provider] === saved.lightModels[provider]);
}

/** Form draft lives in the settings shell while the user switches tabs. */
export function useAISettings() {
  const [saved, setSaved] = useState(readDraft);
  const [draft, setDraft] = useState(saved);
  const [policy, setPolicy] = useState(readProviderPolicy);
  const [inlineConsistencyAI, setInlineConsistencyAI] = useState(() => localStorage.getItem('ai_inline_consistency') === 'true');
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const refresh = () => {
      setPolicy(readProviderPolicy());
      setInlineConsistencyAI(localStorage.getItem('ai_inline_consistency') === 'true');
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const update = <Key extends keyof AISettingsDraft>(key: Key, value: AISettingsDraft[Key]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setIsSaved(false);
    setSaveError('');
  };

  const applyImmediately = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
      setSaveError('');
      window.dispatchEvent(new Event('storage'));
    } catch {
      setSaveError('Perubahan tidak tersimpan. Periksa izin penyimpanan browser lalu coba lagi.');
    }
  };

  const handleSave = () => {
    setIsSaved(false);
    setSaveError('');
    try {
      if (draft.credentialMode !== saved.credentialMode || KEY_PROVIDERS.some(provider => draft.keys[provider] !== saved.keys[provider])) {
        saveCredentials(draft.credentialMode, draft.keys);
      }
      localStorage.setItem('ai_provider', draft.provider);
      localStorage.setItem('ai_context_depth', draft.contextDepth);
      localStorage.setItem('ollama_base_url', draft.ollamaBaseUrl.trim());
      localStorage.setItem('ollama_enabled', String(draft.ollamaEnabled));
      localStorage.setItem('ai_max_cached_lore_chars', draft.maxLoreChars);
      localStorage.setItem('ai_claude_cache_ttl', draft.cacheTtl);
      localStorage.setItem('ai_rewrite_temperature', draft.rewriteTemp);

      for (const provider of [...KEY_PROVIDERS, 'ollama'] as const) {
        const model = draft.models[provider];
        if (model) localStorage.setItem(`ai_model_${provider}`, model);
        else localStorage.removeItem(`ai_model_${provider}`);
      }
      for (const provider of KEY_PROVIDERS) {
        const model = draft.lightModels[provider].trim();
        if (model) localStorage.setItem(`ai_light_model_${provider}`, model);
        else localStorage.removeItem(`ai_light_model_${provider}`);
      }

      const persisted = readDraft();
      setSaved(persisted);
      setDraft(persisted);
      setIsSaved(true);
      window.dispatchEvent(new Event('storage'));
    } catch {
      setSaveError('Gagal menyimpan pengaturan. Periksa izin penyimpanan browser lalu coba lagi.');
    }
  };

  const handleClearCredentials = () => {
    try {
      clearCredentials();
      const keys = readCredentials();
      update('keys', keys);
      setSaved(current => ({ ...current, keys, credentialMode: readCredentialMode() }));
      window.dispatchEvent(new Event('storage'));
    } catch {
      setSaveError('Gagal menghapus key dari penyimpanan browser. Coba lagi.');
    }
  };

  return {
    ...draft,
    ...policy,
    setLocalOnly: (value: boolean) => applyImmediately('ai_local_only', String(value)),
    setAllowedFallbacks: (value: string[]) => applyImmediately('ai_fallback_providers', JSON.stringify(value)),
    setProvider: (value: string) => update('provider', value),
    setContextDepth: (value: ContextDepth) => update('contextDepth', value),
    setKeys: (value: ProviderKeys) => update('keys', value),
    setModels: (value: ProviderModels) => update('models', value),
    setOllamaBaseUrl: (value: string) => update('ollamaBaseUrl', value),
    setOllamaEnabled: (value: boolean) => update('ollamaEnabled', value),
    setMaxLoreChars: (value: string) => update('maxLoreChars', value),
    setLightModels: (value: ProviderKeys) => update('lightModels', value),
    setCacheTtl: (value: ClaudeCacheTtl) => update('cacheTtl', value),
    setRewriteTemp: (value: string) => update('rewriteTemp', value),
    setCredentialMode: (value: CredentialMode) => update('credentialMode', value),
    inlineConsistencyAI,
    toggleInlineConsistencyAI: () => applyImmediately('ai_inline_consistency', String(!inlineConsistencyAI)),
    isDirty: !sameDraft(draft, saved),
    isSaved, saveError, handleClearCredentials, handleSave,
  };
}
