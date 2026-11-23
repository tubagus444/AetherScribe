# Verifikasi detail entri di Graf Lore

23 November 2026.

- Chromium lulus 4 skenario dari `e2e/dataUi.spec.ts`. Pada lebar 1280 dan 390 piksel, klik node membuka deskripsi dan detail entri, tautan penyebutan membuka entri terkait di dialog yang sama, dan Escape mengembalikan pengguna ke kanvas dengan filter aktif. Tombol **Buka di Codex** membuka entri yang sama dengan aksi pengelolaan. Dua skenario Codex juga memeriksa riwayat detail dan gulir dialog.
- Pada percobaan awal, dua skenario graf berhenti karena pencari teks cocok dengan tooltip bawaan dan tooltip graf. Kedua skenario lulus setelah pencari tes dipersempit ke tooltip graf.
- Vitest lulus 852 tes dari 96 berkas. `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance`, dan `npm run build` lulus. Build melaporkan peringatan ukuran bundel, penggunaan `eval` di dependensi `onnxruntime-web`, dan usia data Browserslist.
- Skenario graf menggunakan data sintetis di IndexedDB dan input mouse pada kedua ukuran viewport.

## Tata letak menyesuaikan isi

- Empat skenario Chromium lulus setelah penyesuaian. Pada lebar 1280 dan 390 piksel, entri dengan satu detail menumpuknya di bawah deskripsi. Entri tanpa detail tambahan memakai satu kolom, dengan tinggi mengikuti tab aktif. Tombol **Buka di Codex** menampilkan entri ringkas dengan lebar yang sama di Codex.
- Skenario entri panjang memeriksa dua kolom di desktop, gulir di desktop dan ponsel, posisi baca saat beralih tab, serta judul dan tombol tutup yang tetap terlihat.

## Pencarian node dan fokus hubungan langsung

- Lima skenario Chromium lulus di `e2e/dataUi.spec.ts`. Skenario pencarian memeriksa nama dan alias proyek aktif, hasil tambahan saat sembilan entri memakai alias yang sama, pemusatan kamera, node yang disembunyikan filter, pembukaan detail, dan pemulihan posisi kamera setelah keluar dari fokus. Tampilan pencarian dan pembukaan detail juga diperiksa pada viewport 390 piksel.
- Pada percobaan awal, pengukuran posisi kolom pada ponsel diambil selama animasi dialog sehingga kedua kotak berubah di antara pembacaan. Pengukuran dipindahkan ke satu pembacaan DOM dan skenario lulus pada uji ulang.
- Vitest lulus 852 tes. Ketiga pemeriksaan lint dan build produksi lulus. Pengujian memakai graf sintetis untuk verifikasi interaksi. Performa pada graf besar belum diukur.
