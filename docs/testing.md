# Pengujian dan batas coverage

Panduan ini menjelaskan pemeriksaan aplikasi setelah penyelesaian F01-F29 dan L01-L06.
Tes memakai fixture sintetis, browser context baru, DB terisolasi, dan mock
provider/Drive. Jangan menjalankannya dengan browser profile atau data pengguna.

## Hasil verifikasi terbaru

Snapshot lokal 15 November 2026, implementasi dalam commit `4816258`, Windows/
Node 24.15.0 dan Chromium 159.0.8154.6:

| Pemeriksaan | Hasil |
|---|---|
| Unit/integrasi dan coverage | 91 berkas/792 tes lulus |
| Browser Chromium | 55 skenario lulus, sekitar 3.1 menit |
| Typecheck umum/strict/maintenance | Lulus; strict 31 root/44 source, policy 54 berkas dan 18 ekspor publik AI |
| Build dan clean production | Lulus, termasuk instalasi dependensi terisolasi dan pemeriksaan secret sintetis |
| Startup/offline | PWA reload, worker context/backup dan ekspor Markdown lulus |

L06 mencakup save/restore melalui Pengaturan, tiga permintaan backup bersamaan
dengan maksimal satu worker, startup/crash/respons invalid/timeout 30 detik,
fallback, kegagalan crypto/kompresi/kuota dan perlindungan pre-restore. Rincian
alur dan batasnya ada di [integrasi worker](performance/l06-integration.md).
Peringatan build lama tentang chunk besar, eval ONNX dan usia Browserslist tetap ada.
Perapian dokumentasi sesudah commit ini tidak menjalankan ulang suite runtime.

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

## Laporan coverage

`npm run test:coverage` menghasilkan HTML `coverage/index.html` dan
`coverage/coverage-summary.json`. Laporan menginstrumentasi kode `src` dan
entry server, termasuk file yang belum disentuh tes. Ia tidak menggabungkan
coverage browser/worker native atau child process smoke production.

Snapshot L06 pada commit `4816258`: 32.32% baris, 32.15% statement,
25.46% branch dan 20.99% fungsi. Snapshot sebelumnya tersedia dalam
[arsip verifikasi](archive/2026-11-15-testing-history.md).

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
lain tetap dicatat pada masing-masing item ROADMAP/changelog; tidak semua tes
dapat dijalankan pada seluruh checkout lama karena kontrak antar-modul berubah.

## CI dan artefak

`.github/workflows/critical-tests.yml` berjalan pada push, pull request dan manual,
di Windows serta Ubuntu dengan Node 24.15.0. Setiap job menjalankan `npm ci`,
typecheck umum dan strict bertahap, unit/integrasi dengan coverage, browser kritis, dan build/smoke
production. Tidak membutuhkan repository secrets atau izin tulis repository.

Coverage, HTML report browser, screenshot dan trace kegagalan disimpan sebagai
artefak CI selama tujuh hari. Di lokal, direktori tersebut diabaikan Git.
Untuk diagnosis gunakan `npx playwright show-report` atau
`npx playwright show-trace <path-trace.zip>`. Artefak berisi fixture sintetis.
L01 memverifikasi workflow Windows/Ubuntu berhasil pada commit `7527305`:
[run 43696531716](https://github.com/tubagus444/AetherScribe/actions/runs/43696531716).
Status setiap step, log kedua job dan metadata artefak diperiksa. Lihat
[bukti dan batas verifikasi](audits/2026-11-15-l01-ci.md). Hasil ini berlaku untuk
commit tersebut; catatan belum diverifikasi pada snapshot F24-F28 bersifat historis.
Commit terbaru belum diklaim lulus di GitHub; hasil lokal tidak menggantikan run CI.

Rujukan konfigurasi: [Playwright CI](https://playwright.dev/docs/ci),
[setup-node](https://github.com/actions/setup-node),
[checkout](https://github.com/actions/checkout), dan
[upload-artifact](https://github.com/actions/upload-artifact).

## Riwayat verifikasi

Catatan per tahap F24-L06, jumlah tes lama dan probe regresi disimpan di
[arsip verifikasi](archive/2026-11-15-testing-history.md). Laporan eksperimen
L06 mendahului integrasi; kondisi aplikasi sekarang dijelaskan di
[laporan integrasi](performance/l06-integration.md).
