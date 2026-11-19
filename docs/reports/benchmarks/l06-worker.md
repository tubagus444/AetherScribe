# L06 - Eksperimen persiapan backup di worker

> Riwayat sebelum integrasi worker pada commit 4816258. Angka dan status di bawah
> berlaku pada tahap pengujian ini. Kondisi aplikasi sekarang ada di
> [laporan integrasi L06](../audits/2026-11-15-l06-backup-integration.md).


15 November 2026, HEAD 0647d07 dengan perubahan profiling/eksperimen di working
tree. [Data mentah](l06-worker.json). Windows/Node 24.15.0/Chromium 159.0.8154.6.

```powershell
npm run measure:backup -- --worker --output=test-results/backup-worker.json
```

## Yang dibandingkan

Eksperimen hanya berada di e2e/, tidak diimpor oleh aplikasi. prepareAuto yang
sama dijalankan pada main thread dan native module worker: validasi input,
pembentukan referensi gambar, stringify, SHA-256, envelope, TextEncoder/Blob,
CompressionStream gzip, Response.blob dan arrayBuffer. Worker menerima structured
clone payload dan mengembalikan ArrayBuffer transferable. Biaya postMessage/clone
dan transfer ikut elapsed/heartbeat, sementara constructor Worker di luar timing.

Empat pasangan per ukuran, urutan main/worker bergantian. Pasangan pertama
disimpan pada raw tetapi dikeluarkan dari ringkasan warm (median tiga pasangan
berikutnya). Worker digunakan ulang, lalu diterminasi pada finally. Snapshot
dibuat sebelum pasangan ukur; tidak mengubah flush editor, read transaction atau
commit database. Tidak memasang React/editor atau mengambil heap worker.

## Hasil warm

| Data | Main, median | Worker, median | Jeda timer terburuk main | Jeda timer terburuk worker |
|---|---:|---:|---:|---:|
| 10 ribu kata | 6.9 ms | 6.4 ms | 2.1 ms | 1.8 ms |
| 200 ribu kata | 103.0 ms | 107.1 ms | 71.9 ms | 1.1 ms |
| 2.5 juta kata | 1274.7 ms | 1319.2 ms | 181.8 ms | 11.5 ms |
| 2.5 juta kata + 4 PNG | 1282.4 ms | 1306.6 ms | 209.2 ms | 13.9 ms |

Jeda adalah maksimum callback timer 16 ms pada tiga pasangan warm, bukan latensi
mengetik atau total waktu thread terblokir. Angka mengukur persiapan payload saja;
tidak boleh dibandingkan langsung sebagai percepatan end-to-end dengan collect +
save pada laporan awal. Native gzip/crypto tetap memerlukan waktu; worker terutama
memindahkan beban main thread, bukan memangkas elapsed time. Variasi perangkat
dan scheduler berlaku; tidak menetapkan threshold CI dari satu mesin ini.

## Bukti kompatibilitas

Pada tiap pasangan, hasil didekompresi dan dibandingkan penuh main versus worker,
lalu divalidasi lewat backupService.validateInput. Hasil eksperimen juga dibandingkan
dengan record auto yang benar-benar dibuat saveToInternalDB produksi pada payload
yang sama (termasuk checksum dan imageMode). Tidak menyatakan gzip byte-for-byte
sebagai kontrak format, walaupun ukuran hasil dicatat.

Payload worker dipulihkan menggunakan restoreData produksi sesudah bab sengaja
diubah; seluruh record bab dan byte gambar diperiksa. Harness existing melanjutkan
verifikasi full/internal restore, checksum dan gambar pada semua empat ukuran.
Input null ditolak worker, lalu worker yang sama berhasil mengerjakan request valid
berikutnya. Tidak ada mock IndexedDB/worker/crypto/gzip. Typecheck umum/strict dan
maintenance guard lulus; implementasi layanan backup belum berubah.

## Keputusan tahap ini

Eksperimen layak dilanjutkan untuk menjaga respons main thread pada backup besar.
Belum dipromosikan ke jalur aplikasi. Sebelum integrasi perlu:

- Ukur memori main + worker dan biaya startup dingin; angka heap baseline lama
  tidak membuktikan penggunaan memori worker rendah.
- Ekstrak satu implementasi bersama yang menggantikan duplikasi eksperimen,
  dengan tetap mempertahankan envelope/checksum dan perilaku layanan lama.
- Tentukan fallback untuk Worker/crypto/CompressionStream yang tidak tersedia,
  error/crash/messageerror/timeout, cleanup request, serta batas ukuran payload.
- Pertahankan snapshot/flush dan commit/retensi DB pada service yang ada; ukur
  ulang end-to-end, termasuk mode editor aktif dan aset yang hilang/berubah.
- Jalankan regresi backup/restore/retensi serta tes native/build/offline sebelum
  mengaktifkan jalur baru. Eksperimen ini hanya auto/reference, belum pre-restore,
  backup project/file/Drive atau seluruh format/fallback browser.

Build, unit/browser suite dan coverage tidak diulang pada perubahan harness ini.
Tidak mengubah schema/dependensi atau membuat worker produksi, dan tidak mengklaim
integrasi siap rilis. L06 kini memiliki baseline, profil CPU dan A/B worker;
integrasi produksi masih pekerjaan berikutnya.
