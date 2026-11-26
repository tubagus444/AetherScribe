# Verifikasi riwayat Diskusi AI dan Coba Lagi di Nova

## Alur yang diperiksa

- Diskusi AI membuka 50 sesi terbaru. Pencarian judul tanpa membedakan huruf
  besar dan kecil bisa menemukan sesi ke-51. Sesi Nova, Workshop, dan proyek
  lain dikecualikan dari hasil. Tes berjalan pada lebar 1.280 dan 390 piksel.
- Draf pertanyaan dan lampiran Codex kembali saat penulis berganti sesi di
  dalam panel Diskusi AI. Pengiriman mengosongkan draf sesi yang dikirim.
  Draf berada di memori selama panel terbuka.
- Di Nova, dua skenario memakai riwayat sintetis dengan kesalahan lama dan
  balasan terakhir yang gagal atau terputus. Aksi **Coba Lagi** hanya muncul
  pada balasan terakhir. Permintaan membawa pertanyaan dari giliran itu satu
  kali. Balasan pengganti tetap tersedia setelah Nova ditutup dan dibuka lagi.

## Hasil pemeriksaan

- Ketiga perintah lint lulus. Vitest lulus dengan 873 tes dan
  `e2e/assistantChat.spec.ts` lulus dengan sembilan skenario Chromium.
- Pada percobaan Chromium pertama, satu skenario desktop mencapai batas waktu
  setelah halaman termuat ulang. Konsol juga mencatat key React yang sama pada
  daftar pesan dan kolom draf. Dua skenario Nova gagal karena pemeriksaan
  permintaan belum memperhitungkan konteks naskah sebelum pertanyaan.
  Setelah key dan pemeriksaan permintaan diperbaiki, seluruh skenario lulus.

Uji memakai IndexedDB lokal dan balasan AI simulasi. Provider nyata, browser
lain, dan CI belum diperiksa.
