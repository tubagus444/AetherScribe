# Verifikasi Snippet, Codex, dan pencarian global

Diuji di Windows pada 25 November 2026, dengan proyek sintetis dan
IndexedDB terisolasi. Skenario browser memakai Chromium headless.

## Perilaku yang diperiksa

| Area | Bukti |
| --- | --- |
| Snippet | Transaksi editor menggeser sasaran ketika paragraf sebelumnya disunting dan membatalkan sasaran ketika kutipan berubah. Kutipan berulang tetap terpisah. Hanya balasan tuntas berisi teks dapat diterapkan. Balasan karena batas panjang tetap terbaca dengan aksi terkunci. Pembatalan, percobaan ulang, pilihan ulang, snapshot sebelum penggantian, dan penyisipan diuji. |
| Codex | Nilai *Asal · Desa Awan* pada *Tombak* bertahan setelah kolom templat dihapus dan deskripsi disimpan. Menambahkan kembali kolom memuat nilai lama. Setelah pindah kategori dengan kunci kolom yang sama, nilai aktif dan lama tersimpan terpisah. Penghapusan nilai lama berlaku saat disimpan dan dapat dibatalkan bersama formulir. |
| Pencarian global | Klik pada dua entri yang namanya sama membuka detail sesuai ID. Satu cuplikan dari setiap bab menunjukkan frasa yang dipilih, termasuk di dalam format inline dan dengan entitas HTML. Chromium pada lebar 1280 dan 390 piksel menggulir ke cuplikan yang disorot. Judul saja membuka bab. Jika sasaran hilang, bab tetap terbuka dengan pemberitahuan. Kegagalan simpan mempertahankan pencarian dan editor aktif. |

## Pemeriksaan lokal

- `npm run lint`, `npm run lint:strict`, dan `npm run lint:maintenance` lulus.
- `npm run test:run` lulus 868 tes dalam 98 berkas.
- Playwright lulus 11 skenario terarah dari `writerPriorities.spec.ts`,
  `critical.spec.ts`, dan `dataUi.spec.ts`. Skenario Snippet memeriksa
  snapshot dan naskah hasil penggantian di IndexedDB native sebelum memuat
  ulang editor dan mencoba balasan yang mencapai batas panjang.
- `npm run build` lulus dan menghasilkan aset Web Worker pencarian.
- Putaran awal Chromium menemukan pemuatan ulang dari optimasi dependensi
  Vite saat parser pertama kali dipakai. Parser kini disiapkan saat startup
  pengembangan. Putaran berikutnya menemukan pratinjau dapat tersembunyi saat
  posisi seleksi hilang dari DOM. Pratinjau beralih ke posisi semat sementara
  dan kasus tersebut dipicu dalam tes Chromium.
- AI memakai simulasi SSE. Skenario memakai proyek sintetis dan viewport
  desktop serta ponsel di Chromium. Verifikasi lintas platform melalui CI dan
  uji memakai proyek nyata tetap tercantum sebagai pilihan di roadmap.

## Tindak lanjut batas output Snippet

Snippet meminta 4.096 token untuk kutipan pendek dan hingga 8.192 untuk
kutipan panjang. Tes memeriksa batas berdasarkan panjang seleksi dan percobaan
ulang dengan batas lebih rendah yang dilaporkan model. Chromium memeriksa
bahwa permintaan kutipan pendek mengirim 4.096 token dan aksi tetap terkunci
jika balasan simulasi terpotong. Putaran ini lulus 872 tes Vitest, satu skenario
Snippet di Chromium, dan tiga pemeriksaan lint.

## Sorotan sisipan Snippet

Sorotan **Sisipkan di Bawah** memakai dekorasi sementara di editor. Tes
Vitest memeriksa teks dua paragraf, seleksi seluruh bab, edit di luar dan
di dalam sisipan, serta HTML tersimpan tanpa dekorasi. Dua skenario
Chromium lulus. Skenario lebar 390 piksel memeriksa sorotan di area yang
terlihat, pesan berhasil, dan isi sisipan yang tetap tersedia setelah kembali
ke bab tanpa sorotan. Balasan AI memakai simulasi SSE.

## Status proses Snippet

Pratinjau menampilkan status menunggu, menyusun hasil, mencoba ulang, dan
siap diterapkan. Editor tetap dapat digunakan saat balasan berlangsung.
Vitest memeriksa bahwa pesan percobaan ulang dibersihkan saat potongan
baru tiba. Dua skenario Chromium menguji status dari permintaan hingga
hasil akhir dengan simulasi SSE, termasuk tampilan menunggu di viewport
390 piksel. Seluruh 873 tes Vitest lulus.

## Verifikasi sebelum commit

Build produksi, tiga pemeriksaan lint, 873 tes Vitest, dan 12 skenario
Chromium terarah lulus di Windows. Skenario Chromium mencakup autosave,
kegagalan simpan, menu seleksi, penyimpanan detail Codex, navigasi
pencarian, dan alur Snippet dengan balasan simulasi.
