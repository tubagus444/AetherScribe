# L02 - Instalasi awal dan migrasi database

Tanggal: 15 November 2026. Baseline source `5357bd1`.

## Masalah yang ditemukan dan perbaikan

Tes browser yang memulai aplikasi dengan IndexedDB kosong gagal pada baseline:
jumlah proyek bawaan dua, padahal seharusnya satu. React StrictMode menjalankan
inisialisasi bersamaan; ensureDefaultProject sebelumnya membaca count lalu
menulis proyek, bab dan Story Bible di operasi terpisah. Dua pemanggilan dapat
sama-sama melihat database kosong. Kegagalan penulisan berikutnya juga dapat
meninggalkan proyek atau bab tanpa seluruh data awal.

ensureDefaultProject sekarang menjalankan pemeriksaan dan seluruh pembuatan data
awal dalam satu transaksi readwrite pada projects/chapters/bible. Pemanggilan
bersamaan diserialisasi; kegagalan membatalkan seluruh insert. Proyek yang sudah
ada tetap dipilih berdasarkan lastOpened, bukan dibuat ulang. Tidak menghapus
proyek duplikat yang mungkin sudah ada, mengubah versi/migrasi Dexie, dependensi,
atau format backup. Tidak menambahkan mekanisme recovery UI kegagalan storage.

## Pengaman baru

`e2e/installation.spec.ts` terpisah dari beforeEach critical.spec yang mengisi
database. Setiap test memakai context Chromium baru, membuka halaman HTML kosong
tanpa React, lalu memastikan indexedDB.databases() kosong. Request keluar origin
diblokir, mode AI local-only dan env server sintetis mengikuti harness CI.

| Skenario | Bukti |
|---|---|
| Instalasi kosong | React/DB produksi membuat tepat satu proyek, bab dan Bible; editor bisa menyimpan lalu membaca naskah setelah reload, ID proyek/bab tetap |
| Upgrade v17 | Database historis dibuat dan ditutup sebelum React/current db diimpor; naskah/ID tetap, migrasi sesi Scribble v18 berjalan, metadata v34 terisi, edit/reload berhasil |
| Upgrade v33 | Database historis dibuat sebelum React, metadata v34 terisi dengan word count benar; ID/naskah serta kind sesi eksplisit tetap, edit/reload berhasil |

`e2e/installationFixture.ts` hanya mengimpor Dexie dan mendefinisikan schema lama
secara eksplisit; tidak membentuk schema dari db terbaru. Native database version
sebelum upgrade diperiksa (170/330 sesuai pemetaan versi Dexie). Fixture ini tidak
masuk build production.

`projectBootstrap.test.ts` memakai fake-indexeddb untuk delapan pemanggilan
bersamaan dan injeksi kegagalan Bible sesudah penulisan proyek/bab; memastikan
rollback dan retry berhasil. Tes browser kosong gagal sebelum perbaikan dengan
dua proyek lalu lulus dengan transaksi. Suite lama yang telah diisi data tetap
dijalankan untuk mencegah regresi jalur proyek yang sudah ada.

## Hasil dan batas

Typecheck umum/strict/maintenance, 90 berkas/787 tes, build dan 21 tes Chromium
lulus lokal. Tidak mengukur ulang coverage atau mengklaim runner GitHub sudah
menjalankan perubahan L02. CI npm run test:e2e otomatis menemukan spec baru;
tidak perlu mengubah workflow.

v17 dan v33 merupakan sampel jalur migrasi, bukan bukti setiap versi/record legacy
pengguna didukung tanpa masalah. Belum menguji upgrade ketika tab lain menahan
koneksi, database rusak, quota/izin browser melalui UI, atau Firefox/Safari.
Rollback bootstrap diuji lewat injeksi storage failure; bukan simulasi semua
kegagalan migrasi. Bukti aplikasi berjalan dari Vite development dengan StrictMode;
production build diperiksa terpisah. Gunakan profil dan data sintetis untuk
pengujian berikutnya. L02 selesai dalam lingkup ini; L03-L06 tetap terbuka.
