# Roadmap AetherScribe

## Pekerjaan aktif

Belum ada pekerjaan aktif yang dijadwalkan.

## Pilihan berikutnya

| Pilihan                                       | Hasil yang ingin diketahui                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Verifikasi CI pada commit yang akan dibagikan | Hasil job Windows dan Ubuntu beserta artefak pada SHA yang sama                                     |
| Uji alur penulis dengan salinan proyek nyata  | Kelancaran menulis, Atlas, ekspor, backup, dan pemulihan di profil terpisah                         |
| Uji lingkungan yang dipakai pengguna          | Perilaku Drive atau provider nyata, beberapa tab, browser lain, atau aksesibilitas sesuai kebutuhan |

### Prioritas penyempurnaan alur penulis

Usulan berikut belum dijadwalkan. Temuan berasal dari peninjauan kode. Frekuensi kendalanya masih perlu dinilai saat uji alur dengan proyek nyata.

1. **“Lanjutkan menulis” kembali ke posisi edit terakhir.** Tombol saat ini membuka bab yang terakhir diubah. Simpan posisi edit per bab di perangkat agar penulis bisa meneruskan revisi di tengah bab panjang. Membaca bab lain untuk mengecek referensi tetap mempertahankan posisi kerja. Jika posisi lama sudah tidak sesuai, misalnya setelah pemulihan snapshot, buka bab seperti biasa. Saat uji proyek nyata, amati seberapa sering penulis harus menggulir untuk menemukan paragraf tempat ia terakhir bekerja.
2. **Filter catatan revisi yang masih terbuka.** Panel sudah menghitung catatan terbuka, tetapi penulis masih harus mencarinya di antara catatan yang selesai. Jadikan label jumlah terbuka sebagai filter dan sediakan pilihan **Semua**. Pertahankan urutan naskah dan aksi lompat ke kutipan. Saat catatan terakhir selesai, tampilkan pesan “Semua catatan di bab ini sudah selesai.” Ini penyempurnaan dengan lingkup terkecil karena status tiap catatan sudah tersedia.

### Prioritas Codex — penyimpanan dan penelusuran fakta

Perilaku berikut telah diuji di Chromium desktop dengan proyek contoh terpisah. Pekerjaan belum dijadwalkan.

**Perbaikan, menurut prioritas**

1. **Perbaiki pengetikan alias dan tag.** Saat diketik karakter demi karakter, `Rara, Bu Laras` tersimpan sebagai satu alias `RaraBuLaras`. Gejala yang sama terjadi pada tag. Pertahankan spasi di dalam nama dan gunakan koma untuk memisahkan nilai setelah penulis selesai mengisi.
2. **Muat dan simpan tanggal lahir karakter.** Pada proyek dengan Kalender Dunia, tahun 42 yang dipilih untuk karakter baru tidak tersimpan. Saat karakter dengan tahun lahir 9 disunting menjadi 22, formulir tidak memuat tanggal lama dan nilai tersimpan tetap 9. Periksa alur menetapkan, mengubah, dan menghapus tanggal dengan membuka kembali entri setelah setiap penyimpanan.
3. **Tampilkan kemunculan dengan satu klik.** Tombol **Cek Kemunculan di Chapter** pada kartu membuka dialog detail. Di tab **Keterkaitan**, penulis harus mengeklik tombol cek sekali lagi. Arahkan klik pertama langsung ke bagian **Kemunculan** dan tampilkan hasilnya di sana.

**Peningkatan setelah perbaikan**

1. **Cari entri dari fakta yang diingat penulis.** Kartu *Sagara* menampilkan pangkat *panglima*, tetapi pencarian `panglima` di panel Codex menghasilkan daftar kosong. Sertakan label dan nilai detail yang sedang berlaku serta kolom kategori kustom. Tampilkan bagian yang cocok, misalnya *Pangkat · Panglima*, agar alasan entri muncul langsung terbaca.
2. **Lihat fakta yang tercatat sampai bab pilihan.** Dalam uji, Sagara berpangkat *prajurit* pada awal cerita dan menjadi *panglima* di bab kedua. Sidebar editor bab pertama sudah menampilkan *panglima*. Usulkan pilihan **Lihat sampai bab…** pada entri Codex yang punya riwayat dan gunakan bab aktif sebagai acuan awal di editor. Acuannya urutan baca. Saat adegan berupa kilas balik, penulis tetap menentukan keadaan tokoh pada waktu adegan berlangsung.

### Prioritas Snippet, Diskusi AI, dan Nova

Belum dijadwalkan. Temuan diuji di Chromium dengan proyek contoh dan balasan AI simulasi. Untuk lampiran Diskusi AI, pengujian memeriksa isi permintaan yang dikirim aplikasi.

**Snippet**

- **Perlihatkan aksi kartu pada layar sentuh.** Pada emulasi lebar 390 piksel, ikon Ubah dan Hapus transparan meskipun bisa diketuk. Tampilkan tombol **Opsi** yang selalu terlihat untuk mengakses keduanya.

**Diskusi AI dan Nova**

1. **Kirim entri Codex yang dipilih di Lampirkan Lore.** Memilih *Ratu Senja* ketika ada entri *Ratu* justru mengirim deskripsi Ratu. Simpan identitas entri pada lampiran dan tampilkan nama lengkapnya kepada penulis.
2. **Pertahankan lampiran saat Buat Ulang.** Dengan konteks otomatis dimatikan, ringkasan bab manual terkirim pada permintaan pertama. Saat regenerasi, hanya penanda `@chapter-summary` yang tersisa. Kaitkan isi lampiran dengan pesan asal agar regenerasi memakai bahan yang sama.
3. **Pisahkan draf pertanyaan per sesi Diskusi.** Draf yang belum dikirim ikut muncul ketika sesi berganti. Mengetik di sesi kedua juga menimpa draf sesi pertama. Pulihkan draf masing-masing ketika penulis kembali.
4. **Cari judul di seluruh riwayat Diskusi proyek.** Dalam uji dengan 51 sesi, judul persis sesi tertua tidak ditemukan karena daftar dibatasi sebelum pencarian. Batas 50 sesi terbaru cukup diterapkan pada tampilan awal.
5. **Arahkan Coba Lagi di Nova ke pertanyaan yang benar.** Menekan tombol pada pesan gagal lama mengirim ulang pertanyaan terbaru. Gunakan pola Diskusi AI dengan menawarkan **Coba Lagi** pada giliran terakhir yang gagal.

**Eksplorasi setelah perbaikan.** Tambahkan pilihan **Beri masukan** di samping **Tulis ulang** pada Snippet. Misalnya, penulis dapat meminta alasan dialog terasa terlalu menjelaskan perasaan tokoh. Tampilkan komentar bersama kutipan dengan aksi **Salin** dan **Tutup**, sehingga penulis bisa merevisi sendiri. Uji manfaatnya dalam sesi menulis nyata.

### Eksplorasi editor — membaca referensi sambil menulis

Usulan ini belum dijadwalkan. Tujuannya agar penulis bisa memeriksa satu detail, menutup referensi, lalu meneruskan kalimat di posisi semula, termasuk di ponsel. Urutan prioritas di dalam editor:

1. **Cari di Codex novel.** Pertahankan daftar penyebutan sebagai tampilan awal **Codex di Bab Ini**. Dari panel yang sama, cari entri lewat nama atau alias dan buka kartu detailnya meskipun entri belum disebut di bab aktif.
2. **Cari catatan novel dari Catatan Bab.** Cari judul atau isi catatan proyek dan baca hasilnya di sidebar. Sediakan aksi opsional **Tautkan ke bab ini** agar penulis bisa menyimpan referensi yang akan dipakai lagi.
3. **Intip bab lain.** Buka teks bab dalam tampilan baca-saja untuk memeriksa dialog atau kejadian sebelumnya. Sediakan akses cepat ke bab sebelumnya dan pencarian judul. Sebelum memprioritaskannya, amati kapan penulis perlu membaca kalimat asli dan kapan Codex atau catatan sudah cukup.

Uji dengan satu adegan di desktop dan ponsel. Perhatikan apakah penulis dapat menemukan referensi yang diperlukan dan kembali mengetik tanpa mencari ulang paragrafnya. Dahulukan pemanfaatan panel yang sudah ada agar bilah editor tetap ringkas.

### Eksplorasi Janji Plot — petunjuk sebelum pengungkapan

Usulan eksplorasi berikutnya, belum dijadwalkan. Saat ini kartu rahasia menghitung petunjuk terkait yang terdeteksi di seluruh naskah. Jika penulis memindahkan adegan petunjuk melewati bab pengungkapan, jumlahnya bisa tetap sama meski pengalaman pembaca berubah.

Pada kartu rahasia, penulis dapat mencoba memilih bab pengungkapan untuk satu kali peninjauan. Gunakan data kemunculan per bab yang sudah tersedia secara lokal untuk menunjukkan kapan setiap petunjuk terkait pertama kali terdeteksi menurut urutan baca: sebelum bab pilihan, di bab itu, atau sesudahnya. Cantumkan babnya agar penulis bisa memeriksa konteks. Untuk kilas balik, gunakan bab tempat adegan diceritakan. Untuk petunjuk di bab pengungkapan, penulis perlu memeriksa urutan paragraf. Kata **terdeteksi** menunjukkan kecocokan di naskah; penulis yang menilai maknanya sebagai petunjuk.

**Uji manfaat:** pilih satu rahasia dari naskah nyata dan tentukan bab pengungkapannya. Periksa apakah ringkasan membantu penulis mengambil keputusan revisi, misalnya mempertahankan petunjuk di kilas balik sebagai penjelasan susulan atau memindahkannya lebih awal agar pembaca sempat curiga.

<a id="database-improvement"></a>

## Pekerjaan bersyarat

| Pekerjaan                                                                                                                                                        | Pemicu                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [DB09 — Identitas global dan pelacakan perubahan](docs/archive/2026-11-18-database-improvement-plan.md#db09--identitas-global-dan-pelacakan-perubahan-bersyarat) | Kebutuhan sinkronisasi atau penggabungan perangkat sudah jelas                          |
| [DB10 — Pembuktian migrasi](docs/archive/2026-11-18-database-improvement-plan.md#db10--pembuktian-migrasi-bersyarat)                                             | Target migrasi dipilih                                                                  |
| Migrasi bertahap                                                                                                                                                 | Migrasi baru memproses tabel besar                                                      |
| Font PDF non-Latin                                                                                                                                               | Naskah memerlukan glyph di luar cakupan font saat ini                                   |
| Pemisahan Atlas lanjutan                                                                                                                                         | Toolbar, modal, atau orkestrasi perlu dipisah saat perubahan fitur                      |
| Optimasi backup lanjutan                                                                                                                                         | Pengukuran pemakaian menunjukkan kendala collect/Blob, memori, atau koordinasi antartab |

## Ide diparkir

- Simulator dunia untuk status karakter dan artefak lintas bab.
- Lensa suara dialog untuk membandingkan gaya bicara tokoh.
- Moodboard Codex dengan kajian kuota gambar.
- Peringatan perpindahan POV dengan kajian false positive.

<a id="prioritas-lanjutan"></a>
<a id="audit-2026-11-09"></a>

## Pekerjaan selesai

- [Pengamanan Snippet, retensi nilai templat Codex, dan navigasi hasil pencarian global](docs/reports/audits/2026-11-25-writer-priorities.md)

- [Linimasa, Kalender, dan pencatatan dari editor](docs/reports/audits/2026-11-22-linimasa.md)

- [Catatan Novel dan Codex di sidebar editor](docs/reports/audits/2026-11-21-editor-notes-codex.md)
- [Seleksi, kamera, dan panel detail Atlas](docs/reports/audits/2026-11-21-atlas-sidebar.md)
- [Isi wilayah dan peran lokasi penting Atlas](docs/reports/audits/2026-11-21-atlas-areas.md#isi-wilayah-dan-lokasi-penting)
- [Pratinjau batas melengkung dan sudut tegas pada area Atlas](docs/reports/audits/2026-11-21-atlas-areas.md)
- [Tempat singgah, visibilitas per titik, dan tautan pin Atlas](docs/reports/audits/2026-11-21-atlas-routes.md#tempat-singgah-dan-tautan-pin)
- [Penanda titik dan kurva rute Atlas](docs/reports/audits/2026-11-21-atlas-routes.md)
- [Perbaikan gulir tab Kelengkapan Dunia](docs/reports/audits/2026-11-20-codex-layout.md#gulir-tab-kelengkapan-dunia)
- [Gambar sampul Codex dan cadangan aset](docs/reports/audits/2026-11-20-codex-cover.md)
- [Detail tambahan Codex, riwayat per bab, dan konteks AI](docs/reports/audits/2026-11-20-codex-details.md)
- [Audit F01–F29](docs/archive/2026-11-15-roadmap-audit-completed.md)
- [Penguatan L01–L06](docs/archive/2026-11-15-roadmap-l01-l06-completed.md)
- [Penguatan database DB01–DB08](docs/reports/audits/2026-11-19-db01-db08.md)
