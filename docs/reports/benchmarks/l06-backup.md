# L06 - Pengukuran backup besar

> Riwayat sebelum integrasi worker pada commit 4816258. Angka dan status di bawah
> berlaku pada tahap pengujian ini. Kondisi aplikasi sekarang ada di
> [laporan integrasi L06](../audits/2026-11-15-l06-backup-integration.md).


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


## Tahap kedua: profiling CPU

Sesudah commit 0647d07, jalankan:

```powershell
npm run measure:backup -- --profile --output=test-results/backup-profile.json
```

Hasil ada di [snapshot profiling](l06-profile.json). Empat dataset dan tiga sampel
per ukuran kembali lulus checksum, restore penuh/internal, seluruh bab dan byte
gambar. Tidak mengubah implementasi backup. Script tetap mendukung mode ukur
biasa; flag --profile mengaktifkan CDP CPU profiler hanya selama rangkaian operasi,
bukan seed atau pemeriksaan restore. Snapshot menyimpan 25 frame dengan self-time
tersampel tertinggi tiap sampel, bukan call tree lengkap.

Pada kasus 2.5 juta kata + empat PNG, akumulasi tiga sampel mencatat sekitar
769 ms pada frame native encode, 326 ms digest dan 241 ms Blob. Nilai ini mencakup
semua tahap ukur (collect, file JSON, gzip lengkap dan auto-save), bukan biaya
satu auto-backup. Frame program yang tidak teratribusi sekitar 6766 ms dan idle
1110 ms; keduanya tidak boleh dianggap waktu JavaScript fungsi tertentu atau
bukti seluruh durasi membekukan UI. Nama file/baris berasal dari modul transformasi
Vite dan bukan nomor baris source asli yang stabil. Profiler menambah overhead;
jangan langsung membandingkan elapsed mode profiling dengan baseline sebelumnya.

Kesimpulan yang dapat dipakai: encoding/checksum/pembuatan buffer merupakan
kandidat optimasi yang lebih konkret daripada hanya memindahkan stringify.
Namun sampling ini belum memisahkan biaya native gzip, scheduler dan GC dengan
pasti. Tahap implementasi yang disarankan adalah prototipe worker untuk pekerjaan
CPU setelah snapshot (validasi/serialisasi/encoding/checksum/kompresi), lalu A/B
terhadap baseline pada workload yang sama. Snapshot/flush dan commit DB tetap
memakai alur konsisten yang ada. Ukur biaya transfer/clone, peak memori, fallback
jika worker gagal, serta pertahankan byte/checksum dan kebijakan aset/rollback.
Ini rancangan eksperimen berikutnya, belum keputusan mengirim semua pekerjaan
ke worker atau klaim akan mempercepat elapsed time.

Profiling dan pemeriksaan sintaks script lulus. Tidak menjalankan ulang suite
aplikasi karena perubahan hanya pada harness/report; tidak ada perubahan schema,
dependency, source runtime atau kebijakan backup. L06 tetap pada tahap pengukuran/
profiling selesai, implementasi optimasi belum dilakukan.

Eksperimen berikutnya sudah tersedia: [perbandingan worker dan batas integrasi](l06-worker.md). Hasil tersebut tidak mengganti baseline pengukuran awal.
