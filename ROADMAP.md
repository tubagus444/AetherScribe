# ROADMAP & BACKLOG AKTIF — AetherScribe

> **Pusat Rencana & Backlog Proyek.** Dokumen ini adalah satu-satunya pelacak kerja aktif untuk AetherScribe. 
> Semua fitur yang sudah selesai dan riwayat keputusan teknis telah diarsipkan dengan rapi di direktori [`docs/archive/`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/archive/), katalog fitur di [`docs/features.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/features.md), dan log pembaruan di [`docs/changelog.md`](file:///d:/novel/Aplikasi%20Novel/Aplikasi-Pembuatan-Novel/docs/changelog.md).

---

<a id="audit-2026-11-09"></a>

## Audit Aplikasi — 9 November 2026

**Status awal:** seluruh 29 temuan terbuka; belum ada implementasi perbaikan. Ini pencatatan hasil audit, bukan klaim bahwa fitur telah diperbaiki. **Baseline:** `a47f895a47a633f02f95511192bddfa47397bef2`.

- [Laporan aplikasi (21 bagian)](docs/audits/2026-11-09-application-audit.md).
- [Register bukti dan kriteria penerimaan F01–F29](docs/audits/2026-11-09-findings.md).
- [Indeks dokumentasi](docs/README.md).

Checklist berikut adalah **satu-satunya status kerja aktif** untuk audit ini. Dokumen audit menyimpan snapshot bukti. Item prioritas lama di bagian berikutnya tetap berlaku; kerjakan setelah risiko data/keamanan yang lebih mendesak. Optimasi serialisasi lama berkaitan dengan F19/F23, bukan pengganti perbaikan integritas backup.

**Cara mengerjakan:** ambil satu item atau kelompok dengan dependensi jelas, buka bukti dan kriteria penerimaannya, buat reproduksi aman, implementasikan, lalu verifikasi. Centang hanya setelah acceptance terpenuhi dan dokumen modul/changelog diperbarui. Catat commit/PR, tanggal dan hasil tes di bawah item yang ditutup. Jika ditunda/ditolak, tulis alasan serta risiko yang diterima; jangan centang sebagai selesai.

**Urutan penting:** F05 mendahului F19; desain aset F03 diselaraskan dengan schema F04; F07 dan F10 menyelaraskan triage; F08/F09 menyelesaikan dua sisi search; F12 mendasari F14. F24 dimulai sebagai tes regresi setiap batch, kemudian dilengkapi harness/CI. P1 dapat dikerjakan beberapa jalur independen, bukan ketergantungan serial seluruh daftar.

**Estimasi:** S ≤1 hari, M 2–4 hari, L 5–10 hari; indikatif, termasuk verifikasi terarah. Horizon 0–2 hari berarti mulai mitigasi prioritas pertama, bukan janji seluruh P1 selesai dalam dua hari. Rencana 3–14 hari, 2–6 minggu, dan 1–3 bulan dijelaskan pada bagian 19 laporan.

### P1 — Kerjakan dahulu: data, keamanan, dan fungsi inti

- [ ] **[F03](docs/audits/2026-11-09-findings.md#f03) — Restore internal membuang gambar Atlas** (High; M).
- [ ] **[F05](docs/audits/2026-11-09-findings.md#f05) — Flush editor resolve meskipun save gagal** (High; S–M).
- [ ] **[F01](docs/audits/2026-11-09-findings.md#f01) — Stored XSS pada label Atlas** (High; S).
- [ ] **[F02](docs/audits/2026-11-09-findings.md#f02) — Proxy melampaui batas localhost** (High; S–M).
- [ ] **[F18](docs/audits/2026-11-09-findings.md#f18) — Input salah tipe menyebabkan rejection sebelum try** (Medium; S).
- [ ] **[F04](docs/audits/2026-11-09-findings.md#f04) — Validasi scope dan struktur restore tidak memadai** (High; M).
- [ ] **[F06](docs/audits/2026-11-09-findings.md#f06) — Duplikasi kosong dan urutan bab ambigu** (Medium; S).
- [ ] **[F07](docs/audits/2026-11-09-findings.md#f07) — Setter triage memakai compound index yang tidak ada** (Medium; S).

### P2 — Correctness dan reliabilitas berikutnya

- [ ] **[F24](docs/audits/2026-11-09-findings.md#f24) — Coverage integrasi kritis belum tersedia** (Medium; L).
- [ ] **[F10](docs/audits/2026-11-09-findings.md#f10) — Triage dan workshop key tidak round-trip** (Medium; M).
- [ ] **[F11](docs/audits/2026-11-09-findings.md#f11) — Delete entitas meninggalkan referensi yatim** (Medium; M).
- [ ] **[F19](docs/audits/2026-11-09-findings.md#f19) — Snapshot lintas tabel dan editor belum konsisten** (Medium; M).
- [ ] **[F08](docs/audits/2026-11-09-findings.md#f08) — Panel mencari pada instance Orama yang tidak diinisialisasi** (Medium; S–M).
- [ ] **[F09](docs/audits/2026-11-09-findings.md#f09) — Creating hook kehilangan generated key** (Medium; S).
- [ ] **[F12](docs/audits/2026-11-09-findings.md#f12) — Error SSE dianggap sukses kosong** (Medium; M).
- [ ] **[F14](docs/audits/2026-11-09-findings.md#f14) — Buffer keluaran bercampur antar-attempt** (Medium; M).
- [ ] **[F15](docs/audits/2026-11-09-findings.md#f15) — Interval rewrite tidak dibersihkan saat gagal** (Medium; S).
- [ ] **[F16](docs/audits/2026-11-09-findings.md#f16) — Pesan cancel tidak cocok dengan receiver** (Medium; S).
- [ ] **[F17](docs/audits/2026-11-09-findings.md#f17) — Fallback dapat melewati batas lokal ke cloud** (Medium; S–M).
- [ ] **[F29](docs/audits/2026-11-09-findings.md#f29) — Ringkasan lama dapat dianggap mutakhir** (Medium; S).
- [ ] **[F20](docs/audits/2026-11-09-findings.md#f20) — Prune dilakukan sebelum upload sukses** (Medium; S).
- [ ] **[F21](docs/audits/2026-11-09-findings.md#f21) — Startup production tidak deterministik** (Medium; M).
- [ ] **[F25](docs/audits/2026-11-09-findings.md#f25) — ConfirmDialog belum mengelola semantik dan fokus** (Medium; S–M).
- [ ] **[F22](docs/audits/2026-11-09-findings.md#f22) — Distribusi frontend berat** (Medium; M).
- [ ] **[F23](docs/audits/2026-11-09-findings.md#f23) — Full scans pada jalur yang sering berubah** (Medium; M–L).

### P3 — Perbaikan terencana

- [ ] **[F13](docs/audits/2026-11-09-findings.md#f13) — Usage Claude tertimpa dan temperature nol diabaikan** (Low; S).
- [ ] **[F26](docs/audits/2026-11-09-findings.md#f26) — Mode legacy dapat menampilkan panel kosong** (Low; S).
- [ ] **[F27](docs/audits/2026-11-09-findings.md#f27) — Base64 key dan prompt preview bukan perlindungan rahasia** (Medium; S).
- [ ] **[F28](docs/audits/2026-11-09-findings.md#f28) — Kontrak longgar dan modul bertanggung jawab terlalu banyak** (Low; L).

### Format bukti penyelesaian

Tambahkan di bawah item terkait setelah dikerjakan:

```text
Tanggal / commit atau PR:
Perubahan inti:
Reproduksi sebelum perbaikan:
Verifikasi sesudah perbaikan (perintah + hasil):
Dokumentasi modul yang diperbarui:
Batas verifikasi / risiko tersisa:
```

Tidak ada kebutuhan otomatis menambah autentikasi/RBAC. Hardening mengikuti konteks single-user lokal. Pengujian provider, Drive, jaringan, atau data nyata perlu ruang lingkup yang sesuai; gunakan mock dan database terisolasi untuk regresi awal.

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
