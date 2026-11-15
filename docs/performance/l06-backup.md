# L06 - Pengukuran backup besar

15 November 2026. [Data mentah tiga sampel per ukuran](l06-backup.json).
Source HEAD `3f027fb`, working tree mencakup L05 dan harness pengukuran; layanan
backup belum dioptimasi/diubah. Windows, Node 24.15.0, Chromium 159.0.8154.6.

## Metode dan reproduksi

```powershell
npm run measure:backup -- --output=test-results/backup-benchmark.json
```

Script menjalankan server pengembangan terisolasi pada port 4183, context browser
baru dengan IndexedDB native dan tanpa profil pengguna. Request luar origin
diblokir. Fixture mengimpor kode backup produksi, tetapi React/editor/model tidak
dipasang. Seed dan pemeriksaan restore berada di luar waktu yang dilaporkan.
Satu proyek berisi teks deterministik dari kosakata 1024 token dengan PRNG,
bukan naskah pengguna. Kasus gambar memakai empat PNG valid 600x600 dari pola
piksel deterministik, total 2.18 MiB. Rasio kompresi teks/gambar ini bukan prediksi
untuk semua novel atau ilustrasi pengguna.

Setiap ukuran diukur tiga kali berurutan, termasuk sampel pertama. Tidak ada
throttle CPU; hasil dilaporkan sebagai median. Tahap yang diukur:

1. collectAllData: snapshot IndexedDB, serialisasi gambar dan checksum.
2. JSON.stringify envelope lengkap: jalur file JSON manual, tanpa kompresi.
3. compressData: gzip tambahan seperti jalur penyimpanan yang memakai kompresi.
4. saveToInternalDB(auto): validasi, pembuatan payload referensi gambar, checksum,
   serialisasi, kompresi, penyimpanan IndexedDB dan retensi setelah koleksi.

Tahap dijalankan pada payload yang sama dengan jeda harness. Estimasi jalur auto
adalah median jumlah collect + auto-save per sampel; tidak menambahkan tahap
file JSON/gzip lengkap yang diukur terpisah. Ini bukan pengukuran timer UI daemon
atau waktu unggah file/Drive. Auto-save sudah mencakup kompresinya sendiri.

## Hasil waktu

| Data | Collect | JSON file | Gzip lengkap | Auto-save setelah collect | Estimasi collect + auto-save | Jeda timer terburuk |
|---|---:|---:|---:|---:|---:|---:|
| 10 bab / 10 ribu kata | 3.3 ms | 0.1 ms | 6.1 ms | 7.8 ms | 11.0 ms | 1.6 ms |
| 100 bab / 200 ribu kata | 26.4 ms | 2.2 ms | 114.7 ms | 105.8 ms | 131.9 ms | 101.6 ms |
| 500 bab / 2.5 juta kata | 231.6 ms | 13.5 ms | 1133.1 ms | 1339.2 ms | 1571.8 ms | 180.4 ms |
| 500 bab / 2.5 juta kata + 4 PNG | 319.9 ms | 28.9 ms | 1234.6 ms | 1356.7 ms | 1674.7 ms | 221.5 ms |

Timer 16 ms mengukur keterlambatan callback melebihi intervalnya selama tiap
operasi. Jeda terburuk adalah maksimum seluruh tahap/sampel, bukan median atau
jumlah seluruh stall. Jumlah tick terlambat >50 ms disimpan pada data mentah;
50 ms dipakai sebagai indikator harness, bukan target performa produk yang telah
ditetapkan. Total waktu operasi tidak berarti main thread terblokir sepanjang
waktu tersebut. Timer menunjukkan gangguan event loop, bukan latensi mengetik
TipTap atau atribusi stack CPU. GC, scheduler dan sampling CDP dapat memengaruhi hasil.

## Ukuran dan memori

| Data | JSON lengkap | Gzip lengkap | Auto internal | Tambahan peak heap JS tersampel |
|---|---:|---:|---:|---:|
| 10 ribu kata | 0.07 MiB | 0.02 MiB | 0.02 MiB | 0.9 MiB |
| 200 ribu kata | 1.33 MiB | 0.36 MiB | 0.36 MiB | 4.2 MiB |
| 2.5 juta kata | 16.56 MiB | 4.58 MiB | 4.58 MiB | 72.8 MiB |
| 2.5 juta kata + 4 PNG | 19.47 MiB | 6.76 MiB | 4.58 MiB | 72.6 MiB |

Auto internal menggunakan referensi gambar sehingga ukurannya tidak sama dengan
backup lengkap mandiri. Gambar live yang cocok tetap dibutuhkan saat memulihkan
referensi tersebut. collectAllData saat ini tetap memproses gambar lengkap sebelum
auto-save membentuk referensi; tabel tidak menyiratkan biaya itu sudah dihindari.

Heap diambil lewat Runtime.getHeapUsage setiap sekitar 50 ms dengan forced GC
sebelum/sesudah operasi, bukan di dalam pengukuran. Peak merupakan maksimum
tersampel dikurangi heap awal dan dapat melewatkan puncak singkat. Data mentah
juga memisahkan backing storage serta retained heap saat backup lengkap masih
dipegang. Bukan total RSS browser, native Blob/IndexedDB memory, atau batas memori
yang dijamin. Harness menahan payload untuk pemeriksaan integritas berikutnya.

## Integritas dan keputusan

Semua empat ukuran lulus pemeriksaan checksum SHA-256, baca ulang gzip/JSON,
restore penuh setelah naskah sengaja diganti, dan restore internal berbasis
referensi. Semua record bab dibandingkan, dan byte gambar dibandingkan langsung
sesudah kedua jenis restore. Restore membuat snapshot pengaman lewat service
asli. Tidak menggunakan mock checksum/kompresi/IndexedDB.

Ada indikasi gangguan event loop pada data sedang/besar. Namun stringify JSON
file sendiri hanya sekitar 29 ms pada kasus terbesar; belum ada dasar untuk
menyatakan stringify adalah satu-satunya atau penyebab utama jeda 222 ms.
Pengukuran ini belum memisahkan stack validasi, encoding/checksum, gzip dan GC
di dalam auto-save.

Rekomendasi tahap berikutnya adalah profiling terarah pada dataset sedang/besar,
kemudian membandingkan satu perubahan terukur. Jika worker dipilih, kandidatnya
adalah pekerjaan CPU setelah snapshot konsisten (serialisasi/encoding/kompresi),
dengan memperhitungkan biaya structured clone/transfer dan penggunaan memori.
Flush editor serta batas transaksi snapshot tidak boleh dilemahkan; kontrak
checksum, referensi gambar, penolakan aset hilang, rollback dan pre-restore harus
tetap lulus. Worker tidak otomatis mempercepat elapsed time.

**Tahap pengukuran selesai; optimasi belum dikerjakan atau diputuskan.** Tidak
ada threshold timing CI baru. Benchmark bersifat manual/opsional karena hasil
bergantung perangkat dan workload; belum dijalankan pada runner GitHub, perangkat
lambat, banyak proyek/snapshot/chat, quota rendah atau editor aktif. Typecheck
umum/strict/maintenance lulus. Unit/browser suite tidak diulang untuk harness ini;
bukti sebelumnya tetap memiliki scope dan SHA masing-masing.
