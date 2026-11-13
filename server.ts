import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { proxyBoundary, validateProxyRequest } from "./src/server/proxyBoundary";

// SV10: pola penanganan error yang sama dipakai di tiga endpoint → satu helper.
// Menghormati SV3: bila header sudah terkirim (stream SSE) jangan tulis status lagi.
function sendError(res: express.Response, status: number, error: any, context: string, fallbackMsg?: string) {
  console.error(`${context}:`, error);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({ error: error?.message || fallbackMsg || String(error) });
}

export function createProxyApp() {
  const app = express();
  const PORT = 3000;

  // Body bisa besar pada mode caching (full Story Bible + Codex di system prompt).
  // Default Express 100kb akan menolak (413), jadi limit dinaikkan.
  app.use('/api', proxyBoundary);
  app.use(express.json({ limit: '25mb' }));

  app.use('/api', validateProxyRequest);

  const post = (route: string, handler: express.RequestHandler) => app.post(route, (req, res, next) => {
    void Promise.resolve().then(() => handler(req, res, next)).catch(next);
  });

  // API Proxy Layer for AI Calls
  post("/api/ai/proxy", async (req, res) => {
    // SV2: batalkan permintaan ke provider bila klien memutus koneksi (hemat kuota & resource).
    const upstream = new AbortController();
    res.on('close', () => upstream.abort());

    // SV15: validasi input agar request malformed tidak melempar di luar try.
    // (Express 4 tidak menangkap error async → request bisa menggantung tanpa respons.)
    const { provider, body, ollamaBaseUrl } = req.body || {};
    if (!provider || typeof provider !== 'string' || !body || typeof body !== 'object') {
      return res.status(400).json({ error: "Permintaan tidak valid: 'provider' dan 'body' wajib ada." });
    }

    const clientApiKey = (req.headers['x-api-key'] as string) || '';
    const isStream = !!body.stream;
    
    // Resolve API Key (prioritize client-provided API keys)
    let apiKey = '';
    let url = '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    switch (provider) {
      case 'groq':
        apiKey = clientApiKey || process.env.GROQ_API_KEY || '';
        url = 'https://api.groq.com/openai/v1/chat/completions';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'openai':
        apiKey = clientApiKey || process.env.OPENAI_API_KEY || '';
        url = 'https://api.openai.com/v1/chat/completions';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'openrouter':
        apiKey = clientApiKey || process.env.OPENROUTER_API_KEY || '';
        url = 'https://openrouter.ai/api/v1/chat/completions';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = 'http://localhost:3000';
        headers['X-Title'] = 'AetherScribe IWE';
        break;
      case 'huggingface':
        // Router HF: endpoint OpenAI-compatible terpadu (Inference Providers).
        apiKey = clientApiKey || process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || '';
        url = 'https://router.huggingface.co/v1/chat/completions';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'claude':
        apiKey = clientApiKey || process.env.CLAUDE_API_KEY || '';
        url = 'https://api.anthropic.com/v1/messages';
        if (apiKey) headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        // Aktifkan prompt caching + TTL diperpanjang (cache_control ttl '1h' pada blok system).
        headers['anthropic-beta'] = 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11';
        break;
      case 'google':
        apiKey = clientApiKey || process.env.GEMINI_API_KEY || '';
        // Ensure model name is correctly formatted for the URL
        const modelName = body.model || 'gemini-2.5-flash';
        const sanitizedModel = modelName.includes('/') ? modelName : `models/${modelName}`;
        if (isStream) {
          url = `https://generativelanguage.googleapis.com/v1beta/${sanitizedModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
          // Gemini doesn't use a 'stream: true' property in the body, it uses the alt=sse url
          delete body.stream;
        } else {
          url = `https://generativelanguage.googleapis.com/v1beta/${sanitizedModel}:generateContent?key=${apiKey}`;
        }
        break;
      case 'ollama':
        // Use Ollama's OpenAI-compatible endpoint so the request body matches other providers.
        url = `${(ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '')}/v1/chat/completions`;
        break;
      default:
        return res.status(400).json({ error: "Unsupported provider" });
    }

    // If API key is still missing, check if it was sent in the request (obfuscated or directly)
    // For now, we prioritize server-side keys.

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        redirect: 'error',
        signal: upstream.signal
      });

      if (!response.ok) {
        const errorData = await response.text();
        // SV5: teruskan JSON error ASLI provider bila ada (bentuk { error: { message } }),
        // agar klien & log melihat pesan asli alih-alih string ter-bungkus ganda. Klien
        // (proxy.ts extractErrorMessage) menangani kedua bentuk. Selain itu, bungkus string.
        let payload: any;
        try {
          const parsed = JSON.parse(errorData);
          payload = (parsed && typeof parsed === 'object') ? parsed : { error: errorData };
        } catch {
          payload = { error: errorData || `HTTP error ${response.status}` };
        }
        return res.status(response.status).json(payload);
      }

      if (isStream) {
        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body?.getReader();
        if (!reader) {
          return res.status(500).json({ error: "Streaming not supported by proxy response." });
        }

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
        res.end();
        return;
      }

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      // Klien memutus / kita abort upstream → koneksi sudah tidak ada, jangan kirim apa-apa.
      if (error?.name === 'AbortError') return;
      // SV3 ditangani di sendError (guard headersSent untuk stream SSE yang sudah dimulai).
      sendError(res, 500, error, `Proxy error for ${provider}`);
    }
  });

  // Query Allowed Gemini Models from Google API
  post("/api/ai/google-models", async (req, res) => {
    const clientApiKey = (req.headers['x-api-key'] as string) || '';
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY || '';

    if (!apiKey) {
      return res.status(400).json({ error: "Google API Key is required. Please check that it is entered." });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'GET', redirect: 'error',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      sendError(res, 500, error, 'Google models listing error');
    }
  });

  // Query Allowed Groq Models (OpenAI-compatible endpoint)
  post("/api/ai/groq-models", async (req, res) => {
    const clientApiKey = (req.headers['x-api-key'] as string) || '';
    const apiKey = clientApiKey || process.env.GROQ_API_KEY || '';

    if (!apiKey) {
      return res.status(400).json({ error: "Groq API Key diperlukan. Pastikan sudah dimasukkan." });
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET', redirect: 'error',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      sendError(res, 500, error, 'Groq models listing error');
    }
  });

  // Query Allowed OpenAI Models
  post("/api/ai/openai-models", async (req, res) => {
    const clientApiKey = (req.headers['x-api-key'] as string) || '';
    const apiKey = clientApiKey || process.env.OPENAI_API_KEY || '';

    if (!apiKey) {
      return res.status(400).json({ error: "OpenAI API Key diperlukan. Pastikan sudah dimasukkan." });
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET', redirect: 'error',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      sendError(res, 500, error, 'OpenAI models listing error');
    }
  });

  // Query Allowed Hugging Face Models (router OpenAI-compatible)
  post("/api/ai/huggingface-models", async (req, res) => {
    const clientApiKey = (req.headers['x-api-key'] as string) || '';
    const apiKey = clientApiKey || process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || '';

    if (!apiKey) {
      return res.status(400).json({ error: "Hugging Face API Key diperlukan. Pastikan sudah dimasukkan." });
    }

    try {
      const response = await fetch('https://router.huggingface.co/v1/models', {
        method: 'GET', redirect: 'error',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      sendError(res, 500, error, 'Hugging Face models listing error');
    }
  });

  // Query Allowed Claude (Anthropic) Models
  post("/api/ai/claude-models", async (req, res) => {
    const clientApiKey = (req.headers['x-api-key'] as string) || '';
    const apiKey = clientApiKey || process.env.CLAUDE_API_KEY || '';

    if (!apiKey) {
      return res.status(400).json({ error: "Claude API Key diperlukan. Pastikan sudah dimasukkan." });
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
        method: 'GET', redirect: 'error',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      sendError(res, 500, error, 'Claude models listing error');
    }
  });

  // Query Ollama Models
  post("/api/ai/ollama-models", async (req, res) => {
    const { baseUrl } = req.body;
    const url = `${(baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/tags`;

    try {
      const response = await fetch(url, {
        method: 'GET', redirect: 'error',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      res.status(200).json(data);
    } catch (error: any) {
      sendError(res, 500, error, 'Ollama models listing error', 'Failed to connect to Ollama. Make sure it is running globally.');
    }
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) { res.end(); return; }
    const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 500 ? 'Proxy gagal memproses permintaan.' : 'Permintaan JSON tidak valid atau terlalu besar.' });
  });
  return app;
}

async function startServer() {
  const app = createProxyApp();
  const PORT = 3000;
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VITEST !== 'true') void startServer();
