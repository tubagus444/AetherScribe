# Pengujian dan batas coverage

Harness F24 melengkapi tes regresi yang ditambahkan selama perbaikan audit.
Tes memakai fixture sintetis, browser context baru, DB terisolasi, dan mock
provider/Drive. Jangan menjalankannya dengan browser profile atau data pengguna.

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

Snapshot Windows/Node 24.15.0 pada 14 November 2026: 70 berkas/700 tes lulus;
29.38% baris, 29.24% statement, 22.19% branch dan 17.80% fungsi. Contoh coverage
baris: chapterOperations 100%, useEditorSave 88.76%, backupService 75%,
driveBackupService 58.88%, contextWorker 24.51%, server 8.48%.

Angka rendah pada seluruh aplikasi menjelaskan batas suite, bukan jaminan bahwa
alur lain aman. Belum ada ambang persentase global; CI menggagalkan tes/assertion
yang gagal. Prioritas penambahan berikutnya adalah Atlas XSS native, UI
restore/delete, bootstrap kosong/migrasi DB browser, consent, browser lain,
PWA/offline, aksesibilitas dan performa naskah besar. Persentase harus dibaca
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

Rujukan konfigurasi: [Playwright CI](https://playwright.dev/docs/ci),
[setup-node](https://github.com/actions/setup-node),
[checkout](https://github.com/actions/checkout), dan
[upload-artifact](https://github.com/actions/upload-artifact).

Verifikasi F27: 73 berkas/710 tes dan delapan skenario browser lulus. Angka coverage di atas adalah snapshot F24, bukan pengukuran ulang F27. Tiga probe F27 gagal pada source 2d50625 sebelum fix; key/naskah yang dipakai seluruhnya sintetis.

Verifikasi F25/F26: total 76 berkas/722 tes dan 14 skenario browser lulus. Dua probe browser pada source df1f875 gagal (arc dan semantik dialog), kemudian lulus setelah fix. Fixture dialog berada di e2e/dialogFixture.tsx dan tidak dibundle ke production.


F22 menambahkan `npm run test:startup` (sesudah build): benchmark lima browser
context terisolasi dan smoke production offline dengan service worker aktif,
worker token native dan ekspor Markdown lazy. Port khusus 4181; report opsional
`--output=test-results/startup.json`. CI menjalankannya sesudah test:production.
Guard transformers on-demand di contextCancellation gagal pada worker source
baseline, kemudian lulus. Total F22: 76 berkas/723 tes dan 14 browser tests.
Metodologi/batas pengukuran: [performance/f22.md](performance/f22.md).


F23: total 82 berkas/738 tes serta 16 browser tests. Tambahan mencakup metadata
key-only/generated ID, invalidation, rollback, import/restore/delete, migrasi v33,
query equality tanpa JSON, bounded/stable ranking dan protokol semantic search.
Native browser memverifikasi migrasi serta statistik header/dashboard sesudah
flush editor. `npm run test:data-paths` membandingkan hasil fixture kecil/sedang/
besar dan melaporkan waktu serta working-set heap; tidak perlu key/model nyata.
CI menyimpan JSON benchmark tanpa ambang timing. Lihat [laporan F23](performance/f23.md).

F28.2: 87 berkas/782 tes, typecheck, build, 16 Chromium tests dan startup/offline
lulus lokal (15 November 2026). Matriks input/output context dan pesan Orama,
malformed response/progress, timer cleanup, antrean sesudah input invalid,
completion/SSE/usage invalid serta input duplikasi bab diuji dengan fixture.
`src/contracts/f28Contracts.typecheck.ts` otomatis diperiksa oleh `npm run lint`
di CI; memeriksa kontrak negatif tanpa directive penekan error. Dua probe pada
source dec2940 membuktikan completion objek dan COUNT_TOKENS dengan input angka
belum ditolak sebelum perubahan. Snapshot coverage F24 di atas tidak diukur ulang.
Lihat [rincian F28.2](audits/2026-11-15-f28-contracts.md); provider nyata dan workflow
Atlas menyeluruh tetap belum tercakup.

F28.3 menambahkan `npm run lint:strict` sebagai step CI terpisah. Konfigurasi
`tsconfig.strict.json` mengaktifkan strict pada kontrak/helper dan import transitif
(17 root/26 berkas); `lint` tetap memeriksa proyek secara umum. Assertion khusus
di `src/contracts/strict/strictSafety.typecheck.ts` hanya diperiksa konfigurasi
strict dan gagal bila strict dimatikan. Probe sementara membuktikan implicit any,
null/undefined dan catch tanpa narrowing ditolak. Typecheck umum/strict,
87 berkas/782 tes dan build lulus lokal; tidak mengukur ulang coverage atau
menjalankan ulang browser/production/offline. Cakupan, pengecualian lama dan cara
memperluas check ada di [laporan F28.3](audits/2026-11-15-f28-strict.md).


F28.5 menambahkan tes hook Atlas/filter kategori-faksi dan service CRUD/cleanup,
serta satu skenario native Leaflet/IndexedDB melalui `e2e/atlasFixture.tsx`.
Skenario menggambar pin/area/rute (Enter untuk selesai), drag pin dan persistence,
filter tanpa penghapusan, label tersimpan berupa markup yang tetap inert, serta
revoke URL Blob kanvas/thumbnail saat unmount. Fixture tidak dibundle ke production.
Ini belum mencakup upload, portal/deep-link atau pergantian proyek melalui UI
Atlas lengkap; handler dan pengaman jsdom/domain sebelumnya dipertahankan.

Skenario native kedua membuka AtlasPanel produksi, membuat pin melalui toolbar,
memuat ulang peta dan menghapus pin lewat MarkerSidebar. Karakterisasi yang sama
lulus pada source AtlasPanel/useAtlas baseline 827c36b dan setelah ekstraksi;
source dipulihkan setelah probe. Verifikasi F28.5: typecheck umum/strict,
89 berkas/785 tes, build dan 18 browser tests lulus lokal. Coverage tidak diukur ulang.


F28.6: jalankan juga `npm run lint:maintenance`; CI memeriksa budget AST 38 berkas,
minimum 28 source strict (19 root), 18 ekspor publik AI dan arah static import
modul internal. Budget dan pengecualian disimpan dalam scripts/maintenance-policy.json;
perubahan policy perlu review, tidak dihasilkan ulang otomatis oleh CI.
Probe any/assertion/non-null/directive, penyusutan strict, hilangnya ekspor dan
import balik ke facade ditolak. Typecheck umum/strict/maintenance, 89 berkas/785 tes,
18 Chromium tests, data-path, clean production serta startup/offline lulus lokal.
Coverage V8 terbaru: 32.11% baris, 31.95% statement, 25.35% branch, 20.71% fungsi;
angka F24 sebelumnya tetap snapshot historis. Ini tidak mencakup coverage native
browser/worker/child process dan belum membuktikan runner GitHub/Linux berhasil.
[Rincian penutupan dan batas guard](audits/2026-11-15-f28-review.md).


L01 selesai 15 November 2026: run 43696531716 completed/success pada Ubuntu dan
Windows, termasuk typecheck/strict/maintenance, coverage (89 berkas), 18 browser
tests, data-path, clean production, offline dan upload artefak. Tidak ada perubahan
kode/workflow atau rerun. HEAD lokal b9a9437 berbeda hanya pada dokumentasi dari
SHA yang diuji 7527305; tidak mengklaim run tersebut memeriksa commit berikutnya.


L02 menambahkan e2e/installation.spec.ts dengan context baru tanpa seed database:
bootstrap kosong, upgrade v17 dan v33 sebelum React/current db dimuat, edit dan
reload naskah. Fixture schema lama hanya mengimpor Dexie. Tes kosong mendeteksi
proyek bawaan ganda pada baseline 5357bd1; transaksi projects/chapters/bible
memperbaikinya. projectBootstrap menguji concurrency, rollback dan retry.
Verifikasi lokal: typecheck umum/strict/maintenance, 90 berkas/787 tes, build,
21 tes Chromium lulus. CI menemukan spec baru melalui npm run test:e2e; belum
memverifikasi run GitHub untuk L02. Coverage tidak diukur ulang.
[Bukti dan batas migrasi](audits/2026-11-15-l02-installation.md).


L03 menambahkan delapan skenario e2e/dataUi.spec.ts: file hasil ekspor UI dipilih
ulang untuk impor/restore, cancel/konfirmasi, penolakan format/scope, injeksi hook
creating Dexie untuk rollback impor/restore, dan delete bab/Codex/proyek lewat UI.
Tes membandingkan record asli serta referensi, menggunakan dua proyek terisolasi
untuk memastikan proyek lain utuh. Model listing dimock; tanpa provider/Drive.
Typecheck umum/strict/maintenance, 90 berkas/787 tes dan 29 Chromium tests lulus
lokal. Tidak mengubah source aplikasi; build/coverage tidak diulang pada tahap ini.
[Bukti dan batas L03](audits/2026-11-15-l03-data-ui.md).


L04 menambahkan enam skenario e2e/atlasUi.spec.ts pada panel Atlas produksi:
PNG upload/Blob/reload dan penolakan SVG, drag/sisip/hapus vertex area-rute beserta
batas minimum/persistence, portal anak-induk/unlink, deep-link Codex, pergantian
proyek serta penulisan pin ke proyek/peta yang benar. URL Blob lama diperiksa
sudah dicabut setelah pergantian proyek, dengan wrapper yang tetap memanggil API
browser asli. Tidak memock Leaflet/service/IndexedDB atau mengubah source aplikasi.
Typecheck umum/strict/maintenance, 90 berkas/787 tes dan 35 Chromium tests lulus
lokal; build/coverage tidak diulang. Catatan gap Atlas pada F28 adalah historis;
[bukti dan batas L04](audits/2026-11-15-l04-atlas-ui.md) merinci cakupan saat ini.


L05 memperluas lint:strict ke helper backup/remap dan Atlas (28 root/41 source
termasuk import transitif). backupAtlas.typecheck.ts menjaga unknown hasil parse,
input yang tidak nullable, koordinat dan nullable centroid. Policy maintenance
menjaga 51 file tanpa menaikkan budget file lama. Probe kesalahan tipe, explicit
any baru dan penyusutan cakupan ditolak. Typecheck umum/strict/maintenance,
90 berkas/787 tes dan build lulus lokal; browser/coverage tidak diulang karena
implementasi runtime tidak berubah. [Bukti dan pengecualian](audits/2026-11-15-l05-strict.md).


Pengukuran L06: `npm run measure:backup -- --output=test-results/backup-benchmark.json`
menjalankan server terisolasi port 4183 dan empat dataset, tiga sampel tiap ukuran.
Merekam elapsed time/timer delay serta sampled heap CDP; checksum dan restore
penuh/internal memverifikasi seluruh bab serta byte gambar di luar timing.
Tidak memasang React/editor, tidak memakai akun/data pengguna atau menambahkan
threshold CI. Typecheck umum/strict/maintenance lulus; suite runtime tidak diulang.
[Metode dan batas L06](performance/l06-backup.md). Optimasi belum dilakukan.

L06 worker: measure:backup -- --worker membandingkan empat pasangan per ukuran,
termasuk clone/transfer, kesamaan payload produksi, penolakan input dan restore
seluruh bab/gambar. Typecheck umum/strict/maintenance lulus. Eksperimen di e2e/
tidak mengubah aplikasi atau mengklaim worker memory/startup/fallback siap rilis;
[bukti dan batas](performance/l06-worker.md).


L06 readiness: tujuh skenario e2e/backupReadiness.spec.ts menguji startup/crash/
timeout/malformed response dan fallback offline; data/cadangan asal tetap.
TipTap asli menguji snapshot dan ketikan dengan jendela delay in-flight yang
disengaja, bukan benchmark typing latency. Enam siklus memeriksa request/worker
bersih dan sampel V8 heap (attachment worker-stability.json). Total 42 Chromium
tests lulus lokal, bersama 787 tes unit/integrasi serta typecheck/strict/maintenance.
[Status per kriteria dan batas memori/integrasi](performance/l06-readiness.md).


L06 backupLoad.spec.ts menambah satu test aplikasi/editor aktif: enam run main/
worker bergantian, input saat CPU berjalan tanpa delay buatan, CDP heap main dan
worker selama pekerjaan, seluruh 120 karakter tersimpan/reload. Attachment dan
file output backup-load.json merekam tiap run. Tanpa threshold performa universal;
[hasil dan batas interpretasi](performance/l06-editor-load.md). Typecheck umum/
strict/maintenance, 787 tes unit/integrasi serta 43 Chromium tests lulus lokal.

L06 backupStorage.spec.ts menambah enam skenario service backup aplikasi dengan
IndexedDB native: kompresi hilang/gagal, crypto hilang, kuota sementara/permanen
dan kegagalan penyimpanan pre-restore lalu retry. Cocokkan seluruh data/gambar,
validasi record tersisa dan pelestarian draft/riwayat. Error diinjeksi melalui
property browser/hook Dexie, bukan disk nyata penuh.
[Metode dan batas](performance/l06-storage-failures.md). Suite kini berisi 49
skenario Chromium, seluruhnya lulus lokal (2.2 menit); typecheck umum/strict/
maintenance dan enam tes terarah juga lulus. Run pertama memiliki satu inspector
timeout pada tes beban editor saat dokumentasi ditulis; run ulang tanpa perubahan
workspace lulus. Detail dan batas diagnosis ada di laporan storage.
Unit/build/coverage tidak diulang pada batch tes/dokumentasi ini.
