---
paths:
  - "src/services/ai/**"
  - "src/services/contextWorker.ts"
  - "src/services/contextEngine.ts"
  - "src/lib/aiPrompts.ts"
  - "src/lib/aiTuning.ts"
  - "src/features/assistant/**"
---

# AI: alur dalam, konteks & caching

Kode fitur tidak pernah memanggil provider secara langsung. Jalur lengkap:

```
fitur → src/services/ai/index.ts (facade: processRewrite / processChat / expandCodexEntry / checkConsistency / enrichEntities)
      → callAI() ……… ketahanan: circuit breaker per-provider + exponential backoff + fallback otomatis
      → callProxy() (src/services/ai/proxy.ts)
      → POST /api/ai/proxy  (server.ts)
      → provider asli (Gemini / Claude / Groq / OpenRouter / Hugging Face / Ollama)
```

- **Kunci BYOK ada di sisi klien.** Disimpan di `localStorage` ter-encode base64 (atau `sessionStorage`) dengan kunci `ai_key_<provider>`, dibaca oleh `getSettings()` di `index.ts`, lalu diteruskan ke proxy lewat header `x-api-key`. Server memprioritaskan kunci dari klien dan jatuh ke `.env` (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CLAUDE_API_KEY`, `HF_API_KEY`, `OPENAI_API_KEY`) sebagai cadangan. Provider/model/contextDepth juga berupa kunci localStorage (`ai_provider`, `ai_model_<provider>`, `ai_context_depth`).
- **Urutan fallback** adalah `['openrouter','google','claude','groq','huggingface','openai']`; fallback dilewati untuk `INVALID_KEY`/`QUOTA_EXCEEDED` (percuma mengulang kunci yang salah) dan hanya dipakai untuk error koneksi/server/rate-limit. Circuit terbuka setelah 3 kegagalan beruntun selama 30 detik.
- **Logika ketahanan diekstrak & DIUJI (jangan tulis ulang inline):** circuit breaker di `src/services/ai/circuitBreaker.ts` (kelas `CircuitBreaker`, jam disuntik untuk tes open/half-open/reset), dan `computeBackoffDelay`/`shouldAttemptFallback`/`selectFallbackProviders`/`rewriteDedupKey`/`parseJsonArray` di `src/services/ai/resilience.ts` — keduanya bertes (`*.test.ts`). `index.ts` hanya meng-orkestrasi (`callAIWithBackoff`/`callAI`); saat mengubah semantik ketahanan, ubah di modul ini + perbarui tesnya, bukan menyalin logika ke facade.
- **Dua mode injeksi konteks** (keduanya di `index.ts`):
  - **Mode caching** untuk google/claude/openrouter saat `contextDepth !== 'minimal'`: *seluruh* Story Bible + Codex diurutkan secara deterministik dan ditempatkan di system prompt yang **statis** untuk memaksimalkan cache prompt provider; teks scene yang dinamis diletakkan di user prompt.
  - **Mode RAG legacy** selain itu: `getRelevantContext`/`getRelevantBibleRules` memfilter lore secara dinamis lewat context worker.
- Template prompt ada di `src/lib/aiPrompts.ts`. `AbortController` per-aksi memungkinkan `cancelAI(type)`.

## Knowledge base statis diteruskan TERPISAH lewat `cachedContext` (#9/#P3)
**KB statis diteruskan lewat `cachedContext: string[]` (AIRenderParams), bukan digabung ke `systemInstruction`.** Cache provider prefix-based, jadi KB (output `buildCachedContextSegments`, segmen `[Story Bible, Codex+graph]` identik lintas-aksi) ditaruh sebagai blok system PERTAMA di depan instruksi, **tiap segmen dengan `cache_control` sendiri** → rewrite/chat/consistency berbagi cache KB, dan edit satu entri Codex tak membatalkan prefix Bible (tier stabil→volatil). **Jangan gabungkan KB kembali ke `systemInstruction` di caching mode**, dan jaga tiap segmen byte-identik antar-aksi (mis. timeline consistency sengaja di blok instruksi, bukan di `cachedContext`). Perakitan per-provider ada di `proxy.ts` (Claude blok array multi-breakpoint, OpenRouter multipart + cache riwayat #P2, Google string KB-first).

## Cap lore di cache kini tunable & terpusat
`getMaxCachedLoreChars()` di `src/lib/aiTuning.ts` (baca `ai_max_cached_lore_chars` localStorage, default 50k, clamp 10k–100k) adalah sumber tunggal, dipakai `buildCachedContextBlock` di `src/services/ai/index.ts`. Worker (`contextWorker.ts`) **tak punya localStorage** → nilai diteruskan lewat payload `PREVIEW_CONTEXT_TOKENS` dari `previewContextTokens` (`contextEngine.ts`, main thread), bukan dibaca ulang. Bila menambah pemakaian cap di worker lain, teruskan via payload — jangan hardcode lagi.

## Formatter KB = SUMBER TUNGGAL `src/lib/loreFormat.ts` (jangan drift lagi)
Format baris lore Codex mode caching hidup **hanya** di `src/lib/loreFormat.ts` (`formatCodexLoreLine` = `[nama] (kat): desc` + field #17 + blok `[RAHASIA…]`; `buildCodexLoreString` = rakit+cap; `buildRelationshipGraph`). Dipakai OLEH jalur AI nyata (`buildCachedContextSegments`, `index.ts`) DAN meter token (cabang `fullContext` `PREVIEW_CONTEXT_TOKENS` di `contextWorker.ts`). **Jangan menulis ulang format lore di salah satu sisi** — dulu worker hanya `[nama] (kat): desc` → meter underestimate (fields/secret/graf tak terhitung). Relasi untuk graf dimuat di `previewContextTokens` (dari `projectId` codex) lalu diteruskan ke worker. **Pemotongan cap pada BATAS ENTRI** (`buildCodexLoreString`), bukan `.substring()` di tengah string — kalau tidak, blok `[RAHASIA…]` bisa terpotong separuh & entri huruf-akhir hilang senyap; truncation memicu `console.warn` "N/M entri termuat".

## Sesi asisten berbagi tabel `chatSessions`
**Beberapa jenis sesi asisten berbagi tabel `chatSessions`, dibedakan field `kind`.** Studio Asisten (`AIAssistantPanel`, workspace penuh, `kind:'studio'`), Scribble (`ScribbleAssistantPanel`, panel inline samping editor/codex, `kind:'scribble'`), dan Lokakarya Codex (`kind:'workshop'`) sama-sama menulis ke `chatSessions`. Saat membuat sesi baru **wajib set `kind`**, dan daftar riwayat Studio harus memfilter `kind !== 'scribble'` **dan** `kind !== 'workshop'` (lihat query di `AIAssistantPanel`) agar sesi lain tak mencemari. Sesi lama tanpa `kind` di-backfill di migrasi v18.

## Optimasi token/biaya
Seluruh item optimasi token/biaya AI telah **selesai** (arsip lengkap di `docs/archive/RENCANA-OPTIMASI-AI.md` & `docs/decisions.md`): prompt caching trio, plafon `max_tokens` per-aksi, routing model per-tugas, bersih payload Story Bible, cache riwayat chat Claude (#4) & OpenRouter (#P2), debounce/dedup auto-summarizer & rewrite (#6), KB dibagi lintas-aksi (#9), tier cache Bible/Codex (#P3), akurasi estimasi token (#P4), plus empat tunable di Settings → "Optimasi AI Lanjutan": cap lore cache (#5), override model ringan (#7), TTL cache Claude 5m/1j (#P5, `getClaudeCacheTtl` di `aiTuning.ts`, dipakai 3 titik cache_control Claude di `proxy.ts`), dan suhu rewrite (`getRewriteTemperature` di `aiTuning.ts`, default 0.5, clamp 0–1, dipakai `processRewrite`; hanya jalur rewrite, tugas analitis tetap terkunci). Cek dokumen tersebut sebelum menyentuh jalur AI terkait token/caching/model.

## Streaming/retry F12/F14/F15

Jangan menelan error frame SSE sebagai parse error: sse.ts menangani framing dan terminasi provider. Teruskan onRetry dari facade; consumer reset buffer attempt lama dan memakai return final sukses. Rewrite timer wajib cleanup pada finally/unmount/ganti bab; callback memakai run guard. Pertahankan AbortError agar pembatalan tidak dianggap kegagalan biasa. Kebijakan izin fallback lokal/cloud tetap F17.

## Batas provider F17

Jangan memilih fallback hanya berdasarkan adanya key. providerPolicy.ts mengatur local-only dan allowlist fallback; enforce sebelum setiap dispatch, termasuk callProxy langsung. Default fallback kosong; mode lokal menolak cloud walau ada override per aksi. Izin dipersist di useAISettings dan tidak mengubah provider utama otomatis. Event ai-provider-dispatched hanya membawa nama provider, tanpa prompt/key.

## Ringkasan dan usage F29/F13

Auto summary harus menyimpan hash konten sumber dan conditional commit di transaksi DB; jangan memakai waktu selesai request sebagai bukti kesegaran. Hasil saat content/lastModified/summary berubah dibuang, bukan disimpan sebagai fresh. Temperature memakai ?? agar nol valid; usage Claude menggabungkan event input/output/cache dan kalkulasi token menghormati nol. Field summarySourceHash inert dan ikut backup/import.

## Context Worker cancel F16

Pakai contextProtocol.ts untuk pesan sender/receiver. CANCEL selalu payload.cancelId; terima hanya ID aktif, cleanup pada finally dan jangan post hasil request batal. Beri checkpoint setelah await serta yield per batch pada loop panjang. Jangan menjanjikan preemption sinkron atau membatalkan model bersama/indexing fire-and-forget hanya karena satu request timeout.
