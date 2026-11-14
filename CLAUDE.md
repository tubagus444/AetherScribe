# Panduan Proyek AetherScribe (CLAUDE.md)

AetherScribe adalah lingkungan penulisan novel berbasis web yang local-first (Intelligent Writing Environment / IWE). Aplikasi ini dirancang untuk membantu penulis mengelola novel panjang, menjaga konsistensi lore/karakter/waktu, dan mempercepat revisi naskah secara offline dan privat tanpa database backend (data tersimpan murni di browser via Dexie/IndexedDB), didukung Express sebagai proxy AI lokal.

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Framer Motion.
- **Penyimpanan Lokal:** Dexie.js (IndexedDB wrapper, skema v33).
- **Editor Naskah:** TipTap 3 (dipin tepat ke versi `3.22.5`).
- **Komputasi Latar Belakang:** Web Workers (Aho-Corasick, `@xenova/transformers`, Orama BM25).
- **Backend / Proxy:** Node.js, Express, TypeScript (PORT default 3000, binding loopback, body limit 25MB).

## Perintah Penting
```bash
npm run dev      # Menjalankan server Express + Vite middleware di http://localhost:3000
npm run build    # Build frontend Vite + esbuild serverProduction.ts -> dist/
npm run start    # Menjalankan production server dari dist/
npm run lint     # Type-check TypeScript (tsc --noEmit)
npm test         # Menjalankan vitest (mode watch). Gunakan `npx vitest run` untuk single-run
```

## Aturan Coding & Hal yang Dilarang
- **Import Alias:** Gunakan prefix `@/src/` (misal `@/src/db`, `@/src/lib/utils`), bukan `@/db`.
- **Ekstensi TipTap:** DILARANG mengubah atau memperbarui versi `@tiptap/*` selain `3.22.5`.
- **Database Append-Only:** DILARANG mengedit versi skema Dexie lama. Selalu tambah blok `version(N + 1)` baru.
- **Wajib Sinkron 3 Tempat:** Tabel project-scoped baru WAJIB didaftarkan di `importRemap.ts`, `ProjectContext.deleteProject`, dan `backupService.ts`.
- **Komputasi Berat di Worker:** DILARANG menjalankan pencarian embedding, Aho-Corasick teks panjang, atau kalkulasi graf di main thread.
- **Prompt Caching AI:** Simpan Story Bible di `cachedContext` terpisah, jangan gabungkan ke `systemInstruction`.
- **Edge React Flow:** Gunakan inline `style: { stroke: color }`, jangan gunakan atribut `stroke`.

## Panduan Dokumentasi (docs/)
Buka file dokumentasi berikut sesuai area yang sedang kamu kerjakan:
- **Mau pahami gambaran umum aplikasi** -> Baca [`docs/overview.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/overview.md)
- **Mau pahami arsitektur, data flow, worker & env** -> Baca [`docs/architecture.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/architecture.md)
- **Mau ubah atau tambah fitur** -> Baca [`docs/features.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/features.md)
- **Mau ubah atau tambah database / migrasi** -> Baca [`docs/database.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/database.md)
- **Mau ubah atau tambah endpoint API proxy** -> Baca [`docs/api.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/api.md)
- **Mau cek alasan keputusan arsitektur masa lalu** -> Baca [`docs/decisions.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/decisions.md)
- **Mau cek atau catat riwayat perubahan proyek** -> Baca [`docs/changelog.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/changelog.md)
- **Mau cek backlog & prioritas kerja aktif** -> Baca [`ROADMAP.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/ROADMAP.md)
- **Aturan per-fitur spesifik (otomatis sesuai path)** -> Rujuk file `.claude/rules/*.md`

## ATURAN WAJIB
Setiap selesai mengubah fitur, database, atau API, kamu WAJIB:
1) memperbarui file docs yang terkait, dan
2) menambahkan entri di docs/changelog.md.
Jangan menganggap tugas selesai sebelum dokumentasi diperbarui.

Startup: `serverDev.ts` untuk development; `serverProduction.ts` untuk production. `.env` dimuat dari cwd, environment proses menang. Minimum Node mengikuti engines package.json; lihat README untuk instalasi production dan `npm run test:production`.

Pengujian: `npm run test:run` (single-run), `npm run test:coverage`, `npm run test:e2e`, dan `npm run test:production`. Persiapan browser, isolasi fixture dan batas coverage: `docs/testing.md`.
