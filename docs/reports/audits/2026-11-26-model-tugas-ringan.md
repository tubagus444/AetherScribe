# Verifikasi pemilih model tugas ringan

26 November 2026

## Cakupan

- Pencarian model teks untuk penyedia cloud yang dipilih. Daftar dimuat saat
  dropdown dibuka melalui kredensial form atau konfigurasi server. OpenRouter
  memakai katalog akun. Ollama memakai model utamanya.
- Preferensi lama tetap terbaca. **Default AetherScribe** menghapus override
  untuk penyedia itu saat **Simpan Kredensial** ditekan.

## Hasil

- `npm run lint`, `npm run lint:strict`, dan `npm run lint:maintenance` lulus.
- `npm run test:run` lulus dengan 876 tes di 98 berkas, termasuk tes proxy
  untuk prioritas kredensial form, kunci server, dan penolakan origin asing.
- Dua tes Chromium terarah lulus. Skenario pengaturan memakai daftar Groq
  dan OpenRouter simulasi, mencoba ulang setelah gagal, menyaring model audio,
  menyimpan pilihan per penyedia, memuat ulang aplikasi, dan mengembalikan
  default di viewport 390 px. Tombol Escape menutup daftar dan memulihkan fokus.
- `npm run build` lulus dengan peringatan ukuran bundel, ONNX, dan Browserslist.

Verifikasi memakai kredensial sintetis dan respons penyedia simulasi. Akses
akun dan inferensi penyedia nyata belum diuji untuk perubahan ini.
