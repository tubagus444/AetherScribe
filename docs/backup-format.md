# Format Backup dan Pemulihan

Ekspor menggunakan **format v9**. Versi ini independen dari skema IndexedDB
**v35**. Konstanta versi berada di `src/lib/backupFormat.ts`.

## Membaca dan mengonversi arsip portabel

`src/lib/portableBackup.ts` dapat digunakan dari skrip atau browser tanpa
Dexie. `readPortableBackup(blob, scope?)` membaca JSON UTF-8 atau gzip dengan
batas ukuran, memvalidasi record dan relasi, serta memeriksa checksum envelope
dan hash aset yang disertakan. `validatePortableBackup(input, scope?)` melakukan
pemeriksaan yang sama pada objek yang sudah dibaca. Jika `scope` tidak
diberikan, pembaca menggunakan nilai di envelope atau `all` untuk arsip lama
tanpa scope.

`convertPortableBackup(input)` menerima objek dari ekspor mandiri v3–v9.
Konverter memeriksa checksum asli, mengisi tabel legacy yang absen dengan
array kosong, menormalkan record seperti saat restore, dan membuat envelope
v9 dengan checksum baru. Scope, waktu, ID asal, dan metadata sumber
dipertahankan. Gambar inline legacy diberi hash jika belum memilikinya.
Konverter menolak gambar yang hanya bisa diambil dari database asal. Untuk
sumber semacam itu, gunakan ekspor lengkap dari workspace yang memiliki aset.

```ts
import { readBackupFile } from './src/lib/backupIO';
import { convertPortableBackup, serializePortableBackup } from './src/lib/portableBackup';

const input = await readBackupFile(file);
const portable = await convertPortableBackup(input);
const json = serializePortableBackup(portable, 2);
```

Hasilnya dapat disimpan sebagai `.json`, dibaca lagi oleh aplikasi, atau
diproses sebagai JSON oleh importer lain. File dan folder lokal serta Drive
menerapkan batas baca sebelum menerbitkan arsip. Folder dan Drive dapat
menggunakan gzip.

## Scope dan validasi

`restoreData(input)` hanya menerima cadangan seluruh workspace (`scope:'all'`). `importProjectData(input)` hanya menerima `scope:'project'` dengan tepat satu proyek dan menambahkan salinan baru melalui remap ID. UI memvalidasi sebelum konfirmasi; service memvalidasi lagi agar internal/Drive tidak dapat melewati pemeriksaan tersebut.

Schema memeriksa envelope, tipe field inti dan metadata yang dikenal, array, enum, ID positif/unik, kunci unik Bible/kategori/triage, serta referensi proyek, bab, Codex, dan peta. Referensi lintas-proyek ditolak. Metadata JSON tambahan pada record dipertahankan, tetapi tabel yang tidak dikenal, objek non-JSON, siklus, dan kunci prototype berbahaya ditolak. Validasi backup tidak menghapus markup pada teks sumber. Atlas memperlakukan judul marker/nama Codex sebagai teks saat render DOM, termasuk setelah impor (F01; lihat [katalog fitur](features.md)). Konten HTML modul lain mengikuti kebijakan modul masing-masing.

Versi 3–8 tetap dapat dibaca. Scope yang tidak ditulis pada v3–v7 diperlakukan sebagai seluruh workspace. Setelah checksum data asli diverifikasi, tabel opsional yang absen dinormalisasi menjadi array kosong. Normalisasi tidak mengubah input atau checksum aslinya. Versi di luar 3–9 ditolak. Pada v8 dan v9, scope dan `imageMode` wajib. Cadangan penuh mewajibkan tabel sesuai versi. Ekspor per proyek memiliki tabel opsional sesuai cakupannya.

### Sampul Codex di v9

Cadangan lengkap dan ekspor per novel membawa pasangan sampul dan thumbnail
beserta hash. Unduhan dengan sampul memakai gzip jika tersedia. Saat
mengimpor novel, pasangan mengikuti ID entri salinan.
Cadangan otomatis internal memakai referensi hash untuk menghindari duplikasi
gambar. Jika versi gambar yang dirujuk sudah diganti atau dihapus, pemulihan
otomatis itu memerlukan cadangan lengkap. Pemulihan berhenti sebelum mengubah
workspace jika aset yang dibutuhkan tidak tersedia.

Ekspor v8 sejak DB06 menyertakan ID sumber, naskah, dan metadata penulis untuk
bab. `listMetadata` disimpan di IndexedDB sebagai tuple indeks turunan.
Cadangan lama yang membawanya tetap dapat dibaca. Setelah checksum asli cocok,
impor dan restore melepas tuple tersebut. Dexie menghitungnya dari isi dan
metadata bab pada saat insert.

Checksum SHA-256, bila tersedia pada input, wajib cocok; ketidaktersediaan Web Crypto tidak lagi melewati verifikasi. Legacy tanpa checksum masih diterima setelah validasi struktur. Checksum mendeteksi kerusakan, bukan membuktikan asal/kepercayaan suatu file.

Cadangan seluruh workspace mempertahankan snapshot tanpa bab induk di
`data.snapshots`. Field opsional `orphaned: true` menandai bahwa `chapterId`
adalah ID historis. Teks, label, dan waktu tetap utuh. Saat membaca cadangan
lama, aplikasi memeriksa checksum asli sebelum menambahkan penanda untuk
snapshot yang induknya hilang. Snapshot bertanda tidak muncul di riwayat bab
meskipun ID lama dipakai kembali. Untuk mengambil teksnya, periksa field
`content` berdasarkan ID snapshot pada ekspor seluruh workspace.

Impor satu novel tetap mensyaratkan bab induk yang ada di file. Pengecualian
cadangan penuh berlaku khusus untuk relasi bab pada snapshot dan tetap
mewajibkan ID serta struktur record yang valid.

## Aset gambar Atlas

| Jalur | Isi gambar | Kebijakan pemulihan |
|---|---|---|
| File, folder, Drive, ekspor novel | `imageMode:'full'`, `imageDataUrl` dan `imageAssetId` | Gambar didekode tanpa jaringan; identitas hash diperiksa. |
| Auto internal | `imageMode:'references'`, hanya `imageAssetId` | Cocokkan SHA-256 dengan Blob yang masih tersedia di tabel maps; jika tidak ada, batalkan sebelum snapshot/clear. |
| Snapshot pra-restore | `imageMode:'full'` | Gambar lengkap untuk mengembalikan workspace meskipun gambar live telah diganti/dihapus oleh restore. |

`imageAssetId` adalah SHA-256 heksadesimal huruf kecil dari byte UTF-8 string
`imageDataUrl` secara persis, termasuk awalan MIME dan padding base64.
`maps.id` adalah ID record yang dipakai `mapMarkers`. Field khusus backup
dilepas sebelum baris peta dimasukkan ke IndexedDB.

Auto internal sengaja bukan cadangan gambar mandiri. Jika gambar lama sudah tidak tersedia, gunakan file/Drive lengkap. Untuk legacy tanpa hash maupun data URL, restore hanya mempertahankan Blob live dengan `id`, `projectId`, `createdAt`, `width`, dan `height` yang sama; jika tidak cocok, restore dibatalkan. Legacy tidak dapat membuktikan versi historis gambar ketika gambar pernah diganti dengan dimensi sama. Peta yang memang sudah tidak memiliki Blob saat dicadangkan diberi `imageMissing:true`; status tersebut dipertahankan secara eksplisit.

## Record, satuan waktu, dan identitas

Setiap tabel di `data` berisi array record JSON. ID berupa bilangan bulat aman
positif dan unik per tabel dalam satu arsip. Restore workspace mempertahankan
ID. Impor satu novel membuat ID baru dan memetakan ulang referensi. Pada tabel
yang punya `projectId`, referensi mengarah ke record dalam proyek yang sama.
Teks naskah, isi pesan, judul, dan slug kategori dipertahankan sebagai string.

| Record | Isi dan relasi penting |
| --- | --- |
| `projects` dan `chapters` | Proyek, naskah HTML, metadata penulis, dan urutan bab. Bab merujuk ke proyek lewat `projectId`. |
| `snapshots` | Isi historis dan `chapterId`. Pada cadangan penuh, `orphaned:true` menjadikan ID tersebut identitas historis. |
| `codex`, `codexCategories` | Entri dan definisi kategori kustom. `category` memakai slug bawaan atau slug kustom dalam proyek. |
| `codexCovers` | Satu pasangan sampul dan thumbnail per `codexId` di proyek yang sama. Cadangan lengkap menyimpan data URL dan hash untuk kedua varian. |
| `bible`, `aiActions`, `glossary` | Aturan cerita, prompt, dan istilah milik proyek. `bible.key` dan `codexCategories.slug` unik dalam proyek masing-masing. |
| `timeline`, `relationships` | Peristiwa dapat merujuk ke bab dan daftar ID Codex. Relasi merujuk ke dua ID Codex melalui `sourceId` dan `targetId`. |
| `chatSessions`, `plotPromises` | Pesan dan tautan bab aktif, target Workshop `entry:<id>`, serta janji plot dengan referensi bab/Codex opsional. |
| `maps`, `mapMarkers` | Dimensi peta dalam piksel dan gambar inline untuk ekspor lengkap. Penanda memakai koordinat relatif 0–1 dengan `mapId`, `linkedMapId`, dan `codexId` sesuai jenis relasinya. |
| `continuityTriage` | Status temuan kontinuitas. `findingId` unik dalam proyek dan ID yang termuat di dalamnya diremap ketika mengimpor. |

`timestamp`, `createdAt`, `updatedAt`, `lastOpened`, `lastModified`,
`lastMessageAt`, dan waktu pesan memakai milidetik sejak epoch Unix.
`summaryUpdatedAt` menyimpan `lastModified` sumber ringkasan.
`dailyLog` memakai kunci tanggal lokal `YYYY-MM-DD`. Tanggal dunia fiksi
memakai objek `WorldDate` dengan `era` (indeks mulai 0), `year`, `month`,
dan `day` (mulai 1). `eventDate` lama tetap berupa label bebas.
Untuk checksum envelope, gunakan SHA-256 atas UTF-8
`JSON.stringify(envelope.data)` dalam urutan properti yang dibaca dari file.

### Data turunan

- `chapters.listMetadata` dibangun ulang otomatis saat bab disimpan dalam
  proses restore atau impor.
- `embeddings` dibuat kembali oleh worker saat konteks Codex digunakan
  dan model embedding tersedia. Buka proyek dan jalankan fitur AI yang
  menelusuri konteks Codex untuk memicu pembaruan.
- Untuk `sceneEmbeddings`, buka **Cari Adegan** dan klik **Bangun indeks**
  setelah restore atau impor. Gunakan **Perbarui indeks** setelah mengedit.
- `backups`, `errors`, `aiUsageLogs`, dan handle folder tetap lokal sesuai
  [kebijakan tabel](database.md#katalog-tabel-dan-kebijakan-data-db04).

## Urutan restore dan kegagalan

1. Validasi schema, salin input, verifikasi checksum, lalu normalisasi tabel legacy.
2. Dekode gambar lengkap atau resolusi referensi di luar transaksi Dexie.
3. Kumpulkan workspace saat ini dan simpan snapshot pra-restore lengkap. Jika validasi, pembacaan, atau penyimpanan snapshot gagal, batalkan dan tampilkan pesan; jangan clear workspace.
4. Clear/refill tabel domain dalam satu transaksi atomik. Kegagalan insert mengembalikan seluruh perubahan transaksi; snapshot pengaman tetap tersedia. Cache embedding dibuang untuk regenerasi.

Snapshot lengkap memerlukan ruang tambahan. Saat kuota penuh, mekanisme eviksi auto lama tetap berlaku; jika snapshot masih tidak dapat disimpan, restore dibatalkan. Masalah struktur atau relasi lain pada workspace masih dapat membuat snapshot pra-pemulihan gagal validasi.

## Persiapan backup otomatis dan retensi internal

Pengumpulan cadangan menunggu simpan editor, lalu membaca tabel dalam satu
transaksi melalui [`backupSnapshot.ts`](../src/services/backupSnapshot.ts).
Ekspor manuskrip juga membaca snapshot terbaru. Kerjakan pengolahan Blob,
checksum dan kompresi di luar transaksi IndexedDB.

Cadangan otomatis internal besar memakai worker saat Worker, Web Crypto dan
gzip tersedia. `internalBackupPreparation.ts` menyusun data ramping, checksum,
envelope sesuai versi cadangan dan gzip. Gunakan hasil serialisasi data untuk checksum dan envelope
agar data yang sama cukup diserialisasi sekali pada tahap persiapan. Jika worker
gagal mulai, mengirim respons invalid, crash, atau melewati batas waktu,
persiapan beralih ke main thread dengan algoritme yang sama. Jika kompresi
gagal, jalur persiapan dapat menyimpan JSON. Antrean persiapan, simpan, dan
retensi berlaku per tab. Kesalahan penyimpanan diteruskan ke status aplikasi.

Rotasi berjenjang hanya memangkas cadangan otomatis setelah penyimpanan
berhasil. Jika penyimpanan gagal karena kuota, buang cadangan otomatis tertua
yang boleh dieviksikan lalu coba lagi. Seluruh cadangan pengaman pra-restore
dan cadangan otomatis terbaru dilindungi. Laporkan kegagalan jika tidak ada
cadangan yang aman dibuang. [Bukti dan batas integrasi L06](reports/audits/2026-11-15-l06-backup-integration.md)

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

Tes Chromium menggunakan unduhan JSON dari UI dan profil kosong untuk
membandingkan naskah, referensi, serta byte gambar. Akun Drive nyata dan file
novel pengguna berada di luar verifikasi lokal. Fixture legacy menggunakan
data sintetis yang mewakili versi envelope.

## Retensi Drive (F20)

Unggah dahulu, pastikan HTTP sukses dan response memuat ID file; baru jalankan retensi. Upload gagal/network error/response tanpa ID tidak menghapus backup lama. Kegagalan prune dicatat terpisah dan ditampilkan sebagai warning pada sinkronisasi manual, tanpa mengubah sukses upload. Verifikasi ini memakai respons Drive, bukan unduh ulang dan pembandingan hash berkas remote.

## Round-trip F10

Triage yang ikut ekspor dipulihkan dengan projectId/primary key baru. gap-/unused- memetakan Codex, rel- memetakan relasi, tl- dan chrono-invalid-range-/same-chapter-/retro-chap- memetakan timeline. Format rel-source-target legacy ditangani sebagai pasangan Codex. Target yang tidak tersedia berarti status basi dan tidak diimpor; format asing ditolak agar tidak menerapkan status ke temuan yang keliru.

Kunci Workshop `entry:<id>` harus menunjuk ke entri Codex di proyek yang sama.
Penulisan dan remap impor menormalkan bentuk lama seperti `entry:01`. Validasi
berkas memeriksa sintaks dan target sebelum konfirmasi impor. Jika workspace lama
memiliki rujukan ke entri yang sudah dihapus, ekspor menyimpan salinan sesi sebagai
chat Studio dengan pesan lengkap. Pemulihan workspace dari cadangan penuh lama
menerapkan aturan yang sama setelah memeriksa checksum asli. Kunci `new:<seed>`
dan teks pesan tetap literal.

## Detail tambahan Codex

Detail tambahan Codex ikut dalam cadangan penuh dan ekspor per novel bersama
izin AI dan catatan per bab. Pemulihan penuh mempertahankan ID. Impor novel
memetakan `codex.details[].revisions[].chapterId` ke ID bab di salinan proyek.
Catatan dengan `detachedChapterTitle` disimpan tanpa tautan bab. Arsip lama
dapat tidak memuat `details`. Ekspor Markdown Codex tidak memuat detail ini.
