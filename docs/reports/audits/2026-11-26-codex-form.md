# Verifikasi formulir Codex — 26 November 2026

- Mengetik `Rara, Bu Laras` dan `tokoh utama, penjaga arsip` karakter demi
  karakter mempertahankan koma dan spasi di formulir. Setelah disimpan,
  kartu menampilkan dua alias dan dua tag. Uji juga membuka ulang entri,
  memastikan bagian kosong diabaikan, dan mengosongkan tag.
- Pada proyek uji dengan Kalender Dunia, uji menyimpan tanggal lahir saat
  membuat karakter, lalu membuka ulang formulir untuk memeriksa era,
  tahun, bulan, dan hari. Uji mengubah lalu menghapus tanggal dan memuat
  ulang halaman setelah masing-masing penyimpanan.

## Hasil pemeriksaan

- `npm run lint`, `npm run lint:strict`, dan `npm run lint:maintenance` lulus.
- `npm run test:run` lulus dengan 873 tes.
- `npm run test:e2e -- e2e/writerPriorities.spec.ts` lulus dengan sembilan
  skenario di Chromium lokal, termasuk dua skenario Codex baru. Uji memakai
  proyek sintetis di IndexedDB dan balasan simulasi untuk skenario Snippet.
- Pada percobaan awal, uji alias mereproduksi hasil `RaraBuLaras`. Uji
  tanggal sempat tertahan oleh deskripsi wajib yang kosong. Setelah
  data uji diperbaiki dan perubahan formulir diterapkan, keduanya lulus.

Kedua skenario Codex dijalankan pada ukuran desktop. Pengujian ini
mencakup Chromium lokal dan belum mencakup browser lain atau CI.
