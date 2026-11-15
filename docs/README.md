# Indeks Dokumentasi — AetherScribe

## Panduan membaca

| Kebutuhan | Dokumen |
|---|---|
| Memahami tujuan dan modul aplikasi | [Overview](overview.md) |
| Memahami arsitektur, worker, state, dan environment | [Arsitektur](architecture.md) |
| Mencari fitur dan file implementasinya | [Katalog fitur](features.md) |
| Memeriksa tabel, indeks, dan aturan migrasi | [Database](database.md) |
| Memeriksa format backup, aset gambar, validasi, dan batas pemulihan | [Format backup](backup-format.md) |
| Memeriksa endpoint proxy | [API](api.md) |
| Memahami keputusan historis | [Keputusan arsitektur](decisions.md) |
| Melihat riwayat perubahan | [Changelog](changelog.md) |
| Memilih dan melacak pekerjaan berikutnya | [ROADMAP — tracker aktif](../ROADMAP.md) |

## Audit aplikasi 9 November 2026

- [Laporan analisis aplikasi: 21 bagian](audits/2026-11-09-application-audit.md).
- [Register F01–F29: bukti, dampak, rekomendasi, dan kriteria penerimaan](audits/2026-11-09-findings.md).
- [Status audit selesai](../ROADMAP.md#audit-2026-11-09) dan [prioritas lanjutan L01-L06](../ROADMAP.md#prioritas-lanjutan).
- [Arsip pelaksanaan F01-F29](archive/2026-11-15-roadmap-audit-completed.md): bukti per batch dan batas verifikasi historis.

Laporan audit adalah snapshot temuan, bukan daftar perbaikan yang sudah diterapkan. Status pekerjaan hanya diperbarui di `ROADMAP.md`. Label historis **Selesai** dalam katalog/arsip tidak menggantikan verifikasi atas source saat ini. Batas pengujian dan perbedaan dengan dokumentasi lama dijelaskan dalam laporan audit.

## Arsip

Folder [archive/](archive/) mempertahankan rencana, hasil implementasi, dan keputusan audit terdahulu. Dokumen tersebut bukan tracker aktif dan tidak diubah oleh pencatatan audit baru.

## Inventaris dan penguatan bertahap F28

- [F28.1: kontrak, dependensi, ekspor publik dan gap tes (15 November 2026)](audits/2026-11-15-f28-inventory.md). Snapshot dasar untuk pekerjaan bertahap; status aktif tetap di ROADMAP.
- [F28.2: kontrak data worker, AI dan bab (15 November 2026)](audits/2026-11-15-f28-contracts.md). Sumber tipe bersama, penolakan data invalid, pengaman dan batas validasi.
- [F28.3: TypeScript strict bertahap (15 November 2026)](audits/2026-11-15-f28-strict.md). Perintah lokal/CI, 26 berkas cakupan awal, bukti probe dan pengecualian tersisa.

- [F28.6: review akhir, pengaman CI dan perbandingan baseline](audits/2026-11-15-f28-review.md). Penutupan F28 beserta pengecualian dan gap lanjutan.

## Verifikasi lanjutan

- [L01: hasil CI Windows/Ubuntu untuk commit 7527305](audits/2026-11-15-l01-ci.md). Run, job, artefak dan batas verifikasi.
