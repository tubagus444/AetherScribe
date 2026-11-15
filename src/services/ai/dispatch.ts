import type { AIRenderParams } from './types';
import { getSettings } from './settings';
import { callProxy, getLightModelForProvider } from './proxy';
import { readProviderPolicy, enforceProviderPolicy } from './providerPolicy';
import { ErrorService } from '@/src/services/errorService';
import { CircuitBreaker } from './circuitBreaker';
import { computeBackoffDelay, shouldAttemptFallback, selectFallbackProviders } from './resilience';

export class AIError extends Error {
  code: string;
  provider?: string;

  constructor(message: string, code: string, provider?: string) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.name = 'AIError';
  }
}

const MAX_RETRIES = 3;
const FALLBACK_ORDER = ['openrouter', 'google', 'claude', 'groq', 'huggingface', 'openai']; // Ordered preference for fallback

// Tugas mekanis (bukan penulisan kreatif) dirutekan ke model tier-murah provider
// yang sama. rewrite/chat/expand tetap memakai model pilihan pengguna demi kualitas.
const LIGHT_TASK_ACTIONS = new Set(['extract', 'summarize']);

// Circuit breaker per-provider (logika inti + tes di ./circuitBreaker).
const CIRCUIT_OPEN_THRESHOLD = 3; // 3 consecutive failures to open circuit
const CIRCUIT_RESET_TIME = 1000 * 30; // 30 seconds
const breaker = new CircuitBreaker(CIRCUIT_OPEN_THRESHOLD, CIRCUIT_RESET_TIME);

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

async function callAIWithBackoff(
  params: AIRenderParams,
  provider: string,
  settings: ReturnType<typeof getSettings>,
  isFallback: boolean = false
): Promise<string> {
  let attempt = 1;
  // Hindari mutasi objek params milik pemanggil; resolusi model & key dilakukan lokal.
  let model = params.model || settings.models[provider as keyof typeof settings.models];
  // Routing per-tugas: tugas mekanis pakai model murah provider yang sama (kecuali
  // pemanggil sudah memaksa model tertentu lewat params.model).
  if (!params.model && params.actionType && LIGHT_TASK_ACTIONS.has(params.actionType)) {
    model = getLightModelForProvider(provider) || model;
  }
  const apiKey = settings.keys[provider as keyof typeof settings.keys];

  while (attempt <= MAX_RETRIES) {
    if (!breaker.check(provider)) {
      // Circuit terbuka: provider utama langsung dialihkan ke fallback; fallback digagalkan.
      if (isFallback) {
        throw new AIError(`Koneksi ${provider} terputus sementara (Circuit Open).`, 'CIRCUIT_OPEN', provider);
      }
      break;
    }

    try {
      enforceProviderPolicy(provider, isFallback);
      const result = await callProxy(provider, { ...params, model }, apiKey);

      breaker.recordSuccess(provider);
      return result;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        breaker.clearHalfOpen(provider); // jangan biarkan trial half-open menggantung karena pembatalan
        throw error;
      }

      if (error.code === 'PROVIDER_POLICY') throw new AIError(error.message, error.code, provider);
      breaker.recordFailure(provider);

      // Kunci salah / kuota habis: percuma diulang, lempar segera agar user tahu.
      if (error.code === 'INVALID_KEY' || error.code === 'QUOTA_EXCEEDED' || error.code === 'PROVIDER_POLICY') {
        throw new AIError(error.message, error.code, provider);
      }

      if (attempt < MAX_RETRIES) {
        const delay = computeBackoffDelay(attempt); // Exponential backoff: 2s, 4s, 8s + jitter
        if (params.onRetry) {
          params.onRetry(attempt, error, provider);
        }
        await wait(delay);
        attempt++;
      } else {
        if (isFallback) {
          throw new AIError(`Gagal menghubungi ${provider} setelah beberapa percobaan.`, error.code || 'API_ERROR', provider);
        } else {
          break; // Move to fallback logic outside this function
        }
      }
    }
  }

  throw new AIError(`Gagal menghubungi ${provider} setelah percobaan maksimal.`, 'TIMEOUT', provider);
}

export async function callAI(params: AIRenderParams): Promise<string> {
  const settings = getSettings();
  const provider = params.provider || settings.provider;

  try {
    return await callAIWithBackoff(params, provider, settings, false);
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;

    // Only attempt fallback if we know it's a connection/server/rate limit issue
    // NOT if there's no API key or Invalid API Key.
    if (error.code !== 'PROVIDER_POLICY' && shouldAttemptFallback(error.code) && !readProviderPolicy().localOnly) {
      const candidates = selectFallbackProviders(
        FALLBACK_ORDER,
        provider,
        (p) => readProviderPolicy().allowedFallbacks.includes(p) && !!settings.keys[p as keyof typeof settings.keys],
      );
      for (const fallback of candidates) {
        try {
          if (params.onRetry) params.onRetry(1, error, `${fallback} (Cadangan)`);
          const fallbackParams = { ...params, model: undefined, provider: fallback }; // let backup decide its own model
          return await callAIWithBackoff(fallbackParams, fallback, settings, true);
        } catch (fallbackError: any) {
          if (fallbackError.name === 'AbortError') throw fallbackError;
          continue; // Try next fallback
        }
      }
    }

    // If we land here, either all fallbacks failed or we didn't try
    const aiError = new AIError(
      error.message || 'AI processing failed',
      error.code || 'API_ERROR',
      provider
    );

    // Log hanya kode/provider; jangan simpan prompt atau pesan mentah provider.
    ErrorService.log({
      message: 'Permintaan AI gagal.',
      type: 'error',
      source: `AI-Service (${provider})`,
      metadata: {
        provider,
        code: aiError.code,
      }
    });
    throw aiError;
  }
}
