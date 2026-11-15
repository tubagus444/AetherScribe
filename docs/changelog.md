# Changelog — AetherScribe

Catatan riwayat perubahan arsitektur, fitur, perbaikan bug, dan dokumentasi di repositori AetherScribe. Entri terbaru selalu berada di bagian teratas.

---

## 2026-11-15

### [Refactor] F28.4 - Pisahkan Tanggung Jawab Layanan AI

- Ekstrak settings, penyusunan konteks, dispatch/retry/fallback, lifecycle abort dan parsing hasil ke modul internal terpisah. Pertahankan ekspor publik melalui facade index.ts, identitas AIError, state circuit breaker/controller dan dedup rewrite.
- Pertahankan kebijakan provider/kredensial, pemisahan cachedContext, formatter lore bersama, parameter nol, callback retry dan cleanup pembatalan. Tanpa perubahan skema/dependensi.
- Perbarui arsitektur dan roadmap; validasi memakai typecheck umum/strict, suite regresi dan build. Cakupan strict tetap bertahap; pemisahan ini tidak menyatakan seluruh layanan AI sudah strict.

### [Refactor] F28.3 - Pemeriksaan TypeScript Strict Bertahap

- Tambahkan tsconfig.strict.json dan npm run lint:strict; aktifkan strict pada 17 root/26 berkas termasuk dependensi transitif kontrak/helper. Typecheck umum tetap terpisah; belum mengaktifkan strict seluruh aplikasi.
- Tambahkan assertion tipe strict untuk null/undefined dan callback opsional; assertion gagal jika strict dimatikan. Hapus dua cast any pada error SSE dan perkuat tes kode error tanpa mengubah perilaku retry/streaming.
- Jalankan check strict sebagai step CI Windows/Ubuntu. Dokumentasikan cakupan, skipLibCheck, any/non-null lama dan opsi ketat yang belum diaktifkan. Tanpa perubahan skema/dependensi.
- Typecheck umum/strict, 87 berkas/782 tes dan build lulus lokal. Probe implicit any/null/undefined/catch ditolak strict, serta probe strict=false menggagalkan pengaman. Browser/production/offline tidak diulang pada tahap ini; runner GitHub belum diverifikasi. F28.3 selesai, F28 induk tetap terbuka.

### [Refactor] F28.2 - Kontrak Data Worker, AI dan Bab

- Definisikan payload/result setiap task context serta pesan/result/error Orama; sender dan receiver memakai kontrak bersama. Periksa input sebelum komputasi dan hasil/progress sebelum diterima, pertahankan cancellation, cleanup timer, antrean, retry serta Map/Set native.
- Respons JSON/SSE provider masuk sebagai unknown; validasi teks, usage finite nonnegatif (termasuk nol), nama provider dan field error. Parser array model serta callback retry memakai unknown dan narrowing.
- Bedakan metadata daftar ber-ID, entitas tersimpan dan input pembuatan bab tanpa ID/metadata turunan. Duplikasi membentuk input baru tanpa menyalin identitas. Tambahkan pengaman tipe negatif dan tes boundary; facade publik tetap tersedia.
- Verifikasi lokal: typecheck, 87 berkas/782 tes, build, 16 Chromium tests dan startup/offline lulus. Dua probe pada source dec2940 gagal sesuai ekspektasi lalu lulus dengan guard. Dokumentasikan kontrak/batasnya; DB v34/dependensi tetap. F28.2 selesai, F28 induk dan F28.3-F28.6 masih terbuka.

### [Docs] F28.1 - Inventaris Kode, Kontrak dan Tes

- Tambahkan inventory-f28.mjs berbasis AST TypeScript serta snapshot per-file dan detail 19 modul fokus. Catat any/assertion/non-null/directive, konfigurasi compiler, import/konsumen dan ekspor publik; bukan bukti dead code atau jumlah bug.
- Petakan batas DB/worker/AI/Atlas, pengaman yang tersedia dan gap tes sebelum ekstraksi. Rekomendasikan kontrak worker, lalu boundary AI/DTO sebelum strict dan pemisahan modul besar. Pertahankan fondasi F11/F16/F23 serta facade publik.
- Baseline dec2940: 82 berkas/738 tes, 16 browser tests, typecheck dan build lulus lokal; peringatan build lama tetap ada. Tidak mengubah runtime/schema/dependency/strict; F28.1 selesai, F28 induk dan tahap lanjutan tetap terbuka. Rencana dokumentasi yang belum di-commit sebelumnya tetap dipertahankan.

## 2026-11-14

### [Docs] Prioritas Pelaksanaan F28

- Uraikan F28 menjadi enam tahap di ROADMAP: inventaris/pengaman, kontrak data, strict bertahap, ekstraksi layanan AI, pemisahan Atlas, lalu guard CI dan review acceptance.
- Tentukan lingkup serta syarat selesai per tahap; mulai F28.1/F28.2 sebelum strict/refactor besar. Gunakan fondasi F11/F16/F23 yang sudah ada dan pertahankan perilaku aplikasi. F28 tetap terbuka; tidak mengubah runtime atau konfigurasi TypeScript.


### [Perf] F23 — Metadata Terindeks dan Bounded Exact Ranking

- Tambahkan schema v34 append-only: covering metadata/timestamp index bab dan scene keyset index. Migrasi cursor tidak mengumpulkan seluruh manuskrip; creating/updating hook menjaga tuple dalam transaksi yang sama, menghitung kata hanya jika content berubah. Import/restore tidak mempercayai tuple file; rollback/delete tidak meninggalkan cache terpisah. Tidak menambah tabel/FK/dependency; backup tetap v8.
- ChapterList, WritingStats dan Dashboard memakai key metadata tanpa HTML; latest-modified auto-index membaca satu key. Ganti JSON stringify comparison dengan structural equality, konservatif untuk objek non-data. Preserve ID/order/status/count dan last-chapter tie berdasarkan ID.
- Exact semantic search membaca batch 256 dalam readonly snapshot dan menyimpan stable top-k; skor/tie/project isolation dan cancel tetap diuji. Tidak mengklaim semua pencarian lebih cepat atau menghindari seluruh vector scoring.
- Benchmark native IndexedDB kecil/sedang/besar mempertahankan hasil. Fixture 500 bab: list 193,3 ke 7 ms, timestamp 79,5 ke 0,4 ms, working-set full rows 12,59 MB ke metadata 32,2 KB (+5,4 KB backing); bukan peak heap seluruh app. Scene 10.000: 416 ke 427 ms, dengan bounded memory. Raw/metodologi/tradeoff ada di docs/performance/f23.md; test:data-paths ditambahkan ke CI.
- Guard tanpa serialisasi gagal pada source baseline 1c693f8 lalu lulus. 82 berkas/738 tes, 16 Chromium tests, typecheck/build/diff-check dan startup/offline smoke lulus. Migration v33 diuji di fake-indexeddb dan browser native; data/HTML serta statistik header/dashboard utuh. Peringatan build lama tetap ada; GitHub/Linux, multi-tab upgrade/quota, browser lain dan model nyata belum diverifikasi.


### [Perf] F22 — Pisahkan Dependency Berat dari Startup

- Lazy-load ExportManager sehingga library PDF/DOCX tidak dievaluasi saat editor dibuka. Pisahkan actionIcons dari ActionsPanel untuk menghilangkan import statis panel melalui menu seleksi; peringatan mixed import ActionsPanel hilang.
- Impor transformers hanya di getEmbedder; worker ES module mendukung chunk dinamis. Promise bersama/retry, konfigurasi model dan checkpoint cancel tetap dipertahankan. Tokenizer masih statis. Precache seluruh aset lazy dipertahankan untuk offline; tidak menambah dependency/schema atau mengurangi cakupan offline.
- Tambahkan measure-startup.mjs/test:startup dan langkah CI: lima sample context sintetis baru, ukuran entry/gzip/worker, Resource Timing dan CDP ScriptDuration; lalu production PWA offline reload, native token worker dan unduhan ekspor Markdown lazy. Laporan/batas ada di docs/performance/f22.md beserta raw sebelum/sesudah.
- Hasil lokal: entry JS 2.026.553 ke 1.251.421 byte; median editor terlihat 474 ke 408 ms, script 220 ke 174 ms. Precache sekitar 10,8 MiB hampir tetap; bukan klaim percepatan universal. Guard import transformer gagal pada source baseline 786cc5d lalu lulus. 76 berkas/723 tes, 14 browser tests, typecheck/build/diff-check dan production startup/offline smoke lulus. Peringatan bundle/ONNX/Browserslist lama tetap ada; GitHub/Linux dan model embedding nyata belum diverifikasi.


### [Fix] F25/F26 — Fokus Dialog dan Pemulihan Navigasi Legacy

- Gunakan native dialog/showModal untuk ConfirmDialog: role alertdialog, nama/deskripsi, top-layer/inert, fokus awal Batal, Tab/Shift+Tab berputar dan fokus kembali ke pemicu yang masih ada. Busy menahan Escape/backdrop dan menonaktifkan aksi; keyboard tidak meneruskan shortcut ke aplikasi di belakang. Penutupan dikendalikan prop open; fokus/nesting diuji di browser native.
- Normalisasikan mode melalui definisi studio: arc ke continuity, orphans ke completeness (panel induk Kesehatan Codex), unknown ke write, workshop tersimpan/tanpa target ke codex. Terapkan pada pemuatan preferensi, setter, riwayat studio dan fallback MainView. Workshop dengan target tetap valid; deep link Codex/Atlas dan ID bab dipertahankan.
- Dua tes browser pada source baseline df1f875 gagal pada migrasi arc dan role/deskripsi dialog. Sesudah fix, 12 tes baru komponen/helper/context dan enam browser skenario lulus; total 76 berkas/722 tes, 14 Chromium tests, typecheck, build serta diff-check lulus. Peringatan build lama tetap ada.
- Tidak menambah dependency atau mengubah schema DB. Dokumentasi fitur, arsitektur, testing, README dan ROADMAP diperbarui. Verifikasi lokal Windows/Chromium; belum screen reader manual, Firefox/Safari atau workflow GitHub. Dialog membutuhkan dukungan showModal native; mode lama diarahkan ke panel induk, bukan memulihkan target karakter/tab yang tidak tersimpan.


### [Fix] F27 — Pilihan Penyimpanan Key dan Minimisasi Log

- Pusatkan read/write key di credentialStore: default instalasi baru sesi, preferensi legacy permanen tetap dipakai sampai pengguna memilih dan menyimpan perubahan. Mode sesi tidak fallback ke key lokal; target ditulis sebelum salinan lama dibuang. Storage failure tampil tanpa klaim sukses.
- Pengaturan menyediakan pilihan sesi/ingat browser dan hapus key langsung. Jelaskan penyimpanan tidak terenkripsi, reload/tab restore, serta batas clear terhadap sesi tab lain, env server dan request/retry berjalan. Key/model/naskah pengguna tidak dihapus otomatis saat upgrade; tidak mengubah schema DB atau dependency.
- Hapus promptPreview/rawMessage dari log facade; raw error console pada AI, koneksi, model listing, summarizer, rewrite/chat dan proxy server diganti pesan statis. ErrorService hanya menyimpan diagnostik allowlist (source, provider, kode, angka lokasi/ID, networkError); pesan/stack/metadata bebas dibuang sebelum DB/console. Log lama disaring pada getRecent/panel, record aslinya tetap sampai clear manual/retensi.
- Tiga probe baseline 2d50625 gagal, lalu sepuluh tes baru hook/UI/facade/IndexedDB sintetis lulus. Suite akhir 73 berkas/710 tes, delapan Chromium tests, typecheck, build dan diff-check lulus. Tes browser baru memakai native storage dan model listing mock, tanpa key/provider nyata. Peringatan build lama tetap ada; workflow GitHub belum dieksekusi.
- Dokumentasi fitur, arsitektur, API, testing, README dan aturan AI/settings diperbarui. Base64 tetap kompatibel untuk key permanen, bukan enkripsi atau mitigasi XSS; log lebih minim mengurangi detail debugging. Tidak mengklaim semua console di seluruh aplikasi tersanitasi atau menghapus salinan historis dari perangkat/provider.


### [Test] F24 — Harness Integrasi Kritis, Browser dan CI

- Pisahkan discovery Vitest dari Playwright; tambahkan test:run, test:coverage dan test:e2e. Coverage V8 melaporkan seluruh src/entry server, termasuk area tanpa tes, dengan HTML dan JSON summary; tidak menggabungkan coverage browser/child process.
- Tambahkan tujuh tes Chromium: persist/reload editor, failed-save/flush/retry, duplikasi draft aktif, round-trip triage/invalid restore, sinkronisasi worker Orama lintas proyek, Blob/gzip Atlas dengan snapshot pengaman, serta context worker native. Context baru, DB fixture sebelum React, local-only, env key kosong dan request eksternal diblokir; cache/HMR uji terpisah dari dev.
- Browser failed-save terbukti gagal pada source sebelum fix F05 (6237f1e, parent 270b5f2): flush resolve alih-alih reject. Source saat ini dipulihkan lalu suite browser lulus. Tidak memakai profil/data/key pengguna.
- Workflow critical-tests.yml untuk push/PR/manual menyiapkan Node 24.15.0, menjalankan typecheck, unit/integrasi+coverage, Chromium dan build/clean production smoke di Windows/Ubuntu. Coverage dan trace/screenshot kegagalan disimpan tujuh hari; workflow tidak memakai repository secrets.
- Verifikasi lokal Windows: 70 berkas/700 tes, tujuh browser tests, typecheck, build/production smoke dan diff-check lulus. Coverage: baris 29.38%, statements 29.24%, branches 22.19%, functions 17.80%. Build masih memberi peringatan lama; CI GitHub/Linux belum dieksekusi. Inventaris/gap dan prosedur ada di docs/testing.md; belum mengklaim seluruh UI, browser lain, provider/Drive nyata, native XSS atau offline teruji.


### [Fix] F21 — Startup Production Deterministik

- Pisahkan serverDev.ts (Vite dinamis) dan serverProduction.ts (bundle CJS tanpa dependency dev). Server app tidak otomatis listen saat diimpor; npm start selalu production. File statis dicari relatif bundle, termasuk jika cwd berbeda.
- Muat .env cwd via dotenv tanpa menimpa env proses; validasi PORT 1-65535/default 3000 dan gunakan port yang sama pada Host/Origin proxy. Binding tetap 127.0.0.1; port 80 memakai normalisasi URL browser. Build hilang, port invalid/terpakai menghasilkan exit 1.
- Tambahkan engines Node sesuai lockfile (22.22.2 pada seri 22, 24.15.0 pada seri 24 atau >=26), petunjuk PowerShell, distribusi npm ci --omit=dev, dan koreksi dokumentasi APP_URL yang tidak digunakan.
- Tambahkan empat tes konfigurasi dan npm run test:production: build memakai secret sintetis lalu scan dist, clean install production di direktori sementara tanpa Vite/tsx, SPA/deep-link/aset, .env/key mock/mode/port/cwd, penolakan origin, dan kegagalan startup. Upstream mock; tidak memakai key/provider nyata.
- Baseline 9b57e73 terbukti gagal exit 1 (Cannot find module 'vite') pada dependency production bersih; sesudah perbaikan smoke production dan smoke development lulus di Windows/Node 24.15.0. 70 berkas/700 tes, typecheck, build dan diff-check lulus; peringatan build lama tetap ada. Belum memverifikasi Linux/versi Node lain.


### [Fix] F16 — Kontrak Cancel Context Worker dan Checkpoint

- Gunakan envelope CANCEL dengan payload.cancelId bersama antara sender/receiver melalui union contextProtocol.ts. Lacak request aktif, abaikan cancel terlambat, bersihkan state akhirnya, dan jangan post hasil/error request batal.
- Tambahkan checkpoint sebelum tugas, setelah model siap dan pembacaan preview DB; scan chunk yield setiap 16 chunk untuk menerima cancel. Model bersama/indexing latar tetap terpisah dari request timeout; tidak mengklaim preemption operasi sinkron atau embedding in-flight.
- Tes timeout gagal pada baseline 0a4e930 karena cancelId dikirim di root, lalu lulus setelah perbaikan. Lima tes baru memakai facade/handler asli dengan transport, tokenizer, model, dan DB mock: timeout/pending cleanup, isolasi request, model loading, scan kooperatif dan late cancel. Belum Worker browser native/model nyata.
- Verifikasi akhir: 69 berkas/696 tes lulus; `npm run lint`, `npm run build`, dan `git diff --check` lulus. Peringatan build lama tentang ukuran bundle, import ActionsPanel, eval ONNX, dan data Browserslist tetap ada.


### [Fix] F29/F13 ? Kesegaran Ringkasan dan Parameter/Metrik AI

- Tambahkan hash sumber ringkasan sebagai metadata Chapter inert. Conditional commit dalam transaksi menolak respons jika bab berubah/dihapus atau summary diedit saat request berlangsung. Timestamp freshness memakai versi sumber; legacy tanpa hash diregenerasi saat eligible. Tidak menambah schema DB atau loop retry otomatis.
- Gunakan nullish default untuk temperature agar nol tetap diteruskan. Usage stream Claude yang sudah digabung sejak F12 diverifikasi hingga message_stop, termasuk cache-read/cache-creation dan output nol; angka usage nol kini dihormati pada kalkulasi token.
- Lima probe gagal pada baseline de55cd9 (entry point summarizer diekspor sementara hanya untuk tes): race konten, temperature nol pada tiga keluarga provider, dan output-token nol. Verifikasi: 67 berkas/691 tes lulus; typecheck, build dan diff-check lulus (peringatan build lama tetap ada). Dua belas tes baru memakai IndexedDB sintetis dan provider mock, mencakup stale/version/deletion/manual-summary, concurrency, legacy, timestamp nol dan payload/usage. Belum provider/browser nyata; prompt ringkasan tetap dibatasi 15.000 karakter seperti sebelumnya.

## 2026-11-13

### [Fix] F17 ? Izin Fallback dan Mode Inferensi Lokal

- Default fallback lintas-provider menjadi kosong. Provider cadangan harus diizinkan eksplisit dan memiliki key; penyimpanan key saja tidak mengizinkan pengiriman naskah. Mode lokal memblokir semua inferensi cloud termasuk override per aksi dan callProxy langsung.
- Kontrol privasi dipersist langsung melalui useAISettings dan dibaca ulang sebelum setiap request/retry. Nilai lokal rusak/storage tidak tersedia menolak cloud. Tampilkan provider tujuan inferensi terakhir; jangan menambah hitungan circuit-breaker untuk penolakan kebijakan.
- Dua probe gagal pada baseline d093244 (callAI diekspor sementara hanya untuk akses tes): fallback Ollama ke cloud tanpa izin dan override cloud dalam mode lokal. Verifikasi: 65 berkas/679 tes lulus; typecheck, build dan diff-check lulus (peringatan build lama tetap ada). Tiga belas tes baru mencakup facade, direct proxy, izin/revokasi, storage, kontrol UI/persistensi serta indikator provider dengan mock jaringan. Belum provider/browser nyata; request yang sudah dikirim tidak dapat ditarik kembali. Tidak menambah dependensi atau schema DB.


### [Fix] F12/F14/F15 ? Error Streaming, Isolasi Retry, dan Cleanup Rewrite

- Parser SSE provider-aware menolak error frame/JSON rusak/teks kosong/EOF tanpa terminasi, memproses CRLF/multiline dan buffer akhir, serta meneruskan error callback. Reader dibatalkan/dilepas; stream tanpa callback dan abort body macet ditangani.
- Teruskan onRetry pada facade chat/rewrite. Reset buffer pada retry/fallback dan pakai hasil final sukses sebagai sumber utama; callback chat sesi lama diabaikan. Rewrite memakai run guard, ref timer, cleanup finally/unmount/ganti bab, pembatalan request dan penghapusan preview gagal.
- Empat reproduksi gagal pada source 2a42ceb: error SSE HTTP 200 dianggap sukses, buffer chat/rewrite bercampur dan timer gagal tertinggal. Verifikasi: 62 berkas/666 tes lulus; typecheck, build dan diff-check lulus (peringatan build lama tetap ada). Delapan belas tes baru memakai stream sintetis dan mock hook/provider, tanpa key/data pengguna. Belum provider/browser nyata; variasi protokol di luar fixture belum diverifikasi. F17 kebijakan fallback lokal/cloud tetap terbuka; F13 tidak ditutup meskipun usage stream kini digabung oleh parser.


### [Fix] F08/F09 ? Jalur Worker Pencarian dan Generated Key Codex

- Panel memakai pencarian berskor melalui facade worker dengan projectId eksplisit; worker mengantrekan INIT/mutasi/search. Codex bisa dicari sebelum indeks adegan tersedia dan hasil lama dibatalkan saat ganti proyek. Error worker tampil sebagai kegagalan, bukan hasil kosong.
- Creating hook menangkap generated key melalui onsuccess, membaca record final setelah commit, dan menggabungkan mutasi key sama dalam satu transaksi. Search menunggu pembacaan post-commit; rollback tidak diindeks. Hook idempotent dan store upsert mencegah dokumen duplikat.
- Verifikasi: 58 berkas/648 tes lulus; typecheck, build dan diff-check lulus (peringatan build lama tetap ada). Sembilan tes baru mencakup facade/handler/store Orama asli dengan transport Worker emulasi, DB terisolasi, serta panel React dengan facade mock. Batas: belum browser dengan Worker native atau embedding nyata; tidak memakai data pengguna. Skema/dependensi tidak berubah.


### [Fix] F10 ? Round-trip Triage dan Sesi Workshop

- Lengkapi import continuityTriage dalam transaksi proyek baru. Petakan findingId Codex/relasi/timeline/kronologi setelah ID dependen tersedia; pertahankan status/timestamp, lepas primary key sumber.
- Remap workshopKey entry:<id> melalui Codex baru; biarkan new:<seed>, pesan chat, dan HTML tetap literal. Format finding asing/target workshop tidak valid membatalkan impor atomik; triage dengan target yang sudah hilang tidak diimpor.
- Verifikasi: 56 berkas/639 tes lulus; typecheck dan build lulus (peringatan build lama tetap ada). Tes round-trip gagal pada baseline e17b932 karena hasil triage impor kosong, lalu lulus setelah perbaikan. Lima tes DB/pure mencakup ekspor/impor dua kali, semua bentuk finding yang dipakai consumer, ID baru, sumber tidak berubah, rollback dan legacy tanpa triage. Batas: fixture sintetis, belum browser native/file pengguna.


### [Fix] F19/F20 ? Snapshot Konsisten dan Retensi Drive Setelah Upload

- Pusatkan pembacaan backup dalam transaksi readonly setelah flush editor tervalidasi, termasuk backup per-proyek dan metadata ekspor manuskrip. Blob/checksum/kompresi di luar transaksi; save gagal menghentikan operasi dengan pesan error.
- Upload Drive wajib sukses dan mengembalikan ID sebelum prune. Error upload/network/missing ID tidak menghapus cadangan lama. Error prune menjadi warning terpisah; keberhasilan upload tetap dipertahankan.
- Verifikasi: 55 berkas/634 tes lulus; typecheck dan build lulus (peringatan build lama tetap ada). Sembilan tes regresi memakai DB terisolasi dan Drive mock: flush/gagal save, konsistensi penulisan bersamaan, scope proyek, urutan upload/delete dan kegagalan retensi. Belum browser/Drive nyata; perubahan setelah snapshot tidak termasuk hasil backup. F10 tetap terbuka meskipun koleksi per-proyek kini juga mencakup tabel triage.


### [Fix] F11 — Penghapusan Entitas dan Integritas Referensi

- Pusatkan penghapusan bab/peta/Codex/proyek dalam transaksi domain. Bersihkan snapshot/embedding, lepaskan referensi terstruktur dan portal masuk; pertahankan teks timeline/chat/janji plot. Workshop entri yang dihapus menjadi sesi studio. Triage proyek terkait direset.
- Satukan jalur ChapterList dan outline. Penghapusan proyek membersihkan snapshot legacy tanpa parent, mempertahankan snapshot bab hidup serta riwayat backup. Cache konsistensi bab dibersihkan setelah commit dan hasil request lama tidak menulis ulang map cache yang telah dilepas.
- Verifikasi: 54 berkas/625 tes lulus; typecheck dan build lulus (peringatan build lama tetap ada). Sembilan tes DB sintetis mencakup isolasi proyek, unlink, snapshot orphan, retensi backup dan rollback semua jenis delete. Belum verifikasi browser native atau penulisan lintas-tab bersamaan. F10/F19 tetap terbuka.

### [Fix] F06/F07 — Duplikasi Bab, Urutan Atomik, dan Persistensi Triage

- Duplikasi ChapterList membaca entitas lengkap setelah flush editor, bukan metadata list dengan content kosong. Pisahkan tipe metadata; normalisasi urutan add/delete/duplicate/move dalam transaksi dengan tie-break ID. Error operasi ditampilkan ke pengguna.
- Ganti query compound-index triage yang tidak tersedia dengan query projectId/filter findingId. Set/update/clear transaksional, terisolasi proyek dan mengonsolidasi duplikat pasangan yang disentuh. Schema DB tetap v33.
- Verifikasi: 53 berkas/616 tes lulus, typecheck dan build lulus (peringatan bundle/ActionsPanel/ONNX/Browserslist lama tetap ada). Tujuh tes regresi DB terisolasi mencakup salinan HTML/metadata, urutan, rollback, kegagalan flush, concurrency, isolasi proyek dan persistensi setelah koneksi dibuka ulang. Batas: belum pengujian UI/browser native; F10/F11 tetap terbuka.

### [Fix] F02/F18 — Batas Localhost dan Validasi Proxy

- Bind server ke 127.0.0.1; periksa Host/Origin/Sec-Fetch-Site sebelum parser/akses key. Batasi Ollama ke loopback HTTP port 11434 dan tolak redirect pada semua request upstream.
- Validasi objek request, provider, model, stream, dan URL sebelum handler async. Tambahkan wrapper rejection untuk semua POST serta error JSON parser/oversize terstruktur. Ekspor factory app agar HTTP dapat diuji tanpa startup Vite.
- Tambahkan 26 tes boundary dan HTTP loopback dengan upstream mock. Seluruh 609 tes lulus; typecheck dan build lulus (peringatan build lama tetap ada). Tidak menggunakan key/data pengguna. Kebijakan dan batas kompatibilitas Ollama remote didokumentasikan di docs/api.md; F21 tetap terbuka.

### [Fix] F01 — Stored XSS pada Label Atlas

- Mengganti string HTML ikon dengan DOM dalam `atlasMarkerIcons.ts`. Judul marker/nama Codex pada pin, area, route, dan portal menggunakan `textContent`; tooltip dinamis Leaflet menerima HTMLElement. SVG dekoratif memakai atribut konstan, tanpa parsing markup dari data pengguna.
- Menambahkan allowlist warna hex `#RGB`/`#RRGGBB` di resolver dan boundary render, termasuk polygon/polyline serta handle edit. Override invalid memakai fallback tanpa mengubah data tersimpan; tidak menambah dependensi atau mengubah skema DB.
- Menambahkan 49 tes regresi memakai Leaflet asli di jsdom dan fixture JSON sintetis. Pada source awal `c12bc43`, tes DOM mereproduksi 27 kegagalan/1 lulus (markup menjadi node/handler dan warna dapat menyisipkan HTML). Setelah perbaikan, 50 berkas/583 tes lulus; `npm run lint`, `npm run build`, dan `git diff --check` lulus. Peringatan build tetap terkait bundle besar, import ActionsPanel, eval ONNX, dan Browserslist lama.
- Memperbarui katalog fitur, kontrak backup terkait label, aturan Atlas, dan roadmap. Tidak mengubah snapshot laporan audit. Belum ada pengujian visual atau eksekusi payload di browser native; verifikasi jsdom memastikan payload tidak menjadi elemen/atribut handler.

## 2026-11-10

### [Fix] F03/F04 — Restore Atlas dan Validasi Backup

- Format backup v8 menandai gambar lengkap/referensi secara eksplisit. Auto internal tetap ramping melalui SHA-256 dan mempertahankan Blob live yang cocok; aset tidak tersedia membuat restore dibatalkan. File/Drive/ekspor/pre-restore menyimpan gambar lengkap; gambar yang memang sudah hilang ditandai eksplisit.
- Semua jalur restore/impor memakai schema terpusat: scope, versi 3–8, record/metadata, ID/kunci unik, dan FK termasuk batas proyek. Legacy v3–v7 dinormalisasi setelah verifikasi checksum data asli. Scope project tidak dapat mengganti seluruh workspace.
- Batas file/unduhan 64 MiB, JSON dekompresi 128 MiB, string 16 MiB, gambar 5 MiB, record 100.000/tabel dan 200.000 total. Dekompresi/unduhan dihitung per chunk. Decoder hanya menerima data URL PNG/JPEG/WebP/GIF dan tidak melakukan fetch gambar.
- Snapshot pra-restore wajib lengkap dan berhasil sebelum clear; kegagalan ditampilkan di UI dan membatalkan restore. Transaksi clear/refill tetap atomik. Skema DB tetap v33; tidak menambah dependensi.
- Menambahkan 49 tes pada service backup dan Drive mock. Tujuh reproduksi regresi gagal pada source `270b5f2` sebelum perbaikan. Verifikasi akhir: 48 berkas/534 tes lulus; typecheck dan build lulus. Peringatan build tetap terkait bundle besar, import ActionsPanel, eval ONNX, dan Browserslist lama.
- Memperbarui katalog fitur, dokumentasi DB, keputusan arsitektur, aturan modul, dan [format backup](backup-format.md). Batas: DB browser native/Drive nyata belum diuji; fixture legacy sintetis; legacy tanpa hash tidak dapat membuktikan versi gambar lama. Konsistensi snapshot bersamaan F19 dan round-trip F10 tetap terbuka.

### [Fix] F05 — Flush editor meneruskan kegagalan simpan

- Save konten hanya dianggap berhasil bila update memengaruhi tepat satu bab; error DB, ID invalid, dan update nol baris membuat flush reject serta menampilkan `Gagal menyimpan`. Konten kosong tetap dapat disimpan.
- Draft tetap di editor saat gagal. Find & Replace berhenti sebelum membaca/mengubah bab, membuat snapshot, atau reload; klik ulang mencoba flush kembali. Bridge reload menolak setelah save gagal sampai penyimpanan berhasil.
- Handler `versionchange` menahan auto-close Dexie dan hanya menutup/reload setelah flush sukses; kegagalan ditampilkan melalui isu DB. Rejection autosave/unmount/pergantian bab/pagehide ditangani; timer status lama dibersihkan agar pesan gagal tetap terlihat.
- Menambahkan dev dependencies `@testing-library/react`, `jsdom`, dan `fake-indexeddb` untuk tes React serta IndexedDB terisolasi. Lima tes gagal pada implementasi awal, lalu lulus setelah perbaikan; 12 tes regresi F05 mencakup kegagalan, retry, konten kosong, pembatalan replace/reload, dan `versionchange`.
- Verifikasi: `npx vitest run` — 46 berkas/485 tes lulus; `npm run lint`, `npm run build`, dan `git diff --check` lulus. Peringatan build terkait ukuran bundle, import ActionsPanel, eval ONNX, dan Browserslist dicatat di ROADMAP.
- Batas: belum ada verifikasi browser native/upgrade lintas-tab nyata; flush saat penutupan paksa tetap bersifat best effort. Data/key pengguna dan layanan eksternal tidak dipakai.

## 2026-11-09

### [Docs] Audit Aplikasi dan Backlog Perbaikan Berdasarkan Prioritas

- Menambahkan [indeks dokumentasi](README.md), [laporan audit 21 bagian](audits/2026-11-09-application-audit.md), dan [register 29 temuan F01–F29](audits/2026-11-09-findings.md).
- Menyimpan bukti source/baris, severity, metode dan batas verifikasi, rekomendasi, effort, dependensi, risiko perubahan, serta kriteria penerimaan tiap temuan.
- Menambahkan checklist P1/P2/P3 di [ROADMAP.md](../ROADMAP.md#audit-2026-11-09) sebagai satu-satunya tracker aktif; seluruh temuan masih terbuka.
- Menjelaskan perbedaan temuan baseline sekarang dengan klaim/keputusan dokumentasi historis tanpa mengubah arsip atau menyatakan keputusan baru sudah diterapkan.
- Hasil 43 berkas/473 tes, typecheck, build dan probe mock berasal dari sesi audit; penulisan dokumentasi ini tidak menjalankan ulang pengujian aplikasi atau layanan eksternal.
- **Cakupan perubahan:** hanya dokumentasi dan roadmap; tidak ada perubahan source, schema, fitur, API, atau implementasi mitigasi.

## 2026-10-09

### [Fitur] Glosarium strictMatch, Janji Plot Rekomendasi Kata Kunci, & Audit Konsistensi Batch
- **Glosarium: Mode strictMatch Opt-In per-Entri**:
  - Menambahkan field `strictMatch?: boolean` pada `GlossaryEntry` di `src/types.ts`.
  - Memperbarui `findGlossaryIssues` di `src/lib/glossary.ts` untuk menggunakan regex case-sensitive (`'g'` tanpa flag `'i'`) bila `strictMatch` aktif pada entri, serta mengisolasi entri tersebut dari fuzzy typo guessing agar istilah pendek atau huruf-kecil (seperti "mana", "ki", "chi", atau singkatan gelar "PM") tidak memicu false-positive terhadap kata umum bahasa Indonesia.
  - Menambahkan badge penanda `Ketat` pada kartu istilah dan kontrol centang interaktif pada `GlossaryForm` di `GlossaryPanel.tsx`.
- **Janji Plot: Rekomendasi Otomatis Kandidat Kata Kunci**:
  - Mengimplementasikan `extractKeywordCandidates` di `src/lib/plotPromises.ts` (100% deterministik, 0 token AI) untuk mengekstrak frasa berhuruf kapital multi-kata, kata tunggal esensial (dengan filter stop-words bahasa Indonesia/Inggris), serta pencocokan istilah glosarium aktif yang muncul di judul atau deskripsi janji.
  - Menampilkan lencana pil rekomendasi interaktif berikon *Sparkles* di `PlotPromisePanel.tsx` pada mode pelacakan kata kunci. Mengklik pil langsung menambahkan kata kunci ke formulir tanpa perlu mengetik ulang.
- **Audit Konsistensi Batch: Antrian Multi-Bab Berbasis Prompt Caching**:
  - Menambahkan pengalih tab `Bab Tunggal` vs `Audit Batch (Banyak Bab)` di `ConsistencyPanel.tsx`.
  - Mode Batch menyediakan antrian pemilihan multi-bab dengan tombol aksi cepat (*Pilih Semua*, *5 Bab Terakhir*, *Kosongkan*) dan perhitungan estimasi kata.
  - Memproses bab secara berurutan dalam antrian otomatis lengkap dengan bilah progres real-time (`%`, bab berjalan) serta tombol pembatalan aman kapan saja.
  - Menampilkan spanduk edukasi *Prompt Caching*: karena *Story Bible*, *Codex Lore*, dan relasi karakter dikirimkan dalam payload yang sama, bab ke-2 dan seterusnya memanfaatkan cache prompt AI (Anthropic/Gemini) yang menghemat biaya token hingga ~90% dan memangkas latensi.
  - Menyajikan ringkasan statistik temuan (Tinggi, Sedang, Rendah) dan akordeon hasil per bab yang dapat dibuka-tutup mandiri, lengkap dengan tombol `Buka di editor` untuk langsung melompat ke posisi kutipan bermasalah di naskah.
- **File yang berubah:**
  - `src/types.ts`
  - `src/lib/glossary.ts` & `src/lib/glossary.test.ts`
  - `src/features/consistency/components/GlossaryPanel.tsx`
  - `src/lib/plotPromises.ts` & `src/lib/plotPromises.test.ts`
  - `src/features/consistency/components/PlotPromisePanel.tsx`
  - `src/features/consistency/components/ConsistencyPanel.tsx`
  - `ROADMAP.md`
  - `docs/features.md`
  - `docs/changelog.md`

### [UI/UX] Perbaikan Tema Gelap & Penataan Pop Up Modal Kalender Dunia
- **Portal Rendering & Solusi Modal Terpotong**: Membungkus seluruh dialog pop up kalender (`CalendarCalculatorModal.tsx`, `ChronologyAuditModal.tsx`, `CalendarEditorModal.tsx`, `CalendarEventModal.tsx`) menggunakan `createPortal` langsung ke `document.body` dengan layer `z-[9999]`. Menghilangkan batasan stacking context dari `MainView` sehingga modal tidak lagi tertutup atau terpotong oleh header atas aplikasi.
- **Ketinggian Responsif Modal**: Mengubah batas ketinggian modal menjadi `max-h-[85vh]` dengan pemosisian `my-auto` dan pengguliran internal mandiri (`overflow-y-auto custom-scrollbar`), memberikan margin vertikal yang lega dari batas atas dan bawah layar.
- **Penyelarasan Tema Gelap (*Dark Mode*)**:
  - Menghapus kelas warna Tailwind non-standar (`dark:bg-slate-850`, `dark:border-indigo-850`) yang sebelumnya gagal di-render dan menyebabkan header inspector serta kartu estimasi perjalanan tampak putih pudar di mode gelap.
  - Memperbarui header tab panel samping di `WorldCalendarPanel.tsx` dengan kontras yang harmonis (`dark:bg-slate-900`, wadah tab `dark:bg-slate-950/80`, dan tab aktif `dark:bg-slate-800 text-indigo-400`).
  - Menyelaraskan kartu moda transportasi di Kalkulator Perjalanan (`dark:bg-slate-800/60`, `dark:border-slate-800`) dan kartu detail tanggal.
  - Menambahkan kontras teks yang tegas (`text-slate-800 dark:text-slate-100`) pada seluruh field input, select, dan tombol utilitas kalender.
- **File yang berubah:**
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `src/features/timeline/components/CalendarCalculatorModal.tsx`
  - `src/features/timeline/components/ChronologyAuditModal.tsx`
  - `src/features/timeline/components/CalendarEditorModal.tsx`
  - `src/features/timeline/components/CalendarEventModal.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [Docs] Pembaruan Panduan Kalender Dunia pada Panel Panduan Pengguna
- **Sinkronisasi Modul Panduan**: Memperbarui kartu panduan utama `Kalender Dunia` (`guideContent.tsx`) agar mencerminkan arsitektur antarmuka 2-kolom terbaru, tombol toggle mode layar penuh/Zen Mode, navigasi tab *Detail Tanggal* & *Agenda*, navigasi *Bird's-Eye Heatmap View*, sistem festival tahunan berulang, pelacak usia dinamis karakter dari Codex, kalkulator perjalanan multi-moda, dan audit kronologi deterministik nol token.
- **Relokasi Kategori**: Menempatkan fitur Kalender Dunia secara tepat di bawah grup `Dunia, Lore & Codex` (`group: 'world'`) sesuai posisinya di bilah navigasi studio, serta melengkapi tombol aksi cepat *"Buka Kalender Dunia"*.
- **Pembaruan Fitur Terkait & Fitur Mikro**: Memperbarui panduan `Peta Kontinuitas` untuk mencakup pemeriksaan urutan kronologi mundur, menambahkan tip penanggalan pada `Timeline Cerita`, serta menambahkan 6 entri sorotan fitur baru pada daftar `Fitur Kecil` (`SMALL_FEATURES`).
- **File yang berubah:**
  - `src/components/panels/guide/guideContent.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [UI/UX] Redesain Layout Kalender Dunia: Arsitektur 2-Kolom & Inspector Terpadu
- **Penyelesaian Masalah Kepadatan Layar**: Menghapus layout kaku 3-kolom (`1fr_300px_300px`) yang sebelumnya mempersempit lebar sel kalender menjadi ~65px. Menggantinya dengan arsitektur **2-Kolom Fleksibel** (`lg:flex-row`) di mana grid kalender mendapatkan prioritas ruang utama (*Hero Area*) yang lapang.
- **Unified Collapsible Inspector**: Menggabungkan kolom terpisah "Peristiwa di Tanggal Ini" dan "Daftar Semua Peristiwa" menjadi satu panel samping terpadu di kanan (~360px) dengan sistem navigasi tab segmented (`Detail Tanggal` & `Agenda`).
- **Sidebar Toggle & Full-Width Mode**: Menambahkan tombol toggle expand/collapse panel samping di header kalender (`PanelRightClose` / `PanelRightOpen`) sehingga penulis dapat memperluas kalender ke mode 100% layar penuh (*zen mode*) kapan saja.
- **Penyederhanaan Sel Kalender Bulanan**: Menata ulang tipografi nomor hari, menyederhanakan indikator hari libur menjadi badge ikon bintang/sparkle yang ringkas tanpa tumpang tindih, serta merapikan pill peristiwa dan bar rentang waktu (*range events*) agar tetap terbaca jelas tanpa memotong ruang sel.
- **Interaksi Kontekstual Mulus**: Mengklik sel tanggal manapun di kalender bulanan atau heatmap tahunan otomatis membuka panel samping (bila tertutup) dan beralih ke tab `Detail Tanggal`. Mengklik peristiwa di pohon agenda otomatis melompat (*jump to date*) ke tanggal bersangkutan di kalender dan membuka rinciannya.
- **File yang berubah:**
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [Fitur] Kalender Dunia: Hari Libur Tahunan, Pelacak Usia Karakter, & Heatmap Tahunan
- **Hari Libur & Festival Tahunan (*Recurring Holidays*)**: Menambahkan struktur data `WorldCalendarHoliday` ke `Project.calendar`, manajemen hari libur & swatch warna di `CalendarEditorModal.tsx`, fungsi filter deterministik `holidaysOnDate`, indikator visual berkilau (`Sparkles`) pada sel kalender bulanan dan heatmap tahunan, serta spanduk perayaan tematik di kartu detail hari.
- **Pelacak Usia Karakter Dinamis (*Dynamic Age Tracker*)**: Menambahkan field `birthDate` pada `CodexEntry` (kategori *character*), picker tanggal lahir terstruktur (Era, Tahun, Bulan, Hari) di `CodexForm.tsx`, chip tanggal lahir di `CodexDetailModal.tsx`, serta kalkulasi usia deterministik (`calculateCharacterAge`) lengkap dengan pendeteksian hari ulang tahun (`🎂 Ulang tahun!`) dan status belum lahir (`⚠️ Belum lahir`). Ditampilkan interaktif pada chip karakter di `CalendarEventModal.tsx` dan kartu peristiwa di `WorldCalendarPanel.tsx`.
- **Navigasi Tampilan Tahunan (*Bird's-Eye / Heatmap View*)**: Menyediakan pengalih mode `Bulan` vs `Tahun (Heatmap)` di `WorldCalendarPanel.tsx`. Komponen `YearHeatmapView` merender grid seluruh bulan dalam setahun dengan intensitas warna kepadatan peristiwa (0 peristiwa, 1 peristiwa, 2+ peristiwa, rentang waktu, dan hari libur) disertai interaksi zoom 1-klik langsung ke bulan dan tanggal bersangkutan.
- **File yang berubah:**
  - `src/types.ts`
  - `src/lib/worldCalendar.ts` & `src/lib/worldCalendar.test.ts`
  - `src/features/timeline/components/CalendarEditorModal.tsx`
  - `src/features/timeline/components/CalendarEventModal.tsx`
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `src/features/codex/components/CodexForm.tsx`
  - `src/features/codex/components/CodexDetailModal.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [Fitur] Kalender Dunia Fase 2: Audit Kronologi Deterministik & Kalkulator Perjalanan
- Mengimplementasikan **Kalkulator Jarak Waktu & Perjalanan** (`CalendarCalculatorModal.tsx`) dengan dukungan penghitungan selisih tanggal in-world (`daysBetween`, `breakdownDays`), estimasi jarak tempuh berbagai moda transportasi fantasi (`TRAVEL_MODES`: jalan kaki, kereta kafilah, kuda santai, kurir kilat, kapal layar, burung pos), proyeksi tanggal tiba (`addDays`, `addMonths`), dan pembuatan instan peristiwa rentang linimasa.
- Mengimplementasikan **Mesin Audit Kronologi Deterministik** (`chronologyAudit.ts`) berbiaya 0 AI token untuk mendeteksi tanggal mundur antar-bab (`retrograde-chapter`), urutan tanggal terbalik di bab yang sama (`retrograde-same-chapter`), dan rentang terbalik (`invalid-range`).
- Menambahkan **Toleransi Kilas Balik (*Flashback*)**: Otomatis mendeteksi indikasi analepsis/kilas balik pada judul atau deskripsi bab/peristiwa untuk mencegah false positive.
- Mengintegrasikan hasil audit ke **Dasbor Peta Kontinuitas** (`continuity.ts`, check `'chronology-retrograde'`) lengkap dengan triase (*abaikan/selesaikan*) dan tombol lencana peringatan interaktif di header **Kalender Dunia** (`ChronologyAuditModal.tsx`).
- Menambahkan tombol aksi cepat *"Hitung perjalanan dari tanggal ini"* pada kartu detail tanggal di `WorldCalendarPanel.tsx`.
- **File yang berubah:**
  - `src/lib/worldCalendar.ts` & `src/lib/worldCalendar.test.ts`
  - `src/lib/chronologyAudit.ts` (baru) & `src/lib/chronologyAudit.test.ts` (baru)
  - `src/lib/continuity.ts` & `src/lib/continuity.test.ts`
  - `src/features/consistency/components/ContinuityDashboard.tsx`
  - `src/features/timeline/components/CalendarCalculatorModal.tsx` (baru)
  - `src/features/timeline/components/ChronologyAuditModal.tsx` (baru)
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `docs/features.md`
  - `ROADMAP.md`
  - `docs/changelog.md`

### [UI/UX] Redesain Footer Utilitas Sistem pada Sidebar
- Mengubah footer tombol sistem di `Sidebar.tsx` dari 3 tombol teks horizontal yang padat dan berdesakan menjadi **Minimalist Icon Dock Bar** (gaya VS Code/Figma).
- Menambahkan label section ringkas "SISTEM" dengan tipografi harmonis (`tracking-[0.18em]`) serta tombol ikon proporsional (Pengaturan, Panduan, Log Error) dengan tooltip dan dukungan auto-close pada layar mobile (<768px).
- **File yang berubah:**
  - `src/components/layout/Sidebar.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

---

## 2026-10-08

### [Refactor] Arsitektur Dokumentasi Modular
- Memecah dokumentasi monolitik dari `CLAUDE.md` dan `AGENTS.md` ke dalam format modular di direktori `docs/` (`overview.md`, `architecture.md`, `features.md`, `database.md`, `api.md`, `decisions.md`, `changelog.md`).
- Merampingkan `CLAUDE.md` dan `.agents/AGENTS.md` menjadi pengarah ringkas di bawah 80 baris dengan klausul aturan wajib pembaruan dokumentasi.
- **File yang berubah:**
  - `docs/overview.md` (baru)
  - `docs/architecture.md` (baru)
  - `docs/features.md` (baru)
  - `docs/database.md` (baru)
  - `docs/api.md` (baru)
  - `docs/decisions.md` (baru)
  - `docs/changelog.md` (baru)
  - `CLAUDE.md`
  - `.agents/AGENTS.md`

---

## 2026-10-07

### [Refactor] Konsolidasi Tracker Root ke ROADMAP.md
- Merapikan dan memindahkan 5 file rencana/audit historis dari root direktori ke `docs/archive/` (`RENCANA-AUDIT-KODE.md`, `RENCANA-OPTIMASI-AI.md`, `RENCANA-ATLAS-DUNIA.md`, `ARSIP-AUDIT-FABLE.md`, `ARSIP-FITUR-WORLDBUILDING.md`).
- Membuat tracker aktif tunggal `ROADMAP.md` di root untuk memantau sisa tugas riil (Fase 2 Kalender Dunia, optimasi memory worker backup, Unicode PDF).
- **File yang berubah:**
  - `ROADMAP.md` (baru)
  - `docs/archive/*` (baru)
  - `CLAUDE.md`
  - `.agents/AGENTS.md`
  - `.gitignore`

---

## 2026-07-07

### [DB] [Fitur] Triase Temuan Peta Kontinuitas & Kalender AI Bridge
- Menambahkan tabel `continuityTriage` pada skema Dexie versi 33 untuk menyimpan status temuan kontinuitas yang diabaikan/disembunyikan oleh penulis.
- Memperbarui `buildTimelineSummary` agar menyertakan rentang tanggal kalender dunia terstruktur (`formatDateRange`) ke dalam konteks prompt AI.
- **File yang berubah:**
  - `src/db.ts`
  - `src/types.ts`
  - `src/features/consistency/components/ContinuityDashboard.tsx`
  - `src/lib/timelineSummary.ts`
  - `src/lib/importRemap.ts`

---

## 2026-07-06

### [Fitur] [DB] Atlas Dunia v1.0 s/d v2.1
- Implementasi panel peta interaktif Leaflet CRS.Simple (tabel `maps` dan `mapMarkers` skema Dexie v32).
- Penambahan penanda pin, poligon area wilayah, polyline rute, kalibrasi skala dan jarak nyata, deteksi wilayah yatim, dan navigasi sub-peta bertingkat (*hierarchical sub-maps*).
- **File yang berubah:**
  - `src/features/atlas/*`
  - `src/lib/mapGeometry.ts`
  - `src/lib/atlasAnalytics.ts`
  - `src/lib/atlasHierarchy.ts`
  - `src/db.ts`
  - `src/types.ts`

---

## 2026-07-03

### [Fitur] Papan Faksi, Graf Lore Visual & Heatmap Pacing
- Menambahkan kanvas visualisasi relasi faksi berbasis React Flow (`factionBoard`).
- Menambahkan visualisasi graf lore interaktif menggunakan Web Worker (`loreGraphWorker.ts`).
- Mengimplementasikan Heatmap tensi per bab dengan estimasi otomatis berbasis rasio dialog.
- **File yang berubah:**
  - `src/features/lore/components/FactionsPanel.tsx`
  - `src/features/codex/components/LoreGraphPanel.tsx`
  - `src/features/consistency/components/PacingHeatmapPanel.tsx`
  - `src/lib/pacingHeatmap.ts`
  - `src/lib/loreGraph.ts`
