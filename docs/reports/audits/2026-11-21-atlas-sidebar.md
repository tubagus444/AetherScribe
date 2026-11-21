# Verifikasi panel detail Atlas, 21 November 2026

Skenario Chromium memilih pin yang terlihat, memeriksa posisi kamera,
menjalankan Pusatkan di peta, dan menggulir pengaturan sampai aksi hapus.
Kepala detail diperiksa saat digulir. Skenario melepas sorotan lewat
Tutup Detail, klik latar peta, dan Esc, termasuk dua tahap Esc dari mode
edit. Tes Atlas yang sudah ada menjalankan ulang tautan sub-peta,
tempat singgah, isi wilayah, dan penghapusan lewat pengaturan.

Skenario seleksi juga diulang pada lebar 600 piksel. Peta dan panel
detail tetap terlihat berdampingan.

| Pemeriksaan lokal | Hasil |
| --- | --- |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run test:run` | 845 tes lulus |
| `npm run test:e2e -- e2e/atlasUi.spec.ts` | 11 tes lulus |
| `e2e/critical.spec.ts` untuk Atlas F28.5 | 2 tes lulus |
| Pengulangan skenario seleksi dengan layar sempit | Lulus |
| `npm run build` | Lulus |
