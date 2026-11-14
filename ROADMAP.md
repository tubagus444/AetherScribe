# ROADMAP & BACKLOG AKTIF — AetherScribe

> **Pusat Rencana & Backlog Proyek.** Dokumen ini adalah satu-satunya pelacak kerja aktif untuk AetherScribe. 
> Semua fitur yang sudah selesai dan riwayat keputusan teknis telah diarsipkan dengan rapi di direktori [`docs/archive/`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/), katalog fitur di [`docs/features.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/features.md), dan log pembaruan di [`docs/changelog.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/changelog.md).

---

<a id="audit-2026-11-09"></a>

## Audit Aplikasi — 9 November 2026

**Status awal audit (9 November 2026):** seluruh 29 temuan terbuka pada baseline. Status implementasi terkini mengikuti checklist dan bukti penyelesaian di bawah. **Baseline:** `a47f895a47a633f02f95511192bddfa47397bef2`.

- [Laporan aplikasi (21 bagian)](docs/audits/2026-11-09-application-audit.md).
- [Register bukti dan kriteria penerimaan F01–F29](docs/audits/2026-11-09-findings.md).
- [Indeks dokumentasi](docs/README.md).

Checklist berikut adalah **satu-satunya status kerja aktif** untuk audit ini. Dokumen audit menyimpan snapshot bukti. Item prioritas lama di bagian berikutnya tetap berlaku; kerjakan setelah risiko data/keamanan yang lebih mendesak. Optimasi serialisasi lama berkaitan dengan F19/F23, bukan pengganti perbaikan integritas backup.

**Cara mengerjakan:** ambil satu item atau kelompok dengan dependensi jelas, buka bukti dan kriteria penerimaannya, buat reproduksi aman, implementasikan, lalu verifikasi. Centang hanya setelah acceptance terpenuhi dan dokumen modul/changelog diperbarui. Catat commit/PR, tanggal dan hasil tes di bawah item yang ditutup. Jika ditunda/ditolak, tulis alasan serta risiko yang diterima; jangan centang sebagai selesai.

**Urutan penting:** F05 mendahului F19; desain aset F03 diselaraskan dengan schema F04; F07 dan F10 menyelaraskan triage; F08/F09 menyelesaikan dua sisi search; F12 mendasari F14. F24 dimulai sebagai tes regresi setiap batch, kemudian dilengkapi harness/CI. P1 dapat dikerjakan beberapa jalur independen, bukan ketergantungan serial seluruh daftar.

**Estimasi:** S ≤1 hari, M 2–4 hari, L 5–10 hari; indikatif, termasuk verifikasi terarah. Horizon 0–2 hari berarti mulai mitigasi prioritas pertama, bukan janji seluruh P1 selesai dalam dua hari. Rencana 3–14 hari, 2–6 minggu, dan 1–3 bulan dijelaskan pada bagian 19 laporan.

### P1 — Kerjakan dahulu: data, keamanan, dan fungsi inti

- [x] **[F03](docs/audits/2026-11-09-findings.md#f03) — Restore internal membuang gambar Atlas** (High; M).
  - Tanggal / commit atau PR: 10 November 2026; commit `fix(backup): lindungi aset Atlas dan validasi restore (F03/F04)` (commit yang menambahkan bukti ini).
  - Perubahan inti: backup v8 memakai imageMode full/references dan SHA-256; auto internal mempertahankan Blob live yang cocok atau menolak jika aset tak tersedia. Snapshot pre-restore menyimpan gambar lengkap untuk undo. Peta tanpa gambar ditandai eksplisit; format/kebijakan diselaraskan dengan F04.
  - Reproduksi sebelum perbaikan: tes `restoring an internal backup does not discard an existing Atlas image` gagal pada source `270b5f2` (imageBlob undefined).
  - Verifikasi sesudah perbaikan: tes internal/full/pre-restore, undo gambar setelah map diganti, legacy, hash mismatch, dan aset hilang/diganti lulus. Batch F03/F04: 49 tes baru; `npx vitest run` — 48 berkas/534 tes lulus; `npm run lint` dan `npm run build` lulus.
  - Dokumentasi modul: `docs/backup-format.md`, `docs/features.md`, `docs/database.md`, `docs/decisions.md`, `docs/changelog.md`, indeks docs dan aturan backup/Atlas.
  - Batas verifikasi / risiko tersisa: IndexedDB sintetis, belum browser/Drive nyata. Auto internal membutuhkan aset live dan bukan backup gambar mandiri. Legacy tanpa hash mempertahankan identitas/dimensi cocok, tidak membuktikan versi gambar historis. F19 tetap terbuka.
- [x] **[F05](docs/audits/2026-11-09-findings.md#f05) — Flush editor resolve meskipun save gagal** (High; S–M).
  - Tanggal / commit atau PR: 10 November 2026; commit `fix(editor): hentikan replace dan reload saat save gagal (F05)` (commit yang menambahkan bukti ini).
  - Perubahan inti: flush reject pada error/update nol baris; status gagal tetap terlihat; draft dapat dicoba simpan ulang; replace/reload dibatalkan. Handler versionchange menahan auto-close Dexie sampai flush berhasil. Rejection pemanggil lifecycle/autosave ditangani.
  - Reproduksi sebelum perbaikan: `npx vitest run src/features/editor/hooks/useEditorSave.test.tsx` — 5 gagal/3 lulus (flush rejection dan update 0 dianggap sukses, reload menimpa draft, timer menghapus status gagal, cleanup melewatkan konten kosong).
  - Verifikasi sesudah perbaikan: tiga berkas tes F05 — 12/12 lulus; `npx vitest run` — 46 berkas/485 tes lulus; `npm run lint`, `npm run build`, dan `git diff --check` lulus. Build masih memberi peringatan bundle besar, import statis/dinamis ActionsPanel, eval ONNX, dan data Browserslist lama. Tes Find & Replace memakai hook asli dan IndexedDB sintetis terisolasi, mencakup pembatalan serta retry berhasil.
  - Dokumentasi modul: `docs/features.md`, `docs/database.md`, `docs/changelog.md`.
  - Batas verifikasi / risiko tersisa: belum diuji browser native/upgrade lintas-tab nyata; penutupan paksa tidak menjamin flush async selesai dan dapat membuang draft di memori. Upgrade tab lain tertahan selama save gagal. F19 tetap terbuka.
- [x] **[F01](docs/audits/2026-11-09-findings.md#f01) — Stored XSS pada label Atlas** (High; S).
  - Tanggal / commit atau PR: 13 November 2026; commit `fix(atlas): cegah stored XSS pada label dan tooltip (F01)` (commit yang menambahkan bukti ini).
  - Perubahan inti: ikon dibangun sebagai DOM, judul marker/nama Codex melalui textContent; tooltip dinamis diberikan ke Leaflet sebagai HTMLElement. Allowlist hex #RGB/#RRGGBB diterapkan di resolver dan boundary render termasuk handle edit; nilai invalid memakai fallback. Tidak mengubah data sumber, skema DB, atau dependensi.
  - Reproduksi sebelum perbaikan: `npx vitest run src/features/atlas/components/MapCanvas.test.tsx` pada source `c12bc43` — 27 gagal/1 lulus; payload JSON menjadi elemen/atribut handler pada badge/tooltip dan warna dapat menyisipkan HTML lewat style.
  - Verifikasi sesudah perbaikan: dua berkas tes F01 — 49/49 lulus, memakai Leaflet asli di jsdom untuk badge pin/area/route/portal, tooltip, nama marker/Codex, warna, edit handle, serta klik/dobel-klik. `npx vitest run` — 50 berkas/583 tes lulus; `npm run lint`, `npm run build`, dan `git diff --check` lulus. Peringatan build tetap terkait bundle besar, import ActionsPanel, eval ONNX, dan Browserslist lama.
  - Dokumentasi modul: `docs/features.md`, `docs/backup-format.md`, `docs/changelog.md`, `.claude/rules/atlas.md`.
  - Batas verifikasi / risiko tersisa: fixture sintetis, tidak memakai data pengguna. Belum pemeriksaan visual atau eksekusi payload di browser native; jsdom memverifikasi bahwa markup tidak menjadi node/handler. Tidak mengklaim mitigasi XSS di modul lain. F24 harness/CI penuh tetap terbuka.
- [x] **[F02](docs/audits/2026-11-09-findings.md#f02) — Proxy melampaui batas localhost** (High; S–M).
  - Tanggal / commit atau PR: 13 November 2026; commit `fix(proxy): batasi akses localhost dan validasi request (F02/F18)` (commit yang menambahkan bukti ini).
  - Perubahan inti: loopback bind, Host/Origin guard, allowlist Ollama dan redirect:error; schema request sebelum handler, wrapper rejection async dan error middleware JSON.
  - Bukti sebelum: source server.ts pada c152d2e bind 0.0.0.0, memakai URL request tanpa allowlist, model.includes/baseUrl.replace sebelum try.
  - Verifikasi: 26 tes boundary/HTTP loopback terisolasi lulus; seluruh 52 berkas/609 tes lulus; npm run lint, npm run build dan git diff --check lulus. Peringatan build lama tetap ada (bundle/ActionsPanel/ONNX/Browserslist).
  - Dokumentasi: docs/api.md dan docs/changelog.md.
  - Batas: tanpa key/provider nyata; Host/Origin bukan autentikasi proses lokal. Ollama remote/port kustom sengaja ditolak; F21 tetap terbuka.
- [x] **[F18](docs/audits/2026-11-09-findings.md#f18) — Input salah tipe menyebabkan rejection sebelum try** (Medium; S).
  - Tanggal / commit atau PR: 13 November 2026; commit `fix(proxy): batasi akses localhost dan validasi request (F02/F18)` (commit yang menambahkan bukti ini).
  - Perubahan inti: loopback bind, Host/Origin guard, allowlist Ollama dan redirect:error; schema request sebelum handler, wrapper rejection async dan error middleware JSON.
  - Bukti sebelum: source server.ts pada c152d2e bind 0.0.0.0, memakai URL request tanpa allowlist, model.includes/baseUrl.replace sebelum try.
  - Verifikasi: 26 tes boundary/HTTP loopback terisolasi lulus; seluruh 52 berkas/609 tes lulus; npm run lint, npm run build dan git diff --check lulus. Peringatan build lama tetap ada (bundle/ActionsPanel/ONNX/Browserslist).
  - Dokumentasi: docs/api.md dan docs/changelog.md.
  - Batas: tanpa key/provider nyata; Host/Origin bukan autentikasi proses lokal. Ollama remote/port kustom sengaja ditolak; F21 tetap terbuka.
- [x] **[F04](docs/audits/2026-11-09-findings.md#f04) — Validasi scope dan struktur restore tidak memadai** (High; M).
  - Tanggal / commit atau PR: 10 November 2026; commit `fix(backup): lindungi aset Atlas dan validasi restore (F03/F04)` (commit yang menambahkan bukti ini).
  - Perubahan inti: schema/limit terpusat untuk UI/core/internal/Drive, scope restore-all vs import-project, versi 3–8, struktur record/metadata, ID/kunci unik/FK lintas-proyek, raster data URL tanpa jaringan, batas file/dekompresi/record. Legacy dinormalisasi sesudah checksum. Snapshot pengaman lengkap wajib berhasil sebelum mutasi; error ditampilkan ke pengguna.
  - Reproduksi sebelum perbaikan: enam tes gagal pada source `270b5f2` — scope project, future version, malformed project, content salah tipe, FK tidak valid, dan kegagalan snapshot tetap diterima/dilanjutkan.
  - Verifikasi sesudah perbaikan: penolakan tanpa clear/snapshot untuk input invalid, fixture legacy v3–v7, impor non-destruktif dengan gambar, rollback insert gagal, kegagalan snapshot, batas stream/gzip/gambar, dan jalur Drive fetch mock lulus. `npx vitest run` — 48 berkas/534 tes lulus; `npm run lint` dan `npm run build` lulus (peringatan bundle/ActionsPanel/ONNX/Browserslist tetap ada).
  - Dokumentasi modul: sama dengan F03; detail kontrak dan batas ada di `docs/backup-format.md`.
  - Batas verifikasi / risiko tersisa: belum browser native/Drive nyata atau file legacy pengguna. Record/referensi workspace yang sudah tidak valid dapat menghalangi snapshot pengaman; restore dibatalkan. F10/F11/F19 dan harness/CI penuh F24 tetap terbuka.
- [x] **[F06](docs/audits/2026-11-09-findings.md#f06) — Duplikasi kosong dan urutan bab ambigu** (Medium; S).
  - Tanggal / commit: 13 November 2026; commit `fix(chapters): perbaiki duplikasi, urutan bab, dan triage (F06/F07)` (commit yang menambahkan bukti ini).
  - Perubahan inti: F06 membaca entitas lengkap setelah flush dan menormalkan order secara atomik; F07 memakai indeks projectId dengan upsert/clear transaksional tanpa migrasi.
  - Bukti awal: ChapterList menduplikasi proyeksi content kosong dan menukar order lewat update terpisah; setter triage menunggu compound index yang tidak ada.
  - Verifikasi: tujuh tes DB sintetis terisolasi mencakup duplikasi, urutan, rollback, gagal flush, concurrency, isolasi proyek dan reopen koneksi; hasil pemeriksaan akhir dicatat di changelog.
  - Dokumentasi: docs/features.md, docs/database.md, docs/changelog.md. Batas: belum UI/browser native; cleanup referensi F11 dan ekspor triage F10 tetap terbuka.
- [x] **[F07](docs/audits/2026-11-09-findings.md#f07) — Setter triage memakai compound index yang tidak ada** (Medium; S).
  - Tanggal / commit: 13 November 2026; commit `fix(chapters): perbaiki duplikasi, urutan bab, dan triage (F06/F07)` (commit yang menambahkan bukti ini).
  - Perubahan inti: F06 membaca entitas lengkap setelah flush dan menormalkan order secara atomik; F07 memakai indeks projectId dengan upsert/clear transaksional tanpa migrasi.
  - Bukti awal: ChapterList menduplikasi proyeksi content kosong dan menukar order lewat update terpisah; setter triage menunggu compound index yang tidak ada.
  - Verifikasi: tujuh tes DB sintetis terisolasi mencakup duplikasi, urutan, rollback, gagal flush, concurrency, isolasi proyek dan reopen koneksi; hasil pemeriksaan akhir dicatat di changelog.
  - Dokumentasi: docs/features.md, docs/database.md, docs/changelog.md. Batas: belum UI/browser native; cleanup referensi F11 dan ekspor triage F10 tetap terbuka.

### P2 — Correctness dan reliabilitas berikutnya

- [ ] **[F24](docs/audits/2026-11-09-findings.md#f24) — Coverage integrasi kritis belum tersedia** (Medium; L).
- [x] **[F10](docs/audits/2026-11-09-findings.md#f10) — Triage dan workshop key tidak round-trip** (Medium; M).
  - Tanggal / commit: 13 November 2026; commit `fix(import): pulihkan triage dan remap sesi workshop (F10)` (commit yang menambahkan bukti ini).
  - Perubahan: impor triage dalam transaksi; remap findingId Codex/relasi/timeline dan workshopKey entry:<id>, pertahankan teks bebas. Format asing ditolak atomik; status target hilang dianggap basi.
  - Bukti awal: snapshot ekspor sudah memuat triage sejak F19, tetapi importer tidak menulis tabelnya; workshopKey tidak mengikuti codexIdMap.
  - Verifikasi: lima tes round-trip/rollback/legacy dan pemetaan finding; 56 berkas/639 tes, typecheck dan build lulus (peringatan build lama tetap ada). Tes round-trip gagal pada baseline e17b932 karena triage impor kosong, lalu lulus sesudah perbaikan.
  - Dokumentasi: docs/features.md, docs/database.md, docs/backup-format.md, docs/changelog.md. Batas: belum browser/file pengguna nyata.
- [x] **[F11](docs/audits/2026-11-09-findings.md#f11) — Delete entitas meninggalkan referensi yatim** (Medium; M).
  - Tanggal / commit: 13 November 2026; commit `fix(data): bersihkan referensi saat menghapus entitas (F11)` (commit yang menambahkan bukti ini).
  - Perubahan: service transaksi domain untuk bab/peta/Codex/proyek; hapus data turunan, unlink referensi sambil mempertahankan teks; cleanup snapshot legacy tanpa parent dan cache bab setelah commit. Kebijakan reset triage/retensi dijelaskan di docs/database.md.
  - Bukti awal: jalur delete bab hanya menghapus chapter; map tidak melepas portal masuk; project hanya mencari snapshot dari bab yang masih ada.
  - Verifikasi: sembilan tes DB terisolasi untuk isolasi proyek, unlink, orphan snapshot, backup retention dan rollback; seluruh 54 berkas/625 tes lulus, typecheck dan build lulus (peringatan build lama tetap ada).
  - Dokumentasi: docs/database.md, docs/features.md, docs/changelog.md. Batas: belum browser native/lintas-tab nyata; F10/F19 tetap terbuka.
- [x] **[F19](docs/audits/2026-11-09-findings.md#f19) — Snapshot lintas tabel dan editor belum konsisten** (Medium; M).
  - Tanggal / commit: 13 November 2026; commit `fix(backup): konsistenkan snapshot dan amankan retensi Drive (F19/F20)` (commit yang menambahkan bukti ini).
  - Perubahan: snapshot readonly setelah flush editor, serialisasi di luar transaksi; ekspor membaca data terbaru. Upload Drive diverifikasi sukses/ID sebelum prune; kegagalan retensi dilaporkan terpisah.
  - Bukti awal: collectAllData membaca store terpisah; ExportManager memakai live-query sebelum flush; DELETE Drive mendahului upload.
  - Verifikasi: sembilan tes regresi DB/Drive mock; 55 berkas/634 tes lulus, typecheck/build/diff-check lulus (peringatan build lama tetap ada). Dokumentasi: docs/features.md, docs/backup-format.md, docs/changelog.md.
  - Batas: belum browser/Drive nyata; edit sesudah snapshot tidak masuk hasilnya. F10 tetap terbuka.
- [x] **[F08](docs/audits/2026-11-09-findings.md#f08) — Panel mencari pada instance Orama yang tidak diinisialisasi** (Medium; S–M).
  - Tanggal / commit: 13 November 2026; commit `fix(search): gunakan worker dan sinkronkan generated key Codex (F08/F09)` (commit yang menambahkan bukti ini).
  - Perubahan: facade pencarian berskor dengan projectId, antrean worker dan error propagation; generated key setelah onsuccess, indeks record final setelah commit, coalescing mutasi dan setup hook idempotent.
  - Bukti awal: panel memakai singleton main-thread yang tidak diinisialisasi; creating hook menimpa ID dengan primKey sebelum auto-increment selesai.
  - Verifikasi: sembilan tes facade/worker-handler/store dengan transport emulasi, DB terisolasi dan panel mock; 58 berkas/648 tes, typecheck/build/diff-check lulus (peringatan build lama tetap ada).
  - Dokumentasi: docs/features.md dan docs/changelog.md. Batas: belum Worker browser native/embedding nyata.
- [x] **[F09](docs/audits/2026-11-09-findings.md#f09) — Creating hook kehilangan generated key** (Medium; S).
  - Tanggal / commit: 13 November 2026; commit `fix(search): gunakan worker dan sinkronkan generated key Codex (F08/F09)` (commit yang menambahkan bukti ini).
  - Perubahan: facade pencarian berskor dengan projectId, antrean worker dan error propagation; generated key setelah onsuccess, indeks record final setelah commit, coalescing mutasi dan setup hook idempotent.
  - Bukti awal: panel memakai singleton main-thread yang tidak diinisialisasi; creating hook menimpa ID dengan primKey sebelum auto-increment selesai.
  - Verifikasi: sembilan tes facade/worker-handler/store dengan transport emulasi, DB terisolasi dan panel mock; 58 berkas/648 tes, typecheck/build/diff-check lulus (peringatan build lama tetap ada).
  - Dokumentasi: docs/features.md dan docs/changelog.md. Batas: belum Worker browser native/embedding nyata.
- [x] **[F12](docs/audits/2026-11-09-findings.md#f12) — Error SSE dianggap sukses kosong** (Medium; M).
  - Tanggal / commit: 13 November 2026; commit `fix(ai): tangani error stream, isolasi retry, dan cleanup rewrite (F12/F14/F15)` (commit yang menambahkan bukti ini).
  - Perubahan: parser SSE provider-aware dengan error/empty/termination guard; onRetry diteruskan, buffer direset dan hasil final sukses dipakai; timer rewrite dibersihkan, request dibatalkan dan callback run lama diabaikan.
  - Bukti sebelum: empat tes regresi pada source 2a42ceb gagal (SSE error HTTP 200, buffer chat/rewrite retry, cleanup timer gagal).
  - Verifikasi: 18 tes baru parser/proxy/hook memakai stream sintetis dan mock; 62 berkas/666 tes, typecheck/build/diff-check lulus (peringatan build lama tetap ada).
  - Dokumentasi: docs/features.md, docs/api.md, docs/changelog.md. Batas: belum provider/browser nyata; F17 dan sisa F13 tetap terbuka.
- [x] **[F14](docs/audits/2026-11-09-findings.md#f14) — Buffer keluaran bercampur antar-attempt** (Medium; M).
  - Tanggal / commit: 13 November 2026; commit `fix(ai): tangani error stream, isolasi retry, dan cleanup rewrite (F12/F14/F15)` (commit yang menambahkan bukti ini).
  - Perubahan: parser SSE provider-aware dengan error/empty/termination guard; onRetry diteruskan, buffer direset dan hasil final sukses dipakai; timer rewrite dibersihkan, request dibatalkan dan callback run lama diabaikan.
  - Bukti sebelum: empat tes regresi pada source 2a42ceb gagal (SSE error HTTP 200, buffer chat/rewrite retry, cleanup timer gagal).
  - Verifikasi: 18 tes baru parser/proxy/hook memakai stream sintetis dan mock; 62 berkas/666 tes, typecheck/build/diff-check lulus (peringatan build lama tetap ada).
  - Dokumentasi: docs/features.md, docs/api.md, docs/changelog.md. Batas: belum provider/browser nyata; F17 dan sisa F13 tetap terbuka.
- [x] **[F15](docs/audits/2026-11-09-findings.md#f15) — Interval rewrite tidak dibersihkan saat gagal** (Medium; S).
  - Tanggal / commit: 13 November 2026; commit `fix(ai): tangani error stream, isolasi retry, dan cleanup rewrite (F12/F14/F15)` (commit yang menambahkan bukti ini).
  - Perubahan: parser SSE provider-aware dengan error/empty/termination guard; onRetry diteruskan, buffer direset dan hasil final sukses dipakai; timer rewrite dibersihkan, request dibatalkan dan callback run lama diabaikan.
  - Bukti sebelum: empat tes regresi pada source 2a42ceb gagal (SSE error HTTP 200, buffer chat/rewrite retry, cleanup timer gagal).
  - Verifikasi: 18 tes baru parser/proxy/hook memakai stream sintetis dan mock; 62 berkas/666 tes, typecheck/build/diff-check lulus (peringatan build lama tetap ada).
  - Dokumentasi: docs/features.md, docs/api.md, docs/changelog.md. Batas: belum provider/browser nyata; F17 dan sisa F13 tetap terbuka.
- [ ] **[F16](docs/audits/2026-11-09-findings.md#f16) — Pesan cancel tidak cocok dengan receiver** (Medium; S).
- [x] **[F17](docs/audits/2026-11-09-findings.md#f17) — Fallback dapat melewati batas lokal ke cloud** (Medium; S–M).
  - Tanggal / commit: Implementasi 13 November 2026; commit 14 November 2026: `fix(ai): batasi fallback cloud dengan izin eksplisit (F17)` (commit yang menambahkan bukti ini).
  - Perubahan: izin fallback per provider, default tanpa fallback lintas-provider, mode inferensi hanya lokal, pemeriksaan ulang saat dispatch dan guard direct proxy. Kontrol langsung tersimpan dan indikator tujuan efektif ditampilkan.
  - Bukti sebelum: dua probe pada d093244 gagal (akses test-only callAI): cloud fallback Ollama tanpa izin dan cloud override mode lokal.
  - Verifikasi: 13 tes baru kebijakan/facade/proxy/settings/indikator memakai mock; 65 berkas/679 tes, typecheck/build/diff-check lulus (peringatan build lama tetap ada).
  - Dokumentasi: docs/features.md, docs/api.md, docs/changelog.md. Batas: belum provider/browser nyata; izin baru berlaku untuk dispatch berikutnya, bukan menarik request terkirim.
- [ ] **[F29](docs/audits/2026-11-09-findings.md#f29) — Ringkasan lama dapat dianggap mutakhir** (Medium; S).
- [x] **[F20](docs/audits/2026-11-09-findings.md#f20) — Prune dilakukan sebelum upload sukses** (Medium; S).
  - Tanggal / commit: 13 November 2026; commit `fix(backup): konsistenkan snapshot dan amankan retensi Drive (F19/F20)` (commit yang menambahkan bukti ini).
  - Perubahan: snapshot readonly setelah flush editor, serialisasi di luar transaksi; ekspor membaca data terbaru. Upload Drive diverifikasi sukses/ID sebelum prune; kegagalan retensi dilaporkan terpisah.
  - Bukti awal: collectAllData membaca store terpisah; ExportManager memakai live-query sebelum flush; DELETE Drive mendahului upload.
  - Verifikasi: sembilan tes regresi DB/Drive mock; 55 berkas/634 tes lulus, typecheck/build/diff-check lulus (peringatan build lama tetap ada). Dokumentasi: docs/features.md, docs/backup-format.md, docs/changelog.md.
  - Batas: belum browser/Drive nyata; edit sesudah snapshot tidak masuk hasilnya. F10 tetap terbuka.
- [ ] **[F21](docs/audits/2026-11-09-findings.md#f21) — Startup production tidak deterministik** (Medium; M).
- [ ] **[F25](docs/audits/2026-11-09-findings.md#f25) — ConfirmDialog belum mengelola semantik dan fokus** (Medium; S–M).
- [ ] **[F22](docs/audits/2026-11-09-findings.md#f22) — Distribusi frontend berat** (Medium; M).
- [ ] **[F23](docs/audits/2026-11-09-findings.md#f23) — Full scans pada jalur yang sering berubah** (Medium; M–L).

### P3 — Perbaikan terencana

- [ ] **[F13](docs/audits/2026-11-09-findings.md#f13) — Usage Claude tertimpa dan temperature nol diabaikan** (Low; S).
- [ ] **[F26](docs/audits/2026-11-09-findings.md#f26) — Mode legacy dapat menampilkan panel kosong** (Low; S).
- [ ] **[F27](docs/audits/2026-11-09-findings.md#f27) — Base64 key dan prompt preview bukan perlindungan rahasia** (Medium; S).
- [ ] **[F28](docs/audits/2026-11-09-findings.md#f28) — Kontrak longgar dan modul bertanggung jawab terlalu banyak** (Low; L).

### Format bukti penyelesaian

Tambahkan di bawah item terkait setelah dikerjakan:

```text
Tanggal / commit atau PR:
Perubahan inti:
Reproduksi sebelum perbaikan:
Verifikasi sesudah perbaikan (perintah + hasil):
Dokumentasi modul yang diperbarui:
Batas verifikasi / risiko tersisa:
```

Tidak ada kebutuhan otomatis menambah autentikasi/RBAC. Hardening mengikuti konteks single-user lokal. Pengujian provider, Drive, jaringan, atau data nyata perlu ruang lingkup yang sesuai; gunakan mock dan database terisolasi untuk regresi awal.

---

## 1. Prioritas Terbuka (Actionable)

Item-item yang memiliki desain jelas dan siap dikerjakan jika diperlukan peningkatan pada area terkait:

### 1.1 Penyimpanan & Performa: Diet Jalur Backup Serialisasi
- **Status:** Jalur internal sudah dioptimasi (`assembleBackupJson` 1x stringify).
- **Tujuan:** Untuk proyek dengan naskah sangat masif:
  - Pertimbangkan memindahkan proses serialisasi JSON / kompresi gzip ke Web Worker agar main thread sama sekali tidak mengalami jank pada naskah ratusan ribu kata.

### 1.2 Database: Konvensi Migrasi Streaming
- **Status:** Catatan teknis untuk migrasi skema masa depan.
- **Tujuan:** Migrasi Dexie di masa depan sebaiknya menghindari `toArray()` seluruh tabel besar di dalam transaksi jika hanya butuh memodifikasi field parsial. Buat pola cursor/streaming untuk update bertahap.

### 1.3 Ekspor Manuskrip: Cakupan Unicode Font PDF
- **Status:** Aman untuk bahasa Indonesia standar (huruf latin, tanda petik lengkung, em-dash).
- **Tujuan:** Jika di masa depan novel menggunakan karakter/glyph khusus (alfabet fiksi / aksara non-latin), integrasikan font kustom ber-subset UTF-8 ke generator jsPDF.

---

## 2. Ide Diparkir (❄️ Riset & Backburner)

Ide-ide konseptual yang diparkir karena membutuhkan fondasi baru, rawan false-positive, atau di luar urgensi saat ini:

- **Simulator Dunia (State Entitas Berubah Lintas-Bab):**
  - Melacak status hidup/mati karakter, kepemilikan artefak, atau pangkat yang berubah sepanjang bab, serta validasi jarak/waktu tempuh. *(Dibutuhkan fondasi "state-per-bab" terlebih dahulu).*
- **Lensa Suara Dialog (Analisis Gaya Bicara):**
  - Metrik panjang ujaran, variasi kosakata, dan gaya bicara deterministik per-tokoh untuk mendeteksi apakah semua karakter terdengar serupa.
- **Moodboard / Referensi Visual Codex:**
  - Galeri visual (wajah/kostum) per entri Codex. *(Perlu mitigasi kuota penyimpanan IndexedDB).*
- **Peringatan POV Aktif:**
  - Deteksi loncatan sudut pandang narasi (*anti head-hopping*). *(Tantangan: rawan false-positive tinggi pada deteksi teks bahasa Indonesia).*

---

## 3. Indeks Arsip Historis

Dokumen masa lalu yang telah diselesaikan dan dirangkum untuk referensi arsitektur:
- [`docs/archive/RENCANA-AUDIT-KODE.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/RENCANA-AUDIT-KODE.md) — Keputusan audit 12 area kualitas kode inti.
- [`docs/archive/RENCANA-OPTIMASI-AI.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/RENCANA-OPTIMASI-AI.md) — Rekam 14 optimasi token, prompt caching, dan routing model AI.
- [`docs/archive/RENCANA-ATLAS-DUNIA.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/RENCANA-ATLAS-DUNIA.md) — Spesifikasi awal dan arsitektur panel peta interaktif Atlas.
- [`docs/archive/ARSIP-AUDIT-FABLE.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/ARSIP-AUDIT-FABLE.md) — Riwayat lengkap perbaikan audit menyeluruh Fable Batch 1–3.
- [`docs/archive/ARSIP-FITUR-WORLDBUILDING.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/ARSIP-FITUR-WORLDBUILDING.md) — Riwayat implementasi 17 modul worldbuilding (Kalender, Glosarium, Faksi, Graf Lore, dll).
