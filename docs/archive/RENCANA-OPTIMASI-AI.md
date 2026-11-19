# [ARSIP] Rencana Optimasi Penggunaan AI — AetherScribe

> **Arsip memori-proyek.** Tracker optimasi token/biaya AI: hemat token, kualitas
> tetap maksimal. **Semua item actionable SELESAI.** Dokumen ini dipertahankan
> sebagai rekam keputusan. Mekanisme saat ini dijelaskan dalam
> [kontrak pengembangan AI dan konteks](../architecture.md#kontrak-pengembangan-ai-dan-konteks).

Konteks: aplikasi pribadi satu-pengguna, BYOK (kunci di klien), local-first.
Jalur AI: `src/services/ai/index.ts` (facade) → `proxy.ts` → `server.ts` → provider.

## 14 Item Optimasi yang Telah Diterapkan

| # | Item | Commit | Inti Implementasi |
|---|------|--------|-------------------|
| #0 | Prompt caching trio (Claude/Google/OpenRouter) | `57ef648` | `cache_control` ephemeral + header beta; Google default `gemini-2.5-flash`; Dashboard kartu "Token dari Cache" |
| #1 | Plafon `max_tokens` per-aksi | `57ef648` | rewrite adaptif 512–4000, chat 2048, extract 1500, expand 1000, summarize 700 (jaring pengaman) |
| #2 | Extended TTL cache Claude 1 jam | `7e8aec9` | `ttl:'1h'` + beta `extended-cache-ttl`; kini tunable via #P5 |
| #3 | Routing model per-tugas | `f2e5c46` | extract/summarize → tier murah provider sama (`getLightModelForProvider`); rewrite/chat/expand tetap pilihan pengguna |
| #4 | Cache riwayat chat (Claude, multi-breakpoint) | — | tandai pesan riwayat terakhir `cache_control`; miss saat lewat `MAX_PROXY_HISTORY` (8) |
| #8 | Bersih payload Story Bible | — | `storyBible.ts` sumber tunggal: slug→label, buang baris kosong, cap Catatan Penulis 2000 char (`BIBLE_AI_MAX_CHARS`) |
| #9 | KB dibagi lintas-aksi (KB-first, blok cache terpisah) | — | `cachedContext` di `AIRenderParams`; rewrite/chat/consistency berbagi cache KB; timeline sengaja di blok instruksi |
| #P2 | Cache riwayat chat (OpenRouter) | — | analog #4, multipart `cache_control` diteruskan ke Anthropic hulu |
| #P3 | Tier cache Bible (stabil) vs Codex (volatil) | — | `buildCachedContextSegments` → segmen ber-tier; edit Codex tak batalkan prefix Bible |
| #P4 | Akurasi estimasi token fallback | — | `logUsageToDB` sertakan `cachedContext` + riwayat chat → kartu Dashboard tak bias-rendah |
| #P5 | TTL cache Claude tunable (5m/1j) | — | `getClaudeCacheTtl` (`aiTuning.ts`), 3 titik `cache_control` di `proxy.ts`; Settings → "Optimasi AI Lanjutan" |
| #5 | `MAX_CACHED_LORE_CHARS` tunable | — | `getMaxCachedLoreChars` (`aiTuning.ts`, default 50k, clamp 10k–100k); worker diberi via payload `PREVIEW_CONTEXT_TOKENS` |
| #7 | Override model tugas-ringan (UI) | — | `ai_light_model_<provider>` override `LIGHT_MODELS`; Ollama dilewati |
| #6 | Debounce/dedup panggilan kembar | — | auto-summarizer debounce 8dtk/bab + guard `inFlight`; rewrite dedup in-flight konkuren |

## Catatan Verifikasi

- **Bukti caching bekerja:** `aiUsageLogs.cachedTokens > 0` → cache hit. Terlihat di Dashboard.
- **Pengaturan lanjutan:** Ada di Settings → "Optimasi AI Lanjutan" (cap lore, model ringan, TTL cache Claude, suhu rewrite).
