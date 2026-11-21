# Verifikasi Catatan Novel dan Codex di Bab Ini

- Tiga lint repositori lulus. Vitest lulus dengan 855 tes dari 96 berkas.
- Chromium menjalankan suite kritis dan instalasi. Sebanyak 30 dari 31 tes
  lulus pada putaran itu. Tes detail Codex gagal karena locator cocok dengan
  judul kartu dan dialog. Kedua tes fitur lulus pada putaran terarah terakhir,
  termasuk verifikasi dialog detail dan penutupan sidebar catatan pada lebar
  viewport 390 px. Pengaturan viewport pada percobaan sebelumnya menyisakan
  drawer kiri di depan kontrol editor.
- Tes data mencakup backup penuh, pemulihan v11, remap ID saat impor novel,
  dan pelepasan tautan setelah bab dihapus. Tes instalasi Chromium mencakup
  migrasi v17, v33, dan v34 ke v39 serta retry setelah migrasi dibatalkan.
- Build produksi berhasil dengan peringatan ukuran chunk, data Browserslist,
  dan penggunaan `eval` oleh dependensi ONNX. Chromium menggunakan
  IndexedDB native dan data sintetis. Browser lain, perangkat ponsel fisik,
  dan layanan eksternal belum diuji.
