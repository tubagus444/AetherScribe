# ROADMAP & BACKLOG AKTIF — AetherScribe

> **Pusat Rencana & Backlog Proyek.** Dokumen ini adalah satu-satunya pelacak kerja aktif untuk AetherScribe. 
> Semua fitur yang sudah selesai dan riwayat keputusan teknis telah diarsipkan dengan rapi di direktori [`docs/archive/`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/), katalog fitur di [`docs/features.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/features.md), dan log pembaruan di [`docs/changelog.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/changelog.md).

---

## 1. Prioritas Terbuka (Actionable)

Item-item yang memiliki desain jelas dan siap dikerjakan jika diperlukan peningkatan pada area terkait:

### 1.1 Penyimpanan & Performa: Diet Jalur Backup Serialisasi
- **Status:** Jalur internal sudah dioptimasi (`assembleBackupJson` 1x stringify).
- **Tujuan:** Untuk proyek dengan naskah sangat masif:
  - Pertimbangkan memindahkan proses serialisasi JSON / kompresi gzip ke Web Worker agar main thread sama sekali tidak mengalami jank pada naskah ratusan ribu kata.

### 1.2 Database: Konvensi Migrasi Streaming
- **Status:** Catatan teknis untuk migrasi skema masa depan.
- **Tujuan:** Migrasi Dexie di masa depan sebaiknya menghindari `toArray()` seluruh tabel besar di dalam transaksi jika hanya butuh memodifikasi field parsial. Buat pola cursor/streaming untuk update bertahap.

### 1.3 Ekspor Manuskrip: Cakupan Unicode Font PDF
- **Status:** Aman untuk bahasa Indonesia standar (huruf latin, tanda petik lengkung, em-dash).
- **Tujuan:** Jika di masa depan novel menggunakan karakter/glyph khusus (alfabet fiksi / aksara non-latin), integrasikan font kustom ber-subset UTF-8 ke generator jsPDF.

---

## 2. Ide Diparkir (❄️ Riset & Backburner)

Ide-ide konseptual yang diparkir karena membutuhkan fondasi baru, rawan false-positive, atau di luar urgensi saat ini:

- **Simulator Dunia (State Entitas Berubah Lintas-Bab):**
  - Melacak status hidup/mati karakter, kepemilikan artefak, atau pangkat yang berubah sepanjang bab, serta validasi jarak/waktu tempuh. *(Dibutuhkan fondasi "state-per-bab" terlebih dahulu).*
- **Lensa Suara Dialog (Analisis Gaya Bicara):**
  - Metrik panjang ujaran, variasi kosakata, dan gaya bicara deterministik per-tokoh untuk mendeteksi apakah semua karakter terdengar serupa.
- **Moodboard / Referensi Visual Codex:**
  - Galeri visual (wajah/kostum) per entri Codex. *(Perlu mitigasi kuota penyimpanan IndexedDB).*
- **Peringatan POV Aktif:**
  - Deteksi loncatan sudut pandang narasi (*anti head-hopping*). *(Tantangan: rawan false-positive tinggi pada deteksi teks bahasa Indonesia).*

---

## 3. Indeks Arsip Historis

Dokumen masa lalu yang telah diselesaikan dan dirangkum untuk referensi arsitektur:
- [`docs/archive/RENCANA-AUDIT-KODE.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/RENCANA-AUDIT-KODE.md) — Keputusan audit 12 area kualitas kode inti.
- [`docs/archive/RENCANA-OPTIMASI-AI.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/RENCANA-OPTIMASI-AI.md) — Rekam 14 optimasi token, prompt caching, dan routing model AI.
- [`docs/archive/RENCANA-ATLAS-DUNIA.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/RENCANA-ATLAS-DUNIA.md) — Spesifikasi awal dan arsitektur panel peta interaktif Atlas.
- [`docs/archive/ARSIP-AUDIT-FABLE.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/ARSIP-AUDIT-FABLE.md) — Riwayat lengkap perbaikan audit menyeluruh Fable Batch 1–3.
- [`docs/archive/ARSIP-FITUR-WORLDBUILDING.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/ARSIP-FITUR-WORLDBUILDING.md) — Riwayat implementasi 17 modul worldbuilding (Kalender, Glosarium, Faksi, Graf Lore, dll).
