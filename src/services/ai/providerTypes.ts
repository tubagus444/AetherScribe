export const AI_PROVIDERS = ['google', 'groq', 'openrouter', 'claude', 'huggingface', 'openai', 'ollama'] as const;
export type AIProvider = typeof AI_PROVIDERS[number];
export function assertAIProvider(value: unknown): asserts value is AIProvider {
 if (typeof value !== 'string' || !AI_PROVIDERS.some(provider => provider === value)) throw new Error('Unknown AI provider');
}
