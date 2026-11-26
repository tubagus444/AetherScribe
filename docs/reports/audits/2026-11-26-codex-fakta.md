# Verifikasi pencarian fakta dan tampilan Codex sampai bab pilihan

- Pencarian label dan nilai **Pangkat** menampilkan Sagara dengan alasan
  **Pangkat · Panglima**. Pencarian kolom kategori kustom menguji label dan
  nilai **Keahlian · Navigasi bintang**. Nilai usang serta catatan dari bab
  terhapus tidak memunculkan Sagara.
- Setelah memilih bab di dialog, nilai dan riwayat dibatasi menurut urutan
  baca, termasuk ketika urutan bab berbeda dari urutan ID. Nilai awal
  berlaku sebelum revisi pertama. Detail tanpa nilai awal menampilkan
  pesan jika belum tercatat, dan kolom kustom yang tidak memiliki riwayat
  tetap tersedia.
- **Codex di Bab Ini** memilih bab aktif dan dapat menampilkan keadaan pada
  bab lain atau kembali ke nilai terkini. Membuka detail lagi memilih bab
  aktif sebagai acuan awal.

## Hasil pemeriksaan

- `npm run lint`, `npm run lint:strict`, dan `npm run lint:maintenance` lulus.
- `npm run test:run` lulus dengan 874 tes.
- Dua belas skenario Chromium lulus pada uji ulang, termasuk empat skenario
  baru pada 1.280 dan 390 piksel serta regresi dialog, Graf Lore, kemunculan
  kartu, dan sorotan Codex di editor.
- Pemeriksaan awal untuk kata **Penjaga** mengharapkan daftar kosong, padahal
  kata tersebut muncul dalam deskripsi entri lain. Uji ulang memeriksa bahwa
  Sagara tidak cocok berdasarkan nilai pangkat lamanya.

Uji memakai data sintetis di Chromium lokal. Perangkat fisik, browser lain,
dan CI belum diperiksa.
