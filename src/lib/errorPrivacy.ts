import type { AppError } from '@/src/types';

const providers = new Set(['google', 'groq', 'openrouter', 'claude', 'huggingface', 'openai', 'ollama']);
const codes = new Set(['INVALID_KEY', 'RATE_LIMIT', 'QUOTA_EXCEEDED', 'MODEL_NOT_FOUND', 'NETWORK_ERROR', 'EMPTY_RESPONSE', 'CIRCUIT_OPEN', 'TIMEOUT', 'API_ERROR', 'PROVIDER_POLICY']);
const sources = new Set(['Global (window.error)', 'Global (unhandledrejection)', 'ProjectContext', 'React Error Boundary', 'Panel Error Boundary', 'Toast Notification']);

/** Logs accept structural diagnostics, never arbitrary messages, stacks or payloads. */
export function privateErrorRecord(error: Partial<AppError>): AppError {
  const ai = /^AI-(Service|Proxy) \((google|groq|openrouter|claude|huggingface|openai|ollama)\)$/.test(error.source || '');
  const metadata: Record<string, unknown> = {};
  const input = error.metadata;
  if (input && typeof input === 'object') {
    if (providers.has(input.provider)) metadata.provider = input.provider;
    if (codes.has(input.code)) metadata.code = input.code;
    if (typeof input.networkError === 'boolean') metadata.networkError = input.networkError;
    for (const key of ['id', 'lineno', 'colno']) {
      if (typeof input[key] === 'number' && Number.isFinite(input[key])) metadata[key] = input[key];
    }
  }
  return {
    ...(typeof error.id === 'number' ? { id: error.id } : {}),
    message: ai ? 'Permintaan AI gagal. Detail sensitif tidak dicatat.' : 'Terjadi kesalahan aplikasi. Detail sensitif tidak dicatat.',
    type: error.type === 'warning' || error.type === 'info' ? error.type : 'error',
    timestamp: Number.isFinite(error.timestamp) ? error.timestamp! : Date.now(),
    source: ai || sources.has(error.source || '') ? error.source! : 'Unknown',
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
}
