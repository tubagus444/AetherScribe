import { readProviderPolicy } from '@/src/services/ai/providerPolicy';
import { useState, useEffect } from 'react';
import { ContextDepth } from '@/src/types';
import { DEFAULT_MAX_CACHED_LORE_CHARS, DEFAULT_CLAUDE_CACHE_TTL, DEFAULT_REWRITE_TEMPERATURE } from '@/src/lib/aiTuning';

export type ProviderKeys = { google: string; groq: string; openrouter: string; claude: string; huggingface: string; openai: string };
export type ProviderModels = { google: string; groq: string; openrouter: string; claude: string; huggingface: string; openai: string; ollama: string };

/**
 * Sumber tunggal pemuatan & penyimpanan pengaturan AI ke localStorage.
 * Memisahkan logika persist dari presentasi (RENCANA-AUDIT-KODE UI1).
 */
export function useAISettings() {
  const [localOnly, setLocalOnlyState] = useState(() => readProviderPolicy().localOnly);
  const [allowedFallbacks, setAllowedFallbacksState] = useState(() => readProviderPolicy().allowedFallbacks);
  const setLocalOnly = (value: boolean) => {
    localStorage.setItem('ai_local_only', String(value)); setLocalOnlyState(value); window.dispatchEvent(new Event('storage'));
  };
  const setAllowedFallbacks = (value: string[]) => {
    localStorage.setItem('ai_fallback_providers', JSON.stringify(value)); setAllowedFallbacksState(value); window.dispatchEvent(new Event('storage'));
  };
  useEffect(() => {
    const refresh = () => {
      const policy = readProviderPolicy();
      setLocalOnlyState(policy.localOnly); setAllowedFallbacksState(policy.allowedFallbacks);
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  const [provider, setProvider] = useState('google');
  const [contextDepth, setContextDepth] = useState<ContextDepth>('balanced');
  const [keys, setKeys] = useState<ProviderKeys>({
    google: '',
    groq: '',
    openrouter: '',
    claude: '',
    huggingface: '',
    openai: ''
  });
  const [models, setModels] = useState<ProviderModels>({
    google: '',
    groq: '',
    openrouter: '',
    claude: '',
    huggingface: '',
    openai: '',
    ollama: ''
  });
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  // Optimasi AI lanjutan (RENCANA-OPTIMASI-AI #5 & #7)
  const [maxLoreChars, setMaxLoreChars] = useState(String(DEFAULT_MAX_CACHED_LORE_CHARS));
  const [lightModels, setLightModels] = useState<Record<string, string>>({
    google: '',
    groq: '',
    openrouter: '',
    claude: '',
    huggingface: '',
    openai: ''
  });
  const [cacheTtl, setCacheTtl] = useState<string>(DEFAULT_CLAUDE_CACHE_TTL);
  const [rewriteTemp, setRewriteTemp] = useState<string>(String(DEFAULT_REWRITE_TEMPERATURE));
  // Konsistensi inline berbasis AI (opsional; default mati = nol token).
  const [inlineConsistencyAI, setInlineConsistencyAI] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Load from localStorage on mount with minimal obfuscation
    const loadKey = (name: string) => {
      try {
        const stored = localStorage.getItem(`ai_key_${name}`);
        return stored ? atob(stored) : '';
      } catch (e) {
        return '';
      }
    };

    const loadModel = (name: string) => {
      return localStorage.getItem(`ai_model_${name}`) || '';
    };

    setProvider(localStorage.getItem('ai_provider') || 'google');
    setContextDepth((localStorage.getItem('ai_context_depth') as ContextDepth) || 'balanced');
    setKeys({
      google: loadKey('google'),
      groq: loadKey('groq'),
      openrouter: loadKey('openrouter'),
      claude: loadKey('claude'),
      huggingface: loadKey('huggingface'),
      openai: loadKey('openai')
    });
    setModels({
      google: loadModel('google'),
      groq: loadModel('groq'),
      openrouter: loadModel('openrouter'),
      claude: loadModel('claude'),
      huggingface: loadModel('huggingface'),
      openai: loadModel('openai'),
      ollama: loadModel('ollama')
    });
    setOllamaBaseUrl(localStorage.getItem('ollama_base_url') || 'http://localhost:11434');
    setOllamaEnabled(localStorage.getItem('ollama_enabled') === 'true');
    setMaxLoreChars(localStorage.getItem('ai_max_cached_lore_chars') || String(DEFAULT_MAX_CACHED_LORE_CHARS));
    setLightModels({
      google: localStorage.getItem('ai_light_model_google') || '',
      groq: localStorage.getItem('ai_light_model_groq') || '',
      openrouter: localStorage.getItem('ai_light_model_openrouter') || '',
      claude: localStorage.getItem('ai_light_model_claude') || '',
      huggingface: localStorage.getItem('ai_light_model_huggingface') || '',
      openai: localStorage.getItem('ai_light_model_openai') || ''
    });
    setCacheTtl(localStorage.getItem('ai_claude_cache_ttl') === '5m' ? '5m' : DEFAULT_CLAUDE_CACHE_TTL);
    setRewriteTemp(localStorage.getItem('ai_rewrite_temperature') || String(DEFAULT_REWRITE_TEMPERATURE));
    setInlineConsistencyAI(localStorage.getItem('ai_inline_consistency') === 'true');
  }, []);

  // Toggle yang TERSIMPAN SEKETIKA (tanpa tombol Simpan) — switch on/off lebih
  // intuitif bila langsung berlaku. Event 'storage' memberi tahu editor agar
  // lapisan AI inline langsung aktif/nonaktif tanpa perlu refresh.
  const toggleInlineConsistencyAI = () => {
    setInlineConsistencyAI(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ai_inline_consistency', next ? 'true' : 'false');
        window.dispatchEvent(new Event('storage'));
      } catch { /* abaikan kuota/privasi */ }
      return next;
    });
  };

  const handleSave = () => {
    localStorage.setItem('ai_provider', provider);
    localStorage.setItem('ai_context_depth', contextDepth);
    localStorage.setItem('ollama_base_url', ollamaBaseUrl);
    localStorage.setItem('ollama_enabled', ollamaEnabled.toString());
    localStorage.setItem('ai_max_cached_lore_chars', maxLoreChars);
    localStorage.setItem('ai_claude_cache_ttl', cacheTtl);
    localStorage.setItem('ai_rewrite_temperature', rewriteTemp);
    localStorage.setItem('ai_inline_consistency', inlineConsistencyAI ? 'true' : 'false');

    // Override model tugas-ringan per provider; kosong = pakai default hardcoded.
    (['google', 'groq', 'openrouter', 'claude', 'huggingface', 'openai'] as const).forEach((p) => {
      const val = lightModels[p]?.trim();
      if (val) localStorage.setItem(`ai_light_model_${p}`, val);
      else localStorage.removeItem(`ai_light_model_${p}`);
    });

    const saveKey = (name: string, value: string) => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        localStorage.setItem(`ai_key_${name}`, btoa(trimmedValue));
        sessionStorage.setItem(`ai_key_${name}`, trimmedValue); // Active session usage
      } else {
        localStorage.removeItem(`ai_key_${name}`);
        sessionStorage.removeItem(`ai_key_${name}`);
      }
    };

    const saveModel = (name: string, value: string) => {
      if (value) {
        localStorage.setItem(`ai_model_${name}`, value);
      } else {
        localStorage.removeItem(`ai_model_${name}`);
      }
    };

    saveKey('google', keys.google);
    saveKey('groq', keys.groq);
    saveKey('openrouter', keys.openrouter);
    saveKey('claude', keys.claude);
    saveKey('huggingface', keys.huggingface);
    saveKey('openai', keys.openai);

    saveModel('google', models.google);
    saveModel('groq', models.groq);
    saveModel('openrouter', models.openrouter);
    saveModel('claude', models.claude);
    saveModel('huggingface', models.huggingface);
    saveModel('openai', models.openai);
    saveModel('ollama', models.ollama);

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    // Dispatch storage event so hooks can pick up ollama changes in same window
    window.dispatchEvent(new Event('storage'));
  };

  return {
    localOnly, setLocalOnly, allowedFallbacks, setAllowedFallbacks,
    provider, setProvider,
    contextDepth, setContextDepth,
    keys, setKeys,
    models, setModels,
    ollamaBaseUrl, setOllamaBaseUrl,
    ollamaEnabled, setOllamaEnabled,
    maxLoreChars, setMaxLoreChars,
    lightModels, setLightModels,
    cacheTtl, setCacheTtl,
    rewriteTemp, setRewriteTemp,
    inlineConsistencyAI, setInlineConsistencyAI, toggleInlineConsistencyAI,
    isSaved,
    handleSave,
  };
}
