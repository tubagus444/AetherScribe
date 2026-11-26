# Verifikasi kemunculan Codex dan tombol Opsi Snippet

- Pada lebar 1.280 dan 390 piksel, **Cek Kemunculan di Chapter** membuka
  **Keterkaitan** dan langsung membawa fokus ke bagian **Kemunculan**.
  Naskah uji memuat alias entri. Hasil langsung muncul dan membuka bab yang
  tepat saat dipilih. Menutup dialog mengembalikan fokus ke pintasan.
  Membuka kartu lewat judul tetap memulai dari **Deskripsi & Detail**.
  Skenario desktop juga memeriksa hasil kosong.
- **Opsi** terlihat pada kartu Snippet sebelum penunjuk diarahkan ke kartu.
  Menu bisa dibuka, perubahan label disimpan, dan kartu yang dipilih bisa
  dihapus. Chromium menguji sentuhan pada 390 piksel dan navigasi keyboard
  pada desktop, termasuk menutup menu dengan Escape.

## Hasil pemeriksaan

- `npm run lint`, `npm run lint:strict`, dan `npm run lint:maintenance` lulus.
- `npm run test:run` lulus dengan 873 tes.
- `writerPriorities.spec.ts` lulus dengan 13 skenario Chromium, termasuk
  empat skenario baru dan regresi pencarian global serta rewrite Snippet.
- Dua skenario tambahan di `dataUi.spec.ts` lulus dan memeriksa dialog Codex
  saat dibuka dari Graf Lore pada desktop dan ponsel.

Uji memakai data sintetis di Chromium lokal. Skenario rewrite memakai
balasan AI simulasi. Perangkat fisik, browser lain, dan CI belum diperiksa.
