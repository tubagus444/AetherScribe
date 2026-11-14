import { enforceProviderPolicy } from './providerPolicy';
import { readAIStream } from './sse';
import { AIRenderParams } from '@/src/services/ai/types';
import { ErrorService } from '@/src/services/errorService';
import { classifyError, getErrorMessage } from '@/src/services/ai/errors';
import { getClaudeCacheTtl } from '@/src/lib/aiTuning';
import { db } from '@/src/db';

const MAX_PROXY_HISTORY = 8;
const PROXY_TIMEOUT_MS = 60000; // batas waktu menunggu respons (untuk stream: idle-timeout antar-chunk)

function historyText(h: { role: string; parts: { text: string }[] }): string {
  return h.parts?.[0]?.text ?? '';
}

export async function callProxy(provider: string, params: AIRenderParams, apiKey?: string): Promise<string> {
  enforceProviderPolicy(provider);
  const history = (params.history || []).slice(-MAX_PROXY_HISTORY);

  const body: any = {
    model: params.model || getModelForProvider(provider),
  };

  let ollamaBaseUrl: string | undefined = undefined;
  if (provider === 'ollama') {
     ollamaBaseUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
  }

  if (provider === 'claude') {
    body.temperature = params.temperature ?? 0.7;
    body.max_tokens = params.maxTokens || 4000;
    // P0/P3: tiap segmen KB statis (params.cachedContext, stabil→volatil) jadi blok system
    // di DEPAN instruksi, masing-masing dengan cache breakpoint sendiri. Karena segmen
    // identik lintas-aksi (rewrite/chat/consistency memakai buildCachedContextSegments yang
    // sama), cache prefix-nya dibagi → aksi berikutnya MEMBACA cache (~0.1x) alih-alih
    // menulis ulang ~14k token. Tier per-segmen: edit satu entri Codex hanya membatalkan
    // segmen volatil; prefix Bible tetap hit. Separator '\n\n' di awal segmen ke-2+ &
    // instruksi agar segmen byte-identik. cache_control hanya saat cacheable. Anthropic
    // mengabaikan penanda untuk blok di bawah ambang minimum, tanpa error.
    // P5: TTL cache bisa diatur pengguna (Settings → Optimasi AI Lanjutan). 5 menit = premi
    // tulis 1.25× (hemat untuk pemakaian jarang); 1 jam = 2× tapi cache bertahan melewati
    // jeda berpikir/mengetik (default, optimal untuk sesi panjang yang banyak baca cache).
    const claudeCacheControl: any = getClaudeCacheTtl() === '5m'
      ? { type: 'ephemeral' }
      : { type: 'ephemeral', ttl: '1h' };
    if (params.cachedContext?.length) {
      const blocks: any[] = params.cachedContext.map((text, i) => {
        const b: any = { type: 'text', text: i === 0 ? text : `\n\n${text}` };
        if (params.cacheable) b.cache_control = { ...claudeCacheControl };
        return b;
      });
      blocks.push({ type: 'text', text: `\n\n${params.systemInstruction}` });
      body.system = blocks;
    } else if (params.cacheable) {
      body.system = [{ type: 'text', text: params.systemInstruction, cache_control: { ...claudeCacheControl } }];
    } else {
      body.system = params.systemInstruction;
    }
    const claudeHistory: any[] = history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: historyText(h)
    }));
    // Cache breakpoint KEDUA pada pesan riwayat terakhir. Blok system (lore) sudah
    // tercache; tanpa ini riwayat percakapan dikirim ulang penuh & dibayar penuh tiap
    // giliran. Dengan menandai pesan riwayat terakhir, prefix percakapan (system +
    // seluruh riwayat) ikut tercache → giliran berikut hanya bayar pesan baru.
    // Anthropic mengizinkan ≤4 breakpoint; ini ke-2. Hanya saat cacheable (chat) & ada
    // riwayat. Catatan: begitu riwayat melewati MAX_PROXY_HISTORY, jendela geser membuat
    // prefix berubah → cache riwayat miss (system tetap hit); keterbatasan inheren.
    if (params.cacheable && claudeHistory.length > 0) {
      const last = claudeHistory[claudeHistory.length - 1];
      last.content = [{ type: 'text', text: last.content, cache_control: { ...claudeCacheControl } }];
    }
    body.messages = [
      ...claudeHistory,
      { role: "user", content: params.userPrompt }
    ];
  } else if (provider === 'google') {
    // P0: KB statis di DEPAN systemInstruction → prefix request identik lintas-aksi
    // sehingga implicit caching seri Gemini 2.5 lebih sering hit (urutan: KB → instruksi).
    // Google tak punya breakpoint eksplisit → segmen digabung jadi satu string.
    const googleSystem = params.cachedContext?.length
      ? `${params.cachedContext.join('\n\n')}\n\n${params.systemInstruction}`
      : params.systemInstruction;
    body.systemInstruction = {
      parts: [{ text: googleSystem }]
    };
    body.contents = [
      ...history.map(h => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: [{ text: historyText(h) }]
      })),
      { role: "user", parts: [{ text: params.userPrompt }] }
    ];
    body.generationConfig = {
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens || 4000,
    };
  } else {
    // OpenAI Compatible (groq, openrouter, ollama)
    body.temperature = params.temperature ?? 0.7;
    body.max_tokens = params.maxTokens || 4000;
    // P0/P3: tiap segmen KB statis (cachedContext) jadi bagian PERTAMA system. Untuk
    // OpenRouter, kirim multipart dengan cache_control per-segmen (diteruskan ke provider
    // hulu Anthropic/Gemini; diabaikan untuk model yang tak mendukung) → segmen identik
    // lintas-aksi dibagi, dan tier per-segmen menjaga prefix Bible hit saat Codex diedit.
    // Groq/Ollama tak mendukung caching → gabung string biasa (KB → instruksi).
    let systemMessage: any;
    if (params.cachedContext?.length && params.cacheable && provider === 'openrouter') {
      const parts: any[] = params.cachedContext.map((text, i) => ({
        type: 'text', text: i === 0 ? text : `\n\n${text}`, cache_control: { type: 'ephemeral' }
      }));
      parts.push({ type: 'text', text: `\n\n${params.systemInstruction}` });
      systemMessage = { role: "system", content: parts };
    } else if (params.cacheable && provider === 'openrouter') {
      systemMessage = { role: "system", content: [{ type: 'text', text: params.systemInstruction, cache_control: { type: 'ephemeral' } }] };
    } else {
      const sysText = params.cachedContext?.length
        ? `${params.cachedContext.join('\n\n')}\n\n${params.systemInstruction}`
        : params.systemInstruction;
      systemMessage = { role: "system", content: sysText };
    }
    // P2: cache prefix percakapan untuk OpenRouter (diteruskan ke Anthropic hulu) — tandai
    // pesan riwayat TERAKHIR dengan cache_control; giliran berikut hanya bayar pesan baru.
    // Analog breakpoint riwayat Claude native (#4). Gemini hulu mengabaikan penanda ini.
    // Keterbatasan inheren sama: begitu riwayat melewati jendela geser, prefix berubah →
    // cache riwayat miss (system tetap hit).
    const histMsgs: any[] = history.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: historyText(h) as any }));
    if (params.cacheable && provider === 'openrouter' && histMsgs.length > 0) {
      const last = histMsgs[histMsgs.length - 1];
      last.content = [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }];
    }
    body.messages = [
      systemMessage,
      ...histMsgs,
      { role: "user", content: params.userPrompt }
    ];
    if (params.stream) {
      body.stream_options = { include_usage: true };
    }
  }

  if (params.stream) {
    body.stream = true;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  // Timeout internal + teruskan sinyal pembatalan dari pemanggil dalam satu controller gabungan.
  const composite = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout>;
  const armTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { timedOut = true; composite.abort(); }, PROXY_TIMEOUT_MS);
  };
  armTimeout();

  const externalSignal = params.signal;
  const forwardAbort = () => composite.abort();
  if (externalSignal) {
    if (externalSignal.aborted) composite.abort();
    else externalSignal.addEventListener('abort', forwardAbort);
  }
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort);
  };
  const timeoutError = () => {
    const err = new Error(getErrorMessage('TIMEOUT', provider)) as any;
    err.code = 'TIMEOUT';
    err.provider = provider;
    return err;
  };

  let response: Response;
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ai-provider-dispatched', { detail: provider }));
    response = await fetch('/api/ai/proxy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, body, ollamaBaseUrl }),
      signal: composite.signal
    });
  } catch (networkError: any) {
    cleanup();
    if (timedOut) throw timeoutError();
    if (networkError?.name === 'AbortError') throw networkError; // dibatalkan oleh pemanggil
    ErrorService.log({
      message: networkError.message,
      type: 'error',
      source: `AI-Proxy (${provider})`,
      metadata: { networkError: true, provider }
    });
    throw networkError;
  }

  if (!response.ok) {
    cleanup();
    const errorText = await response.text();
    const rawMessage = extractErrorMessage(errorText);
    const code = classifyError(response.status, rawMessage);
    const friendlyMessage = getErrorMessage(code, provider);

    const err = new Error(friendlyMessage) as any;
    err.code = code;
    err.provider = provider;
    err.rawMessage = rawMessage;
    throw err;
  }

  try {
    let usageData: any = null;

    if (params.stream) {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming not supported.");

      const cancelReader = () => { void reader.cancel().catch(() => {}); };
      composite.signal.addEventListener('abort', cancelReader);
      let streamed: Awaited<ReturnType<typeof readAIStream>>;
      try {
        if (composite.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        streamed = await readAIStream(provider, reader, params.onChunk ?? (() => {}), armTimeout);
        if (composite.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      } finally { composite.signal.removeEventListener('abort', cancelReader); }
      const completeText = streamed.text;
      usageData = streamed.usage;

      logUsageToDB(params, provider, usageData, completeText);
      return completeText;
    }

    const data = await response.json();
    if (data.usage) usageData = data.usage;
    if (data.usageMetadata) usageData = data.usageMetadata;

    const completeText = extractCompleteText(provider, data);
    if (!completeText) {
      const err = new Error(getErrorMessage('EMPTY_RESPONSE', provider)) as any;
      err.code = 'EMPTY_RESPONSE';
      err.provider = provider;
      err.rawMessage = JSON.stringify(data).slice(0, 500);
      throw err;
    }

    logUsageToDB(params, provider, usageData, completeText);
    return completeText;
  } catch (err: any) {
    if (timedOut) throw timeoutError();
    if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw err;
  } finally {
    cleanup();
  }
}

/** Mengambil teks hasil dari berbagai bentuk respons provider dengan aman. */
function extractCompleteText(provider: string, data: any): string {
  if (provider === 'claude') return data?.content?.[0]?.text ?? '';
  if (provider === 'google') return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return data?.choices?.[0]?.message?.content ?? '';
}

/**
 * server.ts membungkus error provider sebagai { error: "<teks/JSON mentah>" }.
 * Fungsi ini mengupas pembungkus itu untuk mendapatkan pesan asli yang berguna.
 */
function extractErrorMessage(errorText: string): string {
  let inner = errorText;
  try {
    const outer = JSON.parse(errorText);
    if (typeof outer?.error === 'string') inner = outer.error;
    else if (typeof outer?.error?.message === 'string') return outer.error.message;
    else if (typeof outer?.message === 'string') return outer.message;
  } catch {
    return errorText;
  }
  // 'inner' bisa berupa JSON provider asli, mis. {"error":{"message":"..."}}
  try {
    const parsed = JSON.parse(inner);
    return parsed?.error?.message || parsed?.message || inner;
  } catch {
    return inner;
  }
}

function logUsageToDB(params: AIRenderParams, provider: string, usage: any, completeText: string) {
  // Estimate tokens if usage missing. Sertakan cachedContext (KB, dipisah dari
  // systemInstruction di P0) DAN riwayat chat agar estimasi fallback tak meremehkan
  // ukuran prompt (#P4). Riwayat dihitung dari MAX_PROXY_HISTORY pesan terakhir — persis
  // yang dikirim callProxy — agar estimasi cocok dengan payload sebenarnya.
  const cachedLen = params.cachedContext?.reduce((n, s) => n + s.length, 0) || 0;
  const historyLen = (params.history || [])
    .slice(-MAX_PROXY_HISTORY)
    .reduce((n, h) => n + historyText(h).length, 0);
  let promptTokens = Math.ceil((params.userPrompt.length + params.systemInstruction.length + cachedLen + historyLen) / 4);
  let completionTokens = Math.ceil(completeText.length / 4);
  let cachedTokens = 0;

  if (usage) {
    // Token yang dilayani DARI cache (input murah). Tiap provider menamainya beda.
    const cacheRead =
      usage.cache_read_input_tokens ??              // Claude native
      usage.cachedContentTokenCount ??              // Google
      usage.prompt_tokens_details?.cached_tokens ?? // OpenAI/OpenRouter
      0;
    // Token yang DITULIS ke cache (Claude saja; sekali bayar saat cache dibuat).
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    cachedTokens = cacheRead;

    if (usage.promptTokens != null) promptTokens = usage.promptTokens;
    else if (usage.prompt_tokens != null) promptTokens = usage.prompt_tokens; // OpenAI/OpenRouter (sudah termasuk cached)
    else if (usage.promptTokenCount != null) promptTokens = usage.promptTokenCount; // Google (sudah termasuk cached)
    // Claude: input_tokens TIDAK termasuk token cache → jumlahkan agar total mencerminkan ukuran prompt asli.
    else if (usage.input_tokens != null) promptTokens = usage.input_tokens + cacheRead + cacheCreation;
    else if (usage.inputTokenCount != null) promptTokens = usage.inputTokenCount; // Claude/Bedrock style

    if (usage.completionTokens != null) completionTokens = usage.completionTokens;
    else if (usage.completion_tokens != null) completionTokens = usage.completion_tokens;
    else if (usage.output_tokens != null) completionTokens = usage.output_tokens; // Claude native
    else if (usage.outputTokenCount != null) completionTokens = usage.outputTokenCount; // Claude/Bedrock style
    else if (usage.candidatesTokenCount != null) completionTokens = usage.candidatesTokenCount; // Google style
  }

  db.aiUsageLogs.add({
    timestamp: Date.now(),
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    cachedTokens,
    provider,
    model: params.model || getModelForProvider(provider),
    actionType: params.actionType || 'other'
  }).catch(console.error);
}

// Model tier-murah/cepat per provider untuk tugas MEKANIS (extract/summarize).
// BYOK: tetap di provider yang sama → memakai key yang sudah ada, tak butuh key lain.
const LIGHT_MODELS: Record<string, string> = {
  google: 'gemini-2.5-flash-lite',
  claude: 'claude-3-5-haiku-20241022',
  groq: 'llama-3.1-8b-instant',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  huggingface: 'meta-llama/Llama-3.1-8B-Instruct',
  openai: 'gpt-4o-mini',
};

/** Default hardcoded model ringan per provider (sebelum override pengguna). */
export function getDefaultLightModelForProvider(provider: string): string | undefined {
  return provider ? LIGHT_MODELS[provider.toLowerCase()] : undefined;
}

/**
 * Model "ringan" untuk tugas mekanis pada provider yang sama. Pengguna bisa
 * meng-override default lewat Settings (`ai_light_model_<provider>` di localStorage);
 * bila kosong, pakai default hardcoded. Mengembalikan undefined bila provider tak
 * punya tier murah (mis. ollama) → pemanggil jatuh ke model pilihan pengguna.
 */
export function getLightModelForProvider(provider: string): string | undefined {
  if (!provider) return undefined;
  const key = provider.toLowerCase();
  try {
    const override = localStorage.getItem(`ai_light_model_${key}`);
    if (override && override.trim()) return override.trim();
  } catch {
    // localStorage tak tersedia (mis. konteks worker) → pakai default.
  }
  return LIGHT_MODELS[key];
}

function getModelForProvider(provider: string) {
  switch (provider) {
    case 'groq': return 'llama-3.3-70b-versatile';
    case 'openrouter': return 'meta-llama/llama-3.3-70b-instruct:free';
    case 'claude': return 'claude-3-5-sonnet-20241022';
    case 'google': return 'gemini-2.5-flash'; // 2.5 → implicit prompt caching otomatis (hemat token)
    case 'ollama': return 'llama3.2';
    case 'huggingface': return 'meta-llama/Llama-3.3-70B-Instruct';
    case 'openai': return 'gpt-4o-mini';
    default: return '';
  }
}
