# Verifikasi posisi edit dan filter catatan revisi

- **Lanjutkan menulis** membuka bab tempat isi naskah terakhir berhasil
  disimpan di perangkat. Skenario mengedit paragraf di tengah bab, menggeser
  kursor ke awal, membuka bab referensi dengan waktu modifikasi lebih baru,
  lalu membuka Dashboard dan memuat ulang halaman. Tombol memulihkan bab,
  posisi kursor, dan posisi gulir.
- Pemulihan snapshot dengan panjang teks sama tetap membatalkan posisi edit
  lama. Tes layanan juga mencakup dua penulisan isi saat jam perangkat belum
  maju.
- Di **Catatan Teks**, filter mempertahankan urutan naskah dan aksi memilih
  kutipan. Menyelesaikan catatan terakhir menampilkan pesan selesai, dan
  **Semua** membuka kembali daftar penuh.

## Hasil pemeriksaan

- `npm run lint`, `npm run lint:strict`, dan `npm run lint:maintenance` lulus.
- `npm run test:run` lulus dengan 874 tes.
- Seluruh 23 skenario Chromium terpilih lulus pada uji ulang. Paket ini
  mencakup empat skenario baru pada 1.280 dan 390 piksel, serta regresi
  simpan, Undo/Redo, snapshot, pencarian, Codex, dan Snippet.

Percobaan pertama pada 390 piksel terhenti ketika tes mencoba menutup
sidebar melalui tombol yang tertutup sidebar. Tes menggunakan area di luar
sidebar untuk menutupnya pada percobaan berikutnya. Pada rangkaian regresi,
satu skenario Codex juga terhenti karena ketukan terjadi sebelum lapisan
sidebar siap. Tes ponsel sekarang menunggu lapisan sidebar sebelum menutupnya.

Uji memakai data sintetis di Chromium lokal. Perangkat fisik, browser lain,
dan CI belum diperiksa.
