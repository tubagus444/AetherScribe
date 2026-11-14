const MODEL_CACHE_KEY = 'openrouter_models_cache';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 jam

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

/** Bentuk model yang sudah dinormalkan, seragam lintas-provider. */
export interface ProviderModel {
  id: string;          // nilai yang disimpan sebagai pilihan model
  name: string;        // label tampilan
  description?: string; // keterangan tambahan (opsional)
}

export type ModelListProvider = 'google' | 'groq' | 'openrouter' | 'claude' | 'huggingface' | 'openai';

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const cached = localStorage.getItem(MODEL_CACHE_KEY);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) return data;
    } catch (e) {
      console.warn('Error parsing OpenRouter models cache.');
    }
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error('Failed to fetch models');

    const json = await res.json();
    const models = json.data.map((m: any) => ({
      id: m.id,
      name: m.name,
      pricing: m.pricing
    }));

    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({
      data: models,
      timestamp: Date.now()
    }));

    return models;
  } catch (error) {
    console.error('Error fetching OpenRouter models; sensitive details omitted.');
    // Return empty or fallback if fetch fails but we have stale cache
    if (cached) {
      const { data } = JSON.parse(cached);
      return data;
    }
    return [];
  }
}

/** Ekstrak pesan error yang bersih dari respons proxy listing model. */
async function readProxyError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed.error && typeof parsed.error === 'object') {
      return parsed.error.message || JSON.stringify(parsed.error);
    }
    return parsed.error || parsed.message || text || fallback;
  } catch {
    return text || fallback;
  }
}

/** POST ke endpoint proxy listing model, dengan key diteruskan via header. */
async function postModelListing(path: string, apiKey?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  const response = await fetch(path, { method: 'POST', headers });
  if (!response.ok) {
    throw new Error(await readProxyError(response, 'Gagal mengambil daftar model.'));
  }
  return response.json();
}

/**
 * Sumber tunggal pengambilan daftar model lintas-provider.
 * Mengembalikan daftar ternormalisasi `ProviderModel[]`.
 * - openrouter: endpoint publik (tanpa key), di-cache 24 jam.
 * - google/groq/claude/huggingface: lewat proxy server, butuh `apiKey`.
 */
export async function fetchModelsForProvider(
  provider: ModelListProvider,
  apiKey?: string,
): Promise<ProviderModel[]> {
  switch (provider) {
    case 'openrouter': {
      const models = await fetchOpenRouterModels();
      return models.map((m) => ({ id: m.id, name: m.name }));
    }

    case 'google': {
      const data = await postModelListing('/api/ai/google-models', apiKey);
      if (!Array.isArray(data.models)) {
        throw new Error(data.error || 'Format data dari Google API tidak sesuai.');
      }
      return data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => {
          const id = typeof m.name === 'string' && m.name.startsWith('models/')
            ? m.name.substring(7)
            : m.name;
          return { id, name: m.displayName || id, description: m.description || '' };
        });
    }

    case 'groq': {
      const data = await postModelListing('/api/ai/groq-models', apiKey);
      if (!Array.isArray(data.data)) {
        throw new Error(data.error || 'Format data dari Groq API tidak sesuai.');
      }
      return data.data
        .filter((m: any) => m.active !== false)
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          description: m.owned_by ? `oleh ${m.owned_by}` : '',
        }));
    }

    case 'claude': {
      const data = await postModelListing('/api/ai/claude-models', apiKey);
      if (!Array.isArray(data.data)) {
        throw new Error(data.error || 'Format data dari Claude API tidak sesuai.');
      }
      return data.data.map((m: any) => ({
        id: m.id,
        name: m.display_name || m.id,
      }));
    }

    case 'huggingface': {
      const data = await postModelListing('/api/ai/huggingface-models', apiKey);
      if (!Array.isArray(data.data)) {
        throw new Error(data.error || 'Format data dari Hugging Face API tidak sesuai.');
      }
      return data.data.map((m: any) => ({
        id: m.id,
        name: m.id,
      }));
    }

    case 'openai': {
      const data = await postModelListing('/api/ai/openai-models', apiKey);
      if (!Array.isArray(data.data)) {
        throw new Error(data.error || 'Format data dari OpenAI API tidak sesuai.');
      }
      // Hanya model chat/GPT yang relevan; buang embedding/tts/whisper/dll.
      return data.data
        .filter((m: any) => typeof m.id === 'string' && (m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3') || m.id.startsWith('o4') || m.id.startsWith('chatgpt')))
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          description: m.owned_by ? `oleh ${m.owned_by}` : '',
        }));
    }

    default:
      return [];
  }
}
