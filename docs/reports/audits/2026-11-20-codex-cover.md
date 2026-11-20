# Verifikasi gambar sampul Codex — 20 November 2026

- Chromium mengunggah PNG 1500 piksel melalui formulir. Hasil sampul dan
  thumbnail berukuran 1200 dan 192 piksel, dengan ukuran byte di bawah batas.
  Uji membuka gambar besar dan menutupnya dengan Escape, mengganti gambar,
  mengunduh arsip penuh dan per novel sebagai gzip, lalu melepas sampul
  dari entri.
- Uji integrasi menginjeksi kegagalan kuota ketika mengganti pasangan gambar.
  Transaksi mempertahankan pasangan gambar lama dan teks entri. Impor novel
  memetakan sampul ke ID entri salinan. Penghapusan entri dan proyek
  membersihkan gambar. Pemulihan cadangan otomatis yang kehilangan aset
  berhenti sebelum mengubah workspace.
- Uji kapasitas Chromium mengulang satu sampel gambar derau ke 500 entri.
  Sampul berukuran 82.898 byte dan thumbnail 10.990 byte. Workspace uji
  menghasilkan arsip lengkap gzip 46.941.979 byte (44,8 MiB) dan memulihkan
  semua 1.000 varian. Ukuran aktual bergantung pada gambar, naskah, dan aset
  lain yang turut dicadangkan.

| Pemeriksaan lokal dengan Node 24.15.0 | Hasil |
| --- | --- |
| `npm run test:run` | 833 lulus dalam 94 berkas |
| Playwright Chromium `dataUi`, `installation`, `backupIntegration`, `backupStorage` | 43 lulus, termasuk upgrade IndexedDB dari v17, v33, dan v34 |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run build` | Lulus |
