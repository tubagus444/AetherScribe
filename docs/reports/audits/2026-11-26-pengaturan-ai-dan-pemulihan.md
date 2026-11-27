# Verifikasi Konfigurasi AI, Data & Cadangan, dan pemulihan

26 November 2026

- Draf penyedia, model, dan kredensial bertahan saat pengguna berpindah tab
  selama panel Pengaturan terbuka. Kontrol privasi langsung berlaku.
  **Simpan Pengaturan AI** muncul saat draf berbeda dari nilai tersimpan.
- Kartu **Penyedia aktif** menampilkan koneksi, model utama, dan model tugas
  ringan. Pengaturan penyedia lain, penyimpanan key, dan optimasi lanjutan
  dapat dibuka terpisah. Uji koneksi memakai model utama dan, untuk Ollama,
  alamat dari form tanpa menulisnya ke penyimpanan.
- Aksi **Pulihkan** pada daftar cadangan lokal dan Drive menggunakan tampilan
  yang selalu terlihat dengan tinggi minimal 44 px.

## Pemeriksaan

- 876 tes Vitest di 98 berkas lulus.
- Empat skenario Chromium lulus. Skenario mencakup penyimpanan kredensial,
  katalog model tugas ringan, draf lintas tab, mode lokal, payload uji
  koneksi, serta membuka dan membatalkan pemulihan dengan sentuhan di lebar
  390 px.
- Tiga pemeriksaan lint dan build produksi lulus.

Uji Chromium memakai data sintetis dan respons penyedia simulasi. Sesi Drive
dan inferensi pada penyedia nyata belum diuji.

## Data & Cadangan dan diagnostik Ollama

- Ringkasan titik pulih lokal dan unduhan cadangan mandiri ditampilkan di
  awal tab. Riwayat titik pulih bisa dibuka dari ringkasan. Pemeriksaan
  relasi, perlindungan penyimpanan, dan cache berada di Pemeliharaan data.
- Impor dan pemulihan menampilkan status saat membaca dan memvalidasi file.
  Konfirmasi pemulihan menampilkan nama file, tanggal arsip, dan jumlah novel.
  Verifikasi checksum terhadap input asli tetap dilakukan saat konfirmasi.
- Uji Ollama memeriksa daftar model sebelum menguji model utama. Alamat yang
  ditolak, layanan yang tidak dapat dijangkau, dan daftar kosong mendapat
  pesan tersendiri. Uji memakai alamat pada form.

Tiga pemeriksaan lint, 878 tes Vitest, dan build produksi lulus. Skenario
Chromium memakai IndexedDB asli pada profil sintetis. HTTP Ollama dan Drive
memakai respons simulasi.

Pada putaran Chromium yang lebih luas, 34 dari 38 skenario langsung lulus.
Empat lainnya lulus pada putaran ulang. Asersi pemulihan memakai isi ruang
kerja segera sebelum pembacaan arsip, dan tes pemeriksaan relasi membuka
Pemeliharaan data terlebih dahulu. Skenario Workshop dan Graf Lore desktop
lulus saat diulang dengan interaksi yang sama.
Tiga skenario Chromium terakhir lulus setelah uji dan simpan alamat Ollama
disamakan untuk mengabaikan spasi di tepi isian.

## Tata letak Konfigurasi AI

Penyedia, API key, dan kedua model memakai baris terpisah. Pada desktop,
label dan isian sejajar. Pada tampilan sempit, label berada di atas isian
dan kedua pemilih model memiliki lebar yang sama serta tinggi minimal 44 px.
Penyedia cadangan bisa dibuka saat diperlukan dan menampilkan jumlah izin
atau status mode lokal saat tertutup.

Lima skenario Chromium lulus, termasuk tata letak di lebar 390 px, perpindahan
fokus dari dropdown ke API key, dan perubahan izin dari daftar cadangan.
Verifikasi visual memakai build produksi pada lebar 1280 dan 390 px. Tiga
pemeriksaan lint, 878 tes Vitest, dan build produksi lulus.

Pada 27 November, kartu Penyedia utama mendapat penjelasan yang ditautkan
ke pemilih penyedia agar terbaca oleh pembaca layar. Empat skenario Chromium,
enam tes kredensial, dan tiga pemeriksaan lint lulus.
