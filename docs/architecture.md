# Arsitektur Sistem — AetherScribe

## 1. Peta Direktori Proyek

```text
Aplikasi-Pembuatan-Novel/
├── .agents/                    # Aturan agen AI & konvensi lingkungan
├── .claude/rules/              # Aturan teknis per-fitur (dimuat otomatis berbasis path)
├── docs/                       # Dokumentasi modular teknis & keputusan arsitektur
├── public/                     # Aset statis browser (ikon, font, favicon)
├── server.ts                   # Express proxy AI & static file server
├── src/
│   ├── components/             # Komponen UI lintas-fitur
│   │   ├── common/             # Tombol, modal dasar, error boundary, badge
│   │   ├── layout/             # Header, Sidebar, MainView, StudioTabBar
│   │   ├── modals/             # Modal global (impor, ekspor, snapshot)
│   │   └── panels/             # Panel mandiri (Dashboard, Settings, Guide, ErrorLog)
│   ├── contexts/               # State global React Context (Project, Nav, UI, Editor)
│   ├── features/               # Modul fitur berbasis domain
│   │   ├── assistant/          # Obrolan AI Studio & multi-sesi
│   │   ├── atlas/              # Peta interaktif Leaflet CRS.Simple
│   │   ├── chapters/           # Outline, daftar bab, Kanban babak
│   │   ├── codex/              # Ensiklopedia entri, graf lore, form entri
│   │   ├── codex-workshop/     # Studio lokakarya entri dengan AI
│   │   ├── consistency/        # Peta kontinuitas, glosarium, janji plot, pacing
│   │   ├── editor/             # TipTap 3 editor, toolbar, autosave bridge
│   │   ├── lore/               # Story Bible, relasi entitas, papan faksi
│   │   ├── search/             # Pencarian semantik prosa & federated search
│   │   └── timeline/           # Timeline cerita & kalender dunia kustom
│   ├── hooks/                  # Custom React hooks (live query, debounce, backup)
│   ├── lib/                    # Logika murni, algoritma deterministik, math & format
│   ├── services/               # Integrasi AI, worker facade, backup, IndexedDB
│   │   ├── ai/                 # Facade AI, proxy client, circuit breaker, prompts
│   │   └── rag/                # Sinkronisasi & worker pencarian Orama BM25
│   ├── workers/                # Dedicated Web Workers (token counter, dll)
│   ├── db.ts                   # Konfigurasi database Dexie & rantai migrasi skema
│   ├── main.tsx                # Entry point React, tree provider global
│   └── types.ts                # TypeScript interface seluruh model domain
└── vite.config.ts              # Konfigurasi Vite & middleware dev
```

---

## 2. Alur Data & State Management

AetherScribe tidak menggunakan Redux maupun Zustand. State dikelola secara reaktif dan lokal:
- **Penyimpanan Primer:** Browser IndexedDB via wrapper **Dexie.js** (`AetherScribeDB`, skema v35 di `src/db.ts`).
- **Reaktivitas UI:** Menggunakan `dexie-react-hooks` (`useLiveQuery`), dibungkus secara teroptimasi di `src/hooks/useOptimizedLiveQuery.ts` dan `src/hooks/useProjectData.ts`. Setiap perubahan tabel IndexedDB otomatis memicu re-render hanya pada komponen yang berlangganan.
- **State Sesi & Navigasi:** Menggunakan kombinasi React Contexts terisolasi:
  - `ProjectContext`: Proyek aktif, pemilihan proyek, operasi hapus proyek terkoordinasi.
  - `NavigationContext`: Nilai `viewMode` aktif, bab terpilih (`activeChapterId`), dan navigasi deep-link.
  - `UIContext`: Mode fokus (*focus mode*), tema tampilan (dark/light), status sidebar.
  - `EditorPanelContext`: Tab editor aktif dan panel split view.
- `MainView` memilih panel berdasarkan `viewMode` dari
  `NavigationContext`. Saat pertama membuka Editor, TipTap dibuat dari isi bab
  yang sudah dimuat. Saat berpindah panel, antarmuka Editor dan bridge autosave
  dilepas. Satu instance TipTap bertahan dalam memori untuk riwayat bab aktif.
  Ketika Editor dibuka kembali, isi di IndexedDB diperiksa sebelum instance itu
  dipakai kembali. Ganti bab, ganti proyek, atau perubahan isi di penyimpanan
  memulai sesi TipTap baru.

---

## 3. Komputasi Berat di Web Worker

L06 menambahkan `src/workers/backupWorker.ts` untuk persiapan auto-backup internal
besar, dengan antrean save per tab, timeout dan fallback main. Algoritme bersama
ada di `src/lib/internalBackupPreparation.ts`; snapshot dan penyimpanan tetap
milik service. [Kontrak dan batas](reports/audits/2026-11-15-l06-backup-integration.md).

Kontrak data context/Orama, respons AI dan pemisahan metadata/input bab dijelaskan
di [F28.2](reports/audits/2026-11-15-f28-contracts.md). Payload dan hasil tiap task worker
memakai tipe bersama dan pemeriksaan runtime; JSON provider diperlakukan sebagai
unknown sebelum teks/usage/error dinormalisasi.

Pemeriksaan strict dilakukan bertahap melalui `tsconfig.strict.json` dan
`npm run lint:strict`, terpisah dari typecheck umum. Semua import transitif tetap
ikut diperiksa. Cakupan awal dan pengecualiannya ada di [F28.3](reports/audits/2026-11-15-f28-strict.md).

Untuk menjaga antarmuka penulisan tetap mulus (60 FPS) tanpa terblokir (*zero UI freezing*), tugas-tugas berat dieksekusi di background Web Worker:

1. **`src/services/contextWorker.ts`** (dikendalikan `contextEngine.ts`):
   - Pencocokan nama entitas & alias secara instan via algoritma **Aho-Corasick** (`src/lib/ahoCorasick.ts`).
   - Ekstraksi embedding semantik lokal via model `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`) yang disimpan di IndexedDB tabel `embeddings` dan `sceneEmbeddings`.
   - Perhitungan token presisi menggunakan `js-tiktoken`.
2. **`src/services/rag/oramaWorker.ts`** (dikendalikan `oramaStore.ts` & `oramaSync.ts`):
   - Mesin pencarian leksikal **BM25 Orama** sebagai pelengkap pencarian semantik (pencarian federated).
3. **`src/features/codex/workers/loreGraphWorker.ts`**:
   - Menghitung kalkulasi graf keterhubungan entitas lore ratusan node di latar belakang agar kanvas `react-force-graph` tidak membekukan browser.
4. **`src/workers/tokenWorker.ts`**:
   - Menghitung live meter token pada panel editor dan pratinjau konteks.
5. **`src/workers/chapterSearchWorker.ts`**:
   - Memindai teks bab tersimpan untuk pencarian global dan mengembalikan
     cuplikan serta lokasi kecocokan. Editor memeriksa lokasi terhadap
     dokumen aktif sebelum menampilkan dekorasi sementara.

---

## 4. Alur Integrasi AI & Arsitektur Proxy

```text
[Komponen UI / Fitur]
        │
        ▼
[src/services/ai/index.ts] (Facade: executeAIAction)
   ├── Membangun Knowledge Base terpisah (buildCachedContextSegments)
   ├── Memasang circuit breaker & backoff resiliensi (circuitBreaker.ts)
   └── Menyaring parameter & routing model ringan (getLightModelForProvider)
        │
        ▼
[src/services/ai/proxy.ts] (Client HTTP call)
   ├── Menyisipkan header autentikasi BYOK dari credentialStore
   └── Menangani parsing Server-Sent Events (SSE) streaming
        │
        ▼ (HTTP POST /api/ai/proxy - Body limit 25MB)
[server.ts] (Node/Express Proxy)
   ├── Mengaktifkan AbortController hulu bila koneksi klien terputus
   └── Mengarahkan payload ke API Provider Hulu
        │
        ▼
[Provider Hulu] (Google Gemini, Anthropic Claude, Groq, OpenRouter, OpenAI, Hugging Face, Ollama)
```

### Mekanisme Kunci AI:
- **BYOK (Kunci di Klien):** Server proxy tidak menyimpan kredensial. Kunci API diteruskan via header `x-api-key` dari browser, atau menggunakan fallback env server lokal.
- **Prompt Caching Ber-Tier:**
  - Pengetahuan statis (*Story Bible* & aturan dunia) ditempatkan di segmen cache awal yang stabil.
  - Pengetahuan volatil (*Codex* & entri yang sering disunting) ditempatkan di segmen berikutnya.
  - Riwayat chat dan konteks bab diletakkan di akhir agar modifikasi teks naskah tidak membatalkan cache prompt *Story Bible*.
- **Circuit breaker dan fallback:** Dispatch menangani kegagalan sementara dan
  rate-limit dengan backoff. Fallback mengikuti mode lokal dan daftar provider
  yang diizinkan pengguna. [Kebijakan provider](api.md#kebijakan-provider-klien-f17)

### Kontrak pengembangan AI dan konteks

- Fitur memanggil facade `src/services/ai/index.ts`. Gunakan orkestrasi di
  `dispatch.ts`, pembatalan di `execution.ts`, dan validasi respons di
  `responseContracts.ts`. Modul internal mengimpor pemilik fungsi secara
  langsung supaya state breaker dan controller tetap dikelola di satu tempat.
- Pada mode caching, `buildCachedContextSegments` menyusun segmen stabil
  Story Bible lalu Codex dan graf. Teruskan segmen lewat `cachedContext` secara
  terpisah dari `systemInstruction`. Jaga urutan deterministik dan kesamaan
  byte segmen lintas aksi dengan cakupan bab dan riwayat yang sama. Mode lain
  memakai konteks relevan melalui worker.
- `codexDetails.ts` membentuk konteks detail yang diizinkan penulis. Gunakan
  metadata bab untuk memilih revisi hingga bab target. Tanpa bab target,
  aksi biasa memakai nilai terbaru. Audit lintas bab dapat meminta riwayat.
  Nilai yang bergantung pada bab masuk segmen Codex. Prefiks Story Bible
  tetap stabil. Worker meter menerima ID bab dan memakai fungsi format yang sama.
- Jalur AI dan pratinjau token berbagi `loreFormat.ts`. Potong lore pada batas
  entri dan kirim batas dari `getMaxCachedLoreChars()` lewat payload worker.
- Gunakan kontrak dari `contextProtocol.ts`, `rag/oramaProtocol.ts`, dan
  `responseContracts.ts` untuk validasi input dan hasil. Pertahankan tipe
  nilai seperti Map dan Set pada transport worker serta terima usage nol.
- SSE harus meneruskan error provider dan `AbortError`. Saat retry, reset
  buffer percobaan sebelumnya dan gunakan hasil final. Bersihkan timer saat
  selesai, unmount, atau ganti bab.
- Sesi asisten memakai `chatSessions.kind` untuk membedakan Studio, Scribble,
  dan Workshop. Tetapkan jenis pada sesi baru dan jaga riwayat Studio terpisah
  dari dua jenis lain. Aturan remap target Workshop ada di
  [format backup](backup-format.md#round-trip-f10).
- Diskusi AI memilih entri Codex dari ID dalam proyek aktif. Saat mengirim,
  pesan pengguna menyimpan `requestSnapshot` opsional berisi hasil ekspansi
  lore manual, nama lampiran, dan konteks bab manual bila tersedia. Buat Ulang
  menggunakan salinan ini dari pesan asal. Konteks otomatis tetap berasal
  dari sesi.
- Saat menyimpan ringkasan otomatis, pakai hash isi sumber dan commit
  bersyarat di transaksi. Pertahankan nilai nol yang valid pada pengaturan
  suhu dan metrik usage. [Ringkasan dan metrik](features.md#ringkasan-otomatis-dan-metrik-ai-f29f13)

### Kontrak panel pengaturan

Pertahankan `SettingsPanel` sebagai shell tab. Tambahkan kontrol pada section
terkait dan pusatkan baca/tulis pengaturan AI di `useAISettings.ts`. Gunakan
`useConnectionTest.ts` serta komponen status koneksi yang ada.

Shell Pengaturan menyimpan draf selama pengguna berpindah antara Konfigurasi AI
dan Data & Cadangan. Tombol **Simpan Pengaturan AI** muncul ketika draf berubah.
Mode lokal, izin penyedia cadangan, dan konsistensi otomatis tetap berlaku
langsung. Kartu **Penyedia utama** merangkum pilihan bawaan, koneksi, dan model.
Uji koneksi memakai model utama dan alamat Ollama dari form ketika tersedia.
Uji Ollama memeriksa katalog model lebih dulu dan menampilkan keadaan alamat
ditolak, layanan tidak terjangkau, atau katalog kosong sebelum menguji model.
Kontrol penyedia dan model memakai baris terpisah. Label berada di atas kontrol
di layar sempit dan sejajar di layar lebar. Daftar izin cadangan dapat dibuka
dari Preferensi dan statusnya terlihat saat daftar tertutup.

Pemilih model tugas ringan memakai `ModelSelect` dan memuat katalog penyedia
cloud saat dibuka. Proxy memakai API key pada form atau fallback server.
Gunakan ID kosong untuk default AetherScribe. ID lama tetap dipertahankan
saat katalog gagal dimuat atau tidak mencantumkannya. Pilihan disimpan per
penyedia melalui **Simpan Pengaturan AI**. Ollama memakai model utama.
Rangkuman otomatis di latar belakang memerlukan API key di browser.

Facade AI dan panel memakai `credentialStore` bersama. Terapkan perubahan mode
penyimpanan kredensial pada Save. Pertahankan kunci legacy saat mount dan
laporkan kegagalan storage sebelum menampilkan sukses. Clear membersihkan
penyimpanan sesi, penyimpanan browser, dan isian tab aktif.
[Privasi kredensial dan diagnostik](#boundary-kredensial-dan-diagnostik-f27)

---

## 5. Daftar Environment Variables

Daftar nama variabel lingkungan yang didukung aplikasi (tanpa nilai rahasia):

| Nama Variabel | Wajib/Opsional | Deskripsi / Peran |
|---|---|---|
| `GEMINI_API_KEY` | Opsional | Kunci fallback API Google Gemini di sisi server. |
| `GROQ_API_KEY` | Opsional | Kunci fallback API Groq di sisi server. |
| `OPENROUTER_API_KEY` | Opsional | Kunci fallback API OpenRouter di sisi server. |
| `CLAUDE_API_KEY` | Opsional | Kunci fallback API Anthropic Claude di sisi server. |
| `OPENAI_API_KEY` | Opsional | Kunci fallback API OpenAI di sisi server. |
| `HF_API_KEY` | Opsional | Kunci fallback API Hugging Face Inference Router di sisi server. |
| `HUGGINGFACE_API_KEY` | Opsional | Alias untuk `HF_API_KEY`. |
| `APP_URL` | Tidak digunakan | Tidak mengubah binding atau allowlist proxy. |
| `NODE_ENV` | Ditentukan entry point | `serverDev.ts`: development; `serverProduction.ts`: production. Nilai dari shell/.env tidak mengganti pilihan ini. |
| `PORT` | Opsional | Port server Express lokal, bilangan bulat 1-65535 (default: `3000`); Host/Origin mengikuti port aktif. |

## Kontrak Pembatalan Context Worker (F16)

Main thread dan worker memakai contextProtocol.ts: pesan CANCEL membawa payload.cancelId. Task memiliki ID tersendiri, sedangkan INDEX_MANUSCRIPT tetap fire-and-forget. Timeout menghapus pending Promise di main thread dan mengirim cancel; worker memeriksa ID aktif pada checkpoint async/yield serta membersihkan penanda pada finally. Cancel request A tidak membatalkan B atau model bersama. Ini bukan hard termination terhadap komputasi sinkron; pembatalan baru efektif setelah event loop menerima pesan dan checkpoint berikutnya tercapai. Heartbeat progres tetap memperpanjang idle timeout sesuai mekanisme sebelumnya.

## Startup Dev/Production (F21)

`server.ts` mengekspor app/startup tanpa side effect listen dan tanpa import Vite.
`serverDev.ts` memuat `.env` dengan dotenv, menetapkan development, lalu mengimpor
Vite secara dinamis. `serverProduction.ts` menetapkan production dan dibundle
esbuild ke `dist/server.cjs`; aset dicari dari `__dirname` bundle, bukan cwd.
File `.env` berasal dari cwd dan tidak menimpa environment proses. Hanya boolean
HAS_GEMINI_KEY masuk define Vite, bukan nilai kuncinya; rahasia jangan memakai
prefix VITE_ (prefix itu memang diekspos Vite).

Kedua entry menggunakan PORT yang tervalidasi dan binding loopback 127.0.0.1.
Build hilang, port invalid dan kegagalan listen menghasilkan exit code 1.
Runtime tidak memerlukan Vite, tsx, atau dependency dev lain. Versi Node yang
didukung mengikuti engines package.json (termasuk kebutuhan jsdom pada tes).
Prosedur Windows, distribusi production dan smoke test ada di README.md.

## Harness Regresi dan CI (F24)

Vitest memiliki konfigurasi terpisah untuk discovery src/**/*.test.{ts,tsx}, alias
src dan coverage V8 seluruh src/entry server. Playwright memakai browser context
baru, IndexedDB/Blob/worker native, fixture sebelum React dimuat, dan server
Express + Vite khusus uji dengan cache serta port HMR terpisah dari dev pengguna.
Harness berada di e2e/ dan tidak masuk bundle production. Dependency baru hanya
untuk development; skema DB dan runtime fitur tidak berubah.

CI menjalankan typecheck, unit/integrasi+coverage, browser kritis, lalu build dan
smoke production bersih pada Windows/Ubuntu. Laporan coverage/trace/screenshot
disimpan sebagai artefak tujuh hari. Batas, inventaris alur, serta perbedaan
coverage Vitest dan bukti browser/child process dijelaskan di [testing.md](testing.md).

## Boundary Kredensial dan Diagnostik (F27)

credentialStore.ts adalah kontrak bersama hook useAISettings dan facade AI untuk
mode ai_key_storage (session/persistent) dan key ai_key_<provider>. Tanpa flag,
keberadaan key lokal legacy mempertahankan mode persistent; instalasi baru sesi.
Mode sesi tidak membaca fallback key lokal. Save menulis target dahulu, membuang
salinan storage lain, lalu menyimpan flag. Web Storage tidak transaksional; bila
operasi gagal pengguna menerima error, bukan status sukses. Tidak ada migrasi DB.

ErrorService menerapkan privateErrorRecord sebelum console/IndexedDB. Diagnostik
hanya berupa allowlist source/provider/code dan angka ID/lineno/colno serta boolean
networkError. Pesan bebas, stack, model, actionType bebas, nested error, reason,
promptPreview dan rawMessage tidak diteruskan. Panel/getRecent juga memproyeksi
record lama melalui boundary yang sama; bytes lama tidak dihapus otomatis.
Jalur console AI dan sendError server memakai pesan statis tanpa object error.
Ini meminimalkan log aplikasi, tidak memberi perlindungan terhadap script XSS,
profil browser, console dari library/browser, atau salinan data sebelumnya.

## Boundary Modal dan Navigasi (F25/F26)

ConfirmDialog menggunakan primitive browser dialog.showModal, bukan overlay div.
Native top-layer/inert melindungi interaksi latar; handler Tab membatasi rotasi
fokus ke kontrol yang aktif/terlihat, termasuk saat tidak ada kontrol aktif.
Layout effect membuka/menutup modal serta memulihkan pemicu, aria-busy menandai
proses. Escape ditangani melalui cancel event dengan preventDefault agar state
open tetap dikendalikan React. Busy memblokir callback dismissal. Keyboard dialog
tidak diteruskan ke shortcut global aplikasi. Unit jsdom mengemulasi metode native;
bukti trap/nesting/backdrop berasal dari browser Chromium.

studioNavigation.normalizeViewMode memakai STUDIOS sebagai daftar tujuan aktif,
mengalihkan legacy arc/orphans dan memberi fallback unknown/workshop tanpa target.
NavigationContext menerapkannya pada pemuatan/setter; MainView juga memvalidasi
sebelum memilih renderer. Riwayat studio menormalisasi sebelum membaca/menyimpan.
ViewMode legacy tetap dikenali untuk kompatibilitas, tetapi bukan tujuan render
mandiri. openCodexEntry/openAtlasMarker/openWorkshop tetap mempertahankan target.

## Pemuatan Dependency F22

App memakai React.lazy untuk ExportManager di dalam Suspense yang sudah ada.
ActionsPanel dan SelectionFloatingMenu berbagi actionIcons tanpa menarik panel
penuh ke startup. Worker Vite memakai format es; getEmbedder mengimpor transformers
secara dinamis lalu mengatur env sebelum pipeline. Promise init dibagi, kegagalan
mengosongkan promise untuk retry, dan checkpoint cancellation tetap berlaku.
Precache glob/limit tetap mencakup chunk baru; tidak mengecualikan fitur lazy dari
offline. Test produksi test:startup mengaktifkan SW untuk assertion offline, tetapi
memblokirnya pada sample timing agar install cache tidak mencampur ukuran startup.
Lihat [metodologi dan raw data](reports/benchmarks/f22.md).

## Query Metadata dan Ranking F23

chapterMetadata mendefinisikan tuple covering-index, chapterQueries membaca index
keys untuk list/stats serta timestamp terbaru. AetherScribeDB v34 memasang hooks
saat konstruksi, sehingga write path main thread/worker menggunakan kontrak yang
sama tanpa cache post-commit. Bidang baru bukan FK/tabel tambahan. Field derived
ikut backup sebagai data Chapter dan dibangun ulang oleh hook sesudah import.

useOptimizedLiveQuery membandingkan hasil baru lewat sameQueryResult tanpa JSON
serialization; referensi stabil tetap dipertahankan untuk data setara. Tipe non-data
dipandang berubah secara konservatif. sceneQueries melakukan keyset getAll batch
256 dalam satu readonly transaction; contextWorker memakai StableTopK dan tetap
memeriksa cancel. Tidak ada await timer/model di dalam transaksi ranking. Detail
schema, benchmark, dan tradeoff: [database](database.md), [F23](reports/benchmarks/f23.md).

## Pemisahan layanan AI F28.4

`src/services/ai/index.ts` mempertahankan facade publik dan prompt tiap aksi.
Konfigurasi provider/model/kredensial dibaca oleh `settings.ts`; `context.ts`
menyusun KB caching/RAG dengan formatter lore bersama. `dispatch.ts` memiliki
AIError, circuit breaker dan dispatch/retry/fallback; `execution.ts` memiliki
registry AbortController dan cleanup aksi. `resultParsing.ts` menangani sanitasi
finding/audit dan pembersihan wrapper respons. Modul internal tidak mengimpor facade,
sehingga tidak membentuk siklus import. State breaker/controller tetap satu instance
per modul; dedup rewrite tetap di facade. Kontrak publik dan kebijakan privasi tetap.

## Pemisahan Atlas F28.5

AtlasPanel tetap menjadi orchestrator data, navigasi/deep-link dan modal.
`useAtlasSelection` memiliki state peta/penanda, mode gambar/edit dan reset edit
saat seleksi berubah. `useAtlasFilters` memiliki filter jenis/kategori/faksi,
lookup Codex serta daftar penanda terlihat tanpa mengubah data sumber.
`AtlasControls` memiliki thumbnail (termasuk cleanup URL Blob) dan kontrol filter.
`useAtlas` mempertahankan live-query dan membentuk operasi stabil per proyek
melalui `createAtlasOperations` di `src/services/atlasOperations.ts`.
Operasi penghapusan peta tetap mendelegasikan cleanup relasi ke entityDeletion F11.
Leaflet/propsRef, geometri relatif, ikon DOM teks, dan worker presence tetap
memakai implementasi yang sama. Tidak ada perubahan skema atau dependency.

Pratinjau area mengirim lintasan batas ke `areaBoundaryWorker.ts`.
`useAreaBoundaryCrossing` mencocokkan ID permintaan terbaru dan menutup
worker saat kanvas dilepas. Render dan analitik wilayah mengambil sampel
batas dari fungsi murni `sampleAreaBoundary`.
Detail area juga meminta daftar area tercakup lewat protokol yang sama.
Worker memakai sampel lintasan yang terlihat dan memeriksa sisi kandidat
pada batas cekung. Pergantian area membatalkan permintaan terdahulu.

Pengaman F28.5: unit filter/selections dan CRUD/domain cleanup; fixture native
`e2e/atlasFixture.tsx` menggunakan MapCanvas, hook dan service produksi dengan
IndexedDB/Blob asli untuk menggambar pin/area/rute, drag pin, filter jenis,
label markup inert dan cleanup URL saat unmount. Penyelesaian area/rute diuji
melalui Enter. Fixture tidak menggantikan alur upload/modal/sidebar penuh;
portal/deep-link dan pergantian proyek UI belum diuji browser menyeluruh.
Tes jsdom MapCanvas/geometry, domain deletion serta native backup/restore yang
sudah ada tetap menjadi pengaman tambahan. Panel toolbar/modal belum seluruhnya
dipisahkan; pengurangan tanggung jawab tahap ini terfokus pada state/filter,
CRUD dan kontrol bersama.

Skenario native kedua membuka AtlasPanel produksi, membuat pin melalui toolbar,
memuat ulang peta dan menghapus pin lewat MarkerSidebar. Karakterisasi yang sama
lulus pada source AtlasPanel/useAtlas baseline 827c36b dan setelah ekstraksi;
source dipulihkan setelah probe. Verifikasi F28.5: typecheck umum/strict,
89 berkas/785 tes, build dan 18 browser tests lulus lokal. Coverage tidak diukur ulang.

## Pengaman pemeliharaan F28.6

Typecheck umum, strict bertahap dan maintenance guard adalah tiga pemeriksaan
terpisah yang wajib dijalankan. Cakupan strict kini 19 root/28 source (termasuk
settings/resultParsing), sementara budget AST menjangkau 38 berkas. Guard menjaga
nama ekspor publik AI dan arah static import modul internal; ia tidak menggantikan
tes perilaku atau pemeriksaan tipe. Policy diperbarui melalui review dengan alasan,
bukan regenerasi otomatis untuk meloloskan CI. Lihat
[review akhir F28](reports/audits/2026-11-15-f28-review.md) untuk inventaris, pengecualian,
perbandingan baseline dan batas penutupan.


L05 memperluas cakupan strict ke helper backup/Atlas, termasuk dependensi nyata:
28 root/41 source, dengan 51 file di maintenance policy. Pengaman compile-only
backupAtlas.typecheck.ts ditambahkan tanpa perubahan perilaku runtime. Angka
cakupan tahap F28 di atas merupakan snapshot historis. Daftar modul, escape lama
serta cara verifikasi ada di [laporan L05](reports/audits/2026-11-15-l05-strict.md).
