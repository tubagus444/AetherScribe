# ROADMAP & BACKLOG AKTIF - AetherScribe

Diperbarui 18 November 2026 setelah verifikasi lokal DB04.
Status pekerjaan ada di dokumen ini; rincian pelaksanaan ada di laporan dan arsip.

## Ringkasan status

- **Audit F01-F29 selesai**, termasuk F28.1-F28.6.
- **L01-L06 selesai**, termasuk pengukuran dan integrasi worker backup internal.
- **Verifikasi lokal L01–L06:** 91 berkas/792 tes unit/integrasi beserta coverage,
  55 tes Chromium, typecheck umum/strict/maintenance, build, clean production dan
  startup/offline lulus sebelum commit `4816258`.
- **CI GitHub terakhir yang diverifikasi:** commit `7527305`, Windows dan Ubuntu
  lulus pada [run 43696531716](https://github.com/tubagus444/AetherScribe/actions/runs/43696531716).
  Run ini tidak membuktikan commit berikutnya telah diperiksa di GitHub.

Tidak ada item perbaikan dari dua batch tersebut yang masih terbuka. Pengujian
berikutnya dipilih berdasarkan kebutuhan pemakaian dan tidak mengubah status
selesai pekerjaan sebelumnya.

<a id="prioritas-lanjutan"></a>

## Hasil L01-L06

Seluruh item selesai 15 November 2026.

| ID | Hasil | Bukti dan batas |
|---|---|---|
| L01 | Verifikasi CI Windows/Ubuntu pada commit 7527305 | [Laporan CI](docs/audits/2026-11-15-l01-ci.md) |
| L02 | Instalasi kosong, migrasi v17/v33 dan perbaikan bootstrap atomik | [Instalasi dan migrasi](docs/audits/2026-11-15-l02-installation.md) |
| L03 | Impor, restore dan penghapusan melalui UI, termasuk rollback/isolasi | [Alur data UI](docs/audits/2026-11-15-l03-data-ui.md) |
| L04 | Upload, vertex, portal, deep-link dan perpindahan proyek Atlas | [Interaksi Atlas](docs/audits/2026-11-15-l04-atlas-ui.md) |
| L05 | Perluasan strict bertahap untuk helper backup dan Atlas | [Batch strict](docs/audits/2026-11-15-l05-strict.md) |
| L06 | Pengukuran backup besar dan integrasi worker auto internal dengan antrean/fallback | [Integrasi dan verifikasi akhir](docs/performance/l06-integration.md) |

<a id="database-improvement"></a>

## Rencana peningkatan database — 18 November 2026

Tetap menggunakan IndexedDB + Dexie. Rincian tugas, dependensi, aturan fitur baru,
dan kriteria penerimaan ada di [rencana peningkatan database](docs/database-improvement-plan.md).
Status pelaksanaan dicatat di tabel ini.

| Urutan | ID | Pekerjaan | Status |
|---|---|---|---|
| 1 | DB01 | Perlindungan dan pemulihan naskah | Selesai, diverifikasi lokal |
| 2 | DB02 | Pusatkan operasi perubahan data | Selesai, diverifikasi lokal |
| 3 | DB03 | Validasi penulisan dan integritas relasi | Selesai, diverifikasi lokal |
| 4 | DB04 | Katalog tabel dan kebijakan data | Selesai, diverifikasi lokal |
| 5 | DB05 | Kontrak akses data dan adapter Dexie | Selesai, diverifikasi lokal |
| 6 | DB06 | Kontrak data dan evolusi skema | Direncanakan |
| 7 | DB07 | Format ekspor portabel | Direncanakan |
| 8 | DB08 | Kapasitas dan optimasi berdasarkan pengukuran | Direncanakan |
| 9 | DB09 | Identitas global dan pelacakan perubahan | Bersyarat: kebutuhan sinkronisasi |
| 10 | DB10 | Pembuktian migrasi terisolasi | Bersyarat: target migrasi dipilih |

### Hasil DB01

- Isi bab disimpan setelah jeda 1,5 detik. Pembacaan untuk cadangan menunggu
  penyimpanan editor aktif. Footer menampilkan gagal simpan dan hasil tulis lama
  tidak menandai edit yang lebih baru sebagai tersimpan. Kegagalan simpan judul
  dilaporkan lewat notifikasi.
- Pemeriksaan kuota saat aplikasi dibuka tetap memberi peringatan di atas 80%.
  Permintaan persistensi tersedia di **Pengaturan → Data & Cadangan** saat API
  peramban mendukungnya. Penolakan dan API yang tidak tersedia tetap memungkinkan
  pengguna menulis dan mencadangkan.
- Titik pulih otomatis internal memakai referensi gambar peta dari ruang kerja.
  File lengkap, folder, Drive, dan titik sebelum pemulihan menyertakan gambar.
  UI memperlihatkan hasil terbaru per tujuan dan mempertahankan waktu cadangan
  berhasil sebelumnya ketika upaya baru gagal. Untuk ekspor manual, status
  mencatat permulaan unduhan. Sesi Drive yang berakhir meminta login ulang.
- [Uji Chromium](e2e/dataUi.spec.ts) memulihkan file yang diunduh melalui UI ke
  konteks kosong dan membandingkan naskah, relasi, serta byte gambar peta.
  Tes juga mencakup fallback persistensi dan kedaluwarsa Drive dengan respons
  tiruan. Pengujian memakai data sintetis dan profil terisolasi.
- Verifikasi lokal mencakup 794 tes unit/integrasi, typecheck umum dan strict,
  maintenance, serta build produksi. Rangkaian Chromium mencatat 41 dari 42 tes
  lulus. F27 gagal pada percobaan tersebut lalu lulus saat diulang bersama enam
  tes yang mencakup editor dan DB01.

### Hasil DB02

- Inventaris mutasi dari UI dan hook mencakup bab dan snapshot, proyek dan
  progres harian, Codex dan kategori, relasi dan Bible, timeline dan kalender,
  Atlas, sesi dan aksi AI, glosarium, janji plot, serta log. Penulisan kini
  melewati layanan domain. Live query tetap memasok tampilan dari IndexedDB.
- Pembuatan proyek dan bab awal, penggantian lintas bab beserta snapshot,
  pemulihan versi bab, serta pengurutan bab dan timeline memakai transaksi
  di layanan. Penggantian dan pemulihan membatalkan perubahan jika penulisan
  snapshot wajib gagal. Flush editor, invalidasi konteks, dan pemberitahuan
  penghapusan tetap mengikuti urutan operasi yang berlaku.
- Skema dan format cadangan kompatibel dengan data sebelumnya.
  [Uji penggantian lintas bab](src/components/modals/CrossChapterReplace.test.tsx)
  memeriksa rollback pada bab kedua. [Uji Chromium](e2e/dataUi.spec.ts) memeriksa
  rollback pembuatan proyek dan keberhasilan percobaan ulang.
- Verifikasi lokal mencakup 795 tes unit/integrasi, typecheck umum dan strict,
  maintenance, serta build produksi. Putaran awal Chromium mencatat 56 dari
  60 tes lulus. Keempat tes yang gagal lulus pada pengulangan terfokus
  bersama 12 tes lainnya.

### Hasil DB03

- Layanan membedakan input pembuatan, patch, dan record tersimpan. Penulisan
  memvalidasi nilai dan memeriksa target referensi dalam transaksi yang sama.
  Patch dapat melepas tautan opsional. Field lama yang tidak dikirim tetap utuh.
- [Kebijakan relasi](docs/database.md#validasi-penulisan-dan-kebijakan-relasi-db03)
  merinci penghapusan anak dan pelepasan tautan. Snapshot lama tanpa induk
  yang bisa diidentifikasi dipertahankan ketika proyek lain dihapus.
- Laporan baca-saja tersedia di **Pengaturan → Data & Cadangan → Periksa Relasi
  Data**. Uji mencakup penolakan tautan invalid atau lintas proyek, rollback,
  pelestarian naskah lama, pemulihan snapshot, dan penghapusan hubungan tanpa
  menghapus entri Codex.
- 799 tes unit/integrasi, typecheck umum dan strict, maintenance, serta build
  produksi lulus. Rangkaian awal Chromium mencatat 40 dari 41 tes lulus.
  F26 yang gagal lulus saat diulang, dan ketiga skenario DB03 lulus dalam
  pengulangan terfokus.

### Hasil DB04

- [Katalog tabel](src/lib/tableCatalog.ts) merinci cakupan, relasi, retensi,
  ekspor, impor, pemulihan, dan penghapusan untuk 20 tabel Dexie. Tes memeriksa
  kesesuaian dengan skema aktual dan indeks yang dipakai untuk menyaring
  record proyek atau bab.
- Koleksi dan validasi cadangan serta cakupan transaksi impor, pemulihan,
  dan penghapusan diturunkan dari katalog. Remap ID, aset, deduplikasi Bible,
  serta pelepasan relasi tetap eksplisit. [Kebijakan data](docs/database.md#katalog-tabel-dan-kebijakan-data-db04)
- Tes memastikan urutan tabel format v8, impor seluruh tabel yang diekspor,
  regenerasi cache, serta perlindungan log dan riwayat cadangan saat pemulihan.
  Verifikasi lokal mencakup 802 tes unit/integrasi, 28 tes Chromium, typecheck
  umum dan strict, maintenance, serta build produksi.

### Hasil DB05

- Kueri, penulisan, dan langganan perubahan bab serta snapshot memakai kontrak
  di `src/lib/chapterStorage.ts` dan adapter Dexie di
  `src/adapters/dexieChapterStorage.ts`. Hook di `src/hooks/useChapterQueries.ts`
  menangani langganan UI. [Kontrak penyimpanan bab](docs/database.md#kontrak-akses-bab-dan-riwayat-versi-db05)
- Ganti teks lintas bab dan pemulihan versi tetap atomik bersama snapshot
  pengaman. Chromium memeriksa pembaruan judul dan riwayat versi antartab, serta
  rollback naskah dan snapshot saat penulisan gagal.
- Verifikasi lokal mencakup 802 tes unit/integrasi, typecheck umum dan strict,
  maintenance, serta build produksi. Sebanyak 64 dari 65 tes Chromium lulus
  pada putaran penuh. Uji simpan draf terputus oleh hot reload Vite saat berkas
  sumber disunting dan lulus saat seluruh 20 tes di `e2e/critical.spec.ts` diulang.
- Cakupan awal adalah bab dan riwayat versi. Bootstrap proyek, cadangan, dan
  layanan domain lain mengikuti jalur Dexie masing-masing. Skema v34 dan format
  cadangan v8 tetap berlaku. Evolusi skema dilanjutkan pada DB06.

## Pilihan tindak lanjut

Belum menjadi pekerjaan aktif. Tidak perlu menambah tes hanya untuk menaikkan
jumlah tes; pilih skenario yang sesuai dengan pemakaian aplikasi.

| Urutan | Pilihan | Bukti yang dicari |
|---|---|---|
| 1 | Verifikasi CI pada commit terbaru | Run Windows/Ubuntu untuk SHA terbaru, dengan hasil job dan artefak |
| 2 | Uji pemakaian dengan salinan proyek nyata | Menulis, Atlas, ekspor, backup dan restore dalam profil terpisah |
| 3 | Uji sesuai lingkungan pengguna | Drive/provider nyata, beberapa tab, browser lain atau aksesibilitas sesuai kebutuhan |

## Batas verifikasi

- Strict mencakup **32 root/46 source**; maintenance menjaga **54 berkas** dan
  18 ekspor publik AI. Strict belum mencakup seluruh aplikasi.
- Hasil lokal terbaru memakai Windows/Node 24.15.0 dan Chromium, fixture sintetis,
  DB/context terisolasi serta provider/Drive mock. Verifikasi antartab DB05
  mencakup pembaruan judul bab dan riwayat versi. Browser lain, screen reader
  manual, akun/provider nyata dan koordinasi operasi lain antartab masih di luar
  cakupan verifikasi ini.
- Worker aktif untuk persiapan auto internal besar; antrean berlaku per tab.
  Collect/flush, serialisasi Blob dan checksum penuh masih pada jalur sebelumnya.
  Pengukuran latensi/memori eksperimen bukan benchmark ulang integrasi atau peak RSS.
- Auto internal memakai referensi aset gambar live; file/Drive/pre-restore lengkap.
  Shutdown paksa tidak menjamin flush async selesai. Disk nyata penuh belum diuji.
- Coverage Vitest tidak menggabungkan worker/browser native atau child process.
  Cakupan dan hasil terbaru ada di [panduan pengujian](docs/testing.md).

## Pekerjaan bersyarat

| Area | Kapan dikerjakan |
|---|---|
| Migrasi bertahap | Ketika migrasi baru memproses tabel besar; gunakan cursor/streaming bila sesuai |
| Font PDF non-Latin | Ketika naskah membutuhkan glyph di luar cakupan font saat ini |
| Pemisahan Atlas lanjutan | Ketika perubahan toolbar/modal/orchestration membutuhkan pemisahan tanggung jawab |
| Optimasi backup lanjutan | Ketika pengukuran pemakaian menunjukkan collect/Blob, memori atau lintas tab perlu ditangani |

<a id="audit-2026-11-09"></a>

## Audit F01-F29 - selesai

Seluruh 29 temuan audit 9 November 2026 ditutup. Judul dan prioritas pada laporan
awal menggambarkan kondisi saat audit, bukan daftar masalah aplikasi sekarang.

- [Register temuan dan kriteria asli](docs/audits/2026-11-09-findings.md).
- [Arsip pelaksanaan F01-F29](docs/archive/2026-11-15-roadmap-audit-completed.md).
- [Review akhir F28](docs/audits/2026-11-15-f28-review.md).
- [Arsip pelaksanaan L01-L06](docs/archive/2026-11-15-roadmap-l01-l06-completed.md).

## Ide diparkir

Belum menjadi komitmen implementasi:

- Simulator dunia: status karakter/artefak lintas bab.
- Lensa suara dialog: analisis perbedaan gaya bicara tokoh.
- Moodboard Codex: referensi visual per entri dan kajian kuota penyimpanan.
- Peringatan POV: deteksi perpindahan sudut pandang dengan kajian false positive.

## Referensi

- [Indeks dokumentasi](docs/README.md).
- [Katalog fitur](docs/features.md).
- [Keputusan arsitektur](docs/decisions.md).
- [Changelog](docs/changelog.md).
