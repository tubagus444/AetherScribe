# Rekam Keputusan Arsitektur (ADR) — AetherScribe

Dokumen ini mencatat keputusan-keputusan teknis penting yang telah disepakati dan diimplementasikan di repositori ini, beserta rasionalisasi di baliknya.

---

| Tanggal | Keputusan Teknis | Alasan & Rasionalisasi |
|---|---|---|
| 2026-05-10 | **Local-First tanpa Database Backend Server** | Menjamin kedaulatan privasi karya pengguna 100%, akses instan tanpa jeda jaringan, serta nol biaya server database. Seluruh data novel tersimpan di browser via Dexie/IndexedDB. |
| 2026-05-15 | **BYOK (Bring Your Own Key) di Klien Browser** | Kunci API disimpan di `localStorage` klien; server proxy Express hanya meneruskan header `x-api-key` tanpa menyimpan state atau kredensial di server. |
| 2026-05-20 | **Extension TipTap 3 Dipin Tepat ke `3.22.5`** | Ketidakcocokan versi minor antar dependensi `@tiptap/*` menyebabkan instabilitas DOM editor dan merusak sinkronisasi ekstensi konsistensi inline. |
| 2026-06-01 | **Komputasi Berat Berjalan di Web Worker** | Pencocokan nama entitas (Aho-Corasick), pencarian embedding lokal (`transformers.js`), dan BM25 Orama wajib berjalan di worker agar antarmuka penulisan tetap lancar di 60 FPS tanpa freezing. |
| 2026-06-15 | **Meta-Pola "Field JSON Inert Menumpang Objek"** | Fitur baru diutamakan menumpang field opsional non-indeks ke objek `Project`, `Chapter`, atau `CodexEntry` (misal: `hidden`, `worldStatus`, `tension`, `act`, `calendar`) agar alur backup, ekspor, dan `deleteProject` tetap zero-maintenance. |
| 2026-06-21 | **Pengerasan Keamanan Proxy di Luar Cakupan** | Fitur otentikasi multi-user, rate-limiting server, dan pencegahan SSRF Ollama sengaja diputuskan *out-of-scope* karena AetherScribe adalah aplikasi desktop-web pribadi untuk satu pengguna. |
| 2026-07-01 | **Prompt Caching Ber-Tier (Bible Stabil vs Codex Volatil)** | Membagi Knowledge Base ke segmen terpisah. Modifikasi pada bab naskah atau entri Codex tidak membatalkan cache prompt Story Bible yang berukuran besar, menghemat token input hingga 80%. |
| 2026-07-03 | **Hit-Test Manual Koordinat untuk Graf Lore Force-Graph** | API hover dan klik bawaan library `react-force-graph` rawan bug hit-test multi-resolusi. Menggunakan perhitungan jarak koordinat kanvas matematis langsung menjamin interaksi graf 100% andal. |
| 2026-07-03 | **Pewarnaan Edge React Flow via Inline Style** | Komponen kanvas hubungan faksi wajib mewarnai garis relasi menggunakan `style: { stroke: color }`, bukan atribut SVG `stroke`, karena CSS Tailwind akan menimpa atribut biasa. |
| 2026-07-06 | **Leaflet Murni CRS.Simple (Bukan react-leaflet) untuk Atlas** | Menghindari masalah kompatibilitas wrapper di React 19 dan memberikan kendali penuh atas pembuatan poligon dan rute interaktif secara imperatif. |
| 2026-07-06 | **Gambar Peta Dikeluarkan dari Rolling Auto-Backup Internal** | Blob gambar peta disertakan pada ekspor novel manual penuh, tetapi dibuang pada rolling backup otomatis internal (5 salinan) demi mencegah ledakan kuota penyimpanan IndexedDB. |
| 2026-07-07 | **Tautan Event Kalender Dunia Memakai Ulang `characterIds`** | Entitas Codex yang terlibat di peristiwa kalender ditautkan lewat array `characterIds` yang sudah ada, bukan membuat `codexIds` baru, sehingga logika `importRemap` dan penghapusan data tetap utuh. |
| 2026-07-07 | **Triase Peta Kontinuitas via Tabel `continuityTriage` (v33)** | Status pengabaian temuan kontinuitas disimpan secara persisten per proyek dan disertakan dalam backup penuh, sehingga temuan yang disengaja penulis tidak muncul berulang kali. |
| 2026-10-07 | **Pembersihan Root Tracker & Konsolidasi ke `ROADMAP.md`** | 5 file tracker historis yang berserakan dipindahkan ke `docs/archive/`, dan seluruh sisa pekerjaan aktif disatukan ke dalam satu file tunggal `ROADMAP.md` di root. |
| 2026-10-08 | **Refaktorisasi Dokumentasi Modular (Modular Docs Architecture)** | `CLAUDE.md` dan `AGENTS.md` dirampingkan menjadi pengarah ringkas (~80 baris), memecah dokumentasi ke folder `docs/` (`overview`, `architecture`, `features`, `database`, `api`, `decisions`, `changelog`) untuk menghemat token konteks AI dan menyajikan dokumentasi yang terstruktur rapi. |
| 2026-11-10 | **Backup v8: Referensi Gambar Auto dan Snapshot Pengaman Lengkap (F03/F04)** | Memperbarui kebijakan 6 Juli: auto internal tetap hemat ruang melalui SHA-256, tetapi restore mempertahankan aset cocok atau membatalkan bila tidak tersedia. Pre-restore menyimpan gambar penuh dan wajib berhasil sebelum mutasi. Semua jalur memakai schema/limit terpusat; format dan batas legacy dijelaskan di [format backup](backup-format.md). Skema DB tidak berubah. |
