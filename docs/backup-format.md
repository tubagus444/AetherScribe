# Format Backup dan Pemulihan

Format yang dihasilkan saat ini adalah **v8**; skema IndexedDB tetap **v33**. Implementasi utama: `src/services/backupService.ts`, schema `src/lib/backupValidation.ts`, pembaca terbatas `src/lib/backupIO.ts`, dan batas `src/lib/backupLimits.ts`.

## Scope dan validasi

`restoreData(input)` hanya menerima cadangan seluruh workspace (`scope:'all'`). `importProjectData(input)` hanya menerima `scope:'project'` dengan tepat satu proyek dan menambahkan salinan baru melalui remap ID. UI memvalidasi sebelum konfirmasi; service memvalidasi lagi agar internal/Drive tidak dapat melewati pemeriksaan tersebut.

Schema memeriksa envelope, tipe field inti dan metadata yang dikenal, array, enum, ID positif/unik, kunci unik Bible/kategori/triage, serta referensi proyek, bab, Codex, dan peta. Referensi lintas-proyek ditolak. Metadata JSON tambahan pada record dipertahankan, tetapi tabel yang tidak dikenal, objek non-JSON, siklus, dan kunci prototype berbahaya ditolak. Validasi backup tidak menghapus markup pada teks sumber. Atlas memperlakukan judul marker/nama Codex sebagai teks saat render DOM, termasuk setelah impor (F01; lihat [katalog fitur](features.md)). Konten HTML modul lain mengikuti kebijakan modul masing-masing.

Versi 3–7 diterima sebagai legacy. Scope yang tidak ditulis pada legacy diperlakukan sebagai seluruh workspace, sesuai format lama. Setelah checksum data asli diverifikasi, tabel opsional yang absen dinormalisasi menjadi array kosong. Normalisasi tidak mengubah input atau checksum aslinya. Versi di luar 3–8 ditolak. Pada v8, scope dan `imageMode` wajib; restore penuh juga mewajibkan seluruh tabel backup. Ekspor per-proyek tetap memiliki tabel opsional sesuai cakupannya.

Checksum SHA-256, bila tersedia pada input, wajib cocok; ketidaktersediaan Web Crypto tidak lagi melewati verifikasi. Legacy tanpa checksum masih diterima setelah validasi struktur. Checksum mendeteksi kerusakan, bukan membuktikan asal/kepercayaan suatu file.

## Aset gambar Atlas

| Jalur | Isi gambar | Kebijakan pemulihan |
|---|---|---|
| File, folder, Drive, ekspor novel | `imageMode:'full'`, `imageDataUrl` dan `imageAssetId` | Gambar didekode tanpa jaringan; identitas hash diperiksa. |
| Auto internal | `imageMode:'references'`, hanya `imageAssetId` | Cocokkan SHA-256 dengan Blob yang masih tersedia di tabel maps; jika tidak ada, batalkan sebelum snapshot/clear. |
| Snapshot pra-restore | `imageMode:'full'` | Gambar lengkap untuk mengembalikan workspace meskipun gambar live telah diganti/dihapus oleh restore. |

`imageAssetId` adalah SHA-256 dari data URL kanonis hasil serialisasi Blob, bukan ID numerik peta. Dengan demikian penggantian gambar pada ID peta yang sama tidak salah dianggap sebagai aset lama. Field khusus backup dilepas sebelum baris maps dimasukkan ke IndexedDB. Tidak ada tabel aset/migrasi baru.

Auto internal sengaja bukan cadangan gambar mandiri. Jika gambar lama sudah tidak tersedia, gunakan file/Drive lengkap. Untuk legacy tanpa hash maupun data URL, restore hanya mempertahankan Blob live dengan `id`, `projectId`, `createdAt`, `width`, dan `height` yang sama; jika tidak cocok, restore dibatalkan. Legacy tidak dapat membuktikan versi historis gambar ketika gambar pernah diganti dengan dimensi sama. Peta yang memang sudah tidak memiliki Blob saat dicadangkan diberi `imageMissing:true`; status tersebut dipertahankan secara eksplisit.

## Urutan restore dan kegagalan

1. Validasi schema, salin input, verifikasi checksum, lalu normalisasi tabel legacy.
2. Dekode gambar lengkap atau resolusi referensi di luar transaksi Dexie.
3. Kumpulkan workspace saat ini dan simpan snapshot pra-restore lengkap. Jika validasi, pembacaan, atau penyimpanan snapshot gagal, batalkan dan tampilkan pesan; jangan clear workspace.
4. Clear/refill tabel domain dalam satu transaksi atomik. Kegagalan insert mengembalikan seluruh perubahan transaksi; snapshot pengaman tetap tersedia. Cache embedding dibuang untuk regenerasi.

Snapshot lengkap memerlukan ruang tambahan. Saat kuota penuh, mekanisme eviksi auto lama tetap berlaku; jika snapshot masih tidak dapat disimpan, restore dibatalkan. Snapshot juga dapat gagal validasi jika workspace saat ini sudah mempunyai record/referensi tidak valid; perbaikan ini tidak otomatis memperbaiki orphan F11.

## Batas input

| Batas | Nilai |
|---|---|
| File/unduhan terkompresi atau mentah | 64 MiB |
| JSON hasil dekompresi / input internal mentah | 128 MiB |
| Satu string JSON, termasuk escaping | 16 MiB |
| Satu gambar raster yang didekode | 5 MiB |
| Record per tabel / seluruh tabel | 100.000 / 200.000 |
| Kedalaman JSON / node JSON | 32 / 2.000.000 |

File ditolak sebelum pembacaan jika ukurannya berlebihan. Unduhan Drive dihitung per chunk, termasuk bila Content-Length tidak ada. Dekompresi gzip dibatasi selama pembacaan dan stream dibatalkan saat melewati batas; gzip dikenali lewat magic bytes, bukan ekstensi. Objek langsung juga memiliki anggaran ukuran sebelum disalin. PNG, JPEG, WebP, dan GIF base64 diizinkan; SVG, URL eksternal, MIME lain, dan payload tidak valid ditolak tanpa fetch gambar.

## Verifikasi dan batasnya

`src/services/backupService.test.ts` dan `driveBackupService.test.ts` menguji DB sintetis terisolasi, auto/full/pre-restore, undo gambar, legacy v3–v7, scope/versi/schema/FK, checksum, rollback transaksi, kegagalan snapshot, batas ukuran/dekompresi, dan Drive dengan fetch mock. Tujuh probe regresi gagal pada kode sebelum perbaikan lalu lulus setelahnya.

Belum diuji dengan IndexedDB browser native, akun Drive nyata, atau file novel pengguna. Fixture legacy adalah data sintetis yang mewakili versi envelope, bukan koleksi file historis pengguna. Konsistensi snapshot saat ada penulisan bersamaan dan flush editor sebelum backup tetap menjadi cakupan F19; round-trip triage/workshop F10 tetap terbuka.
