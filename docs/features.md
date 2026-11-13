# Katalog Fitur — AetherScribe

Dokumentasi seluruh modul fitur yang ada di dalam aplikasi AetherScribe, mencakup status, arsitektur file, tabel database, endpoint, dan catatan teknis.

---

## Editor Manuskrip (TipTap 3)
- **Status:** Selesai
- **Deskripsi:** Editor kaya fitur berbasis TipTap 3 yang dioptimalkan untuk penulisan novel panjang dengan penghitung kata langsung, mode fokus, dan jaring pengaman autosave anti kehilangan data.
- **File terkait:** `src/features/editor/components/NovelEditor.tsx`, `src/features/editor/components/EditorToolbar.tsx`, `src/features/editor/hooks/useEditorSave.ts`, `src/features/editor/editorBridge.ts`, `src/hooks/useGlobalEvents.ts`
- **Tabel DB:** `chapters`, `snapshots`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Seluruh paket `@tiptap/*` WAJIB dipin tepat ke versi `3.22.5`. Autosave memakai debounce 1,5 detik; flush membaca HTML terbaru termasuk konten kosong. `flushActiveEditor(): Promise<void>` hanya resolve setelah update tepat satu bab, dan reject pada error DB, ID invalid, atau update nol baris. Tanpa editor aktif, flush tetap no-op.
- **Penanganan gagal simpan (F05):** Status menjadi `Gagal menyimpan`, draft tetap di editor, dan reload melalui bridge ditolak sampai save berhasil. Find & Replace membatalkan penggantian/snapshot/reload ketika flush gagal; klik ulang mencoba flush lagi. Edit berikutnya juga mencoba autosave kembali. Timer status sukses sebelumnya tidak boleh menghapus pesan kegagalan. Rejection autosave dan lifecycle ditangani agar tidak menjadi unhandled rejection.
- **Lifecycle:** `pagehide` dan `visibilitychange` mencoba flush, tetapi penyelesaian IndexedDB saat browser menutup halaman tidak dijamin. Pembaruan skema dari koneksi lain hanya menutup DB dan memuat ulang setelah flush sukses; kegagalan mempertahankan tab/koneksi dan menampilkan pesan. Menutup paksa tab setelah save gagal tetap dapat menghilangkan draft yang hanya ada di memori.
- **Verifikasi F05:** Tes hook React, Find & Replace dengan `fake-indexeddb`, dan handler `versionchange` memakai fixture terisolasi; belum diuji pada browser/IndexedDB native atau upgrade lintas-tab nyata.

---

## Manajemen Bab & Papan Babak (Kanban Act)
- **Status:** Selesai
- **Deskripsi:** Pengorganisasian bab naskah dengan drag-and-drop reordering, penetapan status draf, target kata per bab, dan visualisasi babak naratif (Act I, II-A, II-B, III).
- **File terkait:** `src/features/chapters/components/OutlinePanel.tsx`, `src/features/chapters/components/ChapterList.tsx`, `src/features/chapters/hooks/useChapters.ts`
- **Tabel DB:** `chapters`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Field `act` menumpang objek `Chapter` sebagai field JSON inert (non-indeks) sehingga tidak memerlukan migrasi tabel baru.

---

## Story Bible & Aturan Dunia
- **Status:** Selesai
- **Deskripsi:** Tempat mendeklarasikan aturan kanon novel (Tone, Genre, Aturan Sihir, Larangan Narasi) yang otomatis diumpankan ke AI sebagai pondasi pengetahuan stabil.
- **File terkait:** `src/features/lore/components/BiblePanel.tsx`, `src/lib/storyBible.ts`
- **Tabel DB:** `bible`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Blok Story Bible diumpankan via `cachedContext` terpisah pada prompt caching AI agar perbaikan pada teks bab tidak membatalkan cache instruksi Bible.

---

## Codex & Ensiklopedia Lore
- **Status:** Selesai
- **Deskripsi:** Ensiklopedia komprehensif untuk mencatat karakter, tempat, item, sihir, dan lore dengan dukungan alias multi-kata untuk deteksi teks instan.
- **File terkait:** `src/features/codex/components/CodexPanel.tsx`, `src/features/codex/components/CodexDetailModal.tsx`, `src/features/codex/components/CodexForm.tsx`, `src/lib/codexKeywords.ts`
- **Tabel DB:** `codex`, `codexCategories`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Multi-entry index `*aliases` di Dexie memungkinkan pencarian cepat. Ekstraksi kata kunci untuk Aho-Corasick disatukan di `src/lib/codexKeywords.ts`.

---

## Kategori Kustom & Field Template Codex
- **Status:** Selesai
- **Deskripsi:** Pembuat kategori entri fleksibel (misal: Bestiari, Artefak) dengan template field terstruktur (teks, angka, select) yang otomatis ter-denormalisasi.
- **File terkait:** `src/lib/codexFields.ts`, `src/lib/codexCategories.ts`, `src/features/codex/components/CategoryManagerModal.tsx`
- **Tabel DB:** `codexCategories`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Nilai field disimpan di `CodexEntry.customFields` dengan snapshot `label` agar jalur baca (ekspor & AI) mandiri tanpa perlu join tabel.

---

## Hubungan Karakter & Entitas (Relationship Mapper)
- **Status:** Selesai
- **Deskripsi:** Pemetaan jejaring hubungan sosial dan politik antar entitas Codex (Musuh, Keluarga, Sekutu, Bawahan) yang dapat dianalisis oleh AI.
- **File terkait:** `src/features/lore/components/RelationshipMapper.tsx`, `src/features/codex/relationshipTypes.ts`, `src/lib/loreFormat.ts`
- **Tabel DB:** `relationships`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Format hubungan diubah menjadi graf teks ringkas oleh `buildRelationshipGraph` saat diumpankan ke prompt AI.

---

## Kebenaran Tersembunyi (Hidden Truth & Secrets)
- **Status:** Selesai
- **Deskripsi:** Fitur pemisah antara kanon publik dan rahasia penulis; entri atau catatan bertanda rahasia disuntikkan ke AI untuk pencegahan kebocoran plot namun disaring dari ekspor pembaca.
- **File terkait:** `src/features/codex/components/CodexForm.tsx`, `src/lib/loreFormat.ts`
- **Tabel DB:** `codex` (`hidden`, `secret`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Entri berstatus `hidden` tidak muncul di highlight editor pembaca dan ekspor buku, namun disaring secara khusus ke dalam Knowledge Base AI.

---

## Janji Plot (Chekhov's Gun & Payoff)
- **Status:** Selesai
- **Deskripsi:** Pelacak janji naratif yang ditanam di awal cerita (ramalan, senjata, rahasia) dan verifikasi apakah janji tersebut telah terbayar (payoff/reveal) di bab tertentu.
- **File terkait:** `src/features/consistency/components/PlotPromisePanel.tsx`, `src/lib/plotPromises.ts`
- **Tabel DB:** `plotPromises`, `chapters`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Pelacakan kemunculan bekerja secara deterministik nol-token menggunakan `PresenceIndex`. Mendukung penautan `payoffCodexId` ke entri rahasia.

---

## Bengkel Nama (Name Forge)
- **Status:** Selesai
- **Deskripsi:** Generator nama karakter dan faksi berbasis fonotaktik (konsonan/vokal) dan morfem leksikal kustom per kelompok faksi.
- **File terkait:** `src/features/codex/components/NameForgeModal.tsx`, `src/lib/nameForge.ts`
- **Tabel DB:** `codex` (`namePalette`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Logika peracikan nama sepenuhnya deterministik di `nameForge.ts` (+13 tes) tanpa membutuhkan panggilan API LLM.

---

## Glosarium Istilah In-World
- **Status:** Selesai
- **Deskripsi:** Kamus istilah dunia fiksi non-nama (satuan, gelar, istilah sihir) dengan deteksi salah-eja otomatis di editor yang ditandai garis bawah teal.
- **File terkait:** `src/features/consistency/components/GlossaryPanel.tsx`, `src/lib/glossary.ts`, `src/features/editor/components/ConsistencyUnderline.tsx`
- **Tabel DB:** `glossary`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Algoritma mencakup pencocokan varian salah yang dideklarasikan serta deteksi kesalahan ketik serupa (*Levenshtein distance* terkontrol).

---

## Peta Kontinuitas (Continuity Dashboard & Triase)
- **Status:** Selesai
- **Deskripsi:** Dasbor audit konsistensi naskah komprehensif yang memvalidasi kemunculan karakter, urutan waktu linimasa, janji plot tertidur, dan entitas yatim piatu.
- **File terkait:** `src/features/consistency/components/ContinuityDashboard.tsx`, `src/lib/continuity.ts`, `src/hooks/usePresenceIndex.ts`
- **Tabel DB:** `continuityTriage`, `chapters`, `codex`, `timeline`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Pemindaian naskah didelegasikan ke Web Worker (`buildPresenceIndexAsync`). Penulis dapat menyembunyikan temuan yang disengaja via tabel `continuityTriage`.

---

## Lensa Karakter (Character Arc)
- **Status:** Selesai
- **Deskripsi:** Visualisasi frekuensi kemunculan karakter di sepanjang bab, sebaran adegan bersama antar tokoh, dan audit sudut pandang (POV).
- **File terkait:** `src/features/consistency/components/CharacterArcPanel.tsx`, `src/lib/characterArc.ts`
- **Tabel DB:** `chapters`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Menggunakan hasil komputasi bersama `PresenceIndex` untuk efisiensi pemrosesan naskah tebal.

---

## Kalender Dunia (World Calendar & Era)
- **Status:** Selesai (v1 Visual, Fase 2 Audit Kronologi & Kalkulator Perjalanan, serta Pengayaan Worldbuilding & Navigasi Tahunan)
- **Deskripsi:** Sistem penanggalan in-world multi-era dengan kustomisasi jumlah hari per bulan, nama hari per minggu, pita musim, festival/hari libur tahunan berulang (*recurring holidays*), pelacak usia karakter dinamis (*dynamic age tracker*), navigasi visual tahunan (*bird's-eye heatmap view*), kalkulator selisih & durasi perjalanan berbagai moda, serta deteksi deterministik anomali urutan tanggal mundur antar-bab.
- **File terkait:** `src/features/timeline/components/WorldCalendarPanel.tsx`, `src/lib/worldCalendar.ts`, `src/lib/chronologyAudit.ts`, `src/features/timeline/components/CalendarCalculatorModal.tsx`, `src/features/timeline/components/ChronologyAuditModal.tsx`, `src/features/timeline/components/CalendarEditorModal.tsx`, `src/features/timeline/components/CalendarEventModal.tsx`, `src/features/codex/components/CodexForm.tsx`, `src/features/codex/components/CodexDetailModal.tsx`
- **Tabel DB:** `projects` (`calendar`), `timeline` (`startDate`, `endDate`), `codex` (`birthDate`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Kronologi ditentukan oleh urutan array `eras` di mana tiap era mulai dari Tahun 1. Tautan karakter menggunakan ulang field `characterIds` tanpa FK baru. Menggunakan meta-pola field inert JSON sehingga penambahan `holidays` pada kalender dan `birthDate` pada Codex bekerja tanpa migrasi skema Dexie. Perhitungan usia karakter (`calculateCharacterAge`) dan hari libur (`holidaysOnDate`) berjalan murni deterministik di client-side (0 token AI). Tampilan tahunan (Heatmap View) memetakan ritme pacing seluruh bulan dalam setahun dengan navigasi zoom 1-klik ke tampilan bulan dan kartu detail. Antarmuka menggunakan arsitektur 2-kolom bersih: Kalender lega di sisi kiri dan Panel Samping Terpadu (*Collapsible Inspector*) di sisi kanan dengan tab "Detail Tanggal" & "Agenda/Cari" yang dapat disembunyikan kapan saja untuk memaksimalkan ruang pandang. Seluruh modal pop up (Kalkulator, Audit, Editor, Peristiwa) menggunakan `createPortal` ke `document.body` dengan pembatas ketinggian responsif (`max-h-[85vh]` dan `my-auto`) sehingga tidak terpotong atau tertutup oleh header atas aplikasi, serta disempurnakan pewarnaan tema gelapnya (*dark mode*) agar kontras dan serasi.

---

## Timeline Cerita
- **Status:** Selesai
- **Deskripsi:** Linimasa vertikal kronologi peristiwa cerita dengan filter tipe plot, penautan karakter, dan integrasi tanggal bebas maupun terstruktur.
- **File terkait:** `src/features/timeline/components/TimelinePanel.tsx`, `src/lib/timelineSummary.ts`
- **Tabel DB:** `timeline`, `chapters`, `codex`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Event tanpa `startDate` tetap tampil di timeline teks bebas lama tanpa duplikasi data.

---

## Atlas Dunia (Peta Interaktif Leaflet)
- **Status:** Selesai (v1.0 s/d v2.1)
- **Deskripsi:** Kanvas peta interaktif berbasis Leaflet CRS.Simple untuk mengunggah peta, menandai pin, poligon batas wilayah, rute perjalanan, kalibrasi skala jarak, deteksi wilayah yatim, dan navigasi sub-peta bertingkat.
- **File terkait:** `src/features/atlas/components/AtlasPanel.tsx`, `src/features/atlas/components/MapCanvas.tsx`, `src/features/atlas/components/atlasMarkerIcons.ts`, `src/lib/atlasColors.ts`, `src/lib/mapGeometry.ts`, `src/lib/atlasAnalytics.ts`, `src/lib/atlasHierarchy.ts`
- **Tabel DB:** `maps`, `mapMarkers`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Menggunakan Leaflet murni (bukan wrapper React). Koordinat disimpan dalam rasio relatif 0–1. File/Drive/ekspor novel dan snapshot pra-restore menyertakan gambar lengkap. Auto internal v8 menyimpan referensi SHA-256 untuk mencocokkan gambar live, bukan menghapus Blob saat restore; referensi yang tidak tersedia membatalkan pemulihan. Kebijakan legacy dan batasnya dijelaskan di [format backup](backup-format.md).
- **Keamanan label (F01, 13 November 2026):** Ikon dibangun lewat DOM; judul marker dan nama Codex dimasukkan dengan `textContent`. Tooltip dinamis diberikan ke Leaflet sebagai HTMLElement, sehingga markup dari data tersimpan/impor tampil harfiah. SVG dekoratif hanya memakai atribut konstan. Nilai data tidak diinterpolasi ke string HTML.
- **Warna:** Hanya hex `#RGB`/`#RRGGBB` (case-insensitive) diterima. Override invalid diabaikan dan resolver melanjutkan ke warna faksi/kategori/jenis. Boundary render, termasuk SVG path dan handle edit, memvalidasi lagi; callback warna invalid memakai fallback `#64748b`. Data sumber tetap disimpan tanpa perubahan.
- **Verifikasi F01:** 49 tes baru memakai Leaflet asli di jsdom dan fixture JSON sintetis: badge pin/area/route/portal, hover tooltip, nama marker/Codex, penolakan elemen/handler injeksi, warna, handle edit, dan interaksi klik/dobel-klik. Belum ada verifikasi visual atau eksekusi payload di browser native.

---

## Papan & Hubungan Faksi (React Flow)
- **Status:** Selesai
- **Deskripsi:** Visualisasi hierarki dan relasi politik antar kelompok faksi di kanvas interaktif React Flow dengan pewarnaan otomatis dan pemetaan wilayah.
- **File terkait:** `src/features/lore/components/FactionsPanel.tsx`, `src/features/lore/components/FactionBoardCanvas.tsx`, `src/lib/factions.ts`
- **Tabel DB:** `codex` (`factionTag`, `factionBoard`), `relationships`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** ⚠️ Pewarnaan garis edge React Flow WAJIB menggunakan inline `style: { stroke: ... }`, bukan atribut `stroke`.

---

## Heatmap Tensi & Pacing
- **Status:** Selesai
- **Deskripsi:** Grafik heatmap visual untuk memantau ritme ketegangan cerita bab demi bab, membandingkan tensi deklarasi penulis dengan estimasi rasio dialog otomatis.
- **File terkait:** `src/features/consistency/components/PacingHeatmapPanel.tsx`, `src/lib/pacingHeatmap.ts`
- **Tabel DB:** `chapters` (`tension`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Estimasi otomatis `estimateTension` diturunkan dari rasio dialog terhadap narasi dan rata-rata panjang kalimat secara deterministik.

---

## Graf Lore Visual Interaktif (Force Graph)
- **Status:** Selesai
- **Deskripsi:** Graf jaringan fisika interaktif yang memvisualisasikan bagaimana setiap karakter, faksi, lokasi, dan item saling terhubung di dalam cerita.
- **File terkait:** `src/features/codex/components/LoreGraphPanel.tsx`, `src/lib/loreGraph.ts`, `src/features/codex/workers/loreGraphWorker.ts`
- **Tabel DB:** `codex`, `relationships`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** ⚠️ Hit-test hover dan klik node dilakukan secara manual via koordinat kanvas matematis, JANGAN menggunakan API hit-test bawaan force-graph yang rawan bug.

---

## Pelacak Kelengkapan Worldbuilding
- **Status:** Selesai
- **Deskripsi:** Dasbor manajemen mutu worldbuilding yang menampilkan tingkat kematangan setiap entri lore (Rangka, Sebagian, Lengkap) dan daftar gap/TODO penulis.
- **File terkait:** `src/features/codex/components/CodexHealthDashboard.tsx`, `src/lib/worldCompleteness.ts`
- **Tabel DB:** `codex` (`worldStatus`, `todo`)
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Bersifat metadata alur kerja internal; tidak diumpankan ke AI dan tidak disertakan dalam ekspor pembaca.

---

## Lokakarya Codex (Codex Workshop)
- **Status:** Selesai
- **Deskripsi:** Ruang diskusi interaktif khusus bersama AI untuk menggali dan merancang detail entri lore baru atau menyempurnakan entri yang sudah ada.
- **File terkait:** `src/features/codex-workshop/components/CodexWorkshopPanel.tsx`, `src/features/codex-workshop/hooks/useCodexWorkshop.ts`
- **Tabel DB:** `chatSessions` (`kind: 'workshop'`, `workshopKey`), `codex`
- **Endpoint:** `POST /api/ai/proxy`
- **Catatan:** Sesi chat diisolasi dengan kunci `workshopKey` sehingga sesi diskusi untuk entri yang berbeda tidak bercampur.

---

## Asisten AI & Studio Brainstorming
- **Status:** Selesai
- **Deskripsi:** Panel obrolan multi-sesi dengan AI yang dilengkapi pemahaman penuh atas Story Bible dan entri Codex terkait dengan dukungan streaming mulus.
- **File terkait:** `src/features/assistant/components/AIAssistantPanel.tsx`, `src/services/ai/index.ts`, `src/features/assistant/hooks/useChatSession.ts`
- **Tabel DB:** `chatSessions`, `aiUsageLogs`
- **Endpoint:** `POST /api/ai/proxy`
- **Catatan:** Mendukung pembatalan inferensi in-flight secara bersih saat pengguna berganti sesi dengan cepat tanpa kebocoran data.

---

## Scribble & Aksi Rewrite Prosa
- **Status:** Selesai
- **Deskripsi:** Fitur penyuntingan dan penulisan ulang teks langsung dari seleksi editor (Tulis Ulang, Perpanjang, Cek Dialog, dll) dengan opsi preview perbandingan.
- **File terkait:** `src/features/editor/components/ActionsPanel.tsx`, `src/services/ai/index.ts`, `src/lib/cleanRewriteOutput.ts`
- **Tabel DB:** `aiActions`, `chapters`, `snapshots`
- **Endpoint:** `POST /api/ai/proxy`
- **Catatan:** Otomatis mengambil snapshot pelindung sebelum teks ditimpa; membersihkan pembungkus format markdown berlebih pada hasil rewrite.

---

## Pencarian Semantik & Federated Search
- **Status:** Selesai
- **Deskripsi:** Mesin pencari adegan naskah berdasarkan makna (cosine similarity vektor MiniLM) yang dipadukan secara paralel dengan pencarian teks leksikal BM25 Orama untuk entri Codex.
- **File terkait:** `src/features/search/components/SemanticSearchPanel.tsx`, `src/services/contextEngine.ts`, `src/services/rag/oramaStore.ts`
- **Tabel DB:** `sceneEmbeddings`, `codex`, `chapters`
- **Endpoint:** Tidak ada (lokal di worker)
- **Catatan:** Indeks naskah diperbarui secara otomatis di latar belakang oleh daemon `useAutoSemanticIndex` saat bab mengalami perubahan.

---

## Laporan Kualitas Prosa (Prose Report)
- **Status:** Selesai
- **Deskripsi:** Analitik gaya penulisan naskah tanpa token, mengukur keterbacaan (Flesch-Kincaid adaptif), proporsi kalimat panjang, rasio dialog, dan kata pasif.
- **File terkait:** `src/features/consistency/components/ProseReportPanel.tsx`, `src/lib/proseAnalysis.ts`
- **Tabel DB:** `chapters`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Karakter elipsis disanitasi sebelum penghitungan kalimat agar jeda dialog dramatis tidak membiaskan statistik keterbacaan.

---

## Ekspor Manuskrip Multi-Format
- **Status:** Selesai
- **Deskripsi:** Pengekspor naskah novel ke format EPUB (XHTML standar), DOCX (hierarki dokumen rapi), PDF, dan Markdown utuh.
- **File terkait:** `src/components/modals/ExportManager.tsx`, `src/lib/epub.ts`, `src/lib/zip.ts`
- **Tabel DB:** `chapters`, `projects`, `codex`
- **Endpoint:** Tidak ada (lokal di browser)
- **Catatan:** Ekspor naskah tebal menggunakan `yieldToUI()` berkala tiap 8 bab agar browser tidak hang. Gambar dinamis dibersihkan sebelum kompilasi EPUB.

---

## Snapshot & Visual Diff Revisi
- **Status:** Selesai
- **Deskripsi:** Sistem versioning draf naskah bab per-titik waktu dengan modal perbandingan visual kata-demi-kata (LCS diff) berwarna hijau/merah.
- **File terkait:** `src/features/editor/components/SnapshotPanel.tsx`, `src/components/modals/SnapshotDiffModal.tsx`, `src/lib/textDiff.ts`
- **Tabel DB:** `snapshots`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Algoritma diff beroperasi di level kata dengan fallback cerdas per-baris untuk dokumen masif guna mencegah kehabisan memori.

---

## Pencadangan Otomatis & Google Drive Sync
- **Status:** Selesai
- **Deskripsi:** Sistem cadangan berkala ke file terkompresi gzip, retensi kuota otomatis, dan integrasi opsional ke folder Google Drive pribadi via GIS token.
- **File terkait:** `src/services/backupService.ts`, `src/services/driveBackupService.ts`, `src/lib/backupValidation.ts`, `src/lib/backupIO.ts`, `src/lib/backupLimits.ts`, `src/lib/backupRetention.ts`, `src/hooks/useAutoBackup.tsx`
- **Tabel DB:** `backups`
- **Endpoint:** Tidak ada (langsung ke IndexedDB & Google Drive API)
- **Catatan:** Format keluaran v8; legacy v3–v7 diterima melalui normalisasi eksplisit. Service membedakan restore seluruh workspace dengan impor novel baru, memeriksa schema/ID/FK/checksum, membatasi file/dekompresi/record, dan hanya menerima data URL raster yang diizinkan. Kegagalan snapshot pengaman membatalkan restore; transaksi restore tetap atomik. UI menampilkan pesan penolakan dari service. Kontrak lengkap, keterbatasan auto internal, dan cakupan tes terdapat pada [format backup](backup-format.md).

---

## Dashboard Statistik & Progres Menulis
- **Status:** Selesai
- **Deskripsi:** Dasbor ringkasan eksekutif novel: total kata, target harian, distribusi status bab, kuota penyimpanan browser, dan audit token AI.
- **File terkait:** `src/components/panels/DashboardPanel.tsx`, `src/lib/dailyProgress.ts`, `src/hooks/useDailyProgress.ts`
- **Tabel DB:** `projects`, `chapters`, `aiUsageLogs`
- **Endpoint:** Tidak ada (lokal)
- **Catatan:** Perhitungan delta kata harian menggunakan tanggal lokal pengguna tanpa ketergantungan timezone server.

---

## Navigasi Studio & Footer Utilitas Sistem
- **Status:** Selesai
- **Deskripsi:** Navigasi 5 studio kerja utama (Menulis, Dunia & Lore, Visual & Peta, Analisis & Naskah, Asisten AI) dengan footer dock minimalis untuk utilitas sistem (Pengaturan, Panduan Pengguna, Log Error).
- **File terkait:** `src/components/layout/Sidebar.tsx`, `src/lib/studioNavigation.ts`
- **Tabel DB:** Tidak ada (state navigasi lokal)
- **Endpoint:** Tidak ada
- **Catatan:** Footer sistem menggunakan dock bar ringkas berbasis ikon dengan label kategori proporsional untuk mengoptimalkan ruang vertikal daftar bab dan menghindari kepadatan teks.

---

---

## Glosarium Istilah In-World & Mode strictMatch
- **Status:** Selesai
- **Deskripsi:** Basis data istilah *in-world* non-nama (satuan ukuran, pangkat, kalender, salam, idiom) untuk menjaga konsistensi ejaan secara deterministik di editor TipTap. Mendukung deteksi varian salah yang dideklarasikan, pendeteksian typo berbasis jarak edit (Levensthein), serta opsi mode `strictMatch` per-entri.
- **File terkait:** `src/types.ts`, `src/lib/glossary.ts`, `src/lib/glossary.test.ts`, `src/features/consistency/components/GlossaryPanel.tsx`
- **Tabel DB:** `glossary`
- **Endpoint:** Tidak ada (100% deterministik, 0 token AI)
- **Catatan:** Mode `strictMatch` (`GlossaryEntry.strictMatch`) menggunakan pencocokan regex case-sensitive persis (`g` tanpa `i`) dan mengecualikan entri dari fuzzy typo guessing. Mengeliminasi false-positive pada kata umum/istilah pendek (seperti "mana", "ki", "chi", singkatan "PM").

---

## Pelacak Janji Plot (Chekhov's Gun) & Rekomendasi Kata Kunci
- **Status:** Selesai
- **Deskripsi:** Pembukuan janji naratif (*plot promises*) yang dideklarasikan penulis—artefak, ramalan, misteri, atau rahasia yang harus terbayar (*payoff*). Sistem melacak di bab mana elemen muncul (via Codex ID atau kata kunci Aho-Corasick) dan membunyikan alarm bila elemen tertidur (*dormant*) terlalu lama. Dilengkapi ekstraktor rekomendasi kata kunci otomatis 1-klik saat membuat janji baru.
- **File terkait:** `src/types.ts`, `src/lib/plotPromises.ts`, `src/lib/plotPromises.test.ts`, `src/features/consistency/components/PlotPromisePanel.tsx`
- **Tabel DB:** `plotPromises`
- **Endpoint:** Tidak ada (100% deterministik, 0 token AI)
- **Catatan:** Fungsi `extractKeywordCandidates` mengekstrak frasa berhuruf kapital multi-kata, istilah tunggal penting (bukan kata hubung/stop words), serta entri glosarium yang cocok di judul/deskripsi janji, menyajikannya sebagai badge pil interaktif yang langsung menambahkan kata kunci ke formulir.

---

## Pengecek Kontinuitas & Audit Konsistensi Batch (Prompt Caching)
- **Status:** Selesai
- **Deskripsi:** Pengecekan konsistensi naskah dengan AI terhadap Story Bible, Codex Lore, Relasi Karakter, dan Linimasa Peristiwa. Menyediakan mode pemeriksaan bab tunggal dan mode **Audit Batch** (antrian berurutan untuk banyak bab sekaligus).
- **File terkait:** `src/features/consistency/components/ConsistencyPanel.tsx`, `src/services/ai/index.ts`, `src/lib/timelineSummary.ts`
- **Tabel DB:** `chapters`, `codex`, `bible`, `relationships`, `timeline`
- **Endpoint:** Provider AI (`openrouter`, `google`, `claude`, `groq`, dll.)
- **Catatan:** Mode Batch memproses bab secara sekuensial dengan bilah progres real-time dan opsi pembatalan aman. Karena knowledge base yang dikirimkan identik antar-bab, bab ke-2 dan seterusnya memanfaatkan *prompt caching hit* (~100% reusable context di Anthropic/Gemini) yang menghemat biaya token hingga 90% dan mempercepat respons. Hasil disajikan dalam akordeon ringkas per bab dengan deep link langsung ke kutipan terkait di editor manuskrip.

