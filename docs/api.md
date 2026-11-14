# Dokumentasi API — AetherScribe

> **Arsitektur API:** Aplikasi ini beroperasi secara *local-first*. Server Express (`server.ts`, Port 3000) **bukan database server**, melainkan semata-mata bertindak sebagai **proxy AI** (untuk mengatasi CORS provider dan mengamankan streaming) serta penyaji file statis SPA di mode produksi.
> Batas body JSON server: **25 MB** (`express.json({ limit: '25mb' })`) untuk menampung Knowledge Base besar pada mode prompt caching.

---

## 1. Daftar Endpoint

### Batas proxy lokal (F02/F18, 13 November 2026)

Server bind `127.0.0.1:3000`. Seluruh `/api` memeriksa Host `localhost:3000`/`127.0.0.1:3000`; Origin bila ada harus `http://localhost:3000` atau `http://127.0.0.1:3000`. Request Sec-Fetch-Site cross-site ditolak 403. Klien lokal tanpa Origin tetap diizinkan; ini bukan autentikasi terhadap proses lokal.

Tujuan Ollama dibatasi ke HTTP localhost/127.0.0.1/[::1] port 11434, tanpa kredensial, path tambahan, query, atau fragment. Ollama remote/LAN dan port kustom tidak didukung oleh kebijakan ini. Semua fetch upstream memakai `redirect:'error'`, sehingga redirect tidak dapat melewati allowlist.

JSON wajib berupa objek; provider harus dikenal, body inferensi bukan array, model bila ada berupa string 1–256 karakter, stream bila ada boolean. Model Gemini hanya menerima nama model aman. URL salah tipe ditolak sebelum includes/replace. Body lebih dari 25 MB menghasilkan 413; JSON malformed menghasilkan 400. Wrapper async menangkap rejection pada semua route POST; error middleware memberi JSON terstruktur tanpa unhandled rejection. BYOK dan fallback key environment tetap berlaku setelah pemeriksaan caller.

Verifikasi memakai fixture/mocked upstream dan HTTP loopback terisolasi; tidak menggunakan key/provider nyata. F21 konfigurasi startup production tetap terpisah.

### POST /api/ai/proxy
- **Deskripsi:** Titik masuk utama untuk semua inferensi AI (Google Gemini, Anthropic Claude, Groq, OpenRouter, OpenAI, Hugging Face, Ollama). Mendukung respons JSON standar dan streaming Server-Sent Events (SSE).
- **File Handler:** `server.ts:26-156`
- **Autentikasi:** Mengutamakan header `x-api-key` dari klien browser (BYOK). Jika kosong, menggunakan fallback API key dari variabel lingkungan server.
- **Header:**
  - `Content-Type`: `application/json`
  - `x-api-key` *(opsional)*: Kunci API klien untuk provider terkait
- **Parameter Body (JSON):**
  - `provider` (`string`, wajib): `'google' | 'claude' | 'groq' | 'openrouter' | 'openai' | 'huggingface' | 'ollama'`
  - `body` (`object`, wajib): Payload asli permintaan model sesuai standar provider (mendukung parameter `stream: true`)
  - `ollamaBaseUrl` (`string`, opsional): URL instansi Ollama lokal (default: `http://localhost:11434`)
- **Contoh Response:**
  - Non-streaming (JSON standar provider):
    ```json
    {
      "choices": [
        {
          "message": {
            "role": "assistant",
            "content": "Karakter tersebut melangkah perlahan ke dalam reruntuhan..."
          }
        }
      ],
      "usage": {
        "prompt_tokens": 120,
        "completion_tokens": 45,
        "total_tokens": 165
      }
    }
    ```
  - Streaming (SSE chunk):
    ```text
    Content-Type: text/event-stream
    data: {"choices":[{"delta":{"content":"Karakter"}}]}
    data: {"choices":[{"delta":{"content":" tersebut..."}}]}
    ```

---

### POST /api/ai/google-models
- **Deskripsi:** Mengambil daftar model Google Gemini yang tersedia untuk API key yang diberikan.
- **File Handler:** `server.ts:159-181`
- **Autentikasi:** Membutuhkan Google API key via header `x-api-key` atau env `GEMINI_API_KEY`.
- **Parameter Body:** Kosong (`{}`)
- **Contoh Response:**
  ```json
  {
    "models": [
      {
        "name": "models/gemini-2.5-flash",
        "displayName": "Gemini 2.5 Flash",
        "supportedGenerationMethods": ["generateContent", "countTokens"]
      }
    ]
  }
  ```

---

### POST /api/ai/groq-models
- **Deskripsi:** Mengambil daftar model terbuka berkecepatan tinggi yang aktif di akun Groq pengguna.
- **File Handler:** `server.ts:184-206`
- **Autentikasi:** Membutuhkan Groq API key via header `x-api-key` atau env `GROQ_API_KEY`.
- **Parameter Body:** Kosong (`{}`)
- **Contoh Response:**
  ```json
  {
    "data": [
      { "id": "llama-3.3-70b-versatile", "object": "model" },
      { "id": "mixtral-8x7b-32768", "object": "model" }
    ]
  }
  ```

---

### POST /api/ai/openai-models
- **Deskripsi:** Mengambil daftar model OpenAI yang dapat diakses pengguna.
- **File Handler:** `server.ts:209-231`
- **Autentikasi:** Membutuhkan OpenAI API key via header `x-api-key` atau env `OPENAI_API_KEY`.
- **Parameter Body:** Kosong (`{}`)
- **Contoh Response:**
  ```json
  {
    "data": [
      { "id": "gpt-4o", "object": "model" },
      { "id": "gpt-4o-mini", "object": "model" }
    ]
  }
  ```

---

### POST /api/ai/huggingface-models
- **Deskripsi:** Mengambil daftar model yang didukung router Hugging Face Inference.
- **File Handler:** `server.ts:234-256`
- **Autentikasi:** Membutuhkan Hugging Face API key via header `x-api-key` atau env `HF_API_KEY`.
- **Parameter Body:** Kosong (`{}`)
- **Contoh Response:**
  ```json
  {
    "data": [
      { "id": "meta-llama/Llama-3.1-70B-Instruct", "object": "model" }
    ]
  }
  ```

---

### POST /api/ai/claude-models
- **Deskripsi:** Mengambil daftar model Anthropic Claude yang tersedia untuk akun pengguna.
- **File Handler:** `server.ts:259-282`
- **Autentikasi:** Membutuhkan Claude API key via header `x-api-key` atau env `CLAUDE_API_KEY`.
- **Parameter Body:** Kosong (`{}`)
- **Contoh Response:**
  ```json
  {
    "data": [
      { "id": "claude-3-5-sonnet-20241022", "display_name": "Claude 3.5 Sonnet" },
      { "id": "claude-3-5-haiku-20241022", "display_name": "Claude 3.5 Haiku" }
    ]
  }
  ```

---

### POST /api/ai/ollama-models
- **Deskripsi:** Mengambil daftar model lokal yang terpasang di instansi Ollama pengguna.
- **File Handler:** `server.ts:285-306`
- **Autentikasi:** Tidak perlu (akses jaringan lokal `localhost:11434`).
- **Parameter Body (JSON):**
  - `baseUrl` (`string`, opsional): Base URL host Ollama jika berbeda dari default `http://localhost:11434`.
- **Contoh Response:**
  ```json
  {
    "models": [
      { "name": "llama3:latest", "size": 4661224676 },
      { "name": "mistral:latest", "size": 4109865159 }
    ]
  }
  ```

## Konsumsi SSE pada Klien (F12)

HTTP 200 bukan jaminan keberhasilan inferensi: error SSE provider diteruskan sebagai rejection. Klien memeriksa frame akhir/teks kosong/terminasi, membaca buffer akhir dan mengakhiri reader pada error/abort. Ini berlaku pada proxy.ts/sse.ts, bukan perubahan payload provider server. Retry/fallback membersihkan preview parsial melalui onRetry; hasil final attempt sukses bersifat otoritatif.

## Kebijakan Provider Klien (F17)

providerPolicy.ts membatasi dispatch inferensi di facade dan callProxy. Mode hanya lokal memblokir provider selain Ollama; fallback memerlukan izin per target dan key. API key tersimpan bukan izin fallback. Kebijakan ini milik aplikasi klien, bukan autentikasi server terhadap proses lokal lain. Host/Origin/tujuan proxy tetap mengikuti F02. Izin disimpan lokal, dibaca ulang sebelum request berikutnya; tidak menghapus data yang sudah terkirim ke provider.
