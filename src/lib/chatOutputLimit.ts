export const DEFAULT_CHAT_OUTPUT = 4096;

export function validChatOutput(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function sessionOutput(value: unknown) {
  return validChatOutput(value) ? value : DEFAULT_CHAT_OUTPUT;
}

function capacityKey(provider: string, model: string) {
  return JSON.stringify(['ai-output-capacity', provider, model]);
}

export function knownOutputLimit(provider: string, model: string) {
  try {
    const value = Number(sessionStorage.getItem(capacityKey(provider, model)));
    return validChatOutput(value) ? value : undefined;
  } catch { return undefined; }
}

export function rememberOutputLimit(provider: string, model: string, capacity: number) {
  try { sessionStorage.setItem(capacityKey(provider, model), String(capacity)); }
  catch { /* Penyimpanan tab dapat dinonaktifkan. */ }
}

export function reportedOutputLimit(message: string) {
  const match = /(?:max(?:imum)?[_ ]?(?:output[_ ]?|completion[_ ]?)?tokens?|output token limit)\s*(?:must be (?:at most|less than or equal to|<=)|is|of|:|=|cannot exceed)\s*([\d,]+)/i.exec(message);
  const value = Number(match?.[1].replace(/,/g, ''));
  return validChatOutput(value) ? value : undefined;
}
