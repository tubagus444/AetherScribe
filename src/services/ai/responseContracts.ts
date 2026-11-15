import { record, finite } from '@/src/lib/dataContracts';
export interface AIUsage {
 cache_read_input_tokens?: number; cachedContentTokenCount?: number; cache_creation_input_tokens?: number;
 promptTokens?: number; prompt_tokens?: number; promptTokenCount?: number; input_tokens?: number; inputTokenCount?: number;
 completionTokens?: number; completion_tokens?: number; output_tokens?: number; outputTokenCount?: number; candidatesTokenCount?: number;
 prompt_tokens_details?: { cached_tokens?: number };
}
export function object(value: unknown): Record<string, unknown> {
 if (value === undefined || value === null) return {};
 if (!record(value)) throw new Error('Invalid AI response object');
 return value;
}
export function array(value: unknown): unknown[] {
 if (value === undefined || value === null) return [];
 if (!Array.isArray(value)) throw new Error('Invalid AI response array');
 return value;
}
export function string(value: unknown): string {
 if (value === undefined || value === null) return '';
 if (typeof value !== 'string') throw new Error('Invalid AI text');
 return value;
}
export function parseUsage(value: unknown): AIUsage {
 const data = object(value), result: AIUsage = {};
 const fields = ['cache_read_input_tokens','cachedContentTokenCount','cache_creation_input_tokens','promptTokens','prompt_tokens','promptTokenCount','input_tokens','inputTokenCount','completionTokens','completion_tokens','output_tokens','outputTokenCount','candidatesTokenCount'] as const;
 for (const key of fields) {
  if (data[key] === undefined || data[key] === null) continue;
  if (!finite(data[key]) || data[key] < 0) throw new Error('Invalid AI token usage');
  result[key] = data[key];
 }
 const cached = object(data.prompt_tokens_details).cached_tokens;
 if (cached !== undefined && cached !== null) {
  if (!finite(cached) || cached < 0) throw new Error('Invalid AI cached usage');
  result.prompt_tokens_details = { cached_tokens: cached };
 }
 return result;
}
export function extractCompleteText(provider: string, value: unknown): string {
 const data = object(value);
 if (provider === 'claude') return string(object(array(data.content)[0]).text);
 if (provider === 'google') return string(object(array(object(object(array(data.candidates)[0]).content).parts)[0]).text);
 return string(object(object(array(data.choices)[0]).message).content);
}
export function extractProviderError(value: unknown): string | undefined {
 if (!record(value)) return undefined;
 return typeof value.error === 'string' ? value.error : record(value.error) && typeof value.error.message === 'string' ? value.error.message : typeof value.message === 'string' ? value.message : undefined;
}
