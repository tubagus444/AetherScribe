# Panduan Agen AI — AetherScribe (AGENTS.md)

AetherScribe adalah lingkungan penulisan novel berbasis web yang local-first (Intelligent Writing Environment / IWE). Seluruh data tersimpan murni di browser via Dexie/IndexedDB (skema v33) tanpa database backend.

## Tech Stack & Perintah
- **Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, TipTap 3 (`3.22.5`), Dexie.js, Web Workers, Express proxy.
- **Commands:** `npm run dev` (Express + Vite, PORT default 3000) | `npm test` (`npx vitest run`) | `npm run lint` (`tsc --noEmit`)

## Aturan Coding & Hal yang Dilarang
- Gunakan import alias `@/src/` (bukan `@/db`).
- Dilarang mengubah pin dependensi TipTap selain `3.22.5`.
- Database bersifat append-only: jangan ubah versi Dexie lama, tambah `version(N + 1)`.
- Tabel project-scoped baru wajib sinkron di 3 tempat: `importRemap.ts`, `ProjectContext.deleteProject`, dan `backupService.ts`.
- Komputasi berat (Aho-Corasick, embeddings, graf) wajib berjalan di Web Worker, jangan di main thread.
- Edge React Flow wajib menggunakan inline `style: { stroke: color }`.

## Panduan Dokumentasi (docs/)
- Mau pahami gambaran umum aplikasi -> Baca `docs/overview.md`
- Mau pahami arsitektur, data flow, worker & env -> Baca `docs/architecture.md`
- Mau ubah atau tambah fitur -> Baca `docs/features.md`
- Mau ubah atau tambah database / migrasi -> Baca `docs/database.md`
- Mau ubah atau tambah endpoint API proxy -> Baca `docs/api.md`
- Mau cek alasan keputusan arsitektur masa lalu -> Baca `docs/decisions.md`
- Mau cek atau catat riwayat perubahan -> Baca `docs/changelog.md`
- Mau cek backlog & prioritas kerja aktif -> Baca `ROADMAP.md`
- Aturan per-fitur spesifik -> Rujuk file `.claude/rules/*.md`

## ATURAN WAJIB
Setiap selesai mengubah fitur, database, atau API, kamu WAJIB:
1) memperbarui file docs yang terkait, dan
2) menambahkan entri di docs/changelog.md.
Jangan menganggap tugas selesai sebelum dokumentasi diperbarui.
