# [ARSIP] Riwayat Implementasi Fitur Worldbuilding — AetherScribe

> **Arsip memori-proyek.** Catatan implementasi 17 modul worldbuilding yang telah dibangun ke dalam AetherScribe.
> **Status: Seluruh fitur inti di bawah SUDAH TERPASANG & AKTIF di aplikasi.**
> Untuk ide dan pekerjaan bersyarat saat ini, buka [roadmap](../../ROADMAP.md).

---

## Modul-Modul Worldbuilding yang Telah Selesai Dikirim

| # | Fitur | File / Modul Utama | Dampak & Mekanisme |
|---|---|---|---|
| **#1** | **Kebenaran Tersembunyi (Hidden Truth)** | `src/features/codex/`, `loreFormat.ts` | Field inert `hidden?` / `secret?` pada `CodexEntry` (v22). Pengetahuan rahasia disuntikkan ke AI tanpa bocor ke ekspor pembaca. |
| **#2** | **Janji Plot → Payoff** | `plotPromises.ts`, `PlotPromisesPanel.tsx` | Field `payoffCodexId?` (v23). Menghubungkan janji cerita yang ditebar dengan pengungkapan entri Codex/rahasia. |
| **#3** | **Bengkel Nama (Name Forge)** | `src/lib/nameForge.ts`, `NameForgeModal.tsx` | Generator nama fonotaktik & morfemik berbasis palet faksi. Disimpan di `namePalette` (v24). |
| **#4** | **Kalender Dunia (v1 Visual)** | `src/lib/worldCalendar.ts`, `WorldCalendarPanel.tsx` | Kalender kustom era/bulan/minggu/musim (`Project.calendar`, v31) + penanggalan terstruktur `TimelineEvent.startDate/endDate`. |
| **#7** | **Importer Dokumen** | `src/lib/codexImport.ts` | Parser Markdown ke entri Codex untuk migrasi catatan cepat sekali jalan. |
| **#8** | **Glosarium Istilah** | `glossary.ts`, `GlossaryPanel.tsx`, `ConsistencyUnderline.tsx` | Tabel `glossary` (v25) dengan deteksi typo/varian kata dan garis bawah teal di editor. |
| **#9** | **Integritas Graf Lore** | `src/lib/loreGraph.ts` | Pengecekan backlink dan deteksi dangling references ("Disebut oleh") tanpa tabel baru. |
| **#11** | **Pelacak Kelengkapan** | `worldCompleteness.ts`, `WorldCompletenessPanel.tsx` | Indikator kelengkapan entri dunia (`worldStatus`, `todo`, v27) dengan rekomendasi halus. |
| **#12** | **Papan Plotting Babak & Tensi** | `OutlinePanel.tsx` | Visualisasi struktur babak (Act) dan alur ketegangan naratif. |
| **#14** | **Graf Lore Visual Interaktif** | `LoreGraphPanel.tsx`, `loreGraphWorker.ts` | Kanvas visualisasi keterhubungan entitas dunia berbasis *force-directed graph*. |
| **#15** | **Papan & Hubungan Faksi** | `factions.ts`, `FactionsPanel.tsx` | Manajemen faksi (`factionTag`, v29) dan kanvas visual hubungan antar-faksi berbasis React Flow (`factionBoard`, v30). |
| **#16** | **Heatmap Tensi & Pacing** | `pacingHeatmap.ts`, `PacingHeatmapPanel.tsx` | Analisis ketegangan per bab (`Chapter.tension`, v28) dengan estimasi otomatis berbasis rasio dialog dan panjang kalimat. |
| **#17** | **Field Kustom Kategori Codex** | `codexFields.ts`, `CodexForm.tsx` | Fleksibilitas atribut per kategori (misal: Kelemahan Monster, Efek Artefak) via `CustomCategory.fields` dan `CodexEntry.customFields` (v26). |

---

## Filosofi Arsitektur yang Diterapkan
- **Pola Field Inert:** Menumpangkan data baru ke objek yang sudah ada tanpa tabel/Foreign Key baru, sehingga alur backup, ekspor, dan hapus proyek tetap zero-overhead.
- **Logika Murni Terpisah:** Semua kalkulasi kalender, graf, tensi, dan deteksi teks hidup sebagai modul murni di `src/lib/` yang didukung unit test komprehensif.
