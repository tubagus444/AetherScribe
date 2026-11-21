# Pengujian dan batas coverage

Tes memakai fixture sintetis, browser context baru, database terisolasi,
dan respons tiruan dari provider dan Drive. Hasil per tanggal atau commit
tersedia di [indeks laporan](reports/README.md).

## Menjalankan pemeriksaan

Gunakan Node sesuai `engines` dan dependency dari lockfile:

```powershell
npm ci
npm run lint
npm run lint:strict
npm run lint:maintenance
npm run test:run
npm run test:coverage
npx playwright install chromium --no-shell
npm run test:e2e
npm run test:production
npm run test:startup
```

Pada Linux, tambahkan `--with-deps` saat instalasi Chromium. Unduhan browser dan
instalasi npm memerlukan jaringan; skenario browser tidak memakai provider/model
atau Drive nyata. `test:production` membangun frontend/server dan menginstal
dependency production di direktori sementara sebelum smoke test.

`vitest.config.ts` membatasi discovery ke `src/**/*.test.{ts,tsx}` agar suite
Playwright tidak dijalankan sebagai tes Vitest. Test single-run tersedia melalui
`test:run`; `npm test` tetap mode watch. Unit/integrasi memakai lingkungan Node
atau jsdom per-file; DB integration memakai fake-indexeddb dan teardown DB/tabel.

`playwright.config.ts` menjalankan Chromium bundled dalam mode headless, satu
worker, tanpa retry yang dapat menyembunyikan flakiness. Server uji memiliki
origin `http://127.0.0.1:4177`, HMR 4178 dan cache `node_modules/.vite-e2e`.
Server yang sudah ada tidak boleh dipakai ulang. Harness ini memakai Express dan
Vite middleware asli; konfigurasi cache/HMR khusus berada di `e2e/server.ts` dan
tidak dibundle ke production.

Setiap tes browser membuat context baru tanpa storageState/profile persisten.
Fixture proyek/bab dimasukkan ke IndexedDB native sebelum React dimuat untuk
membuat kondisi awal deterministik. Local-only diaktifkan, env key server
dikosongkan, service worker diblokir dan request browser keluar origin dibatalkan.
Skenario critical.spec ini tidak menguji bootstrap DB kosong; installation.spec L02
memulainya tanpa seed. Service worker offline diuji terpisah oleh test:startup.

## Inventaris alur kritis

| Area | Integrasi/regresi yang tersedia | Bukti browser / batas |
|---|---|---|
| Save F05 | useEditorSave dan CrossChapterReplace: reject, update nol baris, draft, retry, flush/reload | Editor TipTap asli: autosave/reload serta injeksi write failure, flush reject, draft tetap utuh dan retry |
| Bab/triage F06/F07 | chapterTriage: duplikasi HTML/metadata, urutan, rollback, concurrency dan reopen DB | Duplikasi melalui service produksi menyalin draft editor aktif ke IndexedDB native |
| Backup F03/F04/F19 | backupService/backupConsistency: validasi, snapshot wajib, aset, atomic restore dan konsistensi snapshot | Blob/FileReader/Web Crypto/gzip native: Atlas dipulihkan dan snapshot pengaman dibuat; restore versi asing ditolak |
| Round-trip F10 | projectRoundTrip: remap FK/triage/workshop, rollback dan legacy | Export/import service produksi memakai native IndexedDB dan remap triage; L03 melengkapi ekspor/impor lewat tombol, filechooser dan dialog aplikasi |
| Delete F11 | entityDeletion: relasi turunannya, rollback dan cache | L03 menguji delete bab/Codex/proyek, pembatalan, cleanup dan isolasi proyek lain |
| Simpan dan cadangan DB01–DB08 | Validasi relasi, katalog tabel, kontrak bab, dan pembacaan cadangan portabel | Autosave dan cadangan antartab, rollback upgrade, serta restore cadangan ke database kosong. [Verifikasi DB01–DB08](reports/audits/2026-11-19-db01-db08.md) |
| Worker backup L06 | Antrean per tab, estimasi ukuran, fallback, dan retensi snapshot pengaman | Save/restore, permintaan bersamaan dan kegagalan worker. [Verifikasi L06](reports/audits/2026-11-15-l06-backup-integration.md) |
| Search F08/F09 | oramaSearch dan SemanticSearchPanel: protokol, generated ID, rollback, isolasi dan hasil basi | Worker Orama native: insert/search/delete serta isolasi antarproyek |
| Streaming F12/F14/F15 | SSE parser, proxyStream, useChatSession, useEditorAI: error, abort, retry/reset dan cleanup | Stream sintetis; belum provider atau jaringan eksternal nyata |
| Cancel F16 | contextTimeout/contextCancellation: payload CANCEL, timeout, isolasi, checkpoint dan late cancel | Context worker native menguji token count dan Aho-Corasick; timeout/cancel tetap diuji dengan transport/model mock |
| Privasi F17 | providerPolicy, providerPrivacy dan AIProviderIndicator | Belum alur consent UI browser menyeluruh |
| Kredensial/log F27 | credentialPrivacy, logPrivacy, errorService: sesi/legacy/migrasi eksplisit/clear, gagal write, sanitasi sebelum DB/console dan pembacaan log lama | UI Chromium menguji sesi/reload/persistent/clear dengan storage native; model listing mock |
| Proxy F02/F18 | proxyBoundary dan proxyHttp: validasi/malformed/Host/Origin melalui HTTP loopback | Smoke production memakai HTTP dan upstream preload mock; tidak memakai key/provider nyata |
| Drive F20 | driveBackupService: gagal download/upload, upload sebelum prune, missing ID dan warning retensi | Token/fetch Drive dimock; belum OAuth/Drive nyata |
| Ringkasan/parameter F29/F13 | autoSummarizer/proxyUsage: race versi, penghapusan/edit dan nilai nol | DB/fetch mock; belum browser daemon/provider nyata |
| Dialog F25 | ConfirmDialog: role/label/deskripsi, fokus awal/restore, busy cancel | Chromium native: Tab/Shift+Tab, Escape/backdrop, top-layer/inert dan nesting; belum screen reader manual |
| Navigasi F26 | studioNavigation/NavigationContext: normalisasi, riwayat, deep link dan target workshop | Chromium memulihkan arc/orphans/unknown/workshop dan memastikan record proyek/bab utuh |
| Startup F21 | runtimeConfig dan test:production | Clean install production tanpa Vite/tsx, SPA/aset/deep-link, cwd/env/mode/port, invalid/busy port, missing build dan secret sintetis tidak masuk dist |
| XSS Atlas F01 | MapCanvas jsdom memeriksa markup dan handler tidak dibentuk | Native F28.5 memeriksa label markup tetap inert; bukan bukti seluruh permukaan XSS |
| Rute Atlas | Kurva melewati titik asli. Cadangan menyimpan bentuk, visibilitas, dan titik asli | Chromium menggambar, mengganti bentuk, membatalkan titik, menyembunyikan titik antara, mengedit, memeriksa jarak dan estimasi waktu, lalu memuat ulang rute. [Verifikasi rute Atlas](reports/audits/2026-11-21-atlas-routes.md) |
| Tempat singgah Atlas | Identitas titik, edit bersamaan, validasi peta pin, dan remap pin/Codex saat impor | Chromium memilih 3 dari 10 titik, mengikuti hubungan dari kedua sisi, memindahkan pin, dan memeriksa pelepasan tautan. [Verifikasi tempat singgah](reports/audits/2026-11-21-atlas-routes.md#tempat-singgah-dan-tautan-pin) |
| Batas area Atlas | Penutupan kurva, sudut tegas, persilangan, analitik pin, dan cadangan | Chromium menggambar batas, membatalkan titik, melihat tanda persilangan, mengatur sudut, dan memuat ulang. [Verifikasi batas area](reports/audits/2026-11-21-atlas-areas.md) |
| Isi wilayah Atlas | Cakupan area cekung dan melengkung, relasi peran, dan remap cadangan | Chromium membuka pin dan area dari daftar, mengubah bentuk batas, memuat ulang, dan melepas peran pin. [Verifikasi isi wilayah](reports/audits/2026-11-21-atlas-areas.md#isi-wilayah-dan-lokasi-penting) |
| Seleksi dan detail Atlas | React dan Leaflet menjaga pemisahan seleksi, mode edit, dan kamera | Chromium memeriksa pelepasan sorotan, aksi pusatkan, kepala panel saat digulir, dan akses pengaturan. [Verifikasi detail Atlas](reports/audits/2026-11-21-atlas-sidebar.md) |

## Laporan coverage

`npm run test:coverage` menghasilkan HTML `coverage/index.html` dan
`coverage/coverage-summary.json`. Laporan menginstrumentasi kode `src` dan
entry server, termasuk file yang belum disentuh tes. Ia tidak menggabungkan
coverage browser/worker native atau child process smoke production.

Snapshot coverage per commit tersedia di [arsip verifikasi](archive/2026-11-15-testing-history.md).

Angka rendah pada seluruh aplikasi menjelaskan batas suite, bukan jaminan bahwa
alur lain aman. Belum ada ambang persentase global; CI menggagalkan tes/assertion
yang gagal. Pengujian lanjutan dipilih berdasarkan penggunaan: salinan proyek
nyata, consent/provider/Drive nyata, lintas tab, browser lain atau aksesibilitas.
Atlas, UI restore/delete, instalasi/migrasi, worker dan PWA/offline sudah memiliki
skenario native dengan batas yang dijelaskan di laporan masing-masing. Persentase harus dibaca
bersama inventaris di atas, bukan menggantikan assertions regresi.

## Bukti tes mendeteksi bug lama

Tes browser `F05 failed save rejects flush, keeps draft, and permits retry`
dijalankan terhadap isi `useEditorSave.ts` sebelum commit perbaikan `270b5f2`
(`270b5f2^`). Dengan injeksi kegagalan write yang sama, tes gagal pada assertion
flush harus reject: nilai aktual `false`, ekspektasi `true`. Source perbaikan
dipulihkan sesudah probe; tes lalu lulus. Probe hanya memakai context/fixture
sintetis, tanpa membuka profil browser atau DB pengguna. Bukti baseline regresi
lain tersedia di [laporan audit](reports/README.md) dan [changelog](changelog.md). Tidak semua tes
dapat dijalankan pada seluruh checkout lama karena kontrak antar-modul berubah.

## CI dan artefak

`.github/workflows/critical-tests.yml` berjalan pada push, pull request dan manual,
di Windows serta Ubuntu dengan Node 24.15.0. Setiap job menjalankan `npm ci`,
typecheck umum dan strict bertahap, pemeriksaan maintenance, unit/integrasi
dengan coverage, Chromium, regresi jalur data, smoke test produksi, dan
startup offline. Workflow memakai izin baca repo.

Coverage, HTML report browser, screenshot dan trace kegagalan disimpan sebagai
artefak CI selama tujuh hari. Di lokal, direktori tersebut diabaikan Git.
Untuk diagnosis gunakan `npx playwright show-report` atau
`npx playwright show-trace <path-trace.zip>`. Artefak berisi fixture sintetis.
Untuk contoh catatan SHA, job, dan metadata artefak, lihat
[laporan verifikasi CI L01](reports/audits/2026-11-15-l01-ci.md).

Rujukan konfigurasi: [Playwright CI](https://playwright.dev/docs/ci),
[setup-node](https://github.com/actions/setup-node),
[checkout](https://github.com/actions/checkout), dan
[upload-artifact](https://github.com/actions/upload-artifact).

## Riwayat verifikasi

Catatan per batch, percobaan ulang, dan pengukuran tersedia di
[indeks laporan](reports/README.md). Untuk kondisi worker backup saat
ini, baca [format backup](backup-format.md#persiapan-backup-otomatis-dan-retensi-internal).
