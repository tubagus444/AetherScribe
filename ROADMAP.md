# ROADMAP & BACKLOG AKTIF - AetherScribe

Diperbarui 15 November 2026 setelah integrasi worker pada commit `4816258`.
Status pekerjaan ada di dokumen ini; rincian pelaksanaan ada di laporan dan arsip.

## Ringkasan status

- **Audit F01-F29 selesai**, termasuk F28.1-F28.6.
- **L01-L06 selesai**, termasuk pengukuran dan integrasi worker backup internal.
- **Verifikasi lokal terbaru:** 91 berkas/792 tes unit/integrasi beserta coverage,
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

## Pilihan tindak lanjut

Belum menjadi pekerjaan aktif. Tidak perlu menambah tes hanya untuk menaikkan
jumlah tes; pilih skenario yang sesuai dengan pemakaian aplikasi.

| Urutan | Pilihan | Bukti yang dicari |
|---|---|---|
| 1 | Verifikasi CI pada commit terbaru | Run Windows/Ubuntu untuk SHA terbaru, dengan hasil job dan artefak |
| 2 | Uji pemakaian dengan salinan proyek nyata | Menulis, Atlas, ekspor, backup dan restore dalam profil terpisah |
| 3 | Uji sesuai lingkungan pengguna | Drive/provider nyata, beberapa tab, browser lain atau aksesibilitas sesuai kebutuhan |

## Batas verifikasi

- Strict mencakup **31 root/44 source**; maintenance menjaga **54 berkas** dan
  18 ekspor publik AI. Strict belum mencakup seluruh aplikasi.
- Hasil lokal terbaru memakai Windows/Node 24.15.0 dan Chromium, fixture sintetis,
  DB/context terisolasi serta provider/Drive mock. Browser lain, screen reader
  manual, akun/provider nyata dan koordinasi lintas tab belum diverifikasi.
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
