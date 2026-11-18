export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const requestId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export function assertWriteId(value: unknown, label: string): asserts value is number {
  if (!requestId(value)) throw new Error(`${label} tidak valid.`);
}
