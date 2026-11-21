# Verifikasi rute Atlas, 21 November 2026

Uji Chromium memakai peta raster dan IndexedDB lokal. Skenario rute membuat
tiga titik, mengganti pratinjau ke Melengkung, membatalkan titik lewat
Backspace dan tombol, lalu menyimpan lewat dobel-klik. Setelah tersimpan,
skenario memeriksa nomor titik, perubahan jarak dan waktu melalui pilihan
bentuk, dan penyembunyian titik antara dengan kurva, jarak, dan waktu yang
sama. Skenario juga memeriksa akses ke titik tersembunyi dalam mode edit,
penambahan dan penghapusan titik, serta persistensi bentuk, visibilitas,
dan profil kecepatan setelah muat ulang.

Uji geometri memeriksa rute lama, rute dua titik, urutan titik pada kurva,
koordinat batas, dan titik berimpit. Uji cadangan portabel mencakup rute
melengkung beserta titik asal dan metadata perjalanan.

| Pemeriksaan lokal di Windows, Node 24.15.0 | Hasil |
| --- | --- |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run test:run` | 836 tes lulus |
| `npm run test:e2e -- e2e/atlasUi.spec.ts` | 7 tes Chromium lulus |
| `npm run build` | Lulus |

## Tempat singgah dan tautan pin

Skenario Chromium membuat rute melengkung dengan 10 titik dan menampilkan
tiga lokasi, termasuk satu pin yang ditautkan. Skenario memilih titik
individual, memberi nama dua tempat singgah, menautkan Codex dan pin,
menyisipkan lalu menghapus titik, memindahkan pin, memuat ulang aplikasi,
membuka hubungan dari kedua detail, dan menghapus pin.

Uji layanan menjalankan penyisipan bersama perubahan detail titik,
memeriksa penolakan pin dari peta lain, dan menguji pelepasan referensi
saat pin atau Codex dihapus. Uji impor proyek memeriksa bahwa ID Codex
dan pin dialihkan ke salinan dan atribut titik ikut disalin.

| Pemeriksaan lokal di Windows, Node 24.15.0 | Hasil |
| --- | --- |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run test:run` | 838 tes lulus |
| `npm run test:e2e -- e2e/atlasUi.spec.ts` | 8 tes Chromium lulus |
| `e2e/critical.spec.ts` untuk DB05, F10, F03, dan F28.5 Atlas | 4 tes Chromium lulus |
| `npm run build` | Lulus |
