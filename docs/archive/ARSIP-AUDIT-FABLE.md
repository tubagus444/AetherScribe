# [ARSIP] Riwayat Audit Kualitas Fable 5 — AetherScribe

> **Arsip memori-proyek.** Catatan komprehensif seluruh perbaikan teknis dari audit Fable 5.
> **Status: 30+ Temuan Berdampak Tinggi/Sedang SUDAH SELESAI.**
> Untuk status dan prioritas saat ini, buka [roadmap](../../ROADMAP.md).

---

## BATCH 1 — Alur AI, Context Engine, Continuity

| Area | Temuan & Solusi yang Telah Selesai | Komponen Terkait |
|---|---|---|
| **Jantung AI & Test** | Logika inti diekstrak ke `circuitBreaker.ts` + `resilience.ts` (backoff, fallback provider, deduplikasi, parsing JSON). Didukung **24 unit test**. | `src/services/ai/` |
| **Formatter KB & Token** | Pemusatan formatter lore ke `src/lib/loreFormat.ts` (+13 tes). Meter token kini akurat menghitung custom fields, rahasia, dan graf relasi. | `loreFormat.ts`, `contextWorker.ts` |
| **Boilerplate Facade** | 7 fungsi alur AI disatukan dengan helper `executeAIAction` dan `resolveContextBuilder`. Menghilangkan ratusan baris duplikasi boilerplate. | `src/services/ai/index.ts` |
| **Lore Terpotong Senyap** | Pemotongan konteks lore kini presisi pada batas entri penuh (blok rahasia tidak terpotong separuh) + peringatan konsol saat cap tercapai. | `loreFormat.ts` |
| **Presence Scan Non-Blocking** | Pemindaian kehadiran entitas dipindahkan dari main thread ke Web Worker (`buildPresenceIndexAsync`). | `contextWorker.ts`, `usePresenceIndex.ts` |
| **Timeout Worker Idle-Based** | Timeout worker diganti menjadi berbasis idle (di-reset tiap ada progres pengunduhan model/embedding). | `contextEngine.ts` |
| **Pagar Kuota Cache** | Pagar kuota global LRU `MAX_CACHED_CHAPTERS=40` + degradasi otomatis saat kuota `localStorage` penuh. | `useEditorAIConsistency.ts` |
| **Triase Peta Kontinuitas** | Dukungan menyembunyikan/menandai temuan kontinuitas via tabel `continuityTriage` (v33). | `ContinuityPanel.tsx` |
| **Auto-Index Semantik** | Daemon inkremental `useAutoSemanticIndex` memantau modifikasi bab lalu memperbarui embedding di latar belakang secara otomatis. | `App.tsx`, `contextWorker.ts` |
| **Diff Revisi Snapshot** | Algoritma word-level LCS `textDiff.ts` (+4 tes) dan modal visual `SnapshotDiffModal.tsx` untuk membandingkan draf antar-snapshot. | `src/lib/textDiff.ts` |

---

## BATCH 2 — Integritas Data, Editor & Daemon

| Area | Temuan & Solusi yang Telah Selesai | Komponen Terkait |
|---|---|---|
| **Optimasi Serialisasi Backup** | Jalur auto-backup internal diringkas menjadi 1x stringify via `assembleBackupJson` (+5 tes), memangkas beban memori. | `backupService.ts`, `backupEnvelope.ts` |
| **Resiliensi Kuota Backup** | Helper `addBackupResilient` otomatis merotasi cadangan lama saat IndexedDB mendekati kuota penyimpanan. | `backupRetention.ts` |
| **Refaktor Skema Dexie** | Konstanta toko bertingkat (`CORE_STORES` s/d `STORES_V32`) memangkas ~280 baris duplikasi definisi skema tabel. | `src/db.ts` |
| **Validasi Keamanan Restore** | Pengecekan versi minimal (≥ v3), validasi array tabel inti, dan verifikasi checksum integritas SHA-256. | `backupService.ts`, `importRemap.ts` |
| **Autosave Tab Ditutup** | Listener `pagehide` + `visibilitychange` di `useGlobalEvents` memanggil `flushActiveEditor()` mencegah hilangnya kata terakhir saat tab ditutup tiba-tiba. | `useGlobalEvents.ts`, `editorBridge.ts` |
| **Reload Aman Migrasi DB** | Event `db.on('versionchange')` melakukan `flushActiveEditor()` terlebih dahulu sebelum memuat ulang halaman. | `src/db.ts` |
| **Isolasi ErrorBoundary** | Root boundary hanya menangani error render kritis; `PanelErrorBoundary` membungkus panel aktif sehingga kegagalan satu panel tidak merusak Sidebar. | `PanelErrorBoundary.tsx` |
| **Notifikasi Masalah DB** | Peringatan IndexedDB disalurkan ke pengguna via `useDbIssueListener` dan toast persisten. | `useDbIssueListener.ts` |

---

## BATCH 3 — Ekspor, Graf Runtime, RAG & Asisten

| Area | Temuan & Solusi yang Telah Selesai | Komponen Terkait |
|---|---|---|
| **Ekspor Non-Blocking** | Pembuatan PDF dan DOCX menggunakan `yieldToUI()` berkala (tiap 8 bab) sehingga UI tidak membeku pada naskah tebal. | `ExportManager.tsx` |
| **Struktur Rapi DOCX** | `blockToParagraphs` rekursif mempertahankan hierarki list bertingkat (`ul`/`ol`) dan blockquote. | `ExportManager.tsx` |
| **Sanitasi Gambar EPUB** | Pembersihan otomatis elemen `<img>` dinamis yang tidak terdaftar di manifes buku sebelum konversi XHTML. | `epub.ts` |
| **Graf Lore di Web Worker** | Kalkulasi graf entitas dipindahkan ke `loreGraphWorker.ts` dengan debounce 300ms, mencegah lag UI saat Codex bertambah ratusan entri. | `loreGraphWorker.ts` |
| **Analitik Spasial Region** | Mesin murni `atlasAnalytics.ts` (`pointInPolygon`) menghubungkan kehadiran karakter dengan poligon area wilayah di peta. | `atlasAnalytics.ts` |
| **Isolasi RAG Multi-Proyek** | Guard `projectId` pada `oramaStore.indexEntry` mencegah pencemaran data pencarian antar novel. | `oramaStore.ts` |
| **Pencarian Terpadu (Federated)** | `SemanticSearchPanel` menyatukan hasil kemiripan makna scene naskah dan pencarian BM25 entri Codex dalam satu tampilan terpadu. | `SemanticSearchPanel.tsx` |
| **Manajemen Sesi Chat AI** | Pencegahan tumpang tindih chat saat berganti sesi secara cepat via `targetSessionId` eksplisit dan auto-cancel AI in-flight. | `useChatSession.ts` |
