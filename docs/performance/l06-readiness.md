# L06 - Pengujian otomatis kesiapan eksperimen worker

> Riwayat sebelum integrasi worker pada commit 4816258. Angka dan status di bawah
> berlaku pada tahap pengujian ini. Kondisi aplikasi sekarang ada di
> [laporan integrasi L06](l06-integration.md).


15 November 2026, source dasar 01bf781. Pengujian memakai data sintetis dan
context browser baru; tidak mengubah jalur backup aplikasi atau membuka data pengguna.

## Hasil per kriteria

| Kriteria | Status | Bukti / batas |
|---|---|---|
| Payload/checksum dan restore | Lulus pada eksperimen sebelumnya | Snapshot l06-worker.json membandingkan hasil dengan service produksi dan memulihkan seluruh bab/byte gambar. Tes baru memvalidasi payload fallback dan memeriksa data Codex/marker/snapshot tetap utuh saat gagal |
| Worker gagal dibuat | Lulus pada client eksperimen | Factory melempar error; request selesai sebagai reject, fallback main menghasilkan payload yang sama, cadangan sebelumnya tetap |
| Worker crash | Lulus pada client eksperimen | Worker native melempar uncaught error; onerror menolak request dan melakukan cleanup |
| Timeout | Lulus pada client eksperimen | Worker native tidak menjawab; timeout test 500 ms menolak request dan menerminasi worker |
| Respons rusak | Lulus pada client eksperimen | Worker mengirim bytes berupa angka; client menolak, bukan meneruskan payload ke penyimpanan |
| Offline | Lulus untuk fallback yang sudah dimuat | Browser offline gagal memuat worker baru; kode fallback yang sudah diimpor menghasilkan payload valid tanpa mengubah data |
| Mengetik dan batas snapshot | Lulus untuk isolasi snapshot | Editor TipTap asli menyimpan ketikan baru dan dapat reload; payload tetap sesuai snapshot sebelum ketikan tersebut |
| Request/worker berulang | Lulus pada enam siklus | Setiap siklus selesai dengan activeRequests=0 dan jumlah worker browser kembali nol |
| Tren heap main thread | Lulus dalam batas harness | Sesudah GC, kenaikan siklus ke-2 sampai ke-6 <8 MiB; ambang konservatif fixture, bukan batas RAM produk |
| Sampel heap worker | Terukur sebagian | Runtime.getHeapUsage di worker native sebelum request; hasil disertakan pada attachment worker-stability.json |
| Peak RAM gabungan / semua kebocoran | Belum teruji menyeluruh | Tidak mengukur peak worker saat kompresi, RSS, native buffers, atau ratusan siklus |
| Latensi ketikan saat CPU penuh | Belum teruji | Tes snapshot memakai delay 500 ms sebelum pekerjaan untuk memastikan request in-flight secara deterministik; bukan benchmark latency editor |
| Integrasi produksi | Belum | Client/fallback berada di e2e/, bukan jalur backup aplikasi |

## Cara tes bekerja

`e2e/backupWorkerClient.ts` adalah client eksperimen: satu worker milik satu
request, timeout, pemeriksaan ArrayBuffer, error/messageerror, serta cleanup pada
semua jalur selesai. Fallback memanggil algoritme prepareAuto yang sama di main
thread; bila fallback sendiri gagal, error tetap diteruskan. Timeout produksi
belum ditentukan. Ini bukan API baru aplikasi dan belum lengkap untuk fitur backup
file/Drive/pre-restore atau browser tanpa crypto/CompressionStream.

`e2e/backupReadiness.spec.ts` menambahkan tujuh skenario. Fixture berisi 100 bab /
200 ribu kata, satu PNG, Codex, marker dan snapshot bab. Tidak memock IndexedDB,
crypto/gzip atau service backup. Kegagalan dibentuk dengan factory yang menolak
atau script worker native khusus. Semua request yang gagal menjaga data sumber
dan identitas/ukuran record cadangan sebelumnya, lalu fallback dibandingkan
dengan payload produksi yang didekode. Test tidak menulis hasil worker ke tabel
backup sebagai pengganti service produksi.

Tes editor mengambil snapshot melalui collectAllData (termasuk flush), lalu
memulai request dengan jendela delay yang disengaja. Event input membuktikan
ketikan terjadi sebelum request selesai. Naskah baru tersimpan/reload dan naskah
snapshot tetap versi lama. Tidak sengaja melakukan restore versi lama ke editor
aktif pada test ini.

Heap main diambil sesudah forced GC setiap siklus, worker heap diambil lewat
CDP pada worker yang masih hidup sebelum pekerjaan. Attachment memuat enam
sampel masing-masing. Worker baru dibuat/ditutup setiap siklus, sehingga ini
tidak menguji stabilitas satu worker persisten. Attachment menjadi bagian report
Playwright/artefak CI; angka bukan bukti penggunaan memori total rendah.

## Verifikasi dan keputusan

Typecheck umum/strict/maintenance, 90 berkas/787 tes, serta 42 tes Chromium lulus
lokal. Build/coverage tidak diulang karena perubahan hanya pada fixture/client
eksperimen dan dokumentasi; tidak ada perubahan schema/dependensi atau kode
runtime aplikasi. Belum mengklaim run GitHub atau hasil pada data pengguna.

Eksperimen sudah memiliki pengaman kegagalan dasar dan bukti snapshot saat
mengetik. **Belum menyatakan worker siap diaktifkan pada data nyata.** Langkah
sebelum integrasi: peak memori/latensi editor saat kompresi, error fasilitas browser,
validasi isi hasil worker lebih ketat, pemilihan fallback/timeout dan pengujian
end-to-end penyimpanan/retensi/offline production. Pengujian proyek nyata tetap
memakai salinan terpisah dengan cadangan lengkap yang diverifikasi.

## Pengujian berikutnya

[Editor aktif dan sampled peak saat kompresi](l06-editor-load.md) melengkapi
pengukuran worker sebelum request di atas. Long-tail input membaik, sampled heap
bertambah; peak RSS dan kesiapan integrasi produksi tetap belum diklaim.
