import { object, array, string, parseUsage, extractProviderError, type AIUsage } from './responseContracts';
import type { StreamFinishStatus } from './types';

function streamStatus(reason: string): StreamFinishStatus {
  switch (reason.toLowerCase()) {
    case 'length':
    case 'max_tokens': return 'length';
    case 'end_turn':
    case 'stop_sequence':
    case 'stop': return 'complete';
    default: return 'provider-stop';
  }
}

/** Provider-aware SSE reader. Framing/parsing errors must not become empty success. */
export async function readAIStream(provider: string, reader: ReadableStreamDefaultReader<Uint8Array>, onChunk: (text: string) => void, onData?: () => void): Promise<{ text: string; usage: AIUsage; status: StreamFinishStatus }> {
  let buffer = '', text = '', usage: AIUsage = {}, ended = false;
  let status: StreamFinishStatus = 'complete';
  const decoder = new TextDecoder();
  const frame = (raw: string) => {
    const lines = raw.split('\n');
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const payload = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!payload) return;
    if (payload.trim() === '[DONE]') { ended = true; return; }
    let parsed: unknown;
    let data: Record<string, unknown>;
    try { parsed = JSON.parse(payload); data = object(parsed); } catch { throw new Error('Malformed SSE data frame.'); }
    if (data.error || data.type === 'error' || event === 'error') {
      const error = Object.assign(new Error(extractProviderError(data) || 'AI stream error'), { code: 'API_ERROR', provider });
      throw error;
    }
    usage = { ...usage, ...parseUsage(data.usage), ...parseUsage(data.usageMetadata), ...parseUsage(object(data.message).usage), ...parseUsage(data.amazon_bedrock_invocation_metrics) };
    let chunk = '';
    if (provider === 'claude') {
      if (data.type === 'content_block_delta') chunk = string(object(data.delta).text);
      const reason = string(object(data.delta).stop_reason);
      if (reason) status = streamStatus(reason);
      if (data.type === 'message_stop') ended = true;
    } else if (provider === 'google') {
      chunk = array(object(object(array(data.candidates)[0]).content).parts).map(part => string(object(part).text)).join('');
      const reason = string(object(array(data.candidates)[0]).finishReason);
      if (reason) { status = streamStatus(reason); ended = true; }
      if (object(data.promptFeedback).blockReason) throw new Error('AI response blocked.');
    } else {
      chunk = string(object(object(array(data.choices)[0]).delta).content);
      const reason = string(object(array(data.choices)[0]).finish_reason);
      if (reason) { status = streamStatus(reason); ended = true; }
    }
    if (typeof chunk !== 'string') throw new Error('Invalid SSE text chunk.');
    if (chunk) { text += chunk; onChunk(chunk); }
  };
  const drain = (final = false) => {
    buffer = buffer.replace(/\r\n/g, '\n');
    let split: number;
    while ((split = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, split); buffer = buffer.slice(split + 2); frame(raw);
    }
    if (final && buffer.trim()) { frame(buffer); buffer = ''; }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onData?.(); buffer += decoder.decode(value, { stream: true }); drain();
    }
    buffer += decoder.decode(); drain(true);
    if (!text.trim()) throw Object.assign(new Error('AI stream returned no text.'), { code: 'EMPTY_RESPONSE' });
    if (!ended) throw Object.assign(new Error('AI stream ended before completion.'), { code: 'API_ERROR' });
    return { text, usage, status };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
