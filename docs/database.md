# Dokumentasi Database — AetherScribe

> **Penyimpanan Primer:** Browser IndexedDB via **Dexie.js** (`AetherScribeDB`, versi skema saat ini: **v33** di `src/db.ts`).
> Aplikasi tidak menggunakan database SQL server. Seluruh data tersimpan secara lokal di browser pengguna.

---

## 1. Konvensi & Aturan Database

**Penghapusan domain F11:** `entityDeletion.ts` memusatkan kebijakan transaksi. Bab: hapus snapshot dan scene embeddings; lepaskan chapterId pada timeline, chapterId/activeChapterId chat, dan plantedChapterId janji plot, pertahankan teks. Peta: hapus marker miliknya dan lepaskan linkedMapId portal masuk (termasuk referensi lama lintas-proyek). Codex: hapus relasi/embedding, saring characterIds timeline, lepaskan codexId marker dan codexId/payoffCodexId janji plot. Sesi workshop entri diubah menjadi studio tanpa workshopKey agar teks tetap tersedia. Triage proyek direset saat bab/Codex dihapus karena identitas finding dapat berubah.

Hapus proyek membersihkan seluruh tabel domain project-scoped; snapshot bab proyek dibuang dan snapshot legacy yang parent bab-nya sudah tidak ada juga dibersihkan secara global. Snapshot tanpa parent tidak memiliki projectId untuk atribusi; snapshot semua bab hidup tetap dipertahankan. Backup dan log historis tidak dihapus. Cache konsistensi bab di localStorage/memori/LRU dibersihkan setelah commit, sehingga kegagalan transaksi tidak membuang cache. Tidak ada migrasi schema. Penghapusan ini bukan fitur arsip/undo; pemulihan memakai backup yang sudah tersedia.

**F06/F07 (13 November 2026):** Normalisasi urutan ChapterList berlangsung dalam satu transaksi chapters, dengan tie-break ID untuk order lama yang sama. Triage memakai indeks projectId yang sudah ada, memfilter findingId dalam transaksi read-write untuk set/update/clear. Upsert bersamaan diserialisasi oleh transaksi; duplikat lama untuk pasangan proyek/finding yang disentuh dikonsolidasi. Tidak mengubah schema v33 atau menambah indeks. Hook membaca ulang state persisten melalui live query; round-trip ekspor triage F10 tetap terpisah.

**Flush sebelum pembaruan lintas-tab (F05):** Handler `versionchange` di `src/db.ts` mengembalikan `false` agar Dexie tidak otomatis menutup koneksi sebelum flush selesai. Koneksi ditutup dan halaman dimuat ulang hanya setelah `flushActiveEditor()` resolve. Jika flush reject, koneksi tetap terbuka dan isu DB ditampilkan agar draft editor dapat dicoba simpan ulang. Konsekuensinya, upgrade pada tab lain tetap terblokir sampai koneksi lama dapat ditutup dengan aman. Tidak ada perubahan skema untuk perbaikan ini.

1. **Skema Bersifat Append-Only:**
   - Dilarang mengedit atau menghapus blok `this.version(N)` yang sudah ada di `src/db.ts`. Setiap perubahan skema wajib menambahkan blok `this.version(N + 1).stores({...})` baru dengan migrasi `.upgrade()` bila ada transformasi data.
2. **Pola "Field JSON Inert Menumpang Objek":**
   - Sebelum membuat tabel baru, utamakan menumpangkan field opsional non-indeks ke entri yang sudah ada (`CodexEntry`, `Chapter`, `Project`). Pola ini tidak memerlukan migrasi skema dan otomatis ikut alur backup/impor tanpa risiko modifikasi Foreign Key.
3. **⚠️ Wajib Sinkron di 3 Tempat untuk Tabel Project-Scoped Baru:**
   - Bila terpaksa menambah tabel baru yang berelasi dengan `projectId` atau Foreign Key lain, kamu **WAJIB** mendaftarkannya di 3 file berikut:
     1. `src/lib/importRemap.ts`: Daftarkan pemetaan ulang ID saat proyek diimpor.
     2. `src/contexts/ProjectContext.tsx`: Tambahkan perintah penghapusan di `deleteProject` agar tidak meninggalkan data yatim.
     3. `src/services/backupService.ts`: Sertakan di `collectProjectData`, `restoreData`, dan ekspor novel.

---

## 2. Rincian Skema Tabel (20 Tabel)

### projects
- **Fungsi tabel:** Menyimpan metadata proyek novel, target penulisan, kalender kustom dunia, dan kecepatan perjalanan.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `name` | `string` | Tidak | - | Nama judul proyek novel
  - `description` | `string` | Tidak | `""` | Sinopsis / deskripsi proyek
  - `wordGoal` | `number` | Ya | `undefined` | Target total kata novel
  - `dailyGoal` | `number` | Ya | `undefined` | Target kata harian
  - `createdAt` | `number` | Tidak | `Date.now()` | Timestamp pembuatan (ms)
  - `lastOpened` | `number` | Tidak | `Date.now()` | Timestamp terakhir dibuka (ms)
  - `dailyLog` | `Record<string, number>` | Ya | `undefined` | Log harian `YYYY-MM-DD` -> jumlah kata
  - `lastWordCount` | `number` | Ya | `undefined` | Total kata terakhir yang tercatat
  - `lastWordCountDate` | `string` | Ya | `undefined` | Tanggal observasi kata terakhir
  - `calendar` | `WorldCalendar` | Ya | `undefined` | Field inert: definisi kalender dunia kustom (era, bulan, musim, hari)
  - `travelSpeeds` | `TravelSpeedProfile[]` | Ya | `undefined` | Field inert: profil kecepatan perjalanan (Atlas)
- **Relasi:** Induk dari hampir semua data project-scoped.
- **Index penting:** `++id`, `name`, `lastOpened`
- **File migration terkait:** `src/db.ts` (v10 s/d v33)

---

### chapters
- **Fungsi tabel:** Menyimpan naskah bab novel, ringkasan, urutan, POV, tensi, dan status pengerjaan.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `title` | `string` | Tidak | - | Judul bab
  - `summary` | `string` | Ya | `undefined` | Ringkasan isi bab (dihasilkan AI/manual)
  - `summaryUpdatedAt` | `number` | Ya | `undefined` | Timestamp pembaharuan ringkasan
  - `content` | `string` | Tidak | `""` | Teks isi naskah bab (HTML TipTap)
  - `order` | `number` | Tidak | `0` | Urutan bab dalam novel
  - `lastModified` | `number` | Tidak | `Date.now()` | Timestamp terakhir diedit
  - `status` | `'outline'|'draft'|'edit'|'polish'|'done'` | Ya | `'draft'` | Status siklus hidup bab
  - `pov` | `string` | Ya | `undefined` | Tokoh sudut pandang utama (Point of View)
  - `wordGoal` | `number` | Ya | `undefined` | Target jumlah kata untuk bab ini
  - `tension` | `1|2|3|4|5` | Ya | `undefined` | Field inert: tingkat tensi dramatik (1=tenang, 5=klimaks)
  - `act` | `'act-1'|'act-2a'|'act-2b'|'act-3'|'unassigned'` | Ya | `undefined` | Field inert: babak naratif bab
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`, `order`
- **File migration terkait:** `src/db.ts`

---

### codex
- **Fungsi tabel:** Ensiklopedia dunia novel (*worldbuilding lore*: karakter, tempat, faksi, sihir, item, peristiwa).
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `name` | `string` | Tidak | - | Nama entitas lore
  - `aliases` | `string[]` | Tidak | `[]` | Multi-entry alias untuk pencocokan konteks
  - `category` | `string` | Tidak | `'character'` | Kategori (bawaan atau slug kustom)
  - `description` | `string` | Tidak | `""` | Deskripsi umum entitas
  - `tags` | `string[]` | Tidak | `[]` | Tag klasifikasi bebas
  - `hidden` | `boolean` | Ya | `undefined` | Flag inert: disembunyikan dari ekspor, tetap masuk KB AI
  - `secret` | `string` | Ya | `undefined` | Catatan rahasia kanon yang disembunyikan dari pembaca
  - `namePalette` | `NamePalette` | Ya | `undefined` | Palet fonotaktik untuk Bengkel Nama
  - `worldStatus` | `'stub'|'partial'|'solid'` | Ya | `undefined` | Status kelengkapan entitas
  - `todo` | `string` | Ya | `undefined` | Catatan gap/TODO penulis untuk entitas ini
  - `customFields` | `CustomFieldValue[]` | Ya | `undefined` | Nilai field kustom terstruktur per kategori
  - `factionTag` | `string` | Ya | `undefined` | Tag identitas faksi (bila entri ini adalah faksi)
  - `factionBoard` | `{x: number, y: number}` | Ya | `undefined` | Posisi koordinat kartu faksi di kanvas React Flow
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`, `name`, `category`, `*aliases` (multi-entry index)
- **File migration terkait:** `src/db.ts`

---

### bible
- **Fungsi tabel:** Aturan Story Bible proyek (nada narasi, tema, aturan sihir, pembatasan kanon).
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `key` | `string` | Tidak | - | Kunci aturan (misal: "Tone", "Genre", "Rules")
  - `instruction` | `string` | Tidak | - | Petunjuk instruksi kanon untuk penulis & AI
  - `isVirtual` | `boolean` | Ya | `false` | Entri virtual/sistem
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`, `key`, `&[projectId+key]` (compound unique)
- **File migration terkait:** `src/db.ts` (v10 migrasi dedup, v11 compound unique)

---

### aiActions
- **Fungsi tabel:** Template tombol prompt AI kustom per proyek (misal: "Perdalam Dialog", "Deskripsikan Aroma").
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `label` | `string` | Tidak | - | Label nama aksi di UI
  - `prompt` | `string` | Tidak | - | Instruksi prompt kustom yang dieksekusi AI
  - `icon` | `string` | Ya | `undefined` | Nama ikon Lucide
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`, `label`
- **File migration terkait:** `src/db.ts`

---

### snapshots
- **Fungsi tabel:** Riwayat draf bab (versi cadangan manual atau otomatis pra-rewrite AI).
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `chapterId` | `number` | Tidak | - | FK ke `chapters.id`
  - `content` | `string` | Tidak | - | Teks isi bab saat snapshot diambil
  - `label` | `string` | Tidak | - | Label draf (misal: "Pra-Rewrite AI", "Draf Awal")
  - `timestamp` | `number` | Tidak | `Date.now()` | Waktu pengambilan snapshot
  - `auto` | `boolean` | Ya | `false` | True bila diambil otomatis oleh jaring pengaman
- **Relasi:** FK `chapterId` -> `chapters.id`
- **Index penting:** `++id`, `chapterId`, `timestamp`
- **File migration terkait:** `src/db.ts`

---

### timeline
- **Fungsi tabel:** Peristiwa linimasa cerita kronologis dan tautan kalender dunia.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `chapterId` | `number` | Ya | `undefined` | FK ke `chapters.id` (bab tempat peristiwa terjadi)
  - `title` | `string` | Tidak | - | Judul peristiwa
  - `description` | `string` | Tidak | `""` | Deskripsi kejadian
  - `eventDate` | `string` | Ya | `undefined` | Label tanggal teks bebas ("Hari 3, Pagi")
  - `type` | `TimelineEventType` | Tidak | `'plot'` | Tipe: `'plot'|'character'|'world'|'subplot'|'reveal'|'other'`
  - `characterIds` | `number[]` | Ya | `[]` | Array ID entri Codex yang terlibat
  - `startDate` | `WorldDate` | Ya | `undefined` | Tanggal terstruktur kalender dunia kustom
  - `endDate` | `WorldDate` | Ya | `undefined` | Tanggal akhir untuk peristiwa rentang hari
  - `order` | `number` | Tidak | `0` | Urutan manual peristiwa di daftar timeline
- **Relasi:** FK `projectId` -> `projects.id`, FK opsional `chapterId` -> `chapters.id`, relasi array `characterIds` -> `codex.id`
- **Index penting:** `++id`, `chapterId`, `projectId`, `type`
- **File migration terkait:** `src/db.ts`

---

### relationships
- **Fungsi tabel:** Relasi sosial/politik dua arah atau satu arah antar entri Codex.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `sourceId` | `number` | Tidak | - | FK ke `codex.id` (entitas sumber)
  - `targetId` | `number` | Tidak | - | FK ke `codex.id` (entitas target)
  - `type` | `string` | Tidak | - | Jenis relasi (misal: "Musuh", "Keluarga", "Sekutu")
  - `description` | `string` | Ya | `undefined` | Deskripsi dinamika relasi
- **Relasi:** FK `projectId` -> `projects.id`, FK `sourceId` & `targetId` -> `codex.id`
- **Index penting:** `++id`, `projectId`, `sourceId`, `targetId`
- **File migration terkait:** `src/db.ts`

---

### errors
- **Fungsi tabel:** Log error dan peringatan aplikasi untuk diagnostik lokal.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `message` | `string` | Tidak | - | Pesan error
  - `stack` | `string` | Ya | `undefined` | Stack trace error
  - `timestamp` | `number` | Tidak | `Date.now()` | Waktu pencatatan
  - `type` | `'error'|'warning'|'info'` | Tidak | `'error'` | Tingkat keparahan
  - `source` | `string` | Ya | `undefined` | Modul asal error
  - `metadata` | `any` | Ya | `undefined` | Payload informasi tambahan
- **Relasi:** Tidak ada (global per instansi DB).
- **Index penting:** `++id`, `timestamp`, `type`
- **File migration terkait:** `src/db.ts`

---

### backups
- **Fungsi tabel:** Arsip cadangan rolling internal aplikasi (JSON atau gzip terkompresi).
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `timestamp` | `number` | Tidak | - | Waktu pembuatan backup
  - `data` | `string | Uint8Array` | Tidak | - | String JSON atau byte array gzip terkompresi
  - `size` | `number` | Tidak | - | Ukuran payload dalam byte
  - `compressed` | `boolean` | Ya | `false` | True bila data dikompresi gzip
  - `kind` | `'auto'|'pre-restore'` | Ya | `'auto'` | Jenis titik pulih
- **Relasi:** Tidak ada (menyimpan cadangan multi-proyek).
- **Index penting:** `++id`, `timestamp`
- **File migration terkait:** `src/db.ts` (v12)

---

### chatSessions
- **Fungsi tabel:** Sesi percakapan interaktif dengan AI Studio, Scribble, atau Lokakarya.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `chapterId` | `number` | Ya | `undefined` | FK ke `chapters.id` (sesi terikat bab)
  - `activeChapterId` | `number` | Ya | `undefined` | Bab yang sedang dibuka saat chat berlangsung
  - `title` | `string` | Tidak | - | Judul sesi percakapan
  - `messages` | `ChatMessage[]` | Tidak | `[]` | Riwayat pesan (`role`, `content`, `timestamp`)
  - `lastMessageAt` | `number` | Tidak | `Date.now()` | Timestamp pesan terakhir
  - `mode` | `SessionMode` | Ya | `'brainstorm'` | Mode: `'prose-review'|'plot-check'|'brainstorm'`
  - `smartAutoEnabled` | `boolean` | Ya | `true` | Otomatis injeksi konteks relevan
  - `kind` | `'studio'|'scribble'|'workshop'` | Ya | `'studio'` | Jenis workspace chat
  - `workshopKey` | `string` | Ya | `undefined` | Kunci entri lokakarya (`entry:<id>` / `new:<name>`)
- **Relasi:** FK `projectId` -> `projects.id`, FK opsional `chapterId` -> `chapters.id`
- **Index penting:** `++id`, `projectId`, `chapterId`, `activeChapterId`, `lastMessageAt`
- **File migration terkait:** `src/db.ts` (v11, v13, v14)

---

### embeddings
- **Fungsi tabel:** Cache vektor embedding semantik entri Codex untuk pencocokan RAG lokal.
- **Kolom:**
  - `id` | `string` | Tidak | - | Primary key (`projectId_codexId`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `codexId` | `number | string` | Tidak | - | FK ke `codex.id`
  - `contentHash` | `string` | Tidak | - | Hash MD5/SHA teks entri untuk deteksi perubahan
  - `embedding` | `Float32Array` | Tidak | - | Vektor dense 384-dimensi MiniLM
  - `lastUpdated` | `number` | Tidak | - | Waktu pembaharuan vektor
- **Relasi:** FK `projectId` -> `projects.id`, FK `codexId` -> `codex.id`
- **Index penting:** `id` (primary key unik teks), `projectId`, `codexId`
- **File migration terkait:** `src/db.ts` (v16)

---

### aiUsageLogs
- **Fungsi tabel:** Log penggunaan kuota token, biaya, dan performa cache prompt AI per-aksi.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `timestamp` | `number` | Tidak | `Date.now()` | Waktu eksekusi aksi
  - `promptTokens` | `number` | Tidak | `0` | Jumlah token prompt input
  - `completionTokens` | `number` | Tidak | `0` | Jumlah token output model
  - `totalTokens` | `number` | Tidak | `0` | Total token keseluruhan
  - `cachedTokens` | `number` | Ya | `0` | Jumlah token yang terlayani dari prompt cache provider
  - `provider` | `string` | Tidak | - | Nama provider (misal: "google", "claude")
  - `model` | `string` | Tidak | - | Nama model yang digunakan
  - `actionType` | `string` | Tidak | - | Tipe aksi (misal: "rewrite", "chat", "summarize")
- **Relasi:** Tidak ada (log analitik global).
- **Index penting:** `++id`, `timestamp`, `provider`, `actionType`
- **File migration terkait:** `src/db.ts` (v17)

---

### codexCategories
- **Fungsi tabel:** Definisi kategori kustom Codex yang dibuat oleh pengguna (slug, label, ikon, warna, dan field template).
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `slug` | `string` | Tidak | - | Pengenal unik kategori dalam proyek (tidak boleh berubah)
  - `label` | `string` | Tidak | - | Label nama kategori di UI
  - `icon` | `string` | Tidak | - | Nama ikon dari registry kategori
  - `color` | `string` | Tidak | - | Nama warna dari registry kategori
  - `order` | `number` | Tidak | `0` | Urutan tampilan di tab/filter
  - `fields` | `CategoryFieldDef[]` | Ya | `[]` | Skema field kustom yang wajib diisi entri kategori ini
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`, `slug`, `&[projectId+slug]` (compound unique)
- **File migration terkait:** `src/db.ts` (v19)

---

### sceneEmbeddings
- **Fungsi tabel:** Vektor embedding potongan (*chunks*) naskah bab untuk fitur Pencarian Semantik adegan.
- **Kolom:**
  - `id` | `string` | Tidak | - | Primary key (`${projectId}_${chapterId}_${chunkIndex}`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `chapterId` | `number` | Tidak | - | FK ke `chapters.id`
  - `chunkIndex` | `number` | Tidak | - | Indeks urutan potongan dalam bab
  - `contentHash` | `string` | Tidak | - | Hash teks chunk untuk pembaruan inkremental
  - `snippet` | `string` | Tidak | - | Cuplikan teks prosa untuk pratinjau hasil
  - `embedding` | `Float32Array` | Tidak | - | Vektor dense representasi makna teks
  - `lastUpdated` | `number` | Tidak | - | Timestamp pembuatan embedding
- **Relasi:** FK `projectId` -> `projects.id`, FK `chapterId` -> `chapters.id`
- **Index penting:** `id` (primary key unik teks), `projectId`, `chapterId`, `[projectId+chapterId]`
- **File migration terkait:** `src/db.ts` (v20)

---

### plotPromises
- **Fungsi tabel:** Pelacak janji plot (*Chekhov's Gun* / *Foreshadowing*) dan hubungannya ke pengungkapan (*payoff/reveal*).
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `title` | `string` | Tidak | - | Judul janji cerita / elemen misteri
  - `description` | `string` | Ya | `undefined` | Detail janji atau ramalan
  - `codexId` | `number` | Ya | `undefined` | FK ke `codex.id` (entitas yang menjadi janji)
  - `keywords` | `string[]` | Ya | `[]` | Kata kunci pelacak teks naskah untuk janji non-entitas
  - `plantedChapterId` | `number` | Ya | `undefined` | FK ke `chapters.id` tempat janji pertama kali ditebar
  - `payoffCodexId` | `number` | Ya | `undefined` | FK ke `codex.id` (entitas rahasia yang terbayar oleh janji ini)
  - `expectedBy` | `string` | Ya | `undefined` | Catatan target bab atau waktu terbayar
  - `importance` | `'high'|'medium'|'low'` | Ya | `'medium'` | Tingkat pentingnya janji
  - `status` | `'open'|'paid'|'abandoned'` | Tidak | `'open'` | Status penyelesaian janji
  - `createdAt` | `number` | Tidak | `Date.now()` | Timestamp pembuatan
  - `updatedAt` | `number` | Tidak | `Date.now()` | Timestamp pembaruan
- **Relasi:** FK `projectId` -> `projects.id`, FK opsional `codexId` -> `codex.id`, `plantedChapterId` -> `chapters.id`, `payoffCodexId` -> `codex.id`
- **Index penting:** `++id`, `projectId`, `codexId`
- **File migration terkait:** `src/db.ts` (v21)

---

### glossary
- **Fungsi tabel:** Glosarium istilah non-nama khusus dunia fiksi yang wajib konsisten ejaannya.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `term` | `string` | Tidak | - | Ejaan baku/resmi istilah
  - `definition` | `string` | Ya | `undefined` | Arti/definisi istilah
  - `variants` | `string[]` | Ya | `[]` | Daftar varian salah yang sengaja dibendera oleh detektor
  - `category` | `string` | Ya | `undefined` | Kategori istilah (misal: "satuan", "pangkat")
  - `createdAt` | `number` | Tidak | `Date.now()` | Timestamp pembuatan
  - `updatedAt` | `number` | Tidak | `Date.now()` | Timestamp pembaruan
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`
- **File migration terkait:** `src/db.ts` (v25)

---

### maps
- **Fungsi tabel:** Koleksi gambar peta dunia yang diunggah penulis untuk kanvas Atlas.
- **Backup F03/F04:** Skema tabel tetap v33. `imageDataUrl`, `imageAssetId`, dan `imageMissing` hanya milik representasi backup v8, dilepas sebelum insert. Auto internal mencocokkan hash gambar live; snapshot pra-restore menyimpan gambar penuh. Restore tidak clear workspace bila aset yang dibutuhkan atau snapshot pengaman gagal. Lihat [format backup](backup-format.md) untuk kompatibilitas legacy, validasi relasi, dan batas input.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `name` | `string` | Tidak | - | Nama peta (misal: "Benua Aethoria", "Ibukota")
  - `imageBlob` | `Blob` | Tidak | - | Objek Blob binary gambar peta di IndexedDB
  - `width` | `number` | Tidak | - | Dimensi lebar asli piksel
  - `height` | `number` | Tidak | - | Dimensi tinggi asli piksel
  - `createdAt` | `number` | Tidak | `Date.now()` | Timestamp unggah
  - `scale` | `{ distanceUnit: string, ratioToRelative: number }` | Ya | `undefined` | Kalibrasi skala jarak nyata
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`
- **File migration terkait:** `src/db.ts` (v32)

---

### mapMarkers
- **Fungsi tabel:** Titik penanda (pin), batas wilayah (poligon area), dan rute (polyline) di atas peta Atlas.
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `mapId` | `number` | Tidak | - | FK ke `maps.id` (peta pemilik)
  - `kind` | `'pin'|'area'|'route'` | Tidak | `'pin'` | Bentuk penanda
  - `geometry` | `MapPoint | MapPoint[]` | Tidak | - | Koordinat relatif `0–1` (`{x, y}`)
  - `codexId` | `number` | Ya | `undefined` | FK ke `codex.id` (entitas yang ditautkan)
  - `title` | `string` | Ya | `undefined` | Judul bebas bila tidak ditautkan ke Codex
  - `note` | `string` | Ya | `undefined` | Catatan lokasi bebas
  - `color` | `string` | Ya | `undefined` | Kode hex warna penanda
  - `createdAt` | `number` | Tidak | `Date.now()` | Timestamp pembuatan
  - `linkedMapId` | `number` | Ya | `undefined` | FK ke `maps.id` untuk penanda portal sub-peta
  - `meta` | `Record<string, any>` | Ya | `undefined` | Metadata inert (misal: ID profil kecepatan rute)
- **Relasi:** FK `projectId` -> `projects.id`, FK `mapId` -> `maps.id`, FK opsional `codexId` -> `codex.id`, `linkedMapId` -> `maps.id`
- **Index penting:** `++id`, `projectId`, `mapId`, `codexId`
- **File migration terkait:** `src/db.ts` (v32)

---

### continuityTriage
- **Fungsi tabel:** Status triase temuan kontinuitas (apakah temuan diabaikan/disembunyikan oleh penulis).
- **Kolom:**
  - `id` | `number` | Ya (auto-increment) | auto | Primary key (`++id`)
  - `projectId` | `number` | Tidak | - | FK ke `projects.id`
  - `findingId` | `string` | Tidak | - | ID unik deterministik temuan kontinuitas
  - `status` | `'dismissed'|'acknowledged'` | Tidak | `'dismissed'` | Status triase
  - `timestamp` | `number` | Tidak | `Date.now()` | Waktu penandaan
- **Relasi:** FK `projectId` -> `projects.id`
- **Index penting:** `++id`, `projectId`, `findingId`
- **File migration terkait:** `src/db.ts` (v33)

## Impor Identitas Triage dan Workshop (F10)

Schema v33 tidak berubah. Transaksi importProjectData kini mencakup continuityTriage. ID timeline/relationships dikumpulkan dari hasil bulkAdd untuk remap findingId, selain chapterIdMap/codexIdMap/mapIdMap. Primary key triage lama dilepas, projectId diganti, status/timestamp dipertahankan. workshopKey entry:<id> mengikuti ID Codex baru; teks chat tetap literal. Format findingId yang tidak dikenal membatalkan seluruh transaksi, sedangkan finding lama dengan target yang sudah hilang dibuang. Tidak memodifikasi proyek sumber atau tabel proyek lain.
