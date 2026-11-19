# L06 - Editor aktif dan sampled peak main + worker

> Riwayat sebelum integrasi worker pada commit 4816258. Angka dan status di bawah
> berlaku pada tahap pengujian ini. Kondisi aplikasi sekarang ada di
> [laporan integrasi L06](../audits/2026-11-15-l06-backup-integration.md).


15 November 2026. [Data mentah](l06-editor-load.json), source dasar 01bf781 dengan
readiness/tes baru dalam working tree. Tidak mengubah jalur backup aplikasi.

`e2e/backupLoad.spec.ts` memakai aplikasi React/TipTap asli, 500 bab x 5000 kata
sintetis dan empat PNG. Bab pertama diganti teks pendek untuk mengetik; sekitar
2.495 juta kata tersisa di bab lain. Enam run berurutan worker/main/main/worker/
worker/main, masing-masing 20 karakter. Tidak ada delay buatan sebelum kompresi.
Snapshot dibuat melalui service asli sebelum timed preparation.

Worker eksperimen dibuat untuk setiap run, main baseline memakai algoritme
prepareAuto yang sama. Worker main-mode dibiarkan idle untuk inspeksi: perbandingan
heap main baseline sudah mencakup biaya worker idle, bukan aplikasi tanpa worker
sama sekali. Constructor/startup, snapshot dan commit backup DB tidak termasuk
elapsed persiapan. CPU profiler tidak aktif, tetapi CDP heap sampling menambah
overhead. Ini benchmark diagnostik, bukan SLA latensi produk.

## Hasil dari run terarah pertama

| Metrik | Main | Worker |
|---|---:|---:|
| Waktu persiapan tiga run | 1613 / 1623 / 1485 ms | 1601 / 1631 / 1596 ms |
| Median perintah ketik | 9.1 ms | 10.8 ms |
| P95 perintah ketik | 298.0 ms | 26.1 ms |
| Perintah ketik terburuk | 407.4 ms | 48.0 ms |
| Perintah mulai saat pekerjaan belum selesai, per run | 3 / 5 / 3 | 20 / 20 / 20 |
| Sampled peak heap V8 main + worker | 88.5 MiB | 112.3 MiB |
| Sampled peak backing storage gabungan, terpisah | 75.1 MiB | 71.4 MiB |

Sampel key time mencakup seluruh 60 perintah tiap mode, termasuk yang terjadi
sesudah persiapan selesai. Waktu diukur dari panggilan Playwright keyboard sampai
selesai: mencakup IPC/otomatisasi, bukan waktu handler input murni. Pemeriksaan
status sebelum tiap karakter juga memakai IPC yang tidak dihitung sebagai key
time; angka dapat melewatkan sebagian waktu tunggu. Karena itu hasil menunjukkan
perbedaan respons harness, bukan pengukuran presisi latensi pengguna di semua keadaan.
Tidak menetapkan batas timing keras pada CI. Semua 120 karakter ditemukan dalam
database dan tetap terlihat setelah reload.

## Memori

Runtime.getHeapUsage main dan worker diminta berpasangan setiap sekitar 50 ms
selama persiapan dan pengetikan. Total 50 sampel main-mode dan 83 worker-mode pada
run terarah. Peak dihitung dari jumlah usedSize pasangan sampel, bukan penjumlahan
dua maksimum yang terjadi pada waktu berbeda. Respons inspector dapat tiba pada
waktu sedikit berbeda dan sampling dapat melewatkan lonjakan singkat.

Ini memperluas tes sebelumnya yang hanya membaca worker sebelum request. Namun
**bukan peak RSS/RAM proses browser**: native image/IndexedDB/compression buffers,
memori browser lain dan seluruh allocator tidak diukur. Backing storage dilaporkan
terpisah dan tidak dijumlahkan sembarang ke usedSize sebagai total RAM. Forced GC
hanya dilakukan pada main sebelum run; worker baru diterminasi setelah sampling.

Kenaikan sampled JS heap sekitar 23.8 MiB adalah biaya nyata yang perlu dipertimbangkan.
Structured clone payload dan persiapan di worker dapat meningkatkan working set.
Tidak boleh menyatakan worker selalu lebih hemat memori karena respons UI membaik.

## Keputusan

Pada workload ini worker mempertahankan seluruh ketikan dan mengurangi long-tail
perintah ketik, dengan elapsed persiapan hampir sama dan sampled heap lebih besar.
Eksperimen mendukung integrasi yang dibatasi, bukan worker tanpa batas untuk semua
ukuran: satu job persiapan aktif, evaluasi ambang ukuran, cleanup/fallback dan
pengujian perangkat dengan memori rendah perlu menjadi bagian desain produksi.

Test baru hanya menuntut operasi berhasil, ketikan benar-benar dimulai selama
request belum selesai, serta seluruh karakter tersimpan/reload. Angka performa
tidak dijadikan assertion universal. Hasil suite penuh berikutnya dapat berbeda
dari snapshot benchmark terarah ini; artefak backup-load.json disimpan per run.
Belum menguji ketikan manusia, perangkat lambat, quota rendah, semua browser,
peak RSS atau alur penyimpanan/retensi worker produksi. Tidak membutuhkan proyek
atau profil pengguna untuk menjalankan tes ini.

Typecheck umum/strict/maintenance, 90 berkas/787 tes dan 43 tes Chromium lulus
lokal. Build/coverage tidak diulang karena hanya tes/dokumentasi yang berubah.
Readiness failure/fallback/snapshot sebelumnya tetap dijalankan. Worker belum
diaktifkan dalam aplikasi; keputusan integrasi tetap perlu mempertimbangkan
tradeoff memori ini.
