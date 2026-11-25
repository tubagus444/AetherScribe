# Verifikasi riwayat Undo dan Redo Editor

Pada kode sebelum perbaikan (`e641690`), tes Chromium menulis dan menyimpan
dua paragraf, menjalankan Undo dan Redo, lalu beralih ke Catatan dan kembali.
Undo berikutnya menghasilkan satu paragraf kosong. TipTap kehilangan riwayat
saat dilepas, lalu mencatat pemuatan dokumen sebagai perubahan.

Pada kode perbaikan, Undo setelah kembali menghapus paragraf kedua dan
mempertahankan paragraf pertama. Beralih panel saat paragraf kedua masih
di-Undo mempertahankan Redo, termasuk jika autosave belum berjalan. Tes
juga memastikan kedua paragraf tersimpan setelah Redo dan muat ulang.
Riwayat dimulai ulang setelah muat ulang halaman dan ketika isi bab diganti
di IndexedDB selama panel lain terbuka.

## Pemeriksaan

| Perintah | Hasil |
| --- | --- |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run test:run` | 873 tes lulus dalam 98 file |
| `npx playwright test e2e/critical.spec.ts e2e/writerPriorities.spec.ts` | 36 dari 38 tes lulus pada percobaan pertama. Kedua tes regresi riwayat lulus pada percobaan itu dan saat diuji ulang. |
| Uji ulang menu seleksi desktop dan sorotan Codex di ponsel | Keduanya lulus. Pada percobaan pertama, konteks halaman menu seleksi terputus dan indikator pemuatan model menutupi tombol Codex di ponsel. |
| `npm run test:production` | Build dan smoke test produksi lulus |

Tes Chromium menggunakan proyek sintetis di IndexedDB dan memblokir
layanan eksternal. Pengujian lintas browser dan dengan naskah pengguna
berada di luar cakupan verifikasi ini.
