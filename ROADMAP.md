# Roadmap AetherScribe

**Pekerjaan aktif:** belum ada yang dijadwalkan.

[Prioritas implementasi](#prioritas-implementasi) · [Verifikasi](#verifikasi-terbuka) · [Eksplorasi](#eksplorasi) · [Pekerjaan bersyarat](#pekerjaan-bersyarat) · [Ide diparkir](#ide-diparkir) · [Pekerjaan selesai](#pekerjaan-selesai)

## Prioritas implementasi

### P2 — Penyempurnaan alur kerja

Seluruh butir P2 selesai. Lihat [hasil verifikasi](#pekerjaan-selesai).

## Verifikasi terbuka

| Kapan | Pemeriksaan | Bukti yang dicari |
| --- | --- | --- |
| Saat commit siap dibagikan | Verifikasi CI Windows dan Ubuntu | Hasil job dan artefak dari SHA yang sama. |
| Saat menilai alur kerja dan prioritas penyempurnaan | Uji dengan salinan proyek nyata di profil terpisah | Kelancaran menulis, Atlas, ekspor, backup, dan pemulihan. |
| Saat ada lingkungan atau integrasi yang perlu dipastikan | Uji sesuai kebutuhan pengguna | Perilaku Drive atau provider nyata, beberapa tab, browser lain, atau aksesibilitas. |

## Eksplorasi

Usulan berikut belum dijadwalkan. Uji manfaatnya sebelum menetapkan urutan
implementasi lintas fitur.

### Editor — membaca referensi sambil menulis

1. **Cari di Codex novel.** Pertahankan penyebutan bab aktif sebagai tampilan awal
   **Codex di Bab Ini**. Dari panel yang sama, cari nama atau alias dan buka detail
   termasuk untuk entri yang belum disebut di bab aktif.
2. **Cari catatan novel dari Catatan Bab.** Cari judul atau isi catatan proyek dan
   baca hasilnya di sidebar. Sediakan aksi opsional **Tautkan ke bab ini**.
3. **Intip bab lain.** Buka bab dalam tampilan baca-saja untuk memeriksa dialog
   atau kejadian. Sediakan akses ke bab sebelumnya dan pencarian judul. Amati
   kapan penulis memerlukan kalimat asli dan kapan Codex atau catatan sudah cukup.

Uji satu adegan di desktop dan ponsel. Periksa apakah penulis bisa menemukan
referensi dan kembali mengetik di posisi semula. Manfaatkan panel yang ada agar
bilah editor tetap ringkas.

### Janji Plot — petunjuk sebelum pengungkapan

Kartu rahasia menghitung petunjuk terkait yang terdeteksi di seluruh naskah.
Memindahkan adegan petunjuk melewati pengungkapan bisa mempertahankan jumlah
yang sama sambil mengubah pengalaman pembaca.

Coba pilihan bab pengungkapan untuk satu kali peninjauan. Gunakan data
kemunculan lokal untuk menunjukkan bab pertama setiap petunjuk terdeteksi,
baik sebelum, di, maupun sesudah bab pilihan. Untuk kilas balik, gunakan bab
tempat adegan diceritakan. Untuk petunjuk di bab pengungkapan, penulis memeriksa
urutan paragraf. Penulis tetap menilai makna tiap kecocokan dalam konteks adegan.

Uji dengan satu rahasia di naskah nyata. Periksa apakah ringkasannya membantu
penulis memutuskan kapan pembaca sebaiknya menemukan petunjuk.

### Snippet — masukan untuk kutipan

Setelah perbaikan Snippet, uji pilihan **Beri masukan** di samping **Tulis
ulang** dalam sesi menulis nyata. Misalnya, penulis meminta alasan dialog
terasa terlalu menjelaskan perasaan tokoh. Tampilkan komentar bersama kutipan
dengan aksi **Salin** dan **Tutup** agar penulis bisa merevisi sendiri.

<a id="database-improvement"></a>

## Pekerjaan bersyarat

| Pekerjaan | Pemicu |
| --- | --- |
| [DB09 — Identitas global dan pelacakan perubahan](docs/archive/2026-11-18-database-improvement-plan.md#db09--identitas-global-dan-pelacakan-perubahan-bersyarat) | Kebutuhan sinkronisasi atau penggabungan perangkat sudah jelas. |
| [DB10 — Pembuktian migrasi](docs/archive/2026-11-18-database-improvement-plan.md#db10--pembuktian-migrasi-bersyarat) | Target migrasi sudah dipilih. |
| Migrasi bertahap | Migrasi baru memproses tabel besar. |
| Font PDF non-Latin | Naskah memerlukan glyph di luar cakupan font saat ini. |
| Pemisahan Atlas lanjutan | Perubahan fitur memerlukan pemisahan toolbar, modal, atau orkestrasi. |
| Optimasi backup lanjutan | Pengukuran menunjukkan kendala collect/Blob, memori, atau koordinasi antartab. |

## Ide diparkir

- Simulator dunia untuk status karakter dan artefak lintas bab.
- Lensa suara dialog untuk membandingkan gaya bicara tokoh.
- Moodboard Codex dengan kajian kuota gambar.
- Peringatan perpindahan POV dengan kajian false positive.

<a id="prioritas-lanjutan"></a>
<a id="audit-2026-11-09"></a>

## Pekerjaan selesai

### Pengaturan AI

- [Penyempurnaan Konfigurasi AI, Data & Cadangan, dan pemulihan](docs/reports/audits/2026-11-26-pengaturan-ai-dan-pemulihan.md)
- [Pemilih model tugas ringan per penyedia](docs/reports/audits/2026-11-26-model-tugas-ringan.md)

### Editor, Snippet, dan pencarian

- [P2.2 dan P2.3 · Posisi edit dan filter catatan revisi](docs/reports/audits/2026-11-26-editor-posisi-catatan-revisi.md)
- [P2.1 dan P2.4 · Kemunculan Codex dan tombol Opsi Snippet](docs/reports/audits/2026-11-26-interaksi-kartu-codex-snippet.md)
- [Undo dan Redo saat berpindah panel](docs/reports/audits/2026-11-25-editor-history.md)
- [Pengamanan Snippet, retensi nilai templat Codex, dan navigasi hasil pencarian global](docs/reports/audits/2026-11-25-writer-priorities.md)
- [Catatan Novel dan Codex di sidebar editor](docs/reports/audits/2026-11-21-editor-notes-codex.md)

### Diskusi AI dan Nova

- [P2.5–P2.7 · Draf per sesi, pencarian seluruh riwayat, dan Coba Lagi di Nova](docs/reports/audits/2026-11-26-diskusi-ai-riwayat-nova.md)
- [Pemilihan entri Codex dan pemulihan lampiran saat Buat Ulang](docs/reports/audits/2026-11-26-diskusi-ai-lampiran.md)

### Worldbuilding

- [P2.8 dan P2.9 · Pencarian fakta dan tampilan Codex sampai bab pilihan](docs/reports/audits/2026-11-26-codex-fakta.md)
- [Pengetikan alias dan tag serta penyimpanan tanggal lahir karakter Codex](docs/reports/audits/2026-11-26-codex-form.md)
- [Linimasa, Kalender, dan pencatatan dari editor](docs/reports/audits/2026-11-22-linimasa.md)
- [Seleksi, kamera, dan panel detail Atlas](docs/reports/audits/2026-11-21-atlas-sidebar.md)
- [Isi wilayah dan peran lokasi penting Atlas](docs/reports/audits/2026-11-21-atlas-areas.md#isi-wilayah-dan-lokasi-penting)
- [Pratinjau batas melengkung dan sudut tegas pada area Atlas](docs/reports/audits/2026-11-21-atlas-areas.md)
- [Tempat singgah, visibilitas per titik, dan tautan pin Atlas](docs/reports/audits/2026-11-21-atlas-routes.md#tempat-singgah-dan-tautan-pin)
- [Penanda titik dan kurva rute Atlas](docs/reports/audits/2026-11-21-atlas-routes.md)
- [Perbaikan gulir tab Kelengkapan Dunia](docs/reports/audits/2026-11-20-codex-layout.md#gulir-tab-kelengkapan-dunia)
- [Gambar sampul Codex dan cadangan aset](docs/reports/audits/2026-11-20-codex-cover.md)
- [Detail tambahan Codex, riwayat per bab, dan konteks AI](docs/reports/audits/2026-11-20-codex-details.md)

### Penguatan aplikasi dan database

- [Audit F01–F29](docs/archive/2026-11-15-roadmap-audit-completed.md)
- [Penguatan L01–L06](docs/archive/2026-11-15-roadmap-l01-l06-completed.md)
- [Penguatan database DB01–DB08](docs/reports/audits/2026-11-19-db01-db08.md)
