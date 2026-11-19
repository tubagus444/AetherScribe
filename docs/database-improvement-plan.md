# Rencana peningkatan database AetherScribe

Tanggal penyusunan: 18 November 2026.

Keputusan dasar: tetap menggunakan IndexedDB + Dexie. Dokumen ini merinci
pekerjaan yang dapat dilakukan kemudian; tidak menyatakan perubahan sudah
diterapkan. Status pelaksanaan dicatat hanya di [ROADMAP](../ROADMAP.md#database-improvement).
Checklist di sini adalah ruang lingkup dan kriteria penerimaan, bukan tracker kedua.

## Tujuan dan batas

Lindungi naskah, pusatkan aturan data, permudah penambahan fitur, dan sediakan
jalur migrasi ke penyimpanan lain. Fleksibilitas berarti perubahan dapat dilakukan
secara terarah dan aman, bukan skema otomatis mendukung seluruh fitur masa depan.

Pekerjaan dilakukan bertahap per domain. Tidak termasuk mengganti database,
membuat layanan cloud, atau mengaktifkan sinkronisasi sekarang. Perubahan skema
mengikuti aturan append-only pada [dokumentasi database](database.md).

## Kondisi awal dan pemeriksaan sebelum implementasi

Pemeriksaan sebelumnya menemukan skema v34 dengan 20 tabel, transaksi operasi
penting, validasi backup, pemetaan ulang ID saat impor, dan layanan penghapusan
relasi. Backup eksternal file/Drive dan backup internal sudah memiliki alur sendiri.
Backup internal dengan referensi aset tidak setara dengan backup lengkap mandiri.

Ada fondasi layanan query/operasi bab, tetapi akses Dexie masih tersebar pada
komponen dan hook. Katalog tabel backup, impor, dan penghapusan juga masih terpisah.
Ini dasar perencanaan, bukan audit ulang source pada tanggal penyusunan.

Sebelum setiap batch:

- Periksa source terkini dan aturan repositori; identifikasi bagian yang sudah tersedia.
- Catat baseline perilaku dan tes relevan agar pekerjaan tidak mengulang perbaikan lama.
- Gunakan fixture atau salinan data terisolasi untuk percobaan destruktif.
- Tentukan lingkup, kompatibilitas, risiko, dan bukti selesai di ROADMAP.

Rujukan: [format backup](backup-format.md), [pengujian](testing.md),
[hasil instalasi/migrasi](audits/2026-11-15-l02-installation.md), dan
[integrasi worker backup](performance/l06-integration.md).

## Urutan pekerjaan

### DB01 — Perlindungan dan pemulihan naskah

Prioritas kritis. Mulai dari pemeriksaan kemampuan yang sudah ada.

- Petakan alur autosave, gagal simpan, kuota, backup internal, file, dan Drive.
- Perjelas status simpan dan backup eksternal terakhir, termasuk kegagalan dan kebutuhan login ulang.
- Evaluasi `navigator.storage.persisted()`/`persist()` dengan fallback saat tidak didukung atau ditolak.
- Pastikan backup lengkap dapat dipulihkan pada profil browser kosong, termasuk gambar peta.
- Bedakan titik pulih internal yang bergantung pada aset live dari cadangan mandiri.

Selesai jika: gagal simpan tidak ditampilkan sebagai berhasil; penolakan persistensi
tidak menghalangi penggunaan; restore cadangan lengkap terbukti mempertahankan
naskah, relasi, dan aset. Persistensi browser tidak menggantikan backup eksternal.

### DB02 — Pusatkan operasi perubahan data

Fondasi. Mulai dari bab/editor, lalu proyek, Codex, dan domain lain.

- Inventarisasi pemanggilan tambah, ubah, dan hapus langsung dari UI/hook.
- Salurkan operasi melalui layanan domain; tetapkan batas transaksi di layanan.
- Pertahankan flush editor, invalidasi cache, dan pemberitahuan setelah commit.
- Pindahkan pemanggil bertahap; hindari dua jalur dengan aturan berbeda.

Selesai per domain jika: UI memanggil operasi domain, kegagalan transaksi tidak
meninggalkan perubahan parsial, dan perilaku simpan/penghapusan tetap terjaga.

### DB03 — Validasi penulisan dan integritas relasi

Sesudah DB02 pada domain terkait.

- Bedakan input pembuatan, patch pembaruan, dan record tersimpan.
- Validasi runtime nilai penting serta keberadaan dan kepemilikan proyek referensi.
- Dokumentasikan kebijakan relasi: hapus anak, lepas referensi, atau tolak operasi.
- Pastikan pemeriksaan dan mutasi yang harus atomik berada dalam transaksi yang sama.
- Sediakan pemeriksaan integritas yang melaporkan masalah; jangan otomatis menghapus data lama.

Selesai jika: referensi invalid/lintas proyek ditolak pada jalur terkait, patch valid
tetap diterima, dan rollback serta kebijakan penghapusan teruji. Data legacy
ditangani eksplisit tanpa kehilangan teks diam-diam.

### DB04 — Katalog tabel dan kebijakan data

Sesudah inventaris DB02/DB03; dapat dikerjakan setelah domain pertama stabil.

- Catat setiap tabel sebagai data utama, aset, cache turunan, backup, atau log.
- Definisikan cakupan proyek/global, relasi, retensi, serta kebijakan ekspor dan penghapusan.
- Turunkan daftar bersama dari katalog bila sesuai, sambil mempertahankan kode khusus remap/aset.
- Tambahkan pemeriksaan kelengkapan terhadap tabel Dexie sehingga tabel baru tidak terlewat.

Selesai jika: setiap tabel memiliki kebijakan eksplisit; pengecualian seperti cache
dan log terdokumentasi; penambahan tabel tanpa kebijakan terdeteksi. Katalog tidak
menggantikan aturan bisnis dengan cascade generik.

### DB05 — Kontrak akses data dan adapter Dexie

Sesudah DB02–DB04 cukup stabil; dilaksanakan per domain.

- Buat antarmuka query/penyimpanan sesuai kebutuhan domain, mulai dari bab.
- Tempatkan Dexie dan detail indeks pada implementasi adapter.
- Tentukan kontrak transaksi lintas repository agar atomisitas tetap tersedia.
- Tentukan mekanisme subscription/invalidation pengganti ketergantungan UI pada live query Dexie.
- Pisahkan layanan bisnis dari implementasi dan error khusus penyimpanan.

Selesai jika: domain pertama dapat dipanggil melalui kontrak tanpa tipe Dexie di
pemanggil, pembaruan UI tetap reaktif, dan operasi lintas tabel tetap atomik.
Hindari repository CRUD generik yang justru membocorkan query Dexie.

### DB06 — Kontrak data dan prosedur evolusi skema

Sesudah pola domain pertama terbentuk. Aturan migrasi lama tetap berlaku sepanjang pekerjaan.

- Pisahkan tipe domain, record penyimpanan, dan DTO ekspor ketika bentuknya memang berbeda.
- Tetapkan aturan field opsional, default pembacaan, backfill, dan validasi data legacy.
- Tambahkan versi skema hanya ketika diperlukan; jangan mengubah migrasi yang telah dirilis.
- Gunakan cursor/batch sesuai kebutuhan; ukur penggunaan memori untuk transformasi besar.
- Simpan fixture versi historis representatif dan skenario gagal upgrade.

Selesai jika: instalasi kosong dan upgrade historis terpilih mempertahankan data;
kegagalan migrasi tidak menghasilkan keadaan setengah berubah; dokumentasi dan tipe sinkron.
Rujukan: [kontrak data bab dan prosedur evolusi skema](database.md#kontrak-data-dan-evolusi-skema-db06).

### DB07 — Format ekspor portabel

Sesudah DB04 dan kontrak DB06 ditetapkan.

- Pertahankan pemisahan versi format backup dari versi skema Dexie.
- Dokumentasikan record, unit waktu, ID, relasi, encoding aset, dan kebijakan cache.
- Pertahankan pembaca format lama serta penolakan versi yang belum didukung secara jelas.
- Pastikan ekspor lengkap tidak bergantung pada Blob atau aset yang hanya tersedia di DB asal.
- Sediakan jalur konversi ke bentuk portabel tanpa mewajibkan database tujuan sekarang.

Selesai jika: ekspor dapat divalidasi tanpa membuka Dexie dan round-trip ke DB
kosong mempertahankan data utama, referensi, serta aset. Cache yang dikecualikan
memiliki prosedur regenerasi. Gunakan format yang sudah ada sebelum membuat format baru.

### DB08 — Kapasitas dan optimasi berdasarkan pengukuran

Baseline pengukuran boleh dimulai lebih awal jika ada keluhan performa.

- Gunakan fixture kecil/sedang/besar dengan volume, browser, dan perangkat yang dicatat.
- Ukur simpan editor, daftar bab, pencarian, chat, snapshot, ekspor, dan restore.
- Tetapkan target respons/memori berdasarkan baseline sebelum memilih optimasi.
- Evaluasi pagination, indeks, retensi cache, pemisahan pesan chat, serta collect/serialisasi bertahap.
- Periksa kembali interaksi multi-tab dan konsumsi memori di luar worker backup yang sudah tersedia.

Selesai jika: hasil sebelum/sesudah dapat dibandingkan pada fixture yang sama,
target batch tercapai, dan penghematan tidak mengorbankan konsistensi backup atau naskah.
Pemisahan tabel dan indeks baru memerlukan bukti kebutuhan.

### DB09 — Identitas global dan pelacakan perubahan (bersyarat)

Dikerjakan setelah kebutuhan sinkronisasi/penggabungan perangkat diputuskan.

- Tentukan identitas global dan pertahankan kompatibilitas ID lokal/remap lama.
- Tetapkan versi record, kepemilikan data, strategi konflik, dan makna penghapusan.
- Rancang tombstone dan retensinya jika diperlukan; timestamp saja tidak cukup untuk konflik.
- Rancang antrean perubahan dan retry hanya jika mekanisme sinkronisasi sudah jelas.

Selesai jika: penggabungan dua sumber tidak membenturkan identitas, referensi tetap
utuh, dan konflik/hapus-versus-edit memiliki hasil yang terdefinisi. ID global
sendiri belum berarti sinkronisasi tersedia.

### DB10 — Pembuktian migrasi (bersyarat)

Sesudah DB05–DB07 dan database tujuan dipilih. DB09 diperlukan jika menggabungkan
beberapa perangkat; tidak wajib untuk migrasi satu sumber.

- Pilih target berdasarkan kebutuhan nyata, misalnya SQLite lokal atau PostgreSQL dengan backend.
- Buat importer percobaan pada database terisolasi; tentukan pemetaan ID dan tipe/aset.
- Verifikasi jumlah record, isi naskah, referensi, aset, dan batas keunikan.
- Tentukan strategi pengulangan impor, penghentian penulisan saat cutover, verifikasi, serta rollback.
- Dokumentasikan perubahan API, reaktivitas UI, transaksi, dan otorisasi bila memakai server.

Selesai jika: percobaan dapat diulang dengan hasil konsisten dan laporan rekonsiliasi
tersedia. Cutover produksi merupakan pekerjaan terpisah; rencana ini tidak menjalankannya.

## Aturan desain fitur baru

| Kebutuhan | Pendekatan awal |
|---|---|
| Atribut kecil mengikuti umur record induk | Field opsional dengan bentuk dan default jelas |
| Data tumbuh banyak atau memiliki siklus hidup/query sendiri | Tabel tersendiri dengan relasi eksplisit |
| Konfigurasi bertingkat atau field kustom | Objek JSON tervalidasi; versi bentuk bila diperlukan |
| Pencarian atau pengurutan berulang yang mahal | Indeks berdasarkan query dan pengukuran |
| Data turunan yang dapat dihitung ulang | Cache terpisah dengan invalidasi/retensi |
| Hubungan lintas entitas | Referensi terstruktur dan aturan hapus/remap, bukan ID tersembunyi dalam teks |

Jangan menjadikan seluruh domain sebagai key-value atau JSON bebas demi fleksibilitas.
Field yang perlu diindeks, relasi, dan data utama tetap membutuhkan struktur jelas.

Setiap fitur baru harus menjelaskan: pemilik data, bentuk/validasi, query, transaksi,
relasi, penghapusan, backup/impor, kebutuhan migrasi, dan perilaku data lama.

## Cara melaksanakan dan menutup batch

Urutan awal: DB01 → DB02 (bab/editor) → DB03 (bab/editor) → DB04 → DB05
(bab/editor) → perluasan domain dan DB06–DB07 → DB08. DB09–DB10 bersyarat.

Untuk setiap batch, catat pada ROADMAP: lingkup dan pengecualian, file yang berubah,
tes relevan dan hasilnya, batas verifikasi, perubahan skema/format bila ada, serta
pekerjaan tersisa. Jalankan typecheck/build sesuai dampak kode dan tes integrasi
yang membuktikan risiko nyata. Tes browser diperlukan untuk perilaku storage,
upgrade, dan multi-tab yang tidak dibuktikan oleh fake IndexedDB.

Pekerjaan baru dinyatakan selesai setelah kriteria penerimaannya terbukti; jangan
menandai seluruh domain selesai berdasarkan satu adapter atau satu tes round-trip.
