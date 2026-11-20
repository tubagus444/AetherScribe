# Verifikasi tata letak Codex — 20 November 2026

Playwright Chromium membuka halaman Codex melalui aplikasi dengan 25 entri
tersimpan. Pada viewport 1536, 1280, dan 390 piksel dengan tinggi 560 piksel,
daftar menampilkan tiga, dua, dan satu kolom. Judul dan aksi ikut bergulir.
Kartu terakhir beserta tagnya terlihat penuh saat indikator pengindeksan
aktif. Pengujian juga membuka formulir edit dari kartu terakhir, menggulir
ke tombol simpan, membatalkan edit, dan menyaring daftar lewat pencarian.

Pada lebar 1280 dan 390 piksel, label bawaan kategori dan tag tampil utuh
dalam satu baris. Pada lebar 390 piksel, nama kategori panjang dan tag tanpa
spasi tampil utuh dalam beberapa baris. Pemilihan tag lewat papan ketik
tetap memperbarui filter.

Dialog Kelola Kategori diuji dengan 32 kategori kustom pada viewport
1280 × 500 dan 390 × 560 piksel. Di desktop, tombol tutup dapat diklik,
semua kategori bawaan terlihat, dan gulir daftar kustom tidak menggeser
formulir. Di ponsel, isi dialog dapat digulir sampai kategori terakhir
dengan tombol tutup tetap terlihat. Pembatalan konfirmasi hapus dan
pengembalian fokus setelah menutup dialog juga diperiksa.

| Pemeriksaan lokal dengan Node 24.15.0 | Hasil |
| --- | --- |
| `npm run test:e2e -- e2e/dataUi.spec.ts -g Codex` | 5 lulus, termasuk label filter, dialog kategori, dan alur penghapusan entri dan relasi |
| `npm run test:run` | 824 lulus dalam 93 berkas |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run build` | Lulus |
