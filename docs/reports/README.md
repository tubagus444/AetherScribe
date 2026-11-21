# Laporan audit, verifikasi, dan benchmark

Setiap laporan merekam kondisi pada tanggal atau commit yang disebutkan.
Gunakan [referensi aplikasi](../README.md) untuk perilaku saat ini dan
[roadmap](../../ROADMAP.md) untuk memilih pekerjaan berikutnya.

## Audit dan verifikasi

| Periode | Laporan |
| --- | --- |
| Editor 21 November 2026 | [Verifikasi Catatan Novel dan Codex di Bab Ini](audits/2026-11-21-editor-notes-codex.md) |
| Rute Atlas 21 November 2026 | [Verifikasi titik, kurva, dan kalkulator perjalanan](audits/2026-11-21-atlas-routes.md) |
| Area Atlas 21 November 2026 | [Verifikasi pratinjau batas, sudut tegas, dan analitik pin](audits/2026-11-21-atlas-areas.md) |
| Detail Atlas 21 November 2026 | [Verifikasi panel detail, seleksi, dan kamera](audits/2026-11-21-atlas-sidebar.md) |
| Audit 9 November 2026 | [Analisis aplikasi](audits/2026-11-09-application-audit.md) dan [register F01–F29](audits/2026-11-09-findings.md) |
| Penguatan tipe dan modul F28 | [Inventaris](audits/2026-11-15-f28-inventory.md), [kontrak](audits/2026-11-15-f28-contracts.md), [strict](audits/2026-11-15-f28-strict.md), dan [review akhir](audits/2026-11-15-f28-review.md) |
| Verifikasi L01–L06 | [CI Windows/Ubuntu](audits/2026-11-15-l01-ci.md), [instalasi dan migrasi](audits/2026-11-15-l02-installation.md), [alur data UI](audits/2026-11-15-l03-data-ui.md), [Atlas](audits/2026-11-15-l04-atlas-ui.md), [strict](audits/2026-11-15-l05-strict.md), dan [integrasi worker backup](audits/2026-11-15-l06-backup-integration.md) |
| Penguatan database 18–19 November 2026 | [Hasil lokal DB01–DB08](audits/2026-11-19-db01-db08.md) |
| Tata letak Codex 20 November 2026 | [Verifikasi gulir dan kartu Codex](audits/2026-11-20-codex-layout.md) |
| Detail Codex 20 November 2026 | [Verifikasi riwayat, konteks AI, dan cadangan](audits/2026-11-20-codex-details.md) |
| Sampul Codex 20 November 2026 | [Verifikasi unggahan, pemulihan, dan kapasitas](audits/2026-11-20-codex-cover.md) |

## Benchmark

Laporan di bawah memuat metode reproduksi dan batas pengukuran. File JSON
yang ditautkan dari laporan menyimpan sampel mentah untuk perbandingan.
Perintah reproduksi menulis hasil baru ke `test-results/`.

| Fokus | Laporan |
| --- | --- |
| Pemuatan awal dan PWA | [F22](benchmarks/f22.md) |
| Metadata bab dan ranking naskah besar | [F23](benchmarks/f23.md) |
| Kapasitas dan validasi cadangan | [DB08](benchmarks/db08.md) |
| Eksperimen sebelum integrasi worker backup L06 | [Baseline dan profil CPU](benchmarks/l06-backup.md), [A/B worker](benchmarks/l06-worker.md), [kesiapan](benchmarks/l06-readiness.md), [beban editor](benchmarks/l06-editor-load.md), dan [kegagalan penyimpanan](benchmarks/l06-storage-failures.md) |
