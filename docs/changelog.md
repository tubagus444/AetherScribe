# Changelog — AetherScribe

Catatan riwayat perubahan arsitektur, fitur, perbaikan bug, dan dokumentasi di repositori AetherScribe. Entri terbaru selalu berada di bagian teratas.

---

## 2026-11-13

### [Fix] F19/F20 ? Snapshot Konsisten dan Retensi Drive Setelah Upload

- Pusatkan pembacaan backup dalam transaksi readonly setelah flush editor tervalidasi, termasuk backup per-proyek dan metadata ekspor manuskrip. Blob/checksum/kompresi di luar transaksi; save gagal menghentikan operasi dengan pesan error.
- Upload Drive wajib sukses dan mengembalikan ID sebelum prune. Error upload/network/missing ID tidak menghapus cadangan lama. Error prune menjadi warning terpisah; keberhasilan upload tetap dipertahankan.
- Verifikasi: 55 berkas/634 tes lulus; typecheck dan build lulus (peringatan build lama tetap ada). Sembilan tes regresi memakai DB terisolasi dan Drive mock: flush/gagal save, konsistensi penulisan bersamaan, scope proyek, urutan upload/delete dan kegagalan retensi. Belum browser/Drive nyata; perubahan setelah snapshot tidak termasuk hasil backup. F10 tetap terbuka meskipun koleksi per-proyek kini juga mencakup tabel triage.


### [Fix] F11 — Penghapusan Entitas dan Integritas Referensi

- Pusatkan penghapusan bab/peta/Codex/proyek dalam transaksi domain. Bersihkan snapshot/embedding, lepaskan referensi terstruktur dan portal masuk; pertahankan teks timeline/chat/janji plot. Workshop entri yang dihapus menjadi sesi studio. Triage proyek terkait direset.
- Satukan jalur ChapterList dan outline. Penghapusan proyek membersihkan snapshot legacy tanpa parent, mempertahankan snapshot bab hidup serta riwayat backup. Cache konsistensi bab dibersihkan setelah commit dan hasil request lama tidak menulis ulang map cache yang telah dilepas.
- Verifikasi: 54 berkas/625 tes lulus; typecheck dan build lulus (peringatan build lama tetap ada). Sembilan tes DB sintetis mencakup isolasi proyek, unlink, snapshot orphan, retensi backup dan rollback semua jenis delete. Belum verifikasi browser native atau penulisan lintas-tab bersamaan. F10/F19 tetap terbuka.

### [Fix] F06/F07 — Duplikasi Bab, Urutan Atomik, dan Persistensi Triage

- Duplikasi ChapterList membaca entitas lengkap setelah flush editor, bukan metadata list dengan content kosong. Pisahkan tipe metadata; normalisasi urutan add/delete/duplicate/move dalam transaksi dengan tie-break ID. Error operasi ditampilkan ke pengguna.
- Ganti query compound-index triage yang tidak tersedia dengan query projectId/filter findingId. Set/update/clear transaksional, terisolasi proyek dan mengonsolidasi duplikat pasangan yang disentuh. Schema DB tetap v33.
- Verifikasi: 53 berkas/616 tes lulus, typecheck dan build lulus (peringatan bundle/ActionsPanel/ONNX/Browserslist lama tetap ada). Tujuh tes regresi DB terisolasi mencakup salinan HTML/metadata, urutan, rollback, kegagalan flush, concurrency, isolasi proyek dan persistensi setelah koneksi dibuka ulang. Batas: belum pengujian UI/browser native; F10/F11 tetap terbuka.

### [Fix] F02/F18 — Batas Localhost dan Validasi Proxy

- Bind server ke 127.0.0.1; periksa Host/Origin/Sec-Fetch-Site sebelum parser/akses key. Batasi Ollama ke loopback HTTP port 11434 dan tolak redirect pada semua request upstream.
- Validasi objek request, provider, model, stream, dan URL sebelum handler async. Tambahkan wrapper rejection untuk semua POST serta error JSON parser/oversize terstruktur. Ekspor factory app agar HTTP dapat diuji tanpa startup Vite.
- Tambahkan 26 tes boundary dan HTTP loopback dengan upstream mock. Seluruh 609 tes lulus; typecheck dan build lulus (peringatan build lama tetap ada). Tidak menggunakan key/data pengguna. Kebijakan dan batas kompatibilitas Ollama remote didokumentasikan di docs/api.md; F21 tetap terbuka.

### [Fix] F01 — Stored XSS pada Label Atlas

- Mengganti string HTML ikon dengan DOM dalam `atlasMarkerIcons.ts`. Judul marker/nama Codex pada pin, area, route, dan portal menggunakan `textContent`; tooltip dinamis Leaflet menerima HTMLElement. SVG dekoratif memakai atribut konstan, tanpa parsing markup dari data pengguna.
- Menambahkan allowlist warna hex `#RGB`/`#RRGGBB` di resolver dan boundary render, termasuk polygon/polyline serta handle edit. Override invalid memakai fallback tanpa mengubah data tersimpan; tidak menambah dependensi atau mengubah skema DB.
- Menambahkan 49 tes regresi memakai Leaflet asli di jsdom dan fixture JSON sintetis. Pada source awal `c12bc43`, tes DOM mereproduksi 27 kegagalan/1 lulus (markup menjadi node/handler dan warna dapat menyisipkan HTML). Setelah perbaikan, 50 berkas/583 tes lulus; `npm run lint`, `npm run build`, dan `git diff --check` lulus. Peringatan build tetap terkait bundle besar, import ActionsPanel, eval ONNX, dan Browserslist lama.
- Memperbarui katalog fitur, kontrak backup terkait label, aturan Atlas, dan roadmap. Tidak mengubah snapshot laporan audit. Belum ada pengujian visual atau eksekusi payload di browser native; verifikasi jsdom memastikan payload tidak menjadi elemen/atribut handler.

## 2026-11-10

### [Fix] F03/F04 — Restore Atlas dan Validasi Backup

- Format backup v8 menandai gambar lengkap/referensi secara eksplisit. Auto internal tetap ramping melalui SHA-256 dan mempertahankan Blob live yang cocok; aset tidak tersedia membuat restore dibatalkan. File/Drive/ekspor/pre-restore menyimpan gambar lengkap; gambar yang memang sudah hilang ditandai eksplisit.
- Semua jalur restore/impor memakai schema terpusat: scope, versi 3–8, record/metadata, ID/kunci unik, dan FK termasuk batas proyek. Legacy v3–v7 dinormalisasi setelah verifikasi checksum data asli. Scope project tidak dapat mengganti seluruh workspace.
- Batas file/unduhan 64 MiB, JSON dekompresi 128 MiB, string 16 MiB, gambar 5 MiB, record 100.000/tabel dan 200.000 total. Dekompresi/unduhan dihitung per chunk. Decoder hanya menerima data URL PNG/JPEG/WebP/GIF dan tidak melakukan fetch gambar.
- Snapshot pra-restore wajib lengkap dan berhasil sebelum clear; kegagalan ditampilkan di UI dan membatalkan restore. Transaksi clear/refill tetap atomik. Skema DB tetap v33; tidak menambah dependensi.
- Menambahkan 49 tes pada service backup dan Drive mock. Tujuh reproduksi regresi gagal pada source `270b5f2` sebelum perbaikan. Verifikasi akhir: 48 berkas/534 tes lulus; typecheck dan build lulus. Peringatan build tetap terkait bundle besar, import ActionsPanel, eval ONNX, dan Browserslist lama.
- Memperbarui katalog fitur, dokumentasi DB, keputusan arsitektur, aturan modul, dan [format backup](backup-format.md). Batas: DB browser native/Drive nyata belum diuji; fixture legacy sintetis; legacy tanpa hash tidak dapat membuktikan versi gambar lama. Konsistensi snapshot bersamaan F19 dan round-trip F10 tetap terbuka.

### [Fix] F05 — Flush editor meneruskan kegagalan simpan

- Save konten hanya dianggap berhasil bila update memengaruhi tepat satu bab; error DB, ID invalid, dan update nol baris membuat flush reject serta menampilkan `Gagal menyimpan`. Konten kosong tetap dapat disimpan.
- Draft tetap di editor saat gagal. Find & Replace berhenti sebelum membaca/mengubah bab, membuat snapshot, atau reload; klik ulang mencoba flush kembali. Bridge reload menolak setelah save gagal sampai penyimpanan berhasil.
- Handler `versionchange` menahan auto-close Dexie dan hanya menutup/reload setelah flush sukses; kegagalan ditampilkan melalui isu DB. Rejection autosave/unmount/pergantian bab/pagehide ditangani; timer status lama dibersihkan agar pesan gagal tetap terlihat.
- Menambahkan dev dependencies `@testing-library/react`, `jsdom`, dan `fake-indexeddb` untuk tes React serta IndexedDB terisolasi. Lima tes gagal pada implementasi awal, lalu lulus setelah perbaikan; 12 tes regresi F05 mencakup kegagalan, retry, konten kosong, pembatalan replace/reload, dan `versionchange`.
- Verifikasi: `npx vitest run` — 46 berkas/485 tes lulus; `npm run lint`, `npm run build`, dan `git diff --check` lulus. Peringatan build terkait ukuran bundle, import ActionsPanel, eval ONNX, dan Browserslist dicatat di ROADMAP.
- Batas: belum ada verifikasi browser native/upgrade lintas-tab nyata; flush saat penutupan paksa tetap bersifat best effort. Data/key pengguna dan layanan eksternal tidak dipakai.

## 2026-11-09

### [Docs] Audit Aplikasi dan Backlog Perbaikan Berdasarkan Prioritas

- Menambahkan [indeks dokumentasi](README.md), [laporan audit 21 bagian](audits/2026-11-09-application-audit.md), dan [register 29 temuan F01–F29](audits/2026-11-09-findings.md).
- Menyimpan bukti source/baris, severity, metode dan batas verifikasi, rekomendasi, effort, dependensi, risiko perubahan, serta kriteria penerimaan tiap temuan.
- Menambahkan checklist P1/P2/P3 di [ROADMAP.md](../ROADMAP.md#audit-2026-11-09) sebagai satu-satunya tracker aktif; seluruh temuan masih terbuka.
- Menjelaskan perbedaan temuan baseline sekarang dengan klaim/keputusan dokumentasi historis tanpa mengubah arsip atau menyatakan keputusan baru sudah diterapkan.
- Hasil 43 berkas/473 tes, typecheck, build dan probe mock berasal dari sesi audit; penulisan dokumentasi ini tidak menjalankan ulang pengujian aplikasi atau layanan eksternal.
- **Cakupan perubahan:** hanya dokumentasi dan roadmap; tidak ada perubahan source, schema, fitur, API, atau implementasi mitigasi.

## 2026-10-09

### [Fitur] Glosarium strictMatch, Janji Plot Rekomendasi Kata Kunci, & Audit Konsistensi Batch
- **Glosarium: Mode strictMatch Opt-In per-Entri**:
  - Menambahkan field `strictMatch?: boolean` pada `GlossaryEntry` di `src/types.ts`.
  - Memperbarui `findGlossaryIssues` di `src/lib/glossary.ts` untuk menggunakan regex case-sensitive (`'g'` tanpa flag `'i'`) bila `strictMatch` aktif pada entri, serta mengisolasi entri tersebut dari fuzzy typo guessing agar istilah pendek atau huruf-kecil (seperti "mana", "ki", "chi", atau singkatan gelar "PM") tidak memicu false-positive terhadap kata umum bahasa Indonesia.
  - Menambahkan badge penanda `Ketat` pada kartu istilah dan kontrol centang interaktif pada `GlossaryForm` di `GlossaryPanel.tsx`.
- **Janji Plot: Rekomendasi Otomatis Kandidat Kata Kunci**:
  - Mengimplementasikan `extractKeywordCandidates` di `src/lib/plotPromises.ts` (100% deterministik, 0 token AI) untuk mengekstrak frasa berhuruf kapital multi-kata, kata tunggal esensial (dengan filter stop-words bahasa Indonesia/Inggris), serta pencocokan istilah glosarium aktif yang muncul di judul atau deskripsi janji.
  - Menampilkan lencana pil rekomendasi interaktif berikon *Sparkles* di `PlotPromisePanel.tsx` pada mode pelacakan kata kunci. Mengklik pil langsung menambahkan kata kunci ke formulir tanpa perlu mengetik ulang.
- **Audit Konsistensi Batch: Antrian Multi-Bab Berbasis Prompt Caching**:
  - Menambahkan pengalih tab `Bab Tunggal` vs `Audit Batch (Banyak Bab)` di `ConsistencyPanel.tsx`.
  - Mode Batch menyediakan antrian pemilihan multi-bab dengan tombol aksi cepat (*Pilih Semua*, *5 Bab Terakhir*, *Kosongkan*) dan perhitungan estimasi kata.
  - Memproses bab secara berurutan dalam antrian otomatis lengkap dengan bilah progres real-time (`%`, bab berjalan) serta tombol pembatalan aman kapan saja.
  - Menampilkan spanduk edukasi *Prompt Caching*: karena *Story Bible*, *Codex Lore*, dan relasi karakter dikirimkan dalam payload yang sama, bab ke-2 dan seterusnya memanfaatkan cache prompt AI (Anthropic/Gemini) yang menghemat biaya token hingga ~90% dan memangkas latensi.
  - Menyajikan ringkasan statistik temuan (Tinggi, Sedang, Rendah) dan akordeon hasil per bab yang dapat dibuka-tutup mandiri, lengkap dengan tombol `Buka di editor` untuk langsung melompat ke posisi kutipan bermasalah di naskah.
- **File yang berubah:**
  - `src/types.ts`
  - `src/lib/glossary.ts` & `src/lib/glossary.test.ts`
  - `src/features/consistency/components/GlossaryPanel.tsx`
  - `src/lib/plotPromises.ts` & `src/lib/plotPromises.test.ts`
  - `src/features/consistency/components/PlotPromisePanel.tsx`
  - `src/features/consistency/components/ConsistencyPanel.tsx`
  - `ROADMAP.md`
  - `docs/features.md`
  - `docs/changelog.md`

### [UI/UX] Perbaikan Tema Gelap & Penataan Pop Up Modal Kalender Dunia
- **Portal Rendering & Solusi Modal Terpotong**: Membungkus seluruh dialog pop up kalender (`CalendarCalculatorModal.tsx`, `ChronologyAuditModal.tsx`, `CalendarEditorModal.tsx`, `CalendarEventModal.tsx`) menggunakan `createPortal` langsung ke `document.body` dengan layer `z-[9999]`. Menghilangkan batasan stacking context dari `MainView` sehingga modal tidak lagi tertutup atau terpotong oleh header atas aplikasi.
- **Ketinggian Responsif Modal**: Mengubah batas ketinggian modal menjadi `max-h-[85vh]` dengan pemosisian `my-auto` dan pengguliran internal mandiri (`overflow-y-auto custom-scrollbar`), memberikan margin vertikal yang lega dari batas atas dan bawah layar.
- **Penyelarasan Tema Gelap (*Dark Mode*)**:
  - Menghapus kelas warna Tailwind non-standar (`dark:bg-slate-850`, `dark:border-indigo-850`) yang sebelumnya gagal di-render dan menyebabkan header inspector serta kartu estimasi perjalanan tampak putih pudar di mode gelap.
  - Memperbarui header tab panel samping di `WorldCalendarPanel.tsx` dengan kontras yang harmonis (`dark:bg-slate-900`, wadah tab `dark:bg-slate-950/80`, dan tab aktif `dark:bg-slate-800 text-indigo-400`).
  - Menyelaraskan kartu moda transportasi di Kalkulator Perjalanan (`dark:bg-slate-800/60`, `dark:border-slate-800`) dan kartu detail tanggal.
  - Menambahkan kontras teks yang tegas (`text-slate-800 dark:text-slate-100`) pada seluruh field input, select, dan tombol utilitas kalender.
- **File yang berubah:**
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `src/features/timeline/components/CalendarCalculatorModal.tsx`
  - `src/features/timeline/components/ChronologyAuditModal.tsx`
  - `src/features/timeline/components/CalendarEditorModal.tsx`
  - `src/features/timeline/components/CalendarEventModal.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [Docs] Pembaruan Panduan Kalender Dunia pada Panel Panduan Pengguna
- **Sinkronisasi Modul Panduan**: Memperbarui kartu panduan utama `Kalender Dunia` (`guideContent.tsx`) agar mencerminkan arsitektur antarmuka 2-kolom terbaru, tombol toggle mode layar penuh/Zen Mode, navigasi tab *Detail Tanggal* & *Agenda*, navigasi *Bird's-Eye Heatmap View*, sistem festival tahunan berulang, pelacak usia dinamis karakter dari Codex, kalkulator perjalanan multi-moda, dan audit kronologi deterministik nol token.
- **Relokasi Kategori**: Menempatkan fitur Kalender Dunia secara tepat di bawah grup `Dunia, Lore & Codex` (`group: 'world'`) sesuai posisinya di bilah navigasi studio, serta melengkapi tombol aksi cepat *"Buka Kalender Dunia"*.
- **Pembaruan Fitur Terkait & Fitur Mikro**: Memperbarui panduan `Peta Kontinuitas` untuk mencakup pemeriksaan urutan kronologi mundur, menambahkan tip penanggalan pada `Timeline Cerita`, serta menambahkan 6 entri sorotan fitur baru pada daftar `Fitur Kecil` (`SMALL_FEATURES`).
- **File yang berubah:**
  - `src/components/panels/guide/guideContent.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [UI/UX] Redesain Layout Kalender Dunia: Arsitektur 2-Kolom & Inspector Terpadu
- **Penyelesaian Masalah Kepadatan Layar**: Menghapus layout kaku 3-kolom (`1fr_300px_300px`) yang sebelumnya mempersempit lebar sel kalender menjadi ~65px. Menggantinya dengan arsitektur **2-Kolom Fleksibel** (`lg:flex-row`) di mana grid kalender mendapatkan prioritas ruang utama (*Hero Area*) yang lapang.
- **Unified Collapsible Inspector**: Menggabungkan kolom terpisah "Peristiwa di Tanggal Ini" dan "Daftar Semua Peristiwa" menjadi satu panel samping terpadu di kanan (~360px) dengan sistem navigasi tab segmented (`Detail Tanggal` & `Agenda`).
- **Sidebar Toggle & Full-Width Mode**: Menambahkan tombol toggle expand/collapse panel samping di header kalender (`PanelRightClose` / `PanelRightOpen`) sehingga penulis dapat memperluas kalender ke mode 100% layar penuh (*zen mode*) kapan saja.
- **Penyederhanaan Sel Kalender Bulanan**: Menata ulang tipografi nomor hari, menyederhanakan indikator hari libur menjadi badge ikon bintang/sparkle yang ringkas tanpa tumpang tindih, serta merapikan pill peristiwa dan bar rentang waktu (*range events*) agar tetap terbaca jelas tanpa memotong ruang sel.
- **Interaksi Kontekstual Mulus**: Mengklik sel tanggal manapun di kalender bulanan atau heatmap tahunan otomatis membuka panel samping (bila tertutup) dan beralih ke tab `Detail Tanggal`. Mengklik peristiwa di pohon agenda otomatis melompat (*jump to date*) ke tanggal bersangkutan di kalender dan membuka rinciannya.
- **File yang berubah:**
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [Fitur] Kalender Dunia: Hari Libur Tahunan, Pelacak Usia Karakter, & Heatmap Tahunan
- **Hari Libur & Festival Tahunan (*Recurring Holidays*)**: Menambahkan struktur data `WorldCalendarHoliday` ke `Project.calendar`, manajemen hari libur & swatch warna di `CalendarEditorModal.tsx`, fungsi filter deterministik `holidaysOnDate`, indikator visual berkilau (`Sparkles`) pada sel kalender bulanan dan heatmap tahunan, serta spanduk perayaan tematik di kartu detail hari.
- **Pelacak Usia Karakter Dinamis (*Dynamic Age Tracker*)**: Menambahkan field `birthDate` pada `CodexEntry` (kategori *character*), picker tanggal lahir terstruktur (Era, Tahun, Bulan, Hari) di `CodexForm.tsx`, chip tanggal lahir di `CodexDetailModal.tsx`, serta kalkulasi usia deterministik (`calculateCharacterAge`) lengkap dengan pendeteksian hari ulang tahun (`🎂 Ulang tahun!`) dan status belum lahir (`⚠️ Belum lahir`). Ditampilkan interaktif pada chip karakter di `CalendarEventModal.tsx` dan kartu peristiwa di `WorldCalendarPanel.tsx`.
- **Navigasi Tampilan Tahunan (*Bird's-Eye / Heatmap View*)**: Menyediakan pengalih mode `Bulan` vs `Tahun (Heatmap)` di `WorldCalendarPanel.tsx`. Komponen `YearHeatmapView` merender grid seluruh bulan dalam setahun dengan intensitas warna kepadatan peristiwa (0 peristiwa, 1 peristiwa, 2+ peristiwa, rentang waktu, dan hari libur) disertai interaksi zoom 1-klik langsung ke bulan dan tanggal bersangkutan.
- **File yang berubah:**
  - `src/types.ts`
  - `src/lib/worldCalendar.ts` & `src/lib/worldCalendar.test.ts`
  - `src/features/timeline/components/CalendarEditorModal.tsx`
  - `src/features/timeline/components/CalendarEventModal.tsx`
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `src/features/codex/components/CodexForm.tsx`
  - `src/features/codex/components/CodexDetailModal.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

### [Fitur] Kalender Dunia Fase 2: Audit Kronologi Deterministik & Kalkulator Perjalanan
- Mengimplementasikan **Kalkulator Jarak Waktu & Perjalanan** (`CalendarCalculatorModal.tsx`) dengan dukungan penghitungan selisih tanggal in-world (`daysBetween`, `breakdownDays`), estimasi jarak tempuh berbagai moda transportasi fantasi (`TRAVEL_MODES`: jalan kaki, kereta kafilah, kuda santai, kurir kilat, kapal layar, burung pos), proyeksi tanggal tiba (`addDays`, `addMonths`), dan pembuatan instan peristiwa rentang linimasa.
- Mengimplementasikan **Mesin Audit Kronologi Deterministik** (`chronologyAudit.ts`) berbiaya 0 AI token untuk mendeteksi tanggal mundur antar-bab (`retrograde-chapter`), urutan tanggal terbalik di bab yang sama (`retrograde-same-chapter`), dan rentang terbalik (`invalid-range`).
- Menambahkan **Toleransi Kilas Balik (*Flashback*)**: Otomatis mendeteksi indikasi analepsis/kilas balik pada judul atau deskripsi bab/peristiwa untuk mencegah false positive.
- Mengintegrasikan hasil audit ke **Dasbor Peta Kontinuitas** (`continuity.ts`, check `'chronology-retrograde'`) lengkap dengan triase (*abaikan/selesaikan*) dan tombol lencana peringatan interaktif di header **Kalender Dunia** (`ChronologyAuditModal.tsx`).
- Menambahkan tombol aksi cepat *"Hitung perjalanan dari tanggal ini"* pada kartu detail tanggal di `WorldCalendarPanel.tsx`.
- **File yang berubah:**
  - `src/lib/worldCalendar.ts` & `src/lib/worldCalendar.test.ts`
  - `src/lib/chronologyAudit.ts` (baru) & `src/lib/chronologyAudit.test.ts` (baru)
  - `src/lib/continuity.ts` & `src/lib/continuity.test.ts`
  - `src/features/consistency/components/ContinuityDashboard.tsx`
  - `src/features/timeline/components/CalendarCalculatorModal.tsx` (baru)
  - `src/features/timeline/components/ChronologyAuditModal.tsx` (baru)
  - `src/features/timeline/components/WorldCalendarPanel.tsx`
  - `docs/features.md`
  - `ROADMAP.md`
  - `docs/changelog.md`

### [UI/UX] Redesain Footer Utilitas Sistem pada Sidebar
- Mengubah footer tombol sistem di `Sidebar.tsx` dari 3 tombol teks horizontal yang padat dan berdesakan menjadi **Minimalist Icon Dock Bar** (gaya VS Code/Figma).
- Menambahkan label section ringkas "SISTEM" dengan tipografi harmonis (`tracking-[0.18em]`) serta tombol ikon proporsional (Pengaturan, Panduan, Log Error) dengan tooltip dan dukungan auto-close pada layar mobile (<768px).
- **File yang berubah:**
  - `src/components/layout/Sidebar.tsx`
  - `docs/features.md`
  - `docs/changelog.md`

---

## 2026-10-08

### [Refactor] Arsitektur Dokumentasi Modular
- Memecah dokumentasi monolitik dari `CLAUDE.md` dan `AGENTS.md` ke dalam format modular di direktori `docs/` (`overview.md`, `architecture.md`, `features.md`, `database.md`, `api.md`, `decisions.md`, `changelog.md`).
- Merampingkan `CLAUDE.md` dan `.agents/AGENTS.md` menjadi pengarah ringkas di bawah 80 baris dengan klausul aturan wajib pembaruan dokumentasi.
- **File yang berubah:**
  - `docs/overview.md` (baru)
  - `docs/architecture.md` (baru)
  - `docs/features.md` (baru)
  - `docs/database.md` (baru)
  - `docs/api.md` (baru)
  - `docs/decisions.md` (baru)
  - `docs/changelog.md` (baru)
  - `CLAUDE.md`
  - `.agents/AGENTS.md`

---

## 2026-10-07

### [Refactor] Konsolidasi Tracker Root ke ROADMAP.md
- Merapikan dan memindahkan 5 file rencana/audit historis dari root direktori ke `docs/archive/` (`RENCANA-AUDIT-KODE.md`, `RENCANA-OPTIMASI-AI.md`, `RENCANA-ATLAS-DUNIA.md`, `ARSIP-AUDIT-FABLE.md`, `ARSIP-FITUR-WORLDBUILDING.md`).
- Membuat tracker aktif tunggal `ROADMAP.md` di root untuk memantau sisa tugas riil (Fase 2 Kalender Dunia, optimasi memory worker backup, Unicode PDF).
- **File yang berubah:**
  - `ROADMAP.md` (baru)
  - `docs/archive/*` (baru)
  - `CLAUDE.md`
  - `.agents/AGENTS.md`
  - `.gitignore`

---

## 2026-07-07

### [DB] [Fitur] Triase Temuan Peta Kontinuitas & Kalender AI Bridge
- Menambahkan tabel `continuityTriage` pada skema Dexie versi 33 untuk menyimpan status temuan kontinuitas yang diabaikan/disembunyikan oleh penulis.
- Memperbarui `buildTimelineSummary` agar menyertakan rentang tanggal kalender dunia terstruktur (`formatDateRange`) ke dalam konteks prompt AI.
- **File yang berubah:**
  - `src/db.ts`
  - `src/types.ts`
  - `src/features/consistency/components/ContinuityDashboard.tsx`
  - `src/lib/timelineSummary.ts`
  - `src/lib/importRemap.ts`

---

## 2026-07-06

### [Fitur] [DB] Atlas Dunia v1.0 s/d v2.1
- Implementasi panel peta interaktif Leaflet CRS.Simple (tabel `maps` dan `mapMarkers` skema Dexie v32).
- Penambahan penanda pin, poligon area wilayah, polyline rute, kalibrasi skala dan jarak nyata, deteksi wilayah yatim, dan navigasi sub-peta bertingkat (*hierarchical sub-maps*).
- **File yang berubah:**
  - `src/features/atlas/*`
  - `src/lib/mapGeometry.ts`
  - `src/lib/atlasAnalytics.ts`
  - `src/lib/atlasHierarchy.ts`
  - `src/db.ts`
  - `src/types.ts`

---

## 2026-07-03

### [Fitur] Papan Faksi, Graf Lore Visual & Heatmap Pacing
- Menambahkan kanvas visualisasi relasi faksi berbasis React Flow (`factionBoard`).
- Menambahkan visualisasi graf lore interaktif menggunakan Web Worker (`loreGraphWorker.ts`).
- Mengimplementasikan Heatmap tensi per bab dengan estimasi otomatis berbasis rasio dialog.
- **File yang berubah:**
  - `src/features/lore/components/FactionsPanel.tsx`
  - `src/features/codex/components/LoreGraphPanel.tsx`
  - `src/features/consistency/components/PacingHeatmapPanel.tsx`
  - `src/lib/pacingHeatmap.ts`
  - `src/lib/loreGraph.ts`
