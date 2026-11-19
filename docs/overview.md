# Overview Aplikasi — AetherScribe

## 1. Tujuan Aplikasi
**AetherScribe** adalah lingkungan penulisan novel berbasis web yang mengusung arsitektur **local-first** (*Intelligent Writing Environment* / IWE). Aplikasi ini bukan dirancang untuk "AI yang menulis cerita secara otomatis", melainkan sebagai kokpit bagi penulis untuk:
- Mengelola novel panjang dengan puluhan bab dan ratusan ribu kata secara lancar.
- Menjaga konsistensi logika cerita (*anti-plot-hole*), linimasa waktu, kontinuitas karakter, dan aturan dunia fiksi (*lore*).
- Memanfaatkan AI sebagai mitra penyunting, pengecek konsistensi, dan rekan diskusi kreatif tanpa mengorbankan privasi data.

## 2. Target Pengguna
- Penulis novel panjang fiksi/fantasi/fiksi-ilmiah yang memiliki *worldbuilding* kompleks.
- Penulis yang mengutamakan privasi dan kedaulatan data (semua karya tersimpan di perangkat lokal pengguna, bukan server pihak ketiga).
- Penulis yang membutuhkan sistem pelacak kontinuitas deterministik (bebas biaya token) yang dipadukan dengan model bahasa besar (LLM) adaptif.

## 3. Filosofi Arsitektur
- **Local-First & Offline-Ready:** Seluruh data novel, bab, dan ensiklopedia disimpan di browser pengguna via IndexedDB (Dexie). Tidak ada database di sisi backend.
- **BYOK (Bring Your Own Key):** Kunci API yang baru disimpan di sesi tab
  secara default dan dikirim saat memanggil proxy. Pengguna dapat memilih
  menyimpannya di browser. [Privasi kredensial](features.md#privasi-kredensial-dan-log-f27)
- **Deterministik Sebelum AI:** Fitur pelacakan kontinuitas, glosarium, relasi, dan metrik prosa bekerja 100% deterministik di mesin lokal (nol-token). AI hanya dilibatkan untuk tugas penalaran bahasa (rewrite, chat asistensi, analisis konsistensi mendalam).
- **Komputasi berat di latar belakang:** Pencocokan nama (Aho-Corasick),
  embeddings lokal, dan BM25 (Orama) memakai Web Worker untuk mengurangi
  beban main thread.

## 4. Daftar Modul Utama

| Modul | Direktori Utama | Peran & Deskripsi |
|---|---|---|
| **Editor Manuskrip** | `src/features/editor/` | Editor TipTap 3 kaya fitur dengan jaring pengaman kehilangan data (*autosave lifecycle*), metrik kata, dan integrasi inline rewrite. |
| **Manajemen Bab & Babak** | `src/features/chapters/` | Pengorganisasian bab, penataan babak naratif (Act I–III), Kanban tensi, dan reordering bab. |
| **Codex & Ensiklopedia** | `src/features/codex/`, `codex-workshop/` | Ensiklopedia dunia (Karakter, Tempat, Sihir, Item) dengan dukungan kebenaran rahasia, tag faksi, custom category fields, dan studio lokakarya entri. |
| **Story Bible & Hubungan** | `src/features/lore/` | Catatan kanon proyek (aturan nada/dunia) dan pemetaan graf visual hubungan antar-entitas / kanvas faksi (React Flow). |
| **Konsistensi & Kontinuitas** | `src/features/consistency/` | Peta kontinuitas cerita, pelacak Janji Plot (Chekhov's Gun), glosarium istilah in-world, analisis pacing/heatmap, dan laporan prosa. |
| **Atlas Dunia** | `src/features/atlas/` | Kanvas peta interaktif Leaflet (CRS.Simple) untuk menandai pin, wilayah faksi (poligon), rute, kalkulasi jarak tempuh, dan peta bertingkat (*sub-maps*). |
| **Kalender & Linimasa** | `src/features/timeline/` | Penanggalan kustom multi-era/musim dan linimasa kronologis peristiwa cerita. |
| **Pencarian Semantik & RAG** | `src/features/search/`, `src/services/rag/` | Pencarian adegan berdasarkan makna teks naskah (*local embeddings*) dan pencarian federated BM25 Orama. |
| **Asisten AI & Studio** | `src/features/assistant/`, `src/services/ai/` | Obrolan interaktif terkonteks lore dengan dukungan prompt caching, multi-sesi, dan fallback resilience. |
| **Pencadangan & Utilitas** | `src/services/backupService.ts`, `src/components/panels/` | Cadangan gzip otomatis lokal, sinkronisasi Google Drive GIS, ekspor multi-format (EPUB, DOCX, PDF, MD), dan dashboard statistik. |
