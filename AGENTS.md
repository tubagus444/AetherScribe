# Panduan agen AetherScribe

AetherScribe adalah editor novel web local-first. Data naskah tersimpan di
IndexedDB melalui Dexie. Express menjalankan aplikasi dan proxy AI lokal.

## Aturan repositori

- Gunakan alias impor `@/src/` untuk jalur absolut dari source.
- Pertahankan pin semua paket `@tiptap/*` di `3.22.5`.
- Perlakukan versi skema Dexie sebagai append-only. Untuk perubahan skema,
  tambahkan versi baru. Perbarui katalog tabel serta remap relasi sesuai
  [panduan database](docs/database.md#1-konvensi--aturan-database).
- Jalankan pemindaian naskah panjang, embeddings, dan komputasi graf berat
  melalui Web Worker. Gunakan protokol worker dan fungsi derivasi yang sudah ada.
- Pertahankan `cachedContext` terpisah dari `systemInstruction` pada mode
  caching AI. Modul internal AI mengimpor modul yang memiliki fungsi terkait
  secara langsung dan memakai `index.ts` sebagai facade untuk pemanggil luar.
- Warna garis React Flow di `FloatingEdge` menggunakan inline
  `style: { stroke: color }`.

## Rujukan sesuai perubahan

| Area | Bacaan |
| --- | --- |
| Struktur aplikasi, state, startup, dan worker | [Arsitektur](docs/architecture.md) |
| Editor dan analitik | [Editor dan analitik naskah](docs/features.md#kontrak-editor-dan-analitik-naskah) |
| Worldbuilding | [Codex dan graf](docs/features.md#kontrak-codex-dan-graf-lore), [Story Bible dan faksi](docs/features.md#kontrak-story-bible-relasi-dan-faksi), [kalender](docs/features.md#kontrak-linimasa-dan-kalender), dan [Atlas](docs/features.md#kontrak-atlas) |
| Skema, migrasi, transaksi, dan relasi | [Database](docs/database.md) |
| Backup, ekspor, impor proyek, dan pemulihan | [Format backup](docs/backup-format.md) dan [katalog tabel](docs/database.md#katalog-tabel-dan-kebijakan-data-db04) |
| AI, proxy, dan pengaturan | [Integrasi AI](docs/architecture.md#kontrak-pengembangan-ai-dan-konteks), [API](docs/api.md), dan [panel pengaturan](docs/architecture.md#kontrak-panel-pengaturan) |
| Pemeriksaan dan rujukan lain | [Pengujian](docs/testing.md) dan [indeks dokumentasi](docs/README.md) |

## Pengembangan dan verifikasi

- Ikuti versi Node di `package.json`. Gunakan `npm run dev` untuk pengembangan
  serta `npm run build` dan `npm run start` untuk produksi.
- Untuk perubahan kode, jalankan `npm run lint`, `npm run lint:strict`, dan
  `npm run lint:maintenance`. Pertahankan cakupan strict dan gunakan narrowing
  atau tipe yang tepat untuk menyelesaikan diagnostik. Perubahan anggaran tipe
  dalam `scripts/maintenance-policy.json` perlu alasan di review dan dokumentasi.
- Pilih tes yang relevan. `npm run test:run` menjalankan Vitest sekali.
  Perintah coverage, E2E Chromium, startup offline, dan smoke test produksi
  tersedia di [panduan pengujian](docs/testing.md).
- Setiap perubahan fitur, database, atau API memperbarui referensi terkait dan
  [changelog](docs/changelog.md). Gunakan [roadmap](ROADMAP.md) untuk status
  pekerjaan dan [laporan](docs/reports/README.md) untuk menyimpan bukti verifikasi.
