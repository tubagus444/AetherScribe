# Arsitektur Sistem — AetherScribe

## 1. Peta Direktori Proyek

```text
Aplikasi-Pembuatan-Novel/
├── .agents/                    # Aturan agen AI & konvensi lingkungan
├── .claude/rules/              # Aturan teknis per-fitur (dimuat otomatis berbasis path)
├── docs/                       # Dokumentasi modular teknis & keputusan arsitektur
├── public/                     # Aset statis browser (ikon, font, favicon)
├── server.ts                   # Express proxy AI & static file server
├── src/
│   ├── components/             # Komponen UI lintas-fitur
│   │   ├── common/             # Tombol, modal dasar, error boundary, badge
│   │   ├── layout/             # Header, Sidebar, MainView, StudioTabBar
│   │   ├── modals/             # Modal global (impor, ekspor, snapshot)
│   │   └── panels/             # Panel mandiri (Dashboard, Settings, Guide, ErrorLog)
│   ├── contexts/               # State global React Context (Project, Nav, UI, Editor)
│   ├── features/               # Modul fitur berbasis domain
│   │   ├── assistant/          # Obrolan AI Studio & multi-sesi
│   │   ├── atlas/              # Peta interaktif Leaflet CRS.Simple
│   │   ├── chapters/           # Outline, daftar bab, Kanban babak
│   │   ├── codex/              # Ensiklopedia entri, graf lore, form entri
│   │   ├── codex-workshop/     # Studio lokakarya entri dengan AI
│   │   ├── consistency/        # Peta kontinuitas, glosarium, janji plot, pacing
│   │   ├── editor/             # TipTap 3 editor, toolbar, autosave bridge
│   │   ├── lore/               # Story Bible, relasi entitas, papan faksi
│   │   ├── search/             # Pencarian semantik prosa & federated search
│   │   └── timeline/           # Timeline cerita & kalender dunia kustom
│   ├── hooks/                  # Custom React hooks (live query, debounce, backup)
│   ├── lib/                    # Logika murni, algoritma deterministik, math & format
│   ├── services/               # Integrasi AI, worker facade, backup, IndexedDB
│   │   ├── ai/                 # Facade AI, proxy client, circuit breaker, prompts
│   │   └── rag/                # Sinkronisasi & worker pencarian Orama BM25
│   ├── workers/                # Dedicated Web Workers (token counter, dll)
│   ├── db.ts                   # Konfigurasi database Dexie & rantai migrasi skema
│   ├── main.tsx                # Entry point React, tree provider global
│   └── types.ts                # TypeScript interface seluruh model domain
└── vite.config.ts              # Konfigurasi Vite & middleware dev
```

---

## 2. Alur Data & State Management

AetherScribe tidak menggunakan Redux maupun Zustand. State dikelola secara reaktif dan lokal:
- **Penyimpanan Primer:** Browser IndexedDB via wrapper **Dexie.js** (`AetherScribeDB`, skema v33 di `src/db.ts`).
- **Reaktivitas UI:** Menggunakan `dexie-react-hooks` (`useLiveQuery`), dibungkus secara teroptimasi di `src/hooks/useOptimizedLiveQuery.ts` dan `src/hooks/useProjectData.ts`. Setiap perubahan tabel IndexedDB otomatis memicu re-render hanya pada komponen yang berlangganan.
- **State Sesi & Navigasi:** Menggunakan kombinasi React Contexts terisolasi:
  - `ProjectContext`: Proyek aktif, pemilihan proyek, operasi hapus proyek terkoordinasi.
  - `NavigationContext`: Nilai `viewMode` aktif, bab terpilih (`activeChapterId`), dan navigasi deep-link.
  - `UIContext`: Mode fokus (*focus mode*), tema tampilan (dark/light), status sidebar.
  - `EditorPanelContext`: Tab editor aktif dan panel split view.
- **Routing Tampilan:** Ditentukan oleh variabel `viewMode` di `NavigationContext`. Komponen `src/components/layout/MainView.tsx` merender panel terkait. Semua panel dimuat secara malas (*React.lazy*), kecuali Editor TipTap yang di-mount ketika `viewMode === 'write'` demi menghemat RAM.

---

## 3. Komputasi Berat di Web Worker

Untuk menjaga antarmuka penulisan tetap mulus (60 FPS) tanpa terblokir (*zero UI freezing*), tugas-tugas berat dieksekusi di background Web Worker:

1. **`src/services/contextWorker.ts`** (dikendalikan `contextEngine.ts`):
   - Pencocokan nama entitas & alias secara instan via algoritma **Aho-Corasick** (`src/lib/ahoCorasick.ts`).
   - Ekstraksi embedding semantik lokal via model `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`) yang disimpan di IndexedDB tabel `embeddings` dan `sceneEmbeddings`.
   - Perhitungan token presisi menggunakan `js-tiktoken`.
2. **`src/services/rag/oramaWorker.ts`** (dikendalikan `oramaStore.ts` & `oramaSync.ts`):
   - Mesin pencarian leksikal **BM25 Orama** sebagai pelengkap pencarian semantik (pencarian federated).
3. **`src/features/codex/workers/loreGraphWorker.ts`**:
   - Menghitung kalkulasi graf keterhubungan entitas lore ratusan node di latar belakang agar kanvas `react-force-graph` tidak membekukan browser.
4. **`src/workers/tokenWorker.ts`**:
   - Menghitung live meter token pada panel editor dan pratinjau konteks.

---

## 4. Alur Integrasi AI & Arsitektur Proxy

```text
[Komponen UI / Fitur]
        │
        ▼
[src/services/ai/index.ts] (Facade: executeAIAction)
   ├── Membangun Knowledge Base terpisah (buildCachedContextSegments)
   ├── Memasang circuit breaker & backoff resiliensi (circuitBreaker.ts)
   └── Menyaring parameter & routing model ringan (getLightModelForProvider)
        │
        ▼
[src/services/ai/proxy.ts] (Client HTTP call)
   ├── Menyisipkan header autentikasi BYOK dari localStorage
   └── Menangani parsing Server-Sent Events (SSE) streaming
        │
        ▼ (HTTP POST /api/ai/proxy - Body limit 25MB)
[server.ts] (Node/Express Proxy)
   ├── Mengaktifkan AbortController hulu bila koneksi klien terputus
   └── Mengarahkan payload ke API Provider Hulu
        │
        ▼
[Provider Hulu] (Google Gemini, Anthropic Claude, Groq, OpenRouter, OpenAI, Hugging Face, Ollama)
```

### Mekanisme Kunci AI:
- **BYOK (Kunci di Klien):** Server proxy tidak menyimpan kredensial. Kunci API diteruskan via header `x-api-key` dari browser, atau menggunakan fallback env server lokal.
- **Prompt Caching Ber-Tier:**
  - Pengetahuan statis (*Story Bible* & aturan dunia) ditempatkan di segmen cache awal yang stabil.
  - Pengetahuan volatil (*Codex* & entri yang sering disunting) ditempatkan di segmen berikutnya.
  - Riwayat chat dan konteks bab diletakkan di akhir agar modifikasi teks naskah tidak membatalkan cache prompt *Story Bible*.
- **Circuit Breaker & Fallback:** Kegagalan koneksi atau error rate-limit (429) akan ditangani secara anggun dengan jeda backoff eksponensial dan opsi fallback provider otomatis.

---

## 5. Daftar Environment Variables

Daftar nama variabel lingkungan yang didukung aplikasi (tanpa nilai rahasia):

| Nama Variabel | Wajib/Opsional | Deskripsi / Peran |
|---|---|---|
| `GEMINI_API_KEY` | Opsional | Kunci fallback API Google Gemini di sisi server. |
| `GROQ_API_KEY` | Opsional | Kunci fallback API Groq di sisi server. |
| `OPENROUTER_API_KEY` | Opsional | Kunci fallback API OpenRouter di sisi server. |
| `CLAUDE_API_KEY` | Opsional | Kunci fallback API Anthropic Claude di sisi server. |
| `OPENAI_API_KEY` | Opsional | Kunci fallback API OpenAI di sisi server. |
| `HF_API_KEY` | Opsional | Kunci fallback API Hugging Face Inference Router di sisi server. |
| `HUGGINGFACE_API_KEY` | Opsional | Alias untuk `HF_API_KEY`. |
| `APP_URL` | Tidak digunakan | Tidak mengubah binding atau allowlist proxy. |
| `NODE_ENV` | Ditentukan entry point | `serverDev.ts`: development; `serverProduction.ts`: production. Nilai dari shell/.env tidak mengganti pilihan ini. |
| `PORT` | Opsional | Port server Express lokal, bilangan bulat 1-65535 (default: `3000`); Host/Origin mengikuti port aktif. |

## Kontrak Pembatalan Context Worker (F16)

Main thread dan worker memakai contextProtocol.ts: pesan CANCEL membawa payload.cancelId. Task memiliki ID tersendiri, sedangkan INDEX_MANUSCRIPT tetap fire-and-forget. Timeout menghapus pending Promise di main thread dan mengirim cancel; worker memeriksa ID aktif pada checkpoint async/yield serta membersihkan penanda pada finally. Cancel request A tidak membatalkan B atau model bersama. Ini bukan hard termination terhadap komputasi sinkron; pembatalan baru efektif setelah event loop menerima pesan dan checkpoint berikutnya tercapai. Heartbeat progres tetap memperpanjang idle timeout sesuai mekanisme sebelumnya.

## Startup Dev/Production (F21)

`server.ts` mengekspor app/startup tanpa side effect listen dan tanpa import Vite.
`serverDev.ts` memuat `.env` dengan dotenv, menetapkan development, lalu mengimpor
Vite secara dinamis. `serverProduction.ts` menetapkan production dan dibundle
esbuild ke `dist/server.cjs`; aset dicari dari `__dirname` bundle, bukan cwd.
File `.env` berasal dari cwd dan tidak menimpa environment proses. Hanya boolean
HAS_GEMINI_KEY masuk define Vite, bukan nilai kuncinya; rahasia jangan memakai
prefix VITE_ (prefix itu memang diekspos Vite).

Kedua entry menggunakan PORT yang tervalidasi dan binding loopback 127.0.0.1.
Build hilang, port invalid dan kegagalan listen menghasilkan exit code 1.
Runtime tidak memerlukan Vite, tsx, atau dependency dev lain. Versi Node yang
didukung mengikuti engines package.json (termasuk kebutuhan jsdom pada tes).
Prosedur Windows, distribusi production dan smoke test ada di README.md.
