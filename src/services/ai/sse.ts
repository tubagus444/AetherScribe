/** Provider-aware SSE reader. Framing/parsing errors must not become empty success. */
export async function readAIStream(provider: string, reader: ReadableStreamDefaultReader<Uint8Array>, onChunk: (text: string) => void, onData?: () => void): Promise<{ text: string; usage: any }> {
  let buffer = '', text = '', usage: any = {}, ended = false;
  const decoder = new TextDecoder();
  const frame = (raw: string) => {
    const lines = raw.split('\n');
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const payload = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!payload) return;
    if (payload.trim() === '[DONE]') { ended = true; return; }
    let data: any;
    try { data = JSON.parse(payload); } catch { throw new Error('Malformed SSE data frame.'); }
    if (data.error || data.type === 'error' || event === 'error') {
      const error = new Error(data.error?.message || data.message || 'AI stream error') as any;
      error.code = 'API_ERROR'; error.provider = provider; throw error;
    }
    usage = { ...usage, ...data.usage, ...data.usageMetadata, ...data.message?.usage, ...data.amazon_bedrock_invocation_metrics };
    let chunk = '';
    if (provider === 'claude') {
      if (data.type === 'content_block_delta') chunk = data.delta?.text ?? '';
      if (data.type === 'message_stop') ended = true;
    } else if (provider === 'google') {
      chunk = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
      if (data.candidates?.[0]?.finishReason) ended = true;
      if (data.promptFeedback?.blockReason) throw new Error('AI response blocked.');
    } else {
      chunk = data.choices?.[0]?.delta?.content ?? '';
      if (data.choices?.[0]?.finish_reason) ended = true;
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
    if (!text.trim()) { const error = new Error('AI stream returned no text.') as any; error.code = 'EMPTY_RESPONSE'; throw error; }
    if (!ended) { const error = new Error('AI stream ended before completion.') as any; error.code = 'API_ERROR'; throw error; }
    return { text, usage };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
