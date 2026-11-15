# L06 - Kegagalan fasilitas browser dan penyimpanan backup

> Riwayat sebelum integrasi worker pada commit 4816258. Angka dan status di bawah
> berlaku pada tahap pengujian ini. Kondisi aplikasi sekarang ada di
> [laporan integrasi L06](l06-integration.md).


15 November 2026. Enam skenario Chromium baru di
`e2e/backupStorage.spec.ts` memakai service backup aplikasi, IndexedDB native,
10 bab / 20 ribu kata dan satu PNG sintetis dalam context terisolasi.

| Skenario | Hasil yang diperiksa |
|---|---|
| CompressionStream tidak tersedia | Simpan JSON tanpa kompresi, decode/validasi, ubah bab, restore dan cocokkan seluruh data serta byte gambar; snapshot pra-pemulihan tersimpan |
| Constructor kompresi melempar error | Fallback JSON dan round-trip yang sama tetap berhasil |
| Web Crypto tidak tersedia | Restore input ber-checksum ditolak; seluruh data workspace dan record riwayat tetap identik |
| Kuota gagal satu kali | Hapus auto tertua, retry berhasil; auto terbaru dan pre-restore tetap ada, seluruh record tersisa dapat didekode dan divalidasi |
| Kuota gagal terus | Berhenti dengan pesan penyimpanan penuh setelah kandidat aman habis; satu auto terbaru dan pre-restore tetap ada, data sumber tidak berubah |
| Penulisan pre-restore gagal | Restore dibatalkan tanpa perubahan workspace/riwayat; setelah fasilitas pulih, retry berhasil dan snapshot pengaman berisi draft sebelum restore |

Kompresi dan crypto dinonaktifkan sementara melalui property browser, lalu
dikembalikan dalam `finally`. Kegagalan storage disuntikkan pada hook Dexie
`creating` dengan DOMException `QuotaExceededError` atau `UnknownError`; operasi
baca, transaksi, delete, kompresi, checksum dan restore tetap berjalan melalui
implementasi aplikasi. Ini menguji respons terhadap error, bukan menghabiskan
kapasitas disk nyata atau meniru seluruh kegagalan browser/OS.

Percobaan awal menemukan kesalahan query pada tes baru: `kind` bukan indeks
tabel backups. Tes diperbaiki memakai filter; schema dan source aplikasi tetap.

Verifikasi: enam tes terarah dan seluruh 49 tes Chromium lulus lokal (2.2 menit).
Run regresi pertama memiliki 48 lulus dan satu inspector timeout pada tes beban
editor, bersamaan dengan penulisan dokumentasi dan hilangnya state halaman;
kemungkinan reload Vite. Run ulang tanpa perubahan workspace lulus seluruhnya.
Typecheck umum/strict/maintenance lulus. Unit,
build dan coverage tidak diulang untuk batch ini karena hanya menambah tes
browser/dokumentasi; hasil 787 tes sebelumnya tetap merupakan snapshot terpisah.

Worker masih eksperimen di `e2e/`. Tes ini memeriksa jalur backup aplikasi saat
ini, belum menguji penyimpanan hasil worker melalui UI, antrean request worker,
atau aset worker pada build production/offline. Tidak membuka data pengguna,
mengubah schema/dependensi, atau mengaktifkan optimasi baru.
