import { readCredential } from './credentialStore';
import type { ContextDepth } from '@/src/types';

export function getSettings() {
  return {
    provider: localStorage.getItem('ai_provider') || 'google',
    contextDepth: (localStorage.getItem('ai_context_depth') as ContextDepth) || 'balanced',
    keys: {
      google: readCredential('google'),
      groq: readCredential('groq'),
      openrouter: readCredential('openrouter'),
      claude: readCredential('claude'),
      huggingface: readCredential('huggingface'),
      openai: readCredential('openai'),
      ollama: '' // Ollama doesn't use API key
    },
    models: {
      google: localStorage.getItem('ai_model_google') || '',
      groq: localStorage.getItem('ai_model_groq') || '',
      openrouter: localStorage.getItem('ai_model_openrouter') || '',
      claude: localStorage.getItem('ai_model_claude') || '',
      huggingface: localStorage.getItem('ai_model_huggingface') || '',
      openai: localStorage.getItem('ai_model_openai') || '',
      ollama: localStorage.getItem('ai_model_ollama') || ''
    }
  };
}
