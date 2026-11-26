# Verifikasi lampiran Diskusi AI — 26 November 2026

- Proyek uji memiliki entri **Ratu** dan **Ratu Senja**. Memilih **Ratu Senja**
  lewat **Lampirkan Lore** menampilkan nama lengkap di draf dan riwayat.
  Isi pesan yang dikirim memuat deskripsi **Ratu Senja**. Uji juga melepas
  satu lampiran sebelum mengirim.
- Dua skenario memeriksa ringkasan dan cuplikan bab dengan Smart Auto mati.
  Setelah pengiriman pertama, uji mengubah isi Codex, mengganti bab sesi,
  memuat ulang halaman, dan menyiapkan lampiran lain di draf. **Buat Ulang**
  mengirim ulang isi pesan pengguna yang sama persis dan mempertahankan draf.
- Uji backup proyek mencocokkan pesan dan salinan lampiran sebelum ekspor dan
  setelah impor. Salinan lama tetap mengikuti pesan asal saat sumber berubah.
  Pesan yang dikirim sebelum perbaikan tetap dapat dibuka.

## Hasil pemeriksaan

- `npm run lint`, `npm run lint:strict`, dan `npm run lint:maintenance` lulus.
- `npm run test:run` lulus dengan 873 tes.
- `npm run test:e2e -- e2e/assistantChat.spec.ts` lulus dengan lima skenario
  di Chromium lokal. Dua skenario lampiran berjalan di desktop. Dua skenario
  Diskusi yang sudah ada mencakup lebar 1.280 dan 390 piksel. Skenario lain
  memeriksa penyimpanan sesi Nova.
- Percobaan pertama gagal pada pemeriksaan tipe dan dua skenario lampiran
  karena entri Codex sintetis belum memuat daftar alias dan tag yang
  diwajibkan worker. Kedua pemeriksaan lulus setelah data uji dilengkapi.

Uji memakai IndexedDB asli dan balasan AI simulasi. Pengujian ini mencakup
Chromium lokal. Provider nyata, browser lain, dan CI belum diperiksa.
