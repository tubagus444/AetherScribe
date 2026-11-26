# Katalog Fitur — AetherScribe

Referensi fitur AetherScribe, file implementasi, tabel database, dan kontrak teknis.

---

## Editor Manuskrip (TipTap 3)
- **Deskripsi:** Editor kaya fitur berbasis TipTap 3 yang dioptimalkan untuk penulisan novel panjang dengan penghitung kata langsung, mode fokus, dan jaring pengaman autosave anti kehilangan data.
- **File terkait:** `src/features/editor/components/NovelEditor.tsx`, `src/features/editor/components/EditorToolbar.tsx`, `src/features/editor/hooks/useEditorSave.ts`, `src/features/editor/editorBridge.ts`, `src/hooks/useGlobalEvents.ts`
- **Tabel DB:** `chapters`, `snapshots`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Seluruh paket `@tiptap/*` WAJIB dipin tepat ke versi `3.22.5`. Autosave memakai debounce 1,5 detik; flush membaca HTML terbaru termasuk konten kosong. `flushActiveEditor(): Promise<void>` hanya resolve setelah update tepat satu bab, dan reject pada error DB, ID invalid, atau update nol baris. Tanpa editor aktif, flush tetap no-op.
- **Penanganan gagal simpan (F05):** Status menjadi `Gagal menyimpan`, draft tetap di editor, dan reload melalui bridge ditolak sampai save berhasil. Find & Replace membatalkan penggantian/snapshot/reload ketika flush gagal; klik ulang mencoba flush lagi. Edit berikutnya juga mencoba autosave kembali. Timer status sukses sebelumnya tidak boleh menghapus pesan kegagalan. Rejection autosave dan lifecycle ditangani agar tidak menjadi unhandled rejection.
- **Lifecycle:** `pagehide` dan `visibilitychange` mencoba flush, tetapi penyelesaian IndexedDB saat browser menutup halaman tidak dijamin. Pembaruan skema dari koneksi lain hanya menutup DB dan memuat ulang setelah flush sukses; kegagalan mempertahankan tab/koneksi dan menampilkan pesan. Menutup paksa tab setelah save gagal tetap dapat menghilangkan draft yang hanya ada di memori.
- **Verifikasi F05:** Tes hook, Find & Replace, dan penanganan versi memakai fixture terisolasi. Skenario simpan, retry dan perilaku antartab tercantum di [panduan pengujian](testing.md#inventaris-alur-kritis).

---

## Kontrak editor dan analitik naskah

- Undo dan Redo tetap tersedia saat kembali ke Editor pada bab yang sama.
  Riwayat berlaku selama sesi halaman untuk bab aktif. Riwayat dimulai ulang
  saat mengganti bab atau proyek, memuat ulang halaman, atau kembali setelah
  isi bab di penyimpanan berubah dari panel lain.

- Heading 1–3 di naskah tampil lebih ringkas pada layar sempit dan lebar,
  dengan ukuran yang berbeda untuk tiap level.
- Menu seleksi mengambang menjaga jarak dari seluruh blok teks. Menu dipasang
  di atas seleksi jika muat, atau di bawahnya saat ruang di atas terbatas.
  Jika ruang di kedua sisi terlalu sempit, bilah aksi muncul kembali setelah editor digulir.
- Pertahankan draf ketika simpan gagal. Transisi yang memerlukan simpan
  menunggu flush, termasuk perpindahan panel atau bab dan pengambilan
  snapshot cadangan. [Perlindungan dan pengujian simpan](testing.md#inventaris-alur-kritis)
- Peta Kontinuitas, Lensa Karakter, Janji Plot, dan Atlas berbagi
  `PresenceIndex`. Gunakan `buildPresenceIndexAsync` untuk scan on-demand dan
  `usePresenceIndex` untuk hitung ulang otomatis. Fungsi murni `buildPresenceIndex`
  dipakai oleh worker dan tes.
- `ConsistencyUnderline` menggabungkan kutipan AI, Buku Gaya, dan Glosarium. Temuan AI berasal dari cache per paragraf dan bab. Jaga
  invalidasi saat teks berubah, batas cache, dan kunci pembatalan inline.
- Metrik prosa berbagi `proseAnalysis.ts` dan `pacingHeatmap.ts`. Jika
  `Chapter.tension` kosong, tampilkan perkiraan tanpa menyimpannya. Janji
  Plot memakai entri yang dideklarasikan penulis, lalu menurunkan status
  kemunculan lewat `plotPromises.ts`.

## Manajemen Bab & Papan Babak (Kanban Act)
- **F11:** Penghapusan pada ChapterList dan papan outline memakai service domain yang sama. Snapshot/indeks bab ikut dihapus; timeline, chat dan janji plot tetap ada dengan tautan bab dilepas. Urutan sisa bab tetap dinormalisasi atomik. Penghapusan peta, Codex, dan proyek juga memakai `entityDeletion.ts`; kebijakan retensi/unlink lengkap ada di [database](database.md).
- **Perbaikan F06:** ChapterList memakai tipe metadata tanpa content. Duplikasi melakukan flush editor sebelum membaca entitas lengkap dari DB, menyalin HTML/metadata ke ID baru dan menempatkannya sesudah sumber. Operasi daftar memakai `chapterOperations.ts`: urutan awal order lalu ID, dinormalisasi 0..N-1 dalam transaksi pada tambah/hapus/duplikasi/perpindahan. Kegagalan transaksi rollback; kegagalan flush membatalkan duplikasi dan ditampilkan melalui toast. Relasi/snapshot/chat bab tidak ikut digandakan; cleanup referensi saat delete ditangani service F11.
- **Deskripsi:** Pengorganisasian bab naskah dengan drag-and-drop reordering, penetapan status draf, target kata per bab, dan visualisasi babak naratif (Act I, II-A, II-B, III).
- **File terkait:** `src/features/chapters/components/OutlinePanel.tsx`, `src/features/chapters/components/ChapterList.tsx`, `src/features/chapters/hooks/useChapters.ts`
- **Tabel DB:** `chapters`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Field `act` menumpang objek `Chapter` sebagai field JSON inert (non-indeks) sehingga tidak memerlukan migrasi tabel baru.

---

## Story Bible & Aturan Dunia
- **Deskripsi:** Tempat mendeklarasikan aturan kanon novel (Tone, Genre, Aturan Sihir, Larangan Narasi) yang otomatis diumpankan ke AI sebagai pondasi pengetahuan stabil.
- **File terkait:** `src/features/lore/components/BiblePanel.tsx`, `src/lib/storyBible.ts`
- **Tabel DB:** `bible`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Blok Story Bible diumpankan via `cachedContext` terpisah pada prompt caching AI agar perbaikan pada teks bab tidak membatalkan cache instruksi Bible.

---

## Catatan Novel dan sidebar editor

Panel **Menulis → Catatan** menampilkan catatan proyek dengan pencarian judul
atau isi, filter bab dan tag, serta arsip. Formulir menyediakan pilihan tag
yang sudah ada dalam novel dan kolom untuk mengetik tag baru. Catatan boleh
tanpa tautan bab.
Di sidebar editor, **Catatan Bab** menampilkan catatan aktif yang terkait
bab saat ini. **Pilih semua bab saat ini** menyimpan pilihan bab pada saat
aksi dilakukan. **Catatan Teks** masih dibuat melalui seleksi di naskah.
Catatan Novel disimpan di luar konten naskah.

Panel **Codex di Bab Ini** memindai isi editor melalui worker menggunakan
nama dan alias entri Codex yang terlihat. Klik nama entitas untuk membaca
deskripsi, alias, dan detailnya langsung di sidebar editor. Semua penyebutan
yang cocok secara pasti disorot di bab aktif. **Lihat di naskah** dan
tombol panah berpindah antarpenyebutan. Pada layar sempit, panel meringkas
ke tepi bawah saat penulis melihat naskah. Kembali ke daftar atau tutup panel
untuk menghapus sorotan sementara. Alias yang cocok dengan beberapa entri
tetap tampil di daftar penyebutan ambigu. Cuplikan dalam daftar memilih
teks sumber.

## Codex & Ensiklopedia Lore
- **Deskripsi:** Ensiklopedia komprehensif untuk mencatat karakter, tempat, item, sihir, dan lore dengan dukungan alias multi-kata untuk deteksi teks instan.
- **File terkait:** `src/features/codex/components/CodexPanel.tsx`, `src/features/codex/components/CodexDetailModal.tsx`, `src/features/codex/components/CodexForm.tsx`, `src/lib/codexKeywords.ts`
- **Tabel DB:** `codex`, `codexCategories`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Multi-entry index `*aliases` di Dexie memungkinkan pencarian cepat. Ekstraksi kata kunci untuk Aho-Corasick disatukan di `src/lib/codexKeywords.ts`.

---

## Kategori Kustom & Field Template Codex
- **Deskripsi:** Pembuat kategori entri fleksibel (misal: Bestiari, Artefak) dengan template field terstruktur (teks, angka, select) yang otomatis ter-denormalisasi.
- **File terkait:** `src/lib/codexFields.ts`, `src/lib/codexCategories.ts`, `src/features/codex/components/CategoryManagerModal.tsx`
- **Tabel DB:** `codexCategories`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Nilai field disimpan di `CodexEntry.customFields` dengan snapshot `label` agar jalur baca (ekspor & AI) mandiri tanpa perlu join tabel.
- Menghapus kolom dari templat atau memindahkan entri ke kategori lain
  mempertahankan nilai lama. Formulir menampilkannya di **Detail dari templat
  sebelumnya** dan menyediakan aksi hapus per nilai yang berlaku saat disimpan.
- Dialog Kelola Kategori tampil di atas navigasi aplikasi. Pada desktop,
  formulir ada di kiri, kategori bawaan dan kustom di kanan. Daftar kustom
  memiliki area gulir sendiri. Pada layar sempit, isi ditumpuk dalam satu area
  gulir dengan judul dan tombol tutup tetap terlihat.

---

## Kontrak Codex dan graf lore

- Formulir Codex memisahkan alias dan tag berdasarkan koma saat entri
  disimpan. Spasi di dalam nilai dipertahankan dan bagian kosong diabaikan.
- Pada proyek dengan Kalender Dunia, formulir karakter memuat tanggal lahir
  yang tersimpan. Penulis dapat menetapkan, mengubah, atau menghapusnya.
  Perubahan berlaku setelah entri disimpan.

- Entri dapat memuat satu sampul gambar JPG, PNG, atau WebP. Gambar lokal
  diperkecil hingga 1200 piksel pada sisi terpanjang dan 96 KiB. Daftar hanya
  membaca thumbnail hingga 192 piksel dan 12 KiB. Sampul yang lebih besar
  baru dibaca saat tombol **Lihat sampul** dibuka di dialog. Formulir entri
  mengunggah, mengganti, atau menghapus sampul. Gambar digunakan sebagai
  referensi visual lokal.

- Judul, aksi, filter, formulir, dan daftar entri berbagi area gulir di
  bawah navigasi studio. Jumlah kolom mengikuti lebar panel. Virtualisasi
  mengukur tinggi per baris sehingga kartu dengan isi berbeda dapat
  menyesuaikan tingginya. Tombol Asisten AI berada di deretan aksi Codex.
  Indikator pengindeksan aktif mendapat ruang di bawah panel.
- Kartu menampilkan pratinjau hingga tiga alias dan tiga tag. Dialog detail
  menampilkan daftar lengkap di atas navigasi aplikasi. Entri ringkas
  memakai satu kolom dan tinggi mengikuti tab aktif. Bagian detail
  muncul jika berisi sesuatu. Di layar lebar, entri dengan cukup isi
  di kedua bagian menampilkan deskripsi dan identitas di kiri dan detail
  di kanan. Tata letak ini berlaku dari Codex dan Graf Lore.
  Deskripsi, nilai detail, dan riwayat yang panjang memiliki area gulir
  sendiri. Di layar sempit, kedua bagian ditumpuk. Judul dan tombol tutup
  tetap terlihat saat membaca entri.
  Bilah gulir dialog disembunyikan. Di layar lebar, alias, tag, dan tanggal
  lahir tampil di atas deskripsi agar teks bisa mengisi kolom sampai bawah.
  Tab **Keterkaitan** memuat Hubungan, Kemunculan, dan Disebut oleh. Beralih
  tab mempertahankan posisi baca deskripsi dan field.
- **Cek Kemunculan di Chapter** pada kartu membuka tab **Keterkaitan**,
  langsung menuju bagian **Kemunculan**, dan mencari bab secara otomatis.
  Pilih judul hasil untuk membuka bab di editor.
- Label kategori dan tag yang dipilih pada filter dapat tampil dalam beberapa
  baris. Kontrol memakai pilihan bawaan browser dan bisa digunakan lewat papan ketik.
- Di formulir entri, **Tambah detail** menambahkan kolom dengan nama dan
  nilai pilihan penulis. Detail dapat menyimpan satu nilai atau nilai awal
  beserta satu catatan per bab. Ringkasan mengambil nilai terakhir menurut
  urutan naskah, dan tampilan detail menyediakan riwayat yang bisa dibuka.
  **Sertakan dalam konteks AI** dinonaktifkan saat detail dibuat. Jika
  diaktifkan, AI memakai nilai yang berlaku di bab aktif. Audit batch dan
  audit Codex mendalam dapat memakai riwayat sesuai anggaran konteks.
- Gunakan `useCodexCategories`, `getCategoryDef`, dan `CategoryIcon` untuk
  kategori per proyek. Nilai field kustom menyimpan label saat entri
  disimpan agar format AI dan ekspor dapat membaca entri secara mandiri.
  Gunakan `codexFields.ts` pada form, tampilan, AI, dan ekspor.
- Pertahankan daftar Codex khusus highlight dan mention yang menyaring
  entri `hidden`. Konsistensi dan konteks AI memakai data lengkap sesuai
  kebijakan provider. Ekspor Markdown menyaring `hidden` secara default
  dan selalu mengecualikan `secret`.
- Nama dari Bengkel Nama dapat ditambahkan sebagai alias. `namePalette`,
  `worldStatus`, dan `todo` adalah metadata alur kerja yang ikut
  cadangan. Saran kelengkapan dihitung saat dibaca dan tidak dipersist.
- Kembangkan derivasi graf di `loreGraph.ts` dan jalankan graf visual
  melalui worker. `LoreGraphPanel` memakai `graph2ScreenCoords` untuk
  klik dan hover. Hit-test bawaan pernah hanya menjangkau satu node
  pada render kanvas kustom. Pertahankan callback ref untuk memasang
  observer ukuran ketika kanvas muncul setelah data termuat.
- Workshop memakai `chatSessions.kind = 'workshop'` dan kunci per target
  untuk melanjutkan diskusi. Parsing dan penyembunyian blok draf
  ditangani `codexDraft.ts`. Simpan entri lewat aksi pengguna dan
  pertahankan instruksi tambahan Workshop di luar cache pengetahuan.

## Hubungan Karakter & Entitas (Relationship Mapper)
- **Deskripsi:** Pemetaan jejaring hubungan sosial dan politik antar entitas Codex (Musuh, Keluarga, Sekutu, Bawahan) yang dapat dianalisis oleh AI.
- **File terkait:** `src/features/lore/components/RelationshipMapper.tsx`, `src/features/codex/relationshipTypes.ts`, `src/lib/loreFormat.ts`
- **Tabel DB:** `relationships`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Format hubungan diubah menjadi graf teks ringkas oleh `buildRelationshipGraph` saat diumpankan ke prompt AI.

---

## Kebenaran Tersembunyi (Hidden Truth & Secrets)
- **Deskripsi:** Fitur pemisah antara kanon publik dan rahasia penulis; entri atau catatan bertanda rahasia disuntikkan ke AI untuk pencegahan kebocoran plot namun disaring dari ekspor pembaca.
- **File terkait:** `src/features/codex/components/CodexForm.tsx`, `src/lib/loreFormat.ts`
- **Tabel DB:** `codex` (`hidden`, `secret`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Entri berstatus `hidden` tidak muncul di highlight editor pembaca dan ekspor buku, namun disaring secara khusus ke dalam Knowledge Base AI.

---

<a id="pelacak-janji-plot-chekhovs-gun--rekomendasi-kata-kunci"></a>

## Janji Plot (Chekhov's Gun & Payoff)
- **Deskripsi:** Pelacak janji naratif yang ditanam di awal cerita (ramalan, senjata, rahasia) dan verifikasi apakah janji tersebut telah terbayar (payoff/reveal) di bab tertentu.
- **File terkait:** `src/features/consistency/components/PlotPromisePanel.tsx`, `src/lib/plotPromises.ts`
- **Tabel DB:** `plotPromises`, `chapters`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Pelacakan kemunculan bekerja secara deterministik nol-token menggunakan `PresenceIndex`. Kata kunci non-Codex dicari dengan Aho-Corasick. `extractKeywordCandidates` menyarankan frasa kapital, istilah penting, dan istilah glosarium dari judul/deskripsi. Penulis dapat menautkan `payoffCodexId` ke entri rahasia.

---

Dari detail rahasia Codex, penulis dapat meminta AI menyarankan petunjuk pertama atau berikutnya berdasarkan seluruh janji yang menunjuk rahasia itu. Bab penanaman mengikuti urutan baca. Pilihan membuka formulir yang bisa disunting, dan Catat menyimpan kait ke rahasia.

## Bengkel Nama (Name Forge)
- **Deskripsi:** Generator nama karakter dan faksi berbasis fonotaktik (konsonan/vokal) dan morfem leksikal kustom per kelompok faksi.
- **File terkait:** `src/features/codex/components/NameForgeModal.tsx`, `src/lib/nameForge.ts`
- **Tabel DB:** `codex` (`namePalette`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Logika peracikan nama sepenuhnya deterministik di `nameForge.ts` (+13 tes) tanpa membutuhkan panggilan API LLM.

---

<a id="glosarium-istilah-in-world--mode-strictmatch"></a>

## Glosarium Istilah In-World
- **Deskripsi:** Kamus istilah dunia fiksi non-nama (satuan, gelar, istilah sihir) dengan deteksi salah-eja otomatis di editor yang ditandai garis bawah teal.
- **File terkait:** `src/features/consistency/components/GlossaryPanel.tsx`, `src/lib/glossary.ts`, `src/features/editor/extensions/ConsistencyUnderline.ts`
- **Tabel DB:** `glossary`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Algoritma mencakup pencocokan varian salah yang dideklarasikan serta deteksi kesalahan ketik serupa dengan jarak Levenshtein. Mode `strictMatch` mencocokkan varian dengan memperhatikan kapitalisasi dan mengecualikan entri dari deteksi typo berbasis kemiripan.

---

## Peta Kontinuitas (Continuity Dashboard & Triase)
- **Deskripsi:** Dasbor audit konsistensi naskah komprehensif yang memvalidasi kemunculan karakter, urutan waktu linimasa, janji plot tertidur, dan entitas yatim piatu.
- **File terkait:** `src/features/consistency/components/ContinuityDashboard.tsx`, `src/lib/continuity.ts`, `src/hooks/usePresenceIndex.ts`
- **Tabel DB:** `continuityTriage`, `chapters`, `codex`, `timeline`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Pemindaian naskah didelegasikan ke Web Worker (`buildPresenceIndexAsync`). Penulis dapat menyembunyikan temuan yang disengaja via tabel `continuityTriage`.

---

## Lensa Karakter (Character Arc)
- **Deskripsi:** Visualisasi frekuensi kemunculan karakter di sepanjang bab, sebaran adegan bersama antar tokoh, dan audit sudut pandang (POV).
- **File terkait:** `src/features/consistency/components/CharacterArcPanel.tsx`, `src/lib/characterArc.ts`
- **Tabel DB:** `chapters`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Menggunakan hasil komputasi bersama `PresenceIndex` untuk efisiensi pemrosesan naskah tebal.

---

## Kalender Dunia (World Calendar & Era)
- **Deskripsi:** Sistem penanggalan in-world multi-era dengan kustomisasi jumlah hari per bulan, nama hari per minggu, pita musim, festival/hari libur tahunan berulang (*recurring holidays*), pelacak usia karakter dinamis (*dynamic age tracker*), navigasi visual tahunan (*bird's-eye heatmap view*), kalkulator selisih & durasi perjalanan berbagai moda, serta deteksi deterministik anomali urutan tanggal mundur antar-bab.
- **File terkait:** `src/features/timeline/components/WorldCalendarPanel.tsx`, `src/lib/worldCalendar.ts`, `src/lib/chronologyAudit.ts`, `src/features/timeline/components/CalendarCalculatorModal.tsx`, `src/features/timeline/components/ChronologyAuditModal.tsx`, `src/features/timeline/components/CalendarEditorModal.tsx`, `src/features/timeline/components/CalendarEventModal.tsx`, `src/features/codex/components/CodexForm.tsx`, `src/features/codex/components/CodexDetailModal.tsx`
- **Tabel DB:** `projects` (`calendar`), `timeline` (`startDate`, `endDate`), `codex` (`birthDate`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Kronologi ditentukan oleh urutan array `eras` di mana tiap era mulai dari Tahun 1. Tautan karakter menggunakan ulang field `characterIds` tanpa FK baru. Menggunakan meta-pola field inert JSON sehingga penambahan `holidays` pada kalender dan `birthDate` pada Codex bekerja tanpa migrasi skema Dexie. Perhitungan usia karakter (`calculateCharacterAge`) dan hari libur (`holidaysOnDate`) berjalan murni deterministik di client-side (0 token AI). Tampilan tahunan (Heatmap View) memetakan ritme pacing seluruh bulan dalam setahun dengan navigasi zoom 1-klik ke tampilan bulan dan kartu detail. Antarmuka menggunakan arsitektur 2-kolom bersih: Kalender lega di sisi kiri dan Panel Samping Terpadu (*Collapsible Inspector*) di sisi kanan dengan tab "Detail Tanggal" & "Agenda/Cari" yang dapat disembunyikan kapan saja untuk memaksimalkan ruang pandang. Seluruh modal pop up (Kalkulator, Audit, Editor, Peristiwa) menggunakan `createPortal` ke `document.body` dengan pembatas ketinggian responsif (`max-h-[85vh]` dan `my-auto`) sehingga tidak terpotong atau tertutup oleh header atas aplikasi, serta disempurnakan pewarnaan tema gelapnya (*dark mode*) agar kontras dan serasi.

---

## Timeline Cerita
Linimasa menampilkan peristiwa menurut tanggal dunia cerita. Gunakan **Lihat seluruh linimasa** untuk merangkum seluruh periode, lalu pilih periode atau tanggal untuk membaca detail. Saat panel dibuka, semua tanggal tersusun dari kiri ke kanan. Gunakan roda mouse di atas garis waktu, seret, tekan panah geser, atau usap di ponsel. Panah dinonaktifkan saat mencapai ujung. Filter bab dan periode berada dalam satu kelompok. Pilih **Telusuri linimasa** untuk kembali dari ringkasan ke deretan tanggal. Tanggal yang sama berbagi satu titik. Kartu dan titik terpilih ditandai saat detail terbuka. Tutup detail untuk melanjutkan dari posisi gulir yang sama. Gunakan Naik/Turun dalam detail hari untuk mengurutkan kejadian.

**Tambah peristiwa** di Linimasa, aksi tanggal di Kalender, dan **Catat ke Linimasa** pada seleksi teks editor membuka formulir yang sama. Nama wajib; penjelasan, tanggal atau rentang, bab, dan entitas Codex lintas kategori opsional. Seleksi editor mengisi judul dan bab. Tanpa kalender, simpan dulu di **Belum bertanggal** atau atur kalender melalui formulir. Label waktu bebas dari data lama tetap tersedia. Tautan bab menunjukkan tempat peristiwa diceritakan dan tidak menentukan kemunculan pertama karakter.

---

## Kontrak Linimasa dan kalender

Kalender dan Timeline Cerita berbagi tabel `timeline`. Tanggal terstruktur
disimpan di `startDate` dan `endDate`, catatan bebas di `eventDate`.
Event tanpa tanggal terstruktur tetap tampil di Timeline Cerita. Gunakan
`characterIds` untuk referensi Codex dan pertahankan remap saat impor.

Gunakan `worldCalendar.ts` untuk pengurutan, format, offset hari, rentang
musim, dan selisih tanggal. Indeks era berbasis nol, bulan dan hari berbasis
satu, dan hitung selisih hanya dalam satu era. Analitik konsistensi yang
berbasis urutan bab memakai `chapterId` dan `characterIds`.

## Atlas Dunia (Peta Interaktif Leaflet)
- **Deskripsi:** Kanvas peta interaktif berbasis Leaflet CRS.Simple untuk mengunggah peta, menandai pin, poligon batas wilayah, rute perjalanan, kalibrasi skala jarak, deteksi wilayah yatim, dan navigasi sub-peta bertingkat.
- **File terkait:** `src/features/atlas/components/AtlasPanel.tsx`, `src/features/atlas/components/MapCanvas.tsx`, `src/features/atlas/components/atlasMarkerIcons.ts`, `src/lib/atlasColors.ts`, `src/lib/mapGeometry.ts`, `src/lib/atlasAnalytics.ts`, `src/lib/atlasHierarchy.ts`
- **Tabel DB:** `maps`, `mapMarkers`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Menggunakan Leaflet murni (bukan wrapper React). Koordinat disimpan dalam rasio relatif 0–1. File/Drive/ekspor novel dan snapshot pra-restore menyertakan gambar lengkap. Auto internal v8 menyimpan referensi SHA-256 untuk mencocokkan gambar live, bukan menghapus Blob saat restore; referensi yang tidak tersedia membatalkan pemulihan. Kebijakan legacy dan batasnya dijelaskan di [format backup](backup-format.md).
- **Keamanan label (F01, 13 November 2026):** Ikon dibangun lewat DOM; judul marker dan nama Codex dimasukkan dengan `textContent`. Tooltip dinamis diberikan ke Leaflet sebagai HTMLElement, sehingga markup dari data tersimpan/impor tampil harfiah. SVG dekoratif hanya memakai atribut konstan. Nilai data tidak diinterpolasi ke string HTML.
- **Warna:** Hanya hex `#RGB`/`#RRGGBB` (case-insensitive) diterima. Override invalid diabaikan dan resolver melanjutkan ke warna faksi/kategori/jenis. Boundary render, termasuk SVG path dan handle edit, memvalidasi lagi; callback warna invalid memakai fallback `#64748b`. Data sumber tetap disimpan tanpa perubahan.
- **Verifikasi F01:** Tes Leaflet di jsdom memeriksa label, tooltip, warna, handle edit, dan interaksi klik. Verifikasi F28.5 juga menguji label yang berisi markup di Chromium. [Cakupan pengujian](testing.md#inventaris-alur-kritis)

---

## Kontrak Atlas

- Klik penanda membuka detail. Klik ruang kosong, Esc dalam mode lihat,
  atau Tutup Detail melepas seleksi dan membuka Daftar Wilayah. Esc saat
  mengedit geometri mengakhiri mode edit; Esc saat menggambar mengosongkan draf.
- Pusatkan di peta menggeser kamera ke penanda terpilih. Seleksi baru
  menggeser kamera otomatis hanya jika penanda berada di luar tampilan.
- Kepala panel detail tetap terlihat saat isi digulir. Wilayah
  mengutamakan isi wilayah, rute menampilkan tempat singgah dan informasi
  perjalanan, dan pin menampilkan ringkasan Codex serta rute terhubung.
  Tautan Codex, sub-peta, judul, catatan, warna, dan aksi hapus tersedia
  di Pengaturan penanda.

- Pakai konversi `mapGeometry.ts` antara koordinat ternormalisasi 0–1
  dan Leaflet `CRS.Simple`. Sumbu Y gambar dan lintang bergerak berlawanan.
  Pertahankan callback/data terbaru pada listener imperatif melalui ref.
- Samakan `selectedMapId` dengan peta aktif untuk query penanda. Edit
  geometri memakai layer terpisah dan disimpan saat drag selesai atau
  struktur berubah. Pertahankan batas minimum tiga vertex area dan dua
  vertex rute.
- Rute tersimpan menampilkan titik awal dan titik akhir. Titik antara tampil
  secara bawaan pada rute lurus dan bisa diatur melalui detail rute.
  Rute terpilih menomori titik yang terlihat sesuai urutan. Saat menggambar rute, opsi
  Lurus dan Melengkung memperbarui pratinjau; Hapus titik terakhir atau
  Backspace membatalkan satu titik. Kurva membutuhkan minimal tiga titik.
- Simpan pilihan bentuk rute di `meta.routeStyle`. Rute lama menggunakan
  bentuk lurus. Pratinjau, render, edit, dan kalkulator jarak/waktu memakai
  sampel lintasan yang sama, sedangkan `geometry` menyimpan titik asli.
  `meta.showIntermediatePoints` mengatur tampilan titik antara. Mode edit
  tetap menampilkan semua titik pembentuk rute.
- Di Ubah posisi/bentuk, pilih titik di peta atau di daftar untuk mengatur
  visibilitas dan nama, lalu tautkan ke entri Codex atau pin pada peta yang
  sama. Titik tertaut mengikuti pin dan memakai tautan Codex dari pin.
  Detail rute menampilkan tempat singgah berurutan. Detail pin menampilkan
  rute terhubung dan posisi pin pada rute tersebut.
- Area memiliki pilihan Bentuk batas Lurus dan Melengkung. Pratinjau
  menutup batas setelah tiga titik. Tombol Hapus titik terakhir atau
  Backspace membatalkan satu titik draf. Pada batas melengkung, gunakan
  Sudut tegas di titik terakhir saat menggambar, atau pilih titik batas
  di mode Ubah posisi/bentuk dan aktifkan Sudut tegas.
- Shift+klik pada titik batas mengubah sudutnya. Selama menggambar atau
  mengedit area, Atlas memakai gestur Shift untuk penyuntingan titik.
  Dobel-klik biasa menyelesaikan draf area.
- Gunakan sampel batas tertutup dari `sampleAreaBoundary` pada pratinjau
  draf, edit, render Leaflet, dan analitik pin di dalam wilayah. Worker
  menandai persilangan pertama pada pratinjau. `meta.areaStyle` menyimpan
  bentuk batas, dan `geometry[].sharp` menyimpan sudut tegas.
- Detail area menampilkan nama pin di dalam batas dan kawasan yang seluruh
  batasnya tercakup pada peta yang sama. Klik nama penanda untuk membuka
  detailnya. Daftar wilayah memakai batas yang terlihat, termasuk area
  cekung dan melengkung. Aktivitas di Wilayah Ini menampilkan bab terkait.
- Lokasi penting menautkan pin pada peta yang sama dengan satu peran
  buatan penulis. Peran juga muncul pada daftar pin di dalam wilayah.
  Jika pin berada di luar batas, detail menandainya Di luar batas.
- Bentuk label/tooltip Leaflet sebagai DOM dengan `textContent`. Validasi
  warna dengan allowlist Atlas pada resolusi dan render, termasuk handle
  edit. Gunakan pengolahan raster yang ada untuk upload dan backup gambar.
- `useAtlasSelection` mengelola seleksi dan mode edit, `useAtlasFilters`
  mengelola filter, dan `useAtlas` memasok live query. Penghapusan peta
  mengikuti layanan domain, termasuk pelepasan portal. Gunakan
  `usePresenceIndex` untuk kemunculan bab dan `openCodexEntry` untuk deep-link.
  [Arsitektur Atlas](architecture.md#pemisahan-atlas-f285) ·
  [Aset cadangan](backup-format.md#aset-gambar-atlas)

## Papan & Hubungan Faksi (React Flow)
- **Deskripsi:** Visualisasi hierarki dan relasi politik antar kelompok faksi di kanvas interaktif React Flow dengan pewarnaan otomatis dan pemetaan wilayah.
- **File terkait:** `src/features/lore/components/FactionsPanel.tsx`, `src/features/lore/components/FactionBoardCanvas.tsx`, `src/lib/factions.ts`
- **Tabel DB:** `codex` (`factionTag`, `factionBoard`), `relationships`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** ⚠️ Pewarnaan garis edge React Flow WAJIB menggunakan inline `style: { stroke: ... }`, bukan atribut `stroke`.

---

## Kontrak Story Bible, relasi, dan faksi

- Gunakan `storyBible.ts` untuk label slug dan format prompt, termasuk
  batas per bidang. Sinkronisasi dari database perlu menghormati edit
  yang tertunda. Draf AI baru disimpan lewat aksi pengguna.
- Label dan arah hubungan berasal dari `relationshipTypes.ts`. Gunakan
  tabel relasi yang ada dan turunkan keanggotaan faksi dari tag Codex.
- Komputasi tampilan faksi memakai `factions.ts`, termasuk
  `buildFactionBoard`. React Flow mengelola posisi selama drag dan
  menyimpan posisi pada `onNodeDragStop`. Di `FloatingEdge`, terapkan
  warna dengan inline `style: { stroke: color }` agar CSS bawaan React
  Flow tidak menimpa warna.

## Heatmap Tensi & Pacing
- **Deskripsi:** Grafik heatmap visual untuk memantau ritme ketegangan cerita bab demi bab, membandingkan tensi deklarasi penulis dengan estimasi rasio dialog otomatis.
- **File terkait:** `src/features/consistency/components/PacingHeatmapPanel.tsx`, `src/lib/pacingHeatmap.ts`
- **Tabel DB:** `chapters` (`tension`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Estimasi otomatis `estimateTension` diturunkan dari rasio dialog terhadap narasi dan rata-rata panjang kalimat secara deterministik.

---

## Graf Lore Visual Interaktif (Force Graph)
- **Deskripsi:** Graf jaringan fisika interaktif yang memvisualisasikan bagaimana setiap karakter, faksi, lokasi, dan item saling terhubung di dalam cerita.
- Klik node membuka dialog detail di atas graf, termasuk deskripsi, detail, dan keterkaitan. Menutup dialog mengembalikan fokus ke graf dengan posisi kanvas dan filter yang sama. Tombol **Buka di Codex** membuka entri untuk dikelola.
- **Cari node** memakai nama dan alias dari proyek aktif. Pilih hasil untuk memusatkan kamera dan menyorot node. Jika filter menyembunyikannya, **Tampilkan di graf** menampilkan node itu sementara sambil mempertahankan filter.
- **Fokus hubungan langsung** menampilkan node terpilih dan tetangga yang terhubung melalui tautan yang lolos filter. **Kembali ke graf** memulihkan posisi dan zoom kamera sebelumnya.
- **File terkait:** `src/features/codex/components/LoreGraphPanel.tsx`, `src/lib/loreGraph.ts`, `src/workers/loreGraphWorker.ts`
- **Tabel DB:** `codex`, `relationships`, `plotPromises`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** ⚠️ Hit-test hover dan klik node dilakukan secara manual via koordinat kanvas matematis, JANGAN menggunakan API hit-test bawaan force-graph yang rawan bug.

---

## Pelacak Kelengkapan Worldbuilding
- **Deskripsi:** Dasbor manajemen mutu worldbuilding yang menampilkan tingkat kematangan setiap entri lore (Rangka, Sebagian, Lengkap) dan daftar gap/TODO penulis.
- Tab Kelengkapan Dunia dan Saran Entitas (Yatim) berada di atas konten dan ikut bergulir bersama panel.
- **File terkait:** `src/features/codex/components/CodexHealthDashboard.tsx`, `src/lib/worldCompleteness.ts`
- **Tabel DB:** `codex` (`worldStatus`, `todo`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Bersifat metadata alur kerja internal; tidak diumpankan ke AI dan tidak disertakan dalam ekspor pembaca.

---

## Lokakarya Codex (Codex Workshop)
- **Deskripsi:** Ruang diskusi interaktif khusus bersama AI untuk menggali dan merancang detail entri lore baru atau menyempurnakan entri yang sudah ada.
- **File terkait:** `src/features/codex-workshop/components/CodexWorkshopPanel.tsx`, `src/features/codex-workshop/hooks/useCodexWorkshop.ts`
- **Tabel DB:** `chatSessions` (`kind: 'workshop'`, `workshopKey`), `codex`
- **Endpoint:** `POST /api/ai/proxy`
- **Catatan:** Sesi chat diisolasi dengan kunci `workshopKey` sehingga sesi diskusi untuk entri yang berbeda tidak bercampur.

---

## Asisten AI & Studio Brainstorming
- **Deskripsi:** Panel obrolan multi-sesi dengan AI yang dilengkapi pemahaman penuh atas Story Bible dan entri Codex terkait dengan dukungan streaming mulus.
- **File terkait:** `src/features/assistant/components/AIAssistantPanel.tsx`, `src/services/ai/index.ts`, `src/features/assistant/hooks/useChatSession.ts`
- **Tabel DB:** `chatSessions`, `aiUsageLogs`
- **Endpoint:** `POST /api/ai/proxy`
- **Catatan:** Mendukung pembatalan inferensi in-flight secara bersih saat pengguna berganti sesi dengan cepat tanpa kebocoran data.
- Pilih panjang jawaban per sesi melalui menu di header. Ringkas (2.048), Standar (4.096), Panjang (8.192), atau nilai khusus berlaku untuk pengiriman, regenerasi, dan kelanjutan berikutnya.
- Secara bawaan Diskusi AI meminta hingga 4.096 token per balasan. Tombol **Lanjutkan jawaban** menyambung pesan yang mencapai batas, termasuk setelah sesi dibuka kembali.
- Diskusi menyimpan alasan akhir balasan dan teks parsial bersama pesan. Balasan lama tanpa status tetap dapat dibaca. Posisi baca dipertahankan saat penulis menggulir ke atas. Buat Ulang mempertahankan jawaban sebelumnya sampai pengganti selesai, dan Coba Lagi tersedia pada kesalahan terakhir.
- Saat panel Diskusi AI tetap terbuka, setiap sesi menyimpan draf pertanyaan dan lampiran Codex masing-masing. Mengirim pesan mengosongkan draf sesi aktif.
- Daftar awal Diskusi AI menampilkan 50 sesi terbaru. Pencarian judul mencakup seluruh riwayat Diskusi AI proyek aktif. Kosongkan pencarian untuk kembali ke daftar awal.
- **Lampirkan Lore** menampilkan nama lengkap entri Codex yang dipilih. Klik
  lampiran di draf untuk melepasnya. **Buat Ulang** dan **Coba Lagi** memakai
  salinan lampiran manual dari pesan asal, termasuk ringkasan atau cuplikan
  bab. Pemulihan salinan ini berlaku untuk pesan yang dikirim setelah perbaikan.

---

## Scribble & Aksi Rewrite Prosa

Di panel Snippet, tombol **Opsi** pada setiap kartu selalu terlihat dan
menyediakan aksi **Ubah** dan **Hapus**.

Nova Assistant di sidebar editor menyimpan riwayat percakapan per bab di IndexedDB. Saat panel dibuka kembali, pesan dimuat dari sesi Scribble bab tersebut. Gunakan tombol Atur panjang jawaban di header Nova untuk memilih batas per sesi. Balasan yang mencapai batas dapat disambung di pesan yang sama.

**Coba Lagi** tersedia pada balasan terakhir yang gagal atau terputus. Nova mengirim ulang pertanyaan pada giliran itu dan mengganti balasannya pada riwayat sesi.
- **Deskripsi:** Fitur penyuntingan dan penulisan ulang teks langsung dari seleksi editor (Tulis Ulang, Perpanjang, Cek Dialog, dll) dengan opsi preview perbandingan.
- **File terkait:** `src/features/editor/components/ActionsPanel.tsx`, `src/services/ai/index.ts`, `src/lib/cleanRewriteOutput.ts`
- **Tabel DB:** `aiActions`, `chapters`, `snapshots`
- **Endpoint:** `POST /api/ai/proxy`
- **Catatan:** Otomatis mengambil snapshot pelindung sebelum teks ditimpa; membersihkan pembungkus format markdown berlebih pada hasil rewrite.
- Pratinjau Snippet mengaktifkan **Ganti Teks** dan **Sisipkan di Bawah**
  setelah balasan lengkap dan berisi teks. Hasil diterapkan sebagai teks
  sesuai pratinjau. Balasan yang terpotong tetap terlihat di pratinjau
  dengan kedua aksi terkunci. Sasaran mengikuti edit di luar
  kutipan. Jika kutipan berubah, pilih teks di editor lalu tekan
  **Gunakan Seleksi Ini** sebelum menerapkan hasil. Pratinjau berpindah ke
  bawah layar saat posisi kutipan tidak lagi bisa dipakai untuk menampilkannya.
- Pratinjau menunjukkan status saat menunggu balasan, menerima teks,
  mencoba ulang, dan siap diterapkan. Penulis bisa membatalkan permintaan
  dari pratinjau dan tetap bekerja di editor selama AI merespons.
- **Sisipkan di Bawah** menggulir ke teks baru dan menyorot sisipannya di
  editor. Sorotan mengikuti edit di luar sisipan dan hilang saat sisipan
  disunting, bab ditinggalkan, atau hasil lain disisipkan. Sorotan hanya
  tampil di editor dan tidak ikut disimpan atau diekspor.
- Snippet meminta 4.096 token output sebagai batas awal dan dapat meminta hingga
  8.192 untuk kutipan panjang. Jika provider menolak karena batas model yang
  disebutkan dalam respons, Snippet mencoba lagi dengan batas tersebut.

---

## Pencarian Semantik & Federated Search
- **Deskripsi:** Mesin pencari adegan naskah berdasarkan makna (cosine similarity vektor MiniLM) yang dipadukan secara paralel dengan pencarian teks leksikal BM25 Orama untuk entri Codex.
- **File terkait:** `src/features/search/components/SemanticSearchPanel.tsx`, `src/services/contextEngine.ts`, `src/services/rag/oramaStore.ts`
- **Tabel DB:** `sceneEmbeddings`, `codex`, `chapters`
- **Endpoint:** Tidak ada (lokal di worker)
- **Catatan:** Indeks naskah diperbarui secara otomatis di latar belakang oleh daemon `useAutoSemanticIndex` saat bab mengalami perubahan.

### Pencarian global (Ctrl+K)

- Memilih hasil Codex langsung membuka dialog detail entri. Memilih hasil
  isi bab menggulir ke frasa pada cuplikan dan menyorotnya selama lima detik.
  Hasil judul saja membuka bab. Jika lokasi cuplikan sudah berubah dan tak
  dapat dipastikan, aplikasi tetap membuka bab dan memberi tahu penulis.
- Kecocokan persis pada judul atau nama diprioritaskan. Bab dengan jenis
  kecocokan yang sama mengikuti urutan manuskrip. Pencarian isi memakai teks
  yang terlihat di bab tersimpan dan berjalan lokal di Web Worker.

---

## Laporan Kualitas Prosa (Prose Report)
- **Deskripsi:** Analitik gaya penulisan naskah tanpa token, mengukur keterbacaan (Flesch-Kincaid adaptif), proporsi kalimat panjang, rasio dialog, dan kata pasif.
- **File terkait:** `src/features/consistency/components/ProseReportPanel.tsx`, `src/lib/proseAnalysis.ts`
- **Tabel DB:** `chapters`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Karakter elipsis disanitasi sebelum penghitungan kalimat agar jeda dialog dramatis tidak membiaskan statistik keterbacaan.

---

## Ekspor Manuskrip Multi-Format
- **Deskripsi:** Pengekspor naskah novel ke format EPUB (XHTML standar), DOCX (hierarki dokumen rapi), PDF, dan Markdown utuh.
- **File terkait:** `src/components/modals/ExportManager.tsx`, `src/lib/epub.ts`, `src/lib/zip.ts`
- **Tabel DB:** `chapters`, `projects`, `codex`
- **Endpoint:** Tidak ada (lokal di browser)
- **Catatan:** Ekspor naskah tebal menggunakan `yieldToUI()` berkala tiap 8 bab agar browser tidak hang. Gambar dinamis dibersihkan sebelum kompilasi EPUB.

---

## Snapshot & Visual Diff Revisi
- **Deskripsi:** Sistem versioning draf naskah bab per-titik waktu dengan modal perbandingan visual kata-demi-kata (LCS diff) berwarna hijau/merah.
- **File terkait:** `src/features/editor/components/SnapshotPanel.tsx`, `src/components/modals/SnapshotDiffModal.tsx`, `src/lib/textDiff.ts`
- **Tabel DB:** `snapshots`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Algoritma diff beroperasi di level kata dengan fallback cerdas per-baris untuk dokumen masif guna mencegah kehabisan memori.

---

## Pencadangan Otomatis & Google Drive Sync
- **F19/F20:** Backup penuh/per-proyek dan ekspor manuskrip melakukan flush tervalidasi serta membaca snapshot transaksi readonly. Serialisasi Blob/kompresi di luar transaksi. Drive upload sukses dengan ID mendahului retensi; gagal prune dilaporkan terpisah. Lihat [kontrak backup](backup-format.md).
- **Deskripsi:** Sistem cadangan berkala ke file terkompresi gzip, retensi kuota otomatis, dan integrasi opsional ke folder Google Drive pribadi via GIS token.
- **File terkait:** `src/services/backupService.ts`, `src/services/driveBackupService.ts`, `src/lib/backupValidation.ts`, `src/lib/backupIO.ts`, `src/lib/backupLimits.ts`, `src/lib/backupRetention.ts`, `src/hooks/useAutoBackup.tsx`
- **Tabel DB:** `backups`
- **Endpoint:** Tidak ada (langsung ke IndexedDB & Google Drive API)
- **Catatan:** Format keluaran v8; legacy v3–v7 diterima melalui normalisasi eksplisit. Service membedakan restore seluruh workspace dengan impor novel baru, memeriksa schema/ID/FK/checksum, membatasi file/dekompresi/record, dan hanya menerima data URL raster yang diizinkan. Kegagalan snapshot pengaman membatalkan restore; transaksi restore tetap atomik. UI menampilkan pesan penolakan dari service. Kontrak lengkap, keterbatasan auto internal, dan cakupan tes terdapat pada [format backup](backup-format.md).

---

## Dashboard Statistik & Progres Menulis
- **Deskripsi:** Dasbor ringkasan eksekutif novel: total kata, target harian, distribusi status bab, kuota penyimpanan browser, dan audit token AI.
- **File terkait:** `src/components/panels/DashboardPanel.tsx`, `src/lib/dailyProgress.ts`, `src/hooks/useDailyProgress.ts`
- **Tabel DB:** `projects`, `chapters`, `aiUsageLogs`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Perhitungan delta kata harian menggunakan tanggal lokal pengguna tanpa ketergantungan timezone server.

---

## Navigasi Studio & Footer Utilitas Sistem
- **Deskripsi:** Navigasi 5 studio kerja utama (Menulis, Dunia & Lore, Visual & Peta, Analisis & Naskah, Asisten AI) dengan footer dock minimalis untuk utilitas sistem (Pengaturan, Panduan Pengguna, Log Error).
- **File terkait:** `src/components/layout/Sidebar.tsx`, `src/lib/studioNavigation.ts`
- **Tabel DB:** Tidak ada (state navigasi lokal)
- **Endpoint:** Tidak ada
- **Catatan:** Footer sistem menggunakan dock bar ringkas berbasis ikon dengan label kategori proporsional untuk mengoptimalkan ruang vertikal daftar bab dan menghindari kepadatan teks.

---

---

## Pengecek Kontinuitas & Audit Konsistensi Batch (Prompt Caching)
- **Deskripsi:** Pengecekan konsistensi naskah dengan AI terhadap Story Bible, Codex Lore, Relasi Karakter, dan Linimasa Peristiwa. Menyediakan mode pemeriksaan bab tunggal dan mode **Audit Batch** (antrian berurutan untuk banyak bab sekaligus).
- **File terkait:** `src/features/consistency/components/ConsistencyPanel.tsx`, `src/services/ai/index.ts`, `src/lib/timelineSummary.ts`
- **Tabel DB:** `chapters`, `codex`, `bible`, `relationships`, `timeline`
- **Endpoint:** Provider AI (`openrouter`, `google`, `claude`, `groq`, dll.)
- **Catatan:** Mode Batch memproses bab secara sekuensial dengan bilah progres real-time dan opsi pembatalan aman. Segmen pengetahuan yang identik antar-bab dapat memakai cache prompt pada provider yang mendukungnya. Besarnya penghematan bergantung pada cache hit dan aturan provider. Hasil disajikan dalam akordeon ringkas per bab dengan deep link langsung ke kutipan terkait di editor manuskrip.


## Round-trip Proyek (F10)

Ekspor/impor per-proyek menyertakan continuityTriage. Impor menetapkan ID baru lalu memetakan workshopKey entry:<id> serta findingId gap/unused (Codex), rel (relasi), tl dan chrono (timeline). Pesan chat, HTML naskah, dan new:<seed> tidak diubah. Referensi triage yang sudah tidak punya target dibuang sebagai status basi; format finding asing atau target workshop invalid membatalkan impor secara atomik. Backup lama tanpa triage tetap diterima.

## Pencarian Orama (F08/F09)

Panel gabungan memakai oramaSync.searchWithScores(projectId, query, limit), bukan singleton Orama main-thread. Worker memastikan proyek terinisialisasi dan memproses INIT/mutasi/search secara berurutan. Skor BM25 tetap dinormalisasi sebelum digabung dengan hasil adegan. Codex dapat dicari tanpa indeks adegan; pergantian proyek membatalkan tampilan hasil lama. Error pencarian worker diteruskan ke panel.

Hook creating memakai generated key dari onsuccess dan menjadwalkan pembacaan record final hanya sesudah commit. Mutasi per key dalam transaksi digabung; search menunggu pembacaan post-commit, rollback tidak diindeks. Setup hook idempotent; indexEntry bersifat upsert agar tidak menghasilkan dokumen duplikat. Update/delete tetap melalui worker.

## Streaming, Retry, dan Rewrite Lifecycle (F12/F14/F15)

Parser sse.ts memproses frame SSE lintas-chunk/CRLF/multiline dan buffer akhir, serta protokol OpenAI-compatible, Gemini dan Claude. Error frame, JSON rusak, teks kosong dan terminasi tak lengkap menggagalkan operasi; output parsial tidak dianggap sukses. Stream tanpa onChunk tetap dapat dikonsumsi. Reader dibatalkan/dilepas saat selesai/error/abort; timeout idle dan AbortError tetap diteruskan. Penanda sukses: [DONE]/finish_reason, finishReason Gemini, atau message_stop Claude. Batas max-token provider tetap diperlakukan sebagai terminasi sesuai respons provider.

Facade meneruskan onRetry untuk chat/rewrite, termasuk fallback. Consumer mengosongkan buffer pada retry; hasil final attempt sukses menjadi sumber utama, sehingga teks percobaan lama tidak menempel pada hasil baru. Callback chat yang bukan sesi aktif diabaikan. Penghentian chat manual tetap mempertahankan output parsial sesuai perilaku sebelumnya. Rewrite memakai identitas run, ref timer dan cleanup finally/unmount/ganti bab; request dibatalkan dan callback terlambat diabaikan. Preview gagal dibuang agar teks parsial tidak diterima sebagai rewrite sukses.

## Privasi Provider dan Fallback AI (F17)

Pengaturan AI menyediakan mode hanya lokal (ai_local_only) dan daftar izin fallback (ai_fallback_providers). Default fallback lintas-provider kosong, termasuk instalasi lama yang sudah menyimpan key cloud. Provider utama cloud yang dipilih eksplisit tetap dapat dipakai saat mode lokal mati. Ollama gagal tidak berpindah ke cloud kecuali target dicentang dan memiliki key. Mode lokal menolak semua inferensi cloud termasuk override per aksi dan pemanggilan langsung callProxy; pilih Ollama sebagai provider utama. Daftar izin tetap tersimpan tetapi tidak aktif selama mode lokal menyala.

Izin langsung dipersist lewat useAISettings dan dibaca ulang sebelum setiap dispatch/retry; pencabutan selama retry memblokir request berikutnya. Storage tidak tersedia atau nilai local-only rusak bersifat fail-closed. Request yang sudah dikirim tidak dapat ditarik kembali. Indikator global menampilkan tujuan request inferensi terakhir (lokal/cloud); error karena kebijakan tidak dihitung sebagai kegagalan koneksi provider. Ini mengatur inferensi yang membawa naskah, bukan download model lokal, daftar model, Drive, atau autentikasi layanan. Pemilihan provider adalah pilihan pengguna; tidak ada perpindahan default utama secara otomatis.

## Ringkasan Otomatis dan Metrik AI (F29/F13)

Ringkasan otomatis menyimpan summarySourceHash (SHA-256 seluruh HTML sumber) dan summaryUpdatedAt memakai lastModified versi sumber, bukan waktu request selesai. Setelah respons AI, transaksi chapters memeriksa content, lastModified, projectId dan nilai summary/timestamp yang dibaca sebelum request. Bab berubah, dihapus, atau ringkasannya diedit manual saat request berlangsung membuat hasil dibuang. Request bersamaan untuk bab yang sama ditahan inFlight. Tidak ada loop retry otomatis saat mengetik; pemicu perpindahan bab berikutnya dapat merangkum ulang. Ringkasan legacy tanpa hash diverifikasi ulang melalui regenerasi saat memenuhi syarat; batas input prompt 15.000 karakter tetap berlaku.

F13: temperature 0 dipertahankan pada payload Claude, Gemini, dan OpenAI-compatible; hanya null/undefined memakai default 0,7. Usage Claude digabung oleh parser SSE dari message_start hingga message_stop; perhitungan prompt menjumlah input + cache-read + cache-creation, dan angka token nol tidak diganti estimasi. Pemeriksaan parameter ini tidak menggantikan batas model/provider; belum memakai provider nyata.

## Pembatalan Context Worker (F16)

contextProtocol.ts mendefinisikan union pesan task/CANCEL/indexing. Timeout idle contextEngine mengirim { type: CANCEL, payload: { cancelId } } yang sama dengan receiver. Worker hanya menandai ID aktif; cancel terlambat/tidak dikenal diabaikan dan state request dibersihkan pada finally. Hasil/error dari request yang dibatalkan tidak dipost ke pemanggil yang sudah timeout.

Checkpoint dilakukan sebelum pekerjaan, setelah pemuatan model dan embedding, serta di jalur preview DB. Scan chunk Codex memberi kesempatan event loop setiap 16 chunk agar cancel dapat diterima. Pembatalan kooperatif: operasi sinkron tunggal atau embedding yang sedang berlangsung tidak dipreempt di tengah instruksi. Unduhan model bersama dan indexing latar fire-and-forget dapat tetap berjalan karena tidak eksklusif milik request yang timeout.

## Privasi Kredensial dan Log (F27)

Pengaturan AI memiliki pilihan **Selama sesi tab ini** dan **Ingat di browser ini**,
berlaku sesudah **Simpan Kredensial**. Instalasi baru memakai sesi; key lama yang
sudah permanen tetap tersedia sampai pengguna menyimpan pilihan lain. Mode sesi
menulis hanya ke sessionStorage dan membuang salinan localStorage; reload tetap
mempertahankan sesi, dan browser dapat menyalin/memulihkan sesi saat membuka atau
memulihkan tab. Pilihan permanen memakai Base64 legacy yang dapat dibalik, bukan
enkripsi. Script pada origin yang sama atau akses profil browser tetap dapat
membaca key. Pembacaan hook dan facade memakai credentialStore yang sama.

**Hapus semua API key dari browser ini** langsung menghapus salinan permanen,
sesi dan isian tab aktif; tab lain dapat masih memiliki sesi/isian sendiri.
Penghapusan tidak mencabut key pada provider, key .env server, atau membatalkan
request/retry yang sedang berjalan. Tidak ada key lama yang dihapus otomatis
saat membuka pengaturan/upgrade. Kegagalan storage ditampilkan sebagai error.

Log Sistem mengutamakan privasi: hanya source/kode/provider yang dikenal serta
diagnostik angka/boolean yang diizinkan. Prompt, respons mentah, key, model/nama
bebas dan stack tidak masuk log baru. Log lama disaring saat ditampilkan; salinan
asli di DB tetap sampai pengguna memilih Hapus Log Manual atau retensi 30 hari.
Pesan error langsung untuk pengguna tidak dihapus; detail debugging pada log
menjadi lebih terbatas. Tidak ada schema/dependency baru untuk perubahan ini.

## Dialog Konfirmasi dan Navigasi Legacy (F25/F26)

ConfirmDialog pada impor/restore memakai dialog native dengan showModal, role
alertdialog dan label/deskripsi yang terhubung ke judul/isi. Fokus awal memilih
Batal; Tab dan Shift+Tab berputar di kontrol dialog. Bagian aplikasi di belakang
menjadi inert; top-layer menangani modal bertingkat. Escape/backdrop meminta
pembatalan ketika tidak busy. Saat busy kedua aksi dinonaktifkan, dismissal ditahan
dan fokus tetap di modal. Sesudah close/unmount, fokus kembali ke pemicu bila
masih terhubung. Browser harus mendukung HTMLDialogElement.showModal; kontrak
keyboard/nesting diuji pada Chromium, belum screen reader manual.

Preferensi navigasi lama dipulihkan ke panel aktif: arc membuka Peta Kontinuitas,
orphans membuka Kesehatan Codex (tempat tab Saran Entitas/Yatim tersedia), nilai
asing kembali ke Editor. Mode workshop tersimpan tanpa target kembali ke Codex;
openWorkshop dengan target tetap membuka Lokakarya dan Kembali memulihkan panel
asal. Mode canonical ditulis kembali ke preferensi panel aktif. Riwayat tab studio
menormalisasi legacy dan tidak menyimpan workshop. MainView memberi fallback
untuk mode yang tidak valid; proyek/bab dan deep link Codex/Atlas tetap utuh.
Pemetaan legacy membuka panel induk, tanpa merekonstruksi karakter atau subtab
lama yang tidak tersimpan. Tidak ada migrasi data novel.

## Pemuatan Awal dan Offline (F22)

Dialog ekspor memuat kode PDF/DOCX ketika dibuka; editor tidak perlu memuatnya di
awal. Registry ikon menu aksi berdiri sendiri sehingga panel Snippet tetap lazy.
Worker konteks memuat transformers ketika fitur embedding memerlukannya; tugas
token/eksak tidak mengimpor runtime model. Tokenizer tetap ada di entry worker.

Aset lazy tetap diprecache agar tersedia sesudah instalasi offline selesai.
Smoke production membuktikan reload editor, worker token baru dan unduhan Markdown
melalui dialog ekspor saat jaringan offline. Model semantik eksternal tetap butuh
unduhan/cache tersendiri. Hasil pengukuran dan batas ada di [laporan F22](reports/benchmarks/f22.md).

## Query Naskah Besar (F23)

Daftar bab, statistik header dan dashboard memakai indeks metadata (judul, status,
urutan, jumlah kata dan waktu edit), sehingga tidak membaca ulang seluruh HTML
setiap simpan. Metadata diperbarui otomatis dalam transaksi penulisan bab; impor,
restore, duplikasi, rollback dan penghapusan tetap konsisten. Auto-index membaca
satu key waktu edit terbaru. Schema naik append-only ke v34, tanpa tabel baru.

Pencarian adegan tetap menilai semua vektor proyek dengan skor exact dan urutan
seri yang sama, tetapi membacanya per batch dan mempertahankan hanya top-k hit.
Memori dibatasi; latency pencarian tidak dijanjikan selalu turun. Analisis yang
memerlukan isi bab tetap membaca teks. Metodologi/hasil: [F23](reports/benchmarks/f23.md).
