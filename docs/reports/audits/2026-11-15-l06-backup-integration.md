# L06 - Integrasi worker backup internal

15 November 2026, implementasi pada commit `4816258` dengan dasar `0082b89`.
Dokumen ini menjadi rujukan kondisi akhir L06. Laporan pengukuran/eksperimen
sebelumnya merekam tahap sebelum integrasi dan tidak menyatakan status aplikasi sekarang.

## Perilaku

- `backupService.saveToInternalDB` memilih worker untuk record auto dengan
  estimasi >=262144 karakter string bila Worker, crypto dan gzip tersedia.
  Estimasi tidak melakukan stringify; ambang kebijakan awal ini bukan ukuran
  byte file atau titik optimal yang dibuktikan pada semua perangkat.
- `src/lib/internalBackupPreparation.ts` dipakai main dan worker: validasi
  schema/scope, gambar auto menjadi referensi, satu serialisasi data ramping,
  checksum, envelope v8 dan gzip. Pre-restore tetap lengkap di main.
- Worker mentransfer buffer. Client memeriksa discriminator, tipe/batas buffer
  dan header gzip. Isi berasal dari worker bawaan yang memvalidasi input;
  pemeriksaan transport bukan validasi ulang seluruh JSON di main. Pembaca/
  restore tetap memvalidasi schema/checksum sebelum mengganti workspace.
- Startup/crash/messageerror/respons invalid/timeout 30 detik memicu terminasi
  dan fallback main dengan algoritme sama. Kompresi gagal menghasilkan JSON.
  Kegagalan fallback/storage diteruskan ke status/toast aplikasi yang ada.
- Antrean per tab meliputi persiapan, add dengan degradasi kuota dan retensi.
  Setiap permintaan menyimpan snapshot sendiri; rejection tidak meracuni antrean.
  Ini bukan kunci lintas tab. BackupProvider juga tetap membatasi satu siklus.
- Retensi normal kini hanya memangkas auto; pre-restore lama tetap tersedia.
  Degradasi kuota tetap menjaga semua pre-restore dan satu auto terbaru.

Collect/flush editor/transaksi snapshot, serialisasi Blob dan checksum penuh
`collectAllData` masih di jalur sebelumnya. Worker memindahkan tahap persiapan
internal berikutnya; tidak menghilangkan semua jeda. Folder/Drive/ekspor tetap
lengkap. Tidak mengubah schema DB v34, format v8 atau dependensi. Aset worker
sekitar 9.86 kB pada build lokal, tercakup precache PWA standar.

## Bukti dan batas

Enam tes `backupIntegration.spec.ts`: save/restore melalui Pengaturan, tiga
snapshot bersamaan (maksimal satu worker), serta startup/crash/respons invalid/
timeout dengan fallback yang benar-benar disimpan dan di-restore. Tes kompresi
lama kini menonaktifkan Worker untuk memeriksa fallback main; global halaman
tidak mengubah global worker. Unit menjaga antrean sesudah error, estimasi
ukuran, timeout dan retensi pre-restore selama rotasi auto.

`test:startup` memakai build production, PWA dan reload offline, lalu memuat aset
backupWorker native offline, mendekompresi hasil, mencocokkan snapshot dan
menghitung ulang checksum. Ini membuktikan aset production/offline; alur save/
restore UI diuji pada server e2e Vite. Fixture production awal ditolak karena
tabel kosong wajib v8 belum disertakan; fixture diperbaiki tanpa melonggarkan
validator. Typecheck umum/strict/maintenance, 91 berkas/792 tes beserta coverage,
55 tes Chromium (3.1 menit), build/clean production serta startup/offline lulus
lokal. Rincian coverage ada di [panduan tes](../../testing.md); belum ada run GitHub.

Eksperimen latensi/memori sebelumnya bukan pengukuran ulang integrasi. Belum
menguji browser selain Chromium, peak RSS, disk nyata penuh, koordinasi lintas
tab atau data pengguna. Timeout dapat menambah waktu tunggu dan fallback main
dapat kembali menimbulkan jeda. Modul baru masuk strict dan maintenance dengan
budget nol escape, tanpa menaikkan budget file lama (31 root/44 source, 54 file).
