# ROADMAP & BACKLOG AKTIF - AetherScribe

Diperbarui 15 November 2026. Dokumen ini adalah satu-satunya pelacak kerja aktif.
Bukti historis disimpan di [arsip](docs/archive/) dan riwayat perubahan di
[changelog](docs/changelog.md).

## Ringkasan status

- **Audit F01-F29: 29 dari 29 item selesai**, termasuk seluruh tahap F28.1-F28.6.
- **Pekerjaan lanjutan:** L01-L02 selesai; L03-L06 belum dimulai; tidak berarti temuan audit lama dibuka kembali.
- **Verifikasi terbaru:** pengujian lokal Windows/Node 24.15.0 pada F28.6, source
  dasar `c5af3ed`, dicatat dalam commit `7527305`.
- **CI GitHub:** Ubuntu dan Windows lulus pada commit `7527305`; [run 43696531716](https://github.com/tubagus444/AetherScribe/actions/runs/43696531716).

## Prioritas lanjutan

Urutan ini mendahulukan bukti penggunaan dan reliabilitas sebelum optimasi baru.
Item ditandai selesai setelah kriteria selesai terpenuhi dan dokumentasi diperbarui.

| Urutan | ID | Pekerjaan | Kriteria selesai | Status |
|---|---|---|---|---|
| 1 | L01 | Verifikasi workflow CI di GitHub | Catat run/commit dan hasil job Windows/Ubuntu; diagnosis dan perbaiki kegagalan yang ditemukan. | Selesai 15 Nov 2026 |
| 2 | L02 | Pengujian instalasi awal dan migrasi | Tes browser dengan IndexedDB kosong dan upgrade versi lama; proyek pertama, editor dan data hasil migrasi dapat dipakai. Jangan hanya memakai fixture yang sudah diisi. | Selesai 15 Nov 2026 |
| 3 | L03 | Lengkapi tes alur data melalui UI | Impor/restore melalui pemilihan file dan dialog; delete bab/Codex/proyek; error, pembatalan dan rollback tidak merusak data. Gunakan fixture terisolasi. | Belum dimulai |
| 4 | L04 | Lengkapi interaksi Atlas | Upload gambar, portal/deep-link, perpindahan proyek dan edit vertex area/rute diuji lewat UI browser, termasuk persistence dan cleanup. | Belum dimulai |
| 5 | L05 | Perluas TypeScript strict | Pilih batch modul berikutnya; catat import transitif, selesaikan diagnostik tanpa escape baru, perbarui policy dan pastikan CI/regresi lulus. | Belum dimulai |
| 6 | L06 | Ukur jalur backup naskah besar | Ukur serialisasi/kompresi dan respons UI dengan fixture besar. Jika ada jank bermakna, rancang pemindahan ke worker tanpa mengubah snapshot/checksum/restore. | Belum dimulai |

L01 telah diverifikasi; [bukti run, job dan batasnya](docs/audits/2026-11-15-l01-ci.md). L02 selesai; [bukti instalasi/migrasi dan perbaikan bootstrap](docs/audits/2026-11-15-l02-installation.md). L03 berikutnya melengkapi alur data melalui UI. L05 dikerjakan dalam
batch kecil per modul. L06 dimulai dari pengukuran, bukan langsung menambah worker.
Pengujian provider/Drive nyata memerlukan ruang lingkup tersendiri; tes regresi
awal tetap memakai mock, kredensial sintetis dan database terisolasi.

## Batas verifikasi yang masih berlaku

- Strict saat ini mencakup **19 root/28 source**, bukan seluruh aplikasi. Budget
  maintenance menjaga 38 berkas dan 18 ekspor publik AI; escape lama tetap tercatat.
- Tes browser memakai Chromium, lokal dan pada runner GitHub yang diverifikasi. Firefox/Safari,
  screen reader manual dan workflow provider/Drive nyata belum dibuktikan.
- Native Blob/backup/restore, worker, reload editor, metadata, draw/drag/filter/delete
  pin Atlas serta PWA/worker/ekspor Markdown offline sudah diuji pada fixture.
  Ini tidak membuktikan semua format ekspor offline atau seluruh workflow UI.
- Shutdown paksa tidak menjamin flush async selesai. Backup internal berbasis
  referensi membutuhkan aset live yang cocok; bukan backup gambar mandiri.
- Coverage mengukur Vitest; tidak menggabungkan browser/worker/child process native.
  Angka coverage bukan jaminan semua alur aman.

Daftar pengaman dan gap rinci ada di [panduan pengujian](docs/testing.md) dan
[review akhir F28](docs/audits/2026-11-15-f28-review.md).

## Pekerjaan bersyarat

| Area | Kapan dikerjakan | Catatan |
|---|---|---|
| Migrasi database secara bertahap | Saat menambah migrasi yang memproses tabel besar | Pakai cursor/streaming bila hanya perlu mengubah sebagian field; pertahankan migrasi append-only dan tes upgrade/rollback. |
| Font PDF non-Latin | Saat naskah membutuhkan aksara/glyph di luar cakupan font saat ini | Tambahkan font yang sesuai dan tes hasil ekspor; bukan kebutuhan wajib novel berbahasa Indonesia standar. |
| Pemisahan Atlas lanjutan | Saat mengubah toolbar/modal atau orchestration yang masih besar | Tambahkan tes perilaku sebelum ekstraksi berikutnya; jangan memecah hanya untuk mengejar jumlah baris. |

<a id="audit-2026-11-09"></a>

## Audit 9 November 2026 - selesai

Baseline audit: `a47f895a47a633f02f95511192bddfa47397bef2`. Seluruh temuan berikut
sudah ditutup. Judul menggambarkan masalah saat ditemukan, bukan kondisi aplikasi
sekarang. P1/P2/P3 dan estimasi lama adalah riwayat pelaksanaan, bukan urutan aktif.

| Temuan audit | Status |
|---|---|
| [F01](docs/audits/2026-11-09-findings.md#f01) — Stored XSS pada label Atlas | Selesai |
| [F02](docs/audits/2026-11-09-findings.md#f02) — Proxy melampaui batas localhost | Selesai |
| [F03](docs/audits/2026-11-09-findings.md#f03) — Restore internal membuang gambar Atlas | Selesai |
| [F04](docs/audits/2026-11-09-findings.md#f04) — Validasi scope dan struktur restore tidak memadai | Selesai |
| [F05](docs/audits/2026-11-09-findings.md#f05) — Flush editor resolve meskipun save gagal | Selesai |
| [F06](docs/audits/2026-11-09-findings.md#f06) — Duplikasi kosong dan urutan bab ambigu | Selesai |
| [F07](docs/audits/2026-11-09-findings.md#f07) — Setter triage memakai compound index yang tidak ada | Selesai |
| [F08](docs/audits/2026-11-09-findings.md#f08) — Panel mencari pada instance Orama yang tidak diinisialisasi | Selesai |
| [F09](docs/audits/2026-11-09-findings.md#f09) — Creating hook kehilangan generated key | Selesai |
| [F10](docs/audits/2026-11-09-findings.md#f10) — Triage dan workshop key tidak round-trip | Selesai |
| [F11](docs/audits/2026-11-09-findings.md#f11) — Delete entitas meninggalkan referensi yatim | Selesai |
| [F12](docs/audits/2026-11-09-findings.md#f12) — Error SSE dianggap sukses kosong | Selesai |
| [F13](docs/audits/2026-11-09-findings.md#f13) — Usage Claude tertimpa dan temperature nol diabaikan | Selesai |
| [F14](docs/audits/2026-11-09-findings.md#f14) — Buffer keluaran bercampur antar-attempt | Selesai |
| [F15](docs/audits/2026-11-09-findings.md#f15) — Interval rewrite tidak dibersihkan saat gagal | Selesai |
| [F16](docs/audits/2026-11-09-findings.md#f16) — Pesan cancel tidak cocok dengan receiver | Selesai |
| [F17](docs/audits/2026-11-09-findings.md#f17) — Fallback dapat melewati batas lokal ke cloud | Selesai |
| [F18](docs/audits/2026-11-09-findings.md#f18) — Input salah tipe menyebabkan rejection sebelum try | Selesai |
| [F19](docs/audits/2026-11-09-findings.md#f19) — Snapshot lintas tabel dan editor belum konsisten | Selesai |
| [F20](docs/audits/2026-11-09-findings.md#f20) — Prune dilakukan sebelum upload sukses | Selesai |
| [F21](docs/audits/2026-11-09-findings.md#f21) — Startup production tidak deterministik | Selesai |
| [F22](docs/audits/2026-11-09-findings.md#f22) — Distribusi frontend berat | Selesai |
| [F23](docs/audits/2026-11-09-findings.md#f23) — Full scans pada jalur yang sering berubah | Selesai |
| [F24](docs/audits/2026-11-09-findings.md#f24) — Coverage integrasi kritis belum tersedia | Selesai |
| [F25](docs/audits/2026-11-09-findings.md#f25) — ConfirmDialog belum mengelola semantik dan fokus | Selesai |
| [F26](docs/audits/2026-11-09-findings.md#f26) — Mode legacy dapat menampilkan panel kosong | Selesai |
| [F27](docs/audits/2026-11-09-findings.md#f27) — Base64 key dan prompt preview bukan perlindungan rahasia | Selesai |
| [F28](docs/audits/2026-11-09-findings.md#f28) — Kontrak longgar dan modul bertanggung jawab terlalu banyak | Selesai |
| [F29](docs/audits/2026-11-09-findings.md#f29) — Ringkasan lama dapat dianggap mutakhir | Selesai |

Bukti per batch, tanggal, commit, reproduksi dan hasil tes lama tetap tersedia di
[arsip pelaksanaan F01-F29](docs/archive/2026-11-15-roadmap-audit-completed.md).
Kriteria asli ada di [register temuan](docs/audits/2026-11-09-findings.md), dengan
konteks pada [laporan audit](docs/audits/2026-11-09-application-audit.md).

### Bukti penutupan terbaru

- Typecheck umum/strict/maintenance, **89 berkas/785 tes**, **18 tes Chromium**,
  data-path correctness/benchmark, build/clean production serta startup/offline lulus lokal.
- Coverage V8: 32.11% baris, 31.95% statement, 25.35% branch, 20.71% fungsi.
- F28 membandingkan inventaris awal/akhir, meninjau acceptance, mencatat pengecualian
  dan menambahkan pengaman CI. Lihat [review akhir](docs/audits/2026-11-15-f28-review.md).
- Angka di atas adalah snapshot verifikasi F28.6, bukan pemeriksaan ulang setelah
  setiap perubahan dokumentasi. L01 memverifikasi run Windows/Ubuntu pada commit
  `7527305`; commit lokal dokumentasi `b9a9437` dan perubahan berikutnya tidak diklaim diuji run tersebut.

## Ide diparkir

Belum menjadi komitmen implementasi atau pekerjaan aktif:

- **Simulator dunia:** status karakter/artefak lintas bab; perlu fondasi state per bab.
- **Lensa suara dialog:** analisis perbedaan gaya bicara antartokoh.
- **Moodboard Codex:** referensi visual per entri; perlu kajian kuota penyimpanan.
- **Peringatan POV:** deteksi perpindahan sudut pandang; perlu menguji false-positive bahasa Indonesia.

## Referensi

- [Indeks dokumentasi](docs/README.md)
- [Katalog fitur](docs/features.md)
- [Keputusan arsitektur](docs/decisions.md)
- [Arsip audit dan rencana lama](docs/archive/)


## Verifikasi lanjutan L02

Instalasi IndexedDB kosong dan upgrade v17/v33 diuji sebelum React mengisi database.
Bug proyek bawaan ganda diperbaiki dengan transaksi bootstrap atomik; tes rollback
storage failure dan retry ditambahkan. Typecheck umum/strict/maintenance,
90 berkas/787 tes, build dan 21 tes Chromium lulus lokal. Angka ini melengkapi
snapshot F28.6 di atas; bukan hasil runner GitHub baru. Batas versi/tab/browser
ada di [laporan L02](docs/audits/2026-11-15-l02-installation.md).
