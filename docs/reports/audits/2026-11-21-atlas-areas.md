# Verifikasi batas area Atlas, 21 November 2026

Skenario Chromium menggambar batas bersilangan, memeriksa tanda merah,
membatalkan titik lewat keyboard dan tombol, lalu membuat batas tertutup.
Skenario mengganti bentuk batas, menandai sudut tegas di draf dan mode
edit, menghitung pin pada kedua bentuk batas, dan memuat ulang area.

Uji geometri memeriksa sambungan dari titik akhir ke awal, arah sisi di
sudut tegas, persilangan, dan pin di antara batas lurus dan lengkung.
Uji cadangan portabel memastikan bentuk batas dan sudut tegas ikut tersalin.

| Pemeriksaan lokal di Windows, Node 24.15.0 | Hasil |
| --- | --- |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run test:run` | 841 tes lulus |
| `npm run test:e2e -- e2e/atlasUi.spec.ts` | 9 tes Chromium lulus |
| `e2e/critical.spec.ts` untuk F03 dan Atlas F28.5 | 3 tes Chromium lulus |
| `npm run build` | Lulus |

## Regresi Shift+klik

Tes MapCanvas mereproduksi pemanggilan zoom out Leaflet saat dua klik
dengan Shift tiba berurutan. Tes memeriksa bahwa sudut berubah sekali
selama edit dan gestur zoom tersedia kembali setelah keluar dari mode edit.
Skenario Chromium juga memeriksa bahwa Shift+dobel-klik pada draf mengubah
sudut, lalu dobel-klik biasa menyelesaikan draf.

Build dan ketiga pemeriksaan lint lulus. Vitest meluluskan 842 tes dan
Chromium meluluskan 9 tes di `e2e/atlasUi.spec.ts`.

## Isi wilayah dan lokasi penting

Skenario Chromium membuka detail area, menavigasi nama pin dan area yang
tercakup, serta memberi peran Ibu Kota pada satu pin. Saat bentuk batas
diubah, pin keluar dari daftar geografis dan tetap tampil dengan perannya
di Lokasi penting. Skenario memuat ulang lalu melepas peran.

Uji unit mencakup batas area cekung, sisi melengkung, batas berimpit,
penolakan pin di peta lain, edit peran bersamaan, dan penghapusan pin.
Uji impor proyek memeriksa peran lokasi dan ID pin salinan.

Build dan ketiga pemeriksaan lint lulus. Vitest meluluskan 845 tes dan
Chromium meluluskan 10 tes di `e2e/atlasUi.spec.ts` pada pengulangan penuh.
Pada eksekusi awal, satu tes rute terhenti ketika konteks halaman berpindah.
