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

Dialog detail diuji dengan 40 paragraf, 24 alias, dan 24 tag pada viewport
1280 × 500 dan 390 × 500 piksel. Kartu menampilkan ringkasan alias dan tag.
Dialog memberi jarak dari tepi layar serta mempertahankan judul dan tombol
tutup saat isi digulir sampai bagian Kemunculan.

Dialog lebar menempatkan deskripsi dan detail tambahan berdampingan pada
viewport 1280 × 500 piksel. Pada lebar 390 piksel kedua bagian ditumpuk.
Uji roda tetikus pada field 35 baris memastikan nilai field bergulir
tanpa menggeser deskripsi atau panel yang memuatnya.

Dialog memakai hampir seluruh lebar viewport desktop 1280 piksel. Area
teks deskripsi berhenti di batas padding bawah kartu. Deskripsi, nilai
field, dan panel diuji dengan bilah gulir tersembunyi. Roda tetikus tetap
menggulir field, dan tombol panah menggulir deskripsi saat mendapat fokus.

Tab Keterkaitan memisahkan Hubungan, Kemunculan, dan Disebut oleh dari
deskripsi. Uji Chromium memeriksa pergantian tab melalui papan ketik,
pemeliharaan posisi baca, penambahan dan penghapusan hubungan, pencarian
kemunculan, serta pembukaan entri yang menyebut entri asal.

| Pemeriksaan lokal dengan Node 24.15.0 | Hasil |
| --- | --- |
| `npm run test:e2e -- e2e/dataUi.spec.ts -g Codex` | 7 lulus, termasuk gulir dialog detail, label filter, dialog kategori, dan alur penghapusan |
| `npm run test:run` | 824 lulus dalam 93 berkas |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run build` | Lulus |

## Gulir tab Kelengkapan Dunia

Pada Chromium dengan viewport 1280 × 500 piksel, uji regresi merekam selisih
100 piksel antara pergeseran judul dan tombol sebelum perbaikan. Setelah
perbaikan, deretan tombol bergulir sejajar dengan judul. Pada 390 × 560
piksel, perpindahan ke Saran Entitas (Yatim) dan kembali ke Kelengkapan
Dunia menampilkan judul panel di area pandang.

Kedua skenario Playwright terpilih di `e2e/critical.spec.ts` lulus, termasuk
pemulihan rute lama `orphans`. Seluruh 15 tes `worldCompleteness.test.ts`
dan ketiga pemeriksaan lint lulus dengan Node 24.15.0.
