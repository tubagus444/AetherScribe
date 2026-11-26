/**
 * Konten Panduan (data-driven) — dipisah dari GuidePanel.tsx agar komponen tetap
 * ramping dan konten mudah tumbuh.
 *
 * Menambah fitur baru = tambahkan satu objek ke FEATURES (atau SMALL_FEATURES untuk
 * fitur mikro). Isi:
 *   - what   : ringkasan 1 kalimat (tampil sebagai pembuka saat kartu dibuka)
 *   - steps  : "Cara pakai" langkah demi langkah
 *   - detail : "Detail & catatan" — nuansa, jebakan, kaitan antar-fitur, hal kecil
 *   - tip    : catatan hemat token (opsional)
 *   - view   : mengaktifkan tombol "Buka <panel>"; actionKey untuk fitur berupa modal
 */

import {
  type LucideIcon,
  Book, FileText, Database, LayoutList, Share2, Zap, Cpu, Target, Key,
  Sparkles, Coins, Lightbulb, ReplaceAll, History, CalendarClock, CalendarDays, UserSearch,
  MessagesSquare, Gauge, Cloud, FileDown, Wand2, AtSign, Layers, Radar, Activity,
  BarChart3, ScanSearch, SpellCheck, Hammer, StickyNote, ShieldCheck, Library, Crosshair,
  ClipboardPaste, EyeOff, Waypoints, SlidersHorizontal, ClipboardList, Flame, Users,
  Map as MapIcon,
} from 'lucide-react';
import { ViewMode } from '@/src/types';

export type GroupId = 'write' | 'world' | 'analysis' | 'ai' | 'output';
export type ColorKey =
  | 'indigo' | 'amber' | 'teal' | 'emerald' | 'lime' | 'rose' | 'sky'
  | 'violet' | 'green' | 'purple' | 'fuchsia' | 'yellow' | 'slate' | 'cyan'
  | 'blue' | 'orange';

// Kelas Tailwind harus utuh (tidak boleh dirakit dinamis) agar tidak ter-purge.
export const PALETTE: Record<ColorKey, { icon: string; tint: string }> = {
  indigo:  { icon: 'text-indigo-500',  tint: 'bg-indigo-50 dark:bg-indigo-500/10' },
  amber:   { icon: 'text-amber-500',   tint: 'bg-amber-50 dark:bg-amber-500/10' },
  teal:    { icon: 'text-teal-500',    tint: 'bg-teal-50 dark:bg-teal-500/10' },
  emerald: { icon: 'text-emerald-500', tint: 'bg-emerald-50 dark:bg-emerald-500/10' },
  lime:    { icon: 'text-lime-600',    tint: 'bg-lime-50 dark:bg-lime-500/10' },
  rose:    { icon: 'text-rose-500',    tint: 'bg-rose-50 dark:bg-rose-500/10' },
  sky:     { icon: 'text-sky-500',     tint: 'bg-sky-50 dark:bg-sky-500/10' },
  violet:  { icon: 'text-violet-500',  tint: 'bg-violet-50 dark:bg-violet-500/10' },
  green:   { icon: 'text-green-600',   tint: 'bg-green-50 dark:bg-green-500/10' },
  purple:  { icon: 'text-purple-500',  tint: 'bg-purple-50 dark:bg-purple-500/10' },
  fuchsia: { icon: 'text-fuchsia-500', tint: 'bg-fuchsia-50 dark:bg-fuchsia-500/10' },
  yellow:  { icon: 'text-yellow-500',  tint: 'bg-yellow-50 dark:bg-yellow-500/10' },
  slate:   { icon: 'text-slate-500',   tint: 'bg-slate-100 dark:bg-slate-500/10' },
  cyan:    { icon: 'text-cyan-500',    tint: 'bg-cyan-50 dark:bg-cyan-500/10' },
  blue:    { icon: 'text-blue-500',    tint: 'bg-blue-50 dark:bg-blue-500/10' },
  orange:  { icon: 'text-orange-500',  tint: 'bg-orange-50 dark:bg-orange-500/10' },
};

export interface Feature {
  id: string;
  group: GroupId;
  title: string;
  where: string;          // lokasi/menu tempat fitur diakses
  what: string;           // apa gunanya (ringkas)
  steps: string[];        // cara pakai
  detail?: string[];      // detail & catatan mendalam
  tip?: string;           // tips hemat token (opsional)
  Icon: LucideIcon;
  color: ColorKey;
  view?: ViewMode;        // untuk tombol "Buka <panel>"
  actionKey?: 'replace' | 'export' | 'project'; // fitur berupa modal
  openLabel?: string;
}

export interface SmallFeature {
  title: string;
  where: string;
  desc: string;
}

export const GROUPS: { id: GroupId; title: string; subtitle: string; Icon: LucideIcon; color: string }[] = [
  { id: 'write',    title: 'Menulis & Editor',        subtitle: 'Kanvas utama dan semua alat penyuntingan.',                Icon: FileText,    color: 'bg-indigo-600' },
  { id: 'world',    title: 'Dunia, Lore & Codex',     subtitle: 'Bangun kanon cerita: karakter, tempat, aturan.',           Icon: Database,    color: 'bg-emerald-600' },
  { id: 'analysis', title: 'Analisis & Konsistensi',  subtitle: 'Deteksi plot hole & analitik naskah — sebagian nol token.', Icon: ShieldCheck, color: 'bg-green-600' },
  { id: 'ai',       title: 'AI & Asisten',            subtitle: 'Partner kreatif, otomasi, dan pengaturan kecerdasan.',     Icon: Wand2,       color: 'bg-purple-600' },
  { id: 'output',   title: 'Progres, Data & Ekspor',  subtitle: 'Lacak target, cadangkan, dan terbitkan.',                  Icon: FileDown,    color: 'bg-orange-600' },
];

export const FEATURES: Feature[] = [
  // ── MENULIS & EDITOR ───────────────────────────────────────────────────────
  {
    id: 'editor', group: 'write', Icon: FileText, color: 'indigo', view: 'write',
    title: 'Editor & Magic Edit (Tanya AI)',
    where: 'Menu: Editor',
    what: 'Kanvas rich-text bebas distraksi. Menyorot teks memunculkan menu mengambang yang jadi pusat semua aksi: AI, konsistensi, dan catatan.',
    steps: [
      'Sorot teks (minimal 5 karakter) → muncul menu mengambang berbentuk pil.',
      'Klik "Tanya AI" untuk membuka Asisten Editor: ketik instruksi bebas di kotak (mis. "buat lebih puitis"), atau pilih aksi cepat bawaan.',
      'Tiga aksi bawaan: "Show, don\'t tell" (ubah kalimat pasif jadi aksi), "Senses" (perkaya deskripsi indra), "Intensify" (tingkatkan ketegangan).',
      'Setelah AI memproses, muncul pratinjau "Naskah Asli" vs "Hasil Tenunan". Pilih: "Ganti Teks" (timpa), "Sisipkan di Bawah" (tambah di bawah), atau "Abaikan".',
    ],
    detail: [
      'Selain "Tanya AI", pil menu mengambang juga memuat tombol "Cek Konsistensi" (ungu) dan "Catatan" (amber) — lihat fitur terpisahnya di bawah.',
      'Snippet AI kustom Anda muncul di menu AI pada bagian "Kustom (Personal)", di bawah aksi bawaan.',
      'Bila beberapa kunci provider aktif, ada pemilih provider mini (huruf awal tiap provider) di kanan atas menu AI — kirim aksi ini ke provider tertentu tanpa mengubah setelan global.',
      'Ikon pin (Dock) menyematkan menu di bawah layar agar tak menutupi teks yang sedang Anda baca; posisi ini diingat.',
      'Footer editor menampilkan jumlah kata, karakter, perkiraan waktu baca (~200 kata/menit), dan status simpan (Menyimpan…/Tersimpan).',
    ],
    tip: 'Magic Edit hanya memproses teks yang disorot — sorot seperlunya untuk menghemat token. Instruksi eksplisit ("dalam 50 kata") menekan panjang output.',
  },
  {
    id: 'mentions', group: 'write', Icon: AtSign, color: 'amber', view: 'write',
    title: 'Mentions (@) & Sorotan Codex',
    where: 'Di dalam Editor',
    what: 'Cara tercepat mengarahkan perhatian AI ke karakter/lore tertentu tanpa keluar dari layar ketik.',
    steps: [
      'Ketik @ di editor → daftar muncul; pilih karakter, entri Codex, atau bab.',
      'Kata yang cocok dengan nama/alias Codex otomatis bergaris-titik saat Anda mengetik.',
      'Arahkan mouse ke kata bergaris-titik untuk membaca biografinya (tooltip) tanpa membuka menu apa pun.',
    ],
    detail: [
      'Perbedaan penting: sorotan garis-titik itu deterministik (pencocokan nama, gratis). @mention lebih kuat — memaksa AI membaca SELURUH profil entitas itu saat aksi berikutnya.',
      'Karena itu, saat menyuruh AI menulis/mengubah dialog tokoh yang di-@mention, ia sudah tahu kepribadian, gaya bahasa, dan relasinya.',
      'Agar semua variasi nama terdeteksi (mis. "Budi", "Bos Budi", "si Bos"), daftarkan Alias di entri Codex-nya.',
    ],
    tip: '@mention adalah cara paling terfokus menyuntik konteks: AI hanya membaca profil yang Anda tunjuk, bukan seluruh dunia — hemat token sekaligus akurat.',
  },
  {
    id: 'revision-notes', group: 'write', Icon: StickyNote, color: 'amber', view: 'write',
    title: 'Catatan Revisi (margin notes)',
    where: 'Editor: tombol "Catatan" di menu seleksi → panel "Catatan Revisi"',
    what: 'Tempel catatan pada bagian teks tertentu ("perbaiki tempo di sini", "cek nama") tanpa mengotori naskah. Cocok untuk pass revisi.',
    steps: [
      'Sorot teks → klik "Catatan" (ikon nota kuning) di menu mengambang. Bagian teks itu ditandai.',
      'Panel "Catatan Revisi" terbuka dengan editor catatan; tulis isinya, simpan dengan tombol Simpan atau Ctrl+Enter.',
      'Klik kutipan sebuah catatan untuk melompat & menyorot teksnya di editor.',
      'Tandai selesai (ikon centang ganda) — catatan jadi tercoret & redup; hitungan "N terbuka" di header berkurang.',
    ],
    detail: [
      'Catatan menempel pada teks (bukan posisi tetap), jadi tetap benar walau Anda menyunting bagian lain.',
      'Setiap catatan bisa diedit ulang, ditandai selesai/belum, atau dihapus dari panel.',
      'Berbeda dari Snapshots (menyimpan versi) — Catatan Revisi hanya penanda tugas untuk diri sendiri, tidak mengubah isi bab.',
    ],
  },
  {
    id: 'inline-consistency', group: 'write', Icon: SpellCheck, color: 'violet', view: 'write',
    title: 'Konsistensi Inline (garis bawah)',
    where: 'Di dalam Editor',
    what: 'Menandai potensi kontradiksi & salah-eja langsung di bawah teks. Merah menandai kandidat salah eja nama, teal menandai glosarium, dan ungu menandai kutipan dari pemeriksaan AI.',
    steps: [
      'Garis bawah MERAH putus-putus = Buku Gaya: kata berhuruf kapital yang MIRIP tapi tak persis nama/alias Codex (kandidat salah-eja). Deterministik & nol token; arahkan mouse untuk melihat saran ejaan yang benar.',
      'Garis bawah UNGU = temuan AI. Pemicu utama: sorot teks → tombol "Cek Konsistensi" di menu mengambang (on-demand, pakai token).',
      'Arahkan mouse ke garis bawah untuk membaca penjelasan temuannya.',
    ],
    detail: [
      'Buku Gaya (garis merah) bisa dimatikan lewat menu "Tampilan" di editor → "Periksa Ejaan Nama" (default menyala; sepenuhnya gratis token).',
      'Mode otomatis-saat-idle untuk lapisan AI (memeriksa paragraf sendiri saat Anda berhenti mengetik) TERSEDIA tapi default MATI. Nyalakan di Pengaturan (toggle "ai_inline_consistency") hanya bila Anda siap dengan konsumsi token pasif.',
      'Hasil AI di-cache per-paragraf dan tidak diperiksa ulang selama teksnya tak berubah — jadi mengulang buka bab tidak membakar token lagi.',
      'Cache ungu juga bertahan setelah refresh halaman (disimpan lokal), sehingga garis bawah muncul lagi tanpa memanggil AI ulang.',
    ],
    tip: 'Biarkan mode otomatis mati; jalankan "Cek Konsistensi" hanya pada paragraf yang Anda ragukan. Itu memberi kendali penuh atas token.',
  },
  {
    id: 'replace', group: 'write', Icon: ReplaceAll, color: 'sky', actionKey: 'replace', openLabel: 'Buka Ganti Global',
    title: 'Cari & Ganti Seluruh Naskah',
    where: 'Ikon ⇄ di bilah atas (Header)',
    what: 'Ganti sebuah kata/nama di SEMUA bab sekaligus — bukan hanya bab yang sedang dibuka.',
    steps: [
      'Klik ikon ⇄ di header → ketik kata yang dicari dan penggantinya. Modal menampilkan jumlah kecocokan per bab beserta cuplikan konteks.',
      'Aktifkan "Aa" (case-sensitive) atau ".*" (regex) bila perlu. Mode regex mendukung backref seperti $1.',
      'Klik "Ganti Semua" untuk seluruh bab, atau tombol "Ganti" per bab untuk kendali lebih halus. Klik judul bab untuk melompat ke sana.',
    ],
    detail: [
      'Aman terhadap data-loss: bab yang sedang Anda buka disimpan lebih dulu, penggantian dilakukan, lalu bab dimuat ulang — tidak ada perubahan editor yang hilang.',
      'Berbeda dari Cari & Ganti dalam-bab (Ctrl+H di footer editor) yang hanya menyentuh bab aktif. Yang ini lintas-bab.',
      'Ideal untuk mengganti nama tokoh/tempat setelah revisi worldbuilding. Setelahnya, perbarui juga entri Codex terkait.',
    ],
  },
  {
    id: 'search-scene', group: 'write', Icon: ScanSearch, color: 'cyan', view: 'search',
    title: 'Cari Adegan (pencarian semantik)',
    where: 'Menu: Cari Adegan',
    what: 'Temukan adegan berdasarkan MAKNA, bukan kata persis — mis. "protagonis merasa dikhianati" walau kata itu tak muncul. Nol token.',
    steps: [
      'Kali pertama: klik "Bangun indeks". Aplikasi meng-embed adegan naskah secara lokal (progress bar muncul; tanpa token AI).',
      'Ketik deskripsi adegan/momen yang Anda ingat, tekan Enter.',
      'Hasil diurutkan dengan skor "% cocok"; klik sebuah kartu untuk melompat ke bab & menyorot posisinya di editor.',
      'Setelah menulis lagi, klik "Perbarui indeks" — hanya bab yang berubah yang di-embed ulang (cepat).',
    ],
    detail: [
      'Memakai model embedding lokal (Xenova/all-MiniLM-L6-v2) di dalam browser — data tak keluar perangkat dan tidak ada biaya token.',
      'Indeks disimpan di IndexedDB, jadi bertahan antar sesi; cukup "Perbarui" secara berkala, tak perlu bangun ulang dari nol.',
      'Berbeda dari Cari & Ganti (mencari kata literal). Cari Adegan memahami maksud — berguna saat Anda ingat "apa yang terjadi" tapi lupa kata persisnya.',
    ],
    tip: 'Sepenuhnya lokal & gratis token — pakai sebebasnya. Kualitas hasil ikut membaik setelah indeks diperbarui.',
  },
  {
    id: 'snapshots', group: 'write', Icon: History, color: 'teal', view: 'write',
    title: 'Snapshots (Riwayat Versi)',
    where: 'Panel kanan Editor',
    what: 'Mesin waktu per bab. Penyelamat saat sebuah revisi besar ternyata salah arah dan Anda ingin kembali.',
    steps: [
      'Buka panel "Riwayat Versi" dari sisi kanan editor.',
      'Sebelum perombakan besar, isi "Nama snapshot…" (mis. "Sebelum ubah ending") lalu klik ikon kamera untuk mengabadikan kondisi bab.',
      'Pada tiap snapshot: klik "Bandingkan" untuk melihat diff terhadap naskah sekarang, atau "Pulihkan" untuk mengembalikan isinya.',
    ],
    detail: [
      'Snapshot berlabel "Otomatis" (amber) dibuat sistem sebelum aksi destruktif — mis. tepat sebelum sebuah pemulihan — jadi pemulihan pun bisa dibatalkan.',
      'Pulihkan meminta konfirmasi dan membuat snapshot otomatis dari naskah sekarang lebih dulu, sehingga tidak ada versi yang benar-benar hilang.',
      'Snapshot manual bertahan sampai Anda hapus; snapshot per bab, bukan per proyek.',
    ],
  },

  // ── DUNIA, LORE & CODEX ────────────────────────────────────────────────────
  {
    id: 'codex', group: 'world', Icon: Database, color: 'emerald', view: 'codex',
    title: 'Kamus Data / Codex',
    where: 'Menu: Kamus Data',
    what: 'Ensiklopedia dunia Anda (karakter, lokasi, item, dll) — memori jangka panjang proyek yang otomatis jadi konteks AI.',
    steps: [
      'Buat entri per kategori. Ada 6 kategori bawaan, plus kategori kustom buatan Anda (mis. "Faksi", "Ras") lengkap dengan ikon & warna lewat pengelola kategori.',
      'Isi deskripsi; tambahkan Alias (variasi nama) agar semua bentuk terdeteksi di naskah dan oleh AI.',
      'Gunakan "Lengkapi via AI" untuk memperkaya deskripsi sebuah entri, atau buka Lokakarya untuk membangunnya lewat diskusi.',
    ],
    detail: [
      'Setiap entri otomatis dikenali di naskah (sorotan garis-titik) dan menjadi bahan konteks di semua jalur AI (Magic Edit, Studio, Konsistensi).',
      'Menghapus kategori kustom mengalihkan entri terkait ke kategori "other", bukan menghapusnya.',
      'Enrichment AI bawaan hanya memakai 6 kategori inti; kategori kustom bersifat manual (Anda yang mengisi).',
    ],
    tip: 'Selesaikan editing Codex/Bible dulu sebelum sesi menulis — mengedit lore membatalkan cache prompt sehingga panggilan AI berikutnya jadi lebih mahal.',
  },
  {
    id: 'codex-fields', group: 'world', Icon: SlidersHorizontal, color: 'indigo', view: 'codex', openLabel: 'Buka Kamus Data',
    title: 'Template field per kategori (bestiari, herbologi, dll)',
    where: 'Kamus Data → pengelola "Kategori" → ikon sliders pada kategori kustom',
    what: 'Beri kategori kustom field terstruktur khas (mis. Bestiari: Habitat, Kelemahan Fatal, Level Ancaman) — satu mekanisme menggantikan banyak "modul" terpisah.',
    steps: [
      'Buka "Kategori" → buat/pilih kategori kustom (mis. "Bestiari") → klik ikon sliders untuk mengelola field.',
      'Tambahkan field: beri nama, pilih tipe (teks singkat / teks panjang / angka / pilihan). Untuk "pilihan", isi opsinya (pisahkan koma).',
      'Buat/ubah entri berkategori itu → seksi "Detail {kategori}" muncul otomatis dengan field tadi untuk diisi.',
    ],
    detail: [
      'Nilai field tampil ringkas di kartu (≤2 field kunci) dan lengkap di detail entri.',
      'Nilai IKUT ke AI (Cek Konsistensi bisa menangkap kontradiksi anatomi/kelemahan) dan ke ekspor Markdown Codex.',
      'Hanya kategori kustom yang bisa punya field; 6 kategori bawaan tetap polos. Menghapus field tak menghapus nilai lama di entri (tersembunyi hingga entri disimpan ulang).',
    ],
    tip: 'Deterministik & nol token: satu fitur ini menggantikan modul bestiari/herbologi/artefak/quest terpisah — cukup buat kategori + field-nya.',
  },
  {
    id: 'codex-secret', group: 'world', Icon: EyeOff, color: 'purple', view: 'codex', openLabel: 'Buka Kamus Data',
    title: 'Kebenaran Tersembunyi (kanon vs rahasia penulis)',
    where: 'Form entri Codex: kotak ungu "Rahasia penulis"',
    what: 'Simpan yang BENAR-BENAR terjadi terpisah dari yang diketahui pembaca — untuk mystery-box & dramatic irony, tanpa bocor ke naskah.',
    steps: [
      'Centang "Rahasia penulis" agar SELURUH entri disembunyikan dari pembaca (mystery-box: entitas yang keberadaannya sendiri masih rahasia).',
      'Atau isi "Kebenaran tersembunyi" pada entri yang tetap publik — pola "Dunia percaya… / Yang sebenarnya…" (mis. raja yang tampak bijak, sebenarnya dalang kudeta).',
      'Entri rahasia bertanda ikon mata-tercoret di kartu & detailnya.',
    ],
    detail: [
      'Yang disembunyikan TIDAK muncul di sorotan editor, saran @-mention, maupun ekspor Codex.',
      'Tetapi TETAP diberikan ke AI: Cek Konsistensi bisa menangkap bila prosa keceplosan membocorkan atau bertentangan dengan rahasia sebelum saatnya reveal.',
      'Penanda "reveal di bab N" + deteksi kebocoran otomatis direncanakan menyusul (fase 2).',
    ],
    tip: 'Nol biaya tambahan: rahasia menumpang knowledge base yang sudah dikirim ke AI. Gunakan untuk menjaga twist tetap konsisten sepanjang novel panjang.',
  },
  {
    id: 'codex-bridge', group: 'world', Icon: ClipboardPaste, color: 'teal', view: 'codex', openLabel: 'Buka Kamus Data',
    title: 'Impor/Ekspor Codex (jembatan teks ⇄ Markdown)',
    where: 'Kamus Data: tombol "Tempel teks" (form Entri Baru) & "Ekspor" (header)',
    what: 'Isi entri Codex dengan menempel teks lore terstruktur, dan ekspor seluruh Codex ke berkas Markdown. Deterministik & nol token.',
    steps: [
      'Tempel-cepat: klik "Entri Baru" → tombol "Tempel teks" → tempelkan satu blok (heading + isi, mis. "#### Ironhaven — Kota Dermaga" lalu deskripsinya) → "Isi form dari teks".',
      'Form terisi otomatis: heading jadi Nama; sufiks "— X" atau "(X)" jadi Alias; sisanya jadi Deskripsi. Tinjau, betulkan kategori bila perlu, lalu Simpan.',
      'Ekspor: di header Kamus Data klik "Ekspor" → mengunduh berkas .md berisi semua entri, dikelompokkan per kategori & diurutkan A–Z (lengkap alias/tag).',
    ],
    detail: [
      'Tempel-teks hanya muncul saat membuat entri BARU (bukan mengedit). Bila teks berisi beberapa blok/heading, hanya blok pertama yang dipakai — pola "satu entitas per tempel".',
      'Ekspor bersifat SATU ARAH (Codex → Markdown): untuk cadangan yang terbaca, versioning git, cetak/berbagi, atau menyunting lore di editor luar. Tidak ada sinkronisasi balik otomatis.',
      'Untuk memasukkan BANYAK entri sekaligus dari berkas lore lama, gunakan jalur "Impor Novel" (Pengaturan → Backup) memakai berkas ekspor per-novel — masuk sebagai proyek baru, non-destruktif.',
    ],
    tip: 'Seluruhnya lokal & nol token. Tempel-teks memangkas entri manual; ekspor rutin memberi cadangan lore yang enak dibaca & mudah di-diff.',
  },
  {
    id: 'name-forge', group: 'world', Icon: Wand2, color: 'indigo', view: 'codex', openLabel: 'Buka Kamus Data',
    title: 'Bengkel Nama (generator & glos)',
    where: 'Detail entri Codex → ikon dadu',
    what: 'Hasilkan nama NPC/tempat yang konsisten dengan "palet bunyi" sebuah faksi/ras, dan uraikan makna nama majemuk. Deterministik & nol token.',
    steps: [
      'Buka sebuah entri (mis. sebuah ras/faksi) → klik ikon dadu untuk membuka Bengkel Nama.',
      'Langkah 1 — pilih satu preset ("Mengalir" untuk nama halus, "Keras" untuk nama kasar, "Majemuk" untuk nama bermakna). Ini sudah cukup; tak perlu menyentuh kolom lain.',
      'Langkah 3 — klik "Fonetik" untuk nama dari bunyi (atau "Majemuk" bila preset punya leksikon morfem). Klik sebuah nama untuk menyalin, atau tombol "+ alias" agar nama itu langsung jadi alias entri ini.',
      'Ingin menyetel sendiri? Buka "2 · Atur bunyi (lanjutan)" untuk mengubah bunyi awal/vokal/akhir & pola suku kata. Kotak "Urai" menguraikan sebuah nama lama ke akar-akarnya.',
    ],
    detail: [
      'Alur ringkas: (1) pilih preset → (3) klik Fonetik → salin atau "+ alias". Bagian "lanjutan" (langkah 2) opsional — hanya bila ingin meracik bunyi sendiri.',
      'Istilah bunyi: "bunyi awal" (onset) = konsonan pembuka, "vokal" (nukleus) = inti suku kata, "bunyi akhir" (coda) = konsonan penutup. Pola "CVC" berarti konsonan-vokal-konsonan (mis. "kan").',
      'Nama Majemuk butuh "leksikon morfem" (daftar "akar = makna"). Merangkai dua akar jadi nama bermakna, mis. batu+laut → "Kelmar".',
      'Palet tersimpan pada entri itu (field namePalette) dan ikut backup/impor — tidak dikirim ke AI. Tombol "+ alias" langsung menulis ke daftar alias entri (dipakai untuk pelacakan konteks/kontinuitas).',
    ],
    tip: 'Cukup pilih preset lalu klik Fonetik — abaikan kolom lanjutan sampai perlu. Nama yang sreg? Klik "+ alias" agar langsung tercatat, tak sekadar tersalin. "Urai" berguna mengecek makna nama lama.',
  },
  {
    id: 'glossary', group: 'world', Icon: Library, color: 'teal', view: 'glossary', openLabel: 'Buka Glosarium',
    title: 'Glosarium istilah in-world',
    where: 'Menu: Glosarium (grup Dunia & Lore)',
    what: 'Jaga konsistensi ejaan istilah NON-nama (satuan, kalender, pangkat, idiom) — generalisasi "Buku Gaya" di luar nama Codex. Deterministik & nol token.',
    steps: [
      'Tambahkan istilah baku (mis. "liga", "Bulan Sabit") beserta definisi & kategori opsional.',
      'Isi "Varian ejaan salah" (mis. "leage, liege") — ejaan keliru yang ingin Anda tangkap.',
      'Di editor, istilah tak baku digarisbawahi teal putus-putus dengan saran ejaan baku (arahkan mouse).',
    ],
    detail: [
      'Dua jenis temuan: varian yang Anda deklarasikan (presisi mutlak) + kandidat salah-eja mirip istilah baku (dibatasi ke kata berkapital agar tak salah-tanda).',
      'Underline teal berbeda dari merah "Periksa Ejaan Nama" (yang khusus nama Codex). Toggle terpisah "Periksa Glosarium" di menu Tampilan.',
    ],
    tip: 'Sepenuhnya lokal & gratis token. Untuk istilah huruf-kecil (satuan/pangkat), andalkan daftar "Varian" karena deteksi mirip hanya untuk kata berkapital.',
  },
  {
    id: 'workshop', group: 'world', Icon: Hammer, color: 'purple', view: 'codex', openLabel: 'Buka Kamus Data',
    title: 'Lokakarya Codex (buat/edit via diskusi AI)',
    where: 'Tombol "Lokakarya" (header Codex) / "Diskusikan" (detail entri)',
    what: 'Bangun atau rombak entri Codex lewat percakapan. Panel dua kolom: kiri chat, kanan draf field terstruktur yang terisi otomatis.',
    steps: [
      'Buat baru: tombol "Lokakarya" di header Kamus Data. Edit: buka sebuah entri → "Diskusikan".',
      'Berdiskusi dengan AI; saat AI mengusulkan data, draf field di kanan terisi otomatis (live-fill).',
      'Bila AI tak mengisi draf, klik "Tarik dari diskusi" untuk memanennya manual.',
      'Simpan sendiri saat draf siap — di mode edit, muncul diff per-field (before/after) untuk Anda konfirmasi.',
    ],
    detail: [
      'Dua tombol audit: "Audit" membandingkan entri dengan data dunia terstruktur (Codex + Bible + relasi); "Mendalam" membandingkannya dengan cuplikan prosa bab tempat entitas itu benar-benar muncul.',
      'Sesi diskusi dipersist per-target (resume walau Anda pindah panel) dan dibuang otomatis saat entri tersimpan.',
      'AI tidak pernah menulis ke database sendiri — Anda selalu pemegang keputusan simpan. Riwayat Lokakarya terpisah dari Studio Asisten.',
    ],
  },
  {
    id: 'orphans', group: 'world', Icon: UserSearch, color: 'lime', view: 'orphans',
    title: 'Saran Entitas',
    where: 'Menu: Saran Entitas',
    what: 'Menemukan nama-diri yang sering muncul di naskah tapi belum tercatat di Codex — agar tak ada tokoh/tempat terlewat.',
    steps: [
      'Buka Saran Entitas untuk melihat kandidat: nama berhuruf kapital yang berulang namun belum punya entri Codex, beserta frekuensinya.',
      'Tambahkan kandidat relevan ke Codex sekali klik; AI dapat membantu mengisi deskripsi awalnya.',
    ],
    detail: [
      'Ini kebalikan dari pencocokan biasa: alih-alih menyorot yang sudah ada di Codex, ia mencari yang BELUM ada.',
      'Berjalan deterministik & lokal (nol token); enrichment deskripsi barulah opsional memakai AI.',
    ],
  },
  {
    id: 'completeness', group: 'world', Icon: ClipboardList, color: 'indigo', view: 'completeness', openLabel: 'Buka Kelengkapan Dunia',
    title: 'Kelengkapan Dunia (status & TODO lore)',
    where: 'Menu: Dunia & Lore → Kelengkapan Dunia',
    what: 'Peta seberapa matang tiap bagian worldbuilding Anda: status kematangan per entri (Solid/Parsial/Rangka) plus daftar pekerjaan (TODO) yang tersisa.',
    steps: [
      'Di form entri Codex, tetapkan Status kelengkapan (atau biarkan "Otomatis" — alat menyarankan dari kepadatan isi) dan tuliskan catatan/TODO (satu baris per item).',
      'Buka Kelengkapan Dunia untuk melihat rekap: persentase solid, rincian per kategori, daftar entri "Masih Rangka", dan semua TODO tersisa.',
      'Klik entri atau item TODO untuk langsung melompat ke detailnya di Kamus Data dan menggarapnya.',
    ],
    detail: [
      'Filosofi "penulis mendeklarasikan, alat membukukan": status yang Anda set menang; bila kosong, badge menampilkan saran (bertanda "?") tanpa mengubah data.',
      'Deterministik & nol token — murni metadata alur kerja. Status/TODO TIDAK diberikan ke AI maupun ekspor manuskrip.',
      'Berguna untuk melihat bagian dunia mana yang masih kerangka dan perlu diprioritaskan sebelum menulis jauh.',
    ],
    tip: 'Nol token: hanya menghitung & meringkas data yang sudah ada.',
  },
  {
    id: 'relationships', group: 'world', Icon: Share2, color: 'rose', view: 'relationships',
    title: 'Relasi Karakter (Peta Hubungan)',
    where: 'Menu: Relasi Karakter',
    what: 'Panel untuk mencatat & mengelola ikatan dan konflik antar entitas Codex. Relasi dibaca AI secara pasif saat menulis dialog agar sentimen antar tokoh terjaga.',
    steps: [
      'Pilih karakter di daftar kiri (terurut otomatis per jumlah koneksi; centang "Hanya yang terhubung" untuk menyaring) — hubungannya tampil di panel kanan.',
      'Tekan "Koneksi Baru" untuk menautkan ke entitas lain, pilih jenis hubungan (Teman, Musuh, Keluarga, Kekasih, Sekutu, Tinggal di, Memiliki, Lainnya), lalu isi deskripsi opsional.',
      'Saat AI menulis percakapan antar keduanya, ia otomatis tahu sentimen mereka tanpa Anda ingatkan.',
    ],
    detail: [
      'Label hubungan sadar-arah: mis. "Memiliki" dari sisi sumber tampil "Dimiliki oleh" dari sisi target.',
      'Diagram ikatan muncul saat sebuah karakter punya ≥2 koneksi; untuk satu koneksi cukup kartunya.',
      'Relasi ikut menjadi bahan Cek Konsistensi & Peta Kontinuitas (mis. mendeteksi relasi yang dua tokohnya tak pernah bertemu di naskah).',
    ],
  },
  {
    id: 'factions', group: 'world', Icon: Users, color: 'indigo', view: 'factions',
    title: 'Faksi & Kelompok',
    where: 'Menu: Faksi & Kelompok',
    what: 'Mengelompokkan entitas jadi faksi (kerajaan/ordo/kubu) lalu menampilkan politik antar-kelompok. Nol token, deterministik — menumpang tag & relasi yang sudah ada.',
    steps: [
      'Buka sebuah entri Codex (mis. "Kerajaan Merah"), aktifkan "Jadikan Faksi / Kelompok", lalu tentukan tag keanggotaan (default = nama entri).',
      'Beri tag keanggotaan yang sama pada entri anggotanya (karakter/tempat), atau pakai "Tambah anggota" di panel ini.',
      'Panel menampilkan anggota tiap faksi + hubungan antar-faksi: status yang KAMU deklarasikan berdampingan dengan potret relasi antar-anggota.',
    ],
    detail: [
      'Dua sinyal disajikan netral tanpa penghakiman: "Deklarasi" (kebenaran penulis, mis. Sekutu) + "Antar-anggota" (potret relasi anggota, mis. 3× Musuh). Sekutu yang anggotanya bermusuhan itu SAH — bukan error.',
      'Catatan "kenapa bersekutu/bermusuhan" ditulis di kolom catatan tiap deklarasi (tersimpan sebagai deskripsi relasi antar entri faksi).',
      'Faksi = entri Codex ber-tag keanggotaan; menandai/mengedit di sini juga memperbarui data Relasi & Codex yang sama.',
      'Mode Kanvas (toggle Daftar/Kanvas di kanan atas): tata kartu faksi seperti papan politik — seret untuk memindah (posisi tersimpan), tarik titik ○ di tepi kartu untuk menghubungkan dua faksi, klik kartu untuk detail (drawer kanan). Garis diwarnai per tipe relasi (tegas = dideklarasikan, putus-putus = potret turunan). Tombol Snap merapikan ke grid; "Susun rapi" menata ulang otomatis.',
    ],
  },
  {
    id: 'lore-graph', group: 'world', Icon: Waypoints, color: 'amber', view: 'codex', openLabel: 'Buka Kamus Data',
    title: 'Integritas Graf Lore (backlink & tautan menggantung)',
    where: 'Kamus Data (Codex): detail entri + banner di atas daftar',
    what: 'Menjaga tautan antar-entri Codex tetap utuh: menampilkan "siapa yang menyebut entri ini" (backlink) dan menandai relasi/janji plot yang menunjuk entri yang sudah dihapus.',
    steps: [
      'Buka sebuah entri — bagian "Disebut oleh" mendaftar entri lain yang menyebut namanya di deskripsi, plus janji plot yang dibayar entri ini. Klik untuk melompat ke entri sumber.',
      'Bila ada referensi menggantung, banner amber muncul di atas daftar Codex — buka untuk meninjau.',
      'Tekan "Hapus" (relasi yatim) atau "Lepas" (tautan janji yatim) untuk membersihkan referensi yang menunjuk entri yang sudah tiada.',
    ],
    detail: [
      'Melengkapi sorotan MAJU di deskripsi (nama entri lain otomatis jadi tautan) dengan arah SEBALIKNYA — backlink yang selama ini tak terlihat dari sisi entri yang ditunjuk.',
      'Menghapus entri otomatis membersihkan relasinya; banner menangkap sisa yatim dari data lama atau tautan janji plot (yang tak ikut terhapus saat entri dihapus).',
      'Menyoal konsistensi lore ITU SENDIRI (bukan prosa) — itu sebabnya ia tinggal di Codex, bukan di Peta Kontinuitas.',
    ],
    tip: 'Deterministik & nol token — satu pemindaian nama+alias tanpa AI; aman dijalankan kapan saja.',
  },
  {
    id: 'atlas', group: 'world', Icon: MapIcon, color: 'cyan', view: 'atlas',
    title: 'Atlas Dunia (peta interaktif & bertingkat)',
    where: 'Menu: Atlas Dunia',
    what: 'Kanvas peta multilayer offline: unggah gambar peta, tandai lokasi/wilayah/rute, kalibrasi skala nyata, hitung waktu tempuh rute, bangun hierarki sub-peta bertingkat, dan lacak kontinuitas kehadiran adegan. Sepenuhnya lokal, nol token.',
    steps: [
      'Unggah gambar peta (PNG/JPG/WEBP/GIF, maks 5 MB — otomatis dioptimalkan). Anda bisa memiliki banyak peta per proyek (dunia, benua, kota, denah kastil).',
      'Tandai fitur geografis dengan alat "Pin", "Area", atau "Rute". Untuk rute, pilih Lurus atau Melengkung, lalu klik titik-titik di peta. Hapus titik terakhir dengan tombol atau Backspace. Dobel-klik atau Enter untuk menyimpan, Esc untuk mengosongkan draf.',
      'Kalibrasi Skala (tombol "Skala"): tarik garis sepanjang mistar skala grafis di peta, lalu masukkan jarak nyata (mis. 100 km). Rute otomatis menampilkan jarak riil dan waktu tempuh berdasarkan metode perjalanan (Jalan Kaki, Kuda, Kapal, dll di tombol "Kecepatan").',
      'Katalog Wilayah & Direktori Semesta: Sidebar kanan otomatis menampilkan katalog seluruh wilayah (tab "Peta Ini" dan "Semua Peta"). Dilengkapi pencarian instan, filter jenis (Area/Pin/Rute), filter Yatim, dan tombol kembali "← Daftar Wilayah".',
      'Peta Bertingkat (Sub-Maps): pilih Pin atau Area → tautkan ke sub-peta di sidebar lewat Kartu Pratinjau Sub-Peta. Penanda portal berpendar terang di kanvas; dobel-klik penanda untuk langsung menjelajahi sub-peta.',
      'Navigasi Cepat & Pohon Peta: gunakan bilah remah roti (breadcrumbs) di atas atau tombol melayang "← Kembali ke [Peta Induk]" di kanvas. Klik tombol "Pohon" di toolbar untuk melihat pohon hierarki seluruh peta dunia novel Anda.',
      'Analitik Kontinuitas: aktifkan tombol "Yatim" (deteksi lokasi yang belum pernah dikunjungi di naskah), "Linimasa" (slider bab untuk meredupkan penanda bab masa depan), "Heatmap" (konsentrasi aktivitas adegan), dan "Kabut" (menyamarkan rahasia penulis).',
    ],
    detail: [
      'Katalog Wilayah Terpadu: Sidebar kanan dual-mode menampilkan daftar wilayah terindeks saat tidak ada penanda dipilih. Tab "Semua Peta" mengelompokkan wilayah per peta novel dengan teleportasi 1-klik (otomatis berganti peta dan meluncurkan kamera langsung ke wilayah target). Anda juga bisa menutup sidebar dengan tombol "Wilayah" di toolbar untuk memaksimalkan kanvas.',
      'Peta Bertingkat & Memori Spasial: Penanda portal memiliki cincin pendar pulsa (pin) atau badge interaktif di pusat poligon (area). Saat kembali ke peta induk lewat breadcrumbs atau tombol melayang kanvas, aplikasi mengingat penanda asal dan secara halus memusatkan kamera kembali ke titik tersebut.',
      'Pohon Hierarki Peta: Tombol "Pohon" membuka direktori visual pohon relasi (Peta Dunia → Benua → Kota), status peta aktif, pencarian instan, dan daftar peta mandiri yang belum tertaut.',
      'Deep-Link Balik dari Codex: Entri Codex lokasi/faksi/tokoh yang ditandai di peta memiliki tombol ikon MapPin ("Lihat di Peta"). Sekali klik langsung berpindah ke peta yang tepat, memusatkan kamera, dan membuka panel detailnya.',
      'Wilayah Yatim (Orphan Markers): Mengidentifikasi lokasi yang belum memiliki entri Codex atau belum pernah menjadi latar adegan di bab mana pun (mengecek nama & sebutan region); lokasi aktif diredupkan (ghosting) agar yang belum ditulis terlihat jelas.',
      'Estimasi Jarak & Waktu Tempuh: Jarak rute dihitung secara matematis berdasarkan kalibrasi piksel. Tombol "Kecepatan" memungkinkan Anda membuat profil transportasi kustom (mis. Naga Terbang: 150 km/hari, Gerobak: 20 km/hari).',
      'Mode Kabut Rahasia: Penanda yang menaut entri berkategori "Rahasia Penulis" (hidden: true) otomatis disamarkan namanya menjadi "??? (Lokasi Rahasia)" dengan pendar ungu kabut (FOG_HEX) dan sensor deskripsi ramah spoiler.',
      'Heatmap Kehadiran: Memvisualisasikan frekuensi dan bobot sebutan adegan per wilayah secara native di atas kanvas Leaflet tanpa dependensi luar.',
      'Penyuntingan Geometri: Pilih penanda → "Ubah posisi/bentuk": seret titik untuk memindah, klik titik-tengah untuk menambah lekukan, klik-kanan titik untuk menghapus.',
    ],
    tip: 'Seluruh komputasi analitik (skala, jarak, pohon hierarki sub-peta, wilayah yatim, linimasa bab, heatmap) berjalan 100% lokal & gratis token. Gambar peta disimpan lokal di IndexedDB dan disertakan dalam Ekspor Cadangan Novel penuh.',
  },
  {
    id: 'worldcalendar', group: 'world', Icon: CalendarDays, color: 'violet', view: 'worldcalendar', openLabel: 'Buka Kalender Dunia',
    title: 'Kalender Dunia (era, festival, usia tokoh, kalkulator & audit)',
    where: 'Menu: Dunia & Lore → Kalender Dunia',
    what: 'Rancang penanggalan in-world (bulan, minggu, musim, era, festival tahunan), nikmati layout 2-kolom lapang & heatmap tahunan, pantau usia karakter dinamis, hitung estimasi jarak/waktu tempuh perjalanan, serta audit urutan kronologi secara otomatis.',
    steps: [
      'Buka panel — bila belum ada kalender, pilih preset ("Seperti Masehi" / "Fantasi 8-bulan") atau klik "Atur Kalender" untuk menyusun sendiri.',
      'Lewat Editor Kalender, tentukan nama & jumlah hari tiap bulan, nama hari dalam seminggu, musim (rentang bulan & warna), era berurutan, dan Hari Libur/Festival Tahunan (tanggal, nama, warna & tradisi).',
      'Pilih mode tampilan: "Bulan" untuk grid bulanan yang lapang dan bernapas lega, atau "Tahun (Heatmap)" untuk memantau kepadatan peristiwa setahun penuh dalam satu layar bird\'s-eye view (klik tanggal untuk zoom langsung).',
      'Gunakan Panel Samping Terpadu (kanan): Tab "Detail Tanggal" menampilkan festival aktif, daftar peristiwa, usia karakter, dan tombol aksi cepat; Tab "Agenda" menyediakan pencarian instan dan hierarki lipat Era → Tahun → Peristiwa (klik nama peristiwa untuk melompat ke tanggalnya).',
      'Klik tanggal di grid → "Tambah peristiwa di tanggal ini" (atau tombol "Peristiwa baru" di header) untuk mengisi tanggal serta opsi rentang waktu ("Berlangsung beberapa hari").',
      'Tautkan tokoh Codex: kalender otomatis menghitung usia karakter saat peristiwa terjadi secara real-time (lengkap dengan penanda ulang tahun "🎂" dan peringatan belum lahir "⚠️").',
      'Klik "Kalkulator" di header atau "Hitung perjalanan dari tanggal ini" di Detail Tanggal untuk mengukur selisih waktu, estimasi jarak/waktu tempuh 6 moda transportasi fantasi, dan proyeksi tanggal tiba.',
    ],
    detail: [
      'Arsitektur 2-Kolom & Inspector Terpadu: Grid kalender mendapat prioritas ruang visual utama. Anda dapat menyembunyikan/membuka panel samping kapan saja lewat tombol toggle di header (ikon panel) untuk menikmati mode layar penuh 100% (Zen Mode).',
      'Hari Libur & Festival Tahunan (Recurring Holidays): Festival otomatis berulang setiap tahun dengan lencana berkilau bintang (Sparkles) di kalender bulanan/heatmap dan spanduk perayaan tematik emas di kartu detail tanggal.',
      'Pelacak Usia Karakter Dinamis (Dynamic Age Tracker): Isi tanggal lahir (birthDate) pada entri Codex kategori Karakter; usia in-world karakter otomatis dihitung di setiap kartu peristiwa kalender secara presisi.',
      'Kalkulator Jarak Waktu & Perjalanan: Menghitung selisih hari/bulan/tahun in-world antar dua tanggal dan estimasi waktu tempuh berbagai moda (jalan kaki, kereta kafilah, kuda santai, kurir kilat, kapal layar, burung pos) dengan opsi 1-klik membuat peristiwa rentang di linimasa.',
      'Audit Kronologi Deterministik (Nol Token): Tombol lencana peringatan audit di header mendeteksi tanggal peristiwa bab yang mundur secara tidak logis dari bab sebelumnya, urutan tanggal terbalik di bab yang sama, dan rentang tanggal salah — lengkap dengan deteksi cerdas kilas balik (flashback) agar tidak memicu false alarm.',
      'Tautan Bab & Codex: Peristiwa kalender terhubung langsung ke Bab dan entri Kamus Data, tersinkronisasi 100% dengan Timeline Cerita dan Peta Kontinuitas tanpa duplikasi data.',
      'Era bersifat berurutan: urutan di editor (bukan angka tahun) yang menentukan kronologi — tiap era mulai ulang dari Tahun 1.',
    ],
    tip: 'Sepenuhnya deterministik & nol token — merancang kalender, visualisasi heatmap, kalkulator perjalanan, dan audit kronologi berjalan 100% lokal tanpa mengonsumsi kuota AI.',
  },
  {
    id: 'bible', group: 'world', Icon: Book, color: 'sky', view: 'bible',
    title: 'Buku Cerita (Story Bible)',
    where: 'Menu: Buku Cerita',
    what: 'Konstitusi cerita: genre, tone, POV, tempo, tema, dan aturan baku yang mengikat seluruh respons AI.',
    steps: [
      'Tetapkan Tone (mis. "Gelap, gotik, tanpa romansa") dan POV (mis. "Orang pertama, Aku").',
      'Isi Premis, Tema, dan Catatan Penulis sebagai arahan tambahan.',
      'Buntu? Klik "Kembangkan dengan AI" di bidang Tagline/Premis/Latar/Tema/Target Pembaca — AI membaca profil yang sudah terisi lalu mengusulkan draf yang konsisten.',
    ],
    detail: [
      'Nilai ini disuntikkan ke instruksi AI di semua jalur (Magic Edit, Studio, Konsistensi) sehingga keluaran selalu sesuai pakem cerita.',
      'Bersama Codex, Buku Cerita membentuk "knowledge base" statis yang di-cache provider — itu sebabnya menyuntingnya membatalkan cache.',
      'Saran AI bisa diterima dengan "Ganti isi" atau "Tambahkan", diulang untuk variasi, atau dibatalkan di tengah jalan — Anda tetap pemegang keputusan; tak ada yang tersimpan sebelum Anda menerapkannya.',
    ],
    tip: 'AI-assist paling akurat setelah Judul + Genre + Tone terisi; makin lengkap profilnya, makin nyambung sarannya.',
  },

  // ── ANALISIS & KONSISTENSI ─────────────────────────────────────────────────
  {
    id: 'consistency', group: 'analysis', Icon: ShieldCheck, color: 'green', view: 'consistency',
    title: 'Cek Konsistensi (audit AI per-bab)',
    where: 'Menu: Cek Konsistensi',
    what: 'Audit satu bab terhadap Codex, Buku Cerita, relasi, dan Timeline untuk menemukan pertentangan kanon.',
    steps: [
      'Pilih bab, jalankan pemeriksaan, lalu telusuri daftar temuan (mis. ciri tokoh berubah, urutan waktu salah, relasi janggal).',
      'Klik sebuah temuan untuk melompat ke kutipannya di editor (otomatis tersorot) dan perbaiki di tempat.',
    ],
    detail: [
      'Ini versi "audit satu bab penuh" — berbeda dari Konsistensi Inline yang bekerja per-paragraf di dalam editor.',
      'Memakai token karena AI membandingkan prosa bab dengan seluruh data dunia; jalankan saat bab sudah cukup matang.',
    ],
  },
  {
    id: 'timeline', group: 'analysis', Icon: CalendarClock, color: 'violet', view: 'timeline',
    title: 'Timeline Cerita',
    where: 'Menu: Timeline Cerita',
    what: 'Kronologi peristiwa untuk mencegah plot hole dan urutan kejadian yang bertabrakan.',
    steps: [
      'Tambahkan peristiwa penting beserta urutan/waktunya.',
      'Data ini jadi acuan bagi Cek Konsistensi, dan Peta Kontinuitas.',
    ],
    detail: [
      'Pilih Lihat seluruh linimasa untuk melihat seluruh rentang, lalu buka periode atau tanggal untuk melihat peristiwa.',
      'Gunakan Catat ke Linimasa dari seleksi teks editor. Bab dan entitas Codex terkait bisa dikosongkan.',
      'Peristiwa tanpa tanggal, termasuk catatan waktu bebas dari proyek lama, tetap tersedia di Belum bertanggal.',
      'Semakin lengkap Timeline, semakin tajam deteksi kontradiksi kronologi antar bab.',
    ],
    tip: 'Untuk penanggalan dunia sendiri (bulan/musim/era/festival), pelacak usia tokoh, dan kalkulator perjalanan, buka modul Kalender Dunia.',
  },
  {
    id: 'continuity', group: 'analysis', Icon: Radar, color: 'indigo', view: 'continuity',
    title: 'Peta Kontinuitas',
    where: 'Menu: Peta Kontinuitas',
    what: 'Scan lintas-bab yang deterministik (nol token) untuk kesalahan kontinuitas menyeluruh.',
    steps: [
      'Buka panel — aplikasi memindai kemunculan seluruh entitas Codex di semua bab sekali jalan.',
      'Lima cek muncul otomatis: karakter yang menghilang, entitas tak terpakai, relasi tanpa pertemuan, timeline yang tak cocok, dan urutan kronologi mundur (tanggal bab terbalik).',
    ],
    detail: [
      'Memakai satu kali pemindaian nama/alias (Aho-Corasick) yang sama dengan Lensa Karakter — cepat dan gratis.',
      'Pemeriksaan kronologi mundur mengevaluasi tanggal in-world peristiwa kalender antar bab berurutan, dengan toleransi cerdas kilas balik (analepsis/flashback) otomatis.',
      'Cocok dijalankan berkala sebagai "pemeriksaan kesehatan" naskah sebelum menempuh Cek Konsistensi AI yang berbiaya token.',
    ],
    tip: 'Sepenuhnya lokal & gratis token — aman dijalankan sesering apa pun.',
  },
  {
    id: 'arc', group: 'analysis', Icon: Activity, color: 'fuchsia', view: 'arc',
    title: 'Lensa Karakter',
    where: 'Menu: Lensa Karakter',
    what: 'Analitik per-karakter (nol token): porsi layar tiap bab, absensi terlama, bab ber-POV, dan ko-kemunculan.',
    steps: [
      'Pilih karakter untuk melihat di bab mana ia muncul dan seberapa besar porsinya.',
      'Pakai untuk mendeteksi tokoh yang terlalu lama hilang atau POV yang tak seimbang.',
    ],
    detail: [
      'Perhitungan "bab ber-POV" mengambil field POV per-bab — isi POV bab agar metrik ini akurat.',
      'Ko-kemunculan menunjukkan pasangan tokoh yang sering muncul bersama, berguna untuk menakar dinamika hubungan.',
    ],
  },
  {
    id: 'prose', group: 'analysis', Icon: BarChart3, color: 'cyan', view: 'prose',
    title: 'Wawasan Prosa',
    where: 'Menu: Wawasan Prosa',
    what: 'Analitik gaya seluruh naskah (nol token): kalimat terlalu panjang, kalimat pasif, keterbacaan, dan kata berulang.',
    steps: [
      'Buka panel untuk melihat ringkasan grafik gaya penulisan di seluruh bab.',
      'Pakai temuannya untuk memoles ritme, memangkas kalimat pasif, dan menghindari pengulangan kata.',
    ],
    detail: [
      'Hasil analisis disimpan lokal (localStorage) sehingga tak dihitung ulang tiap buka panel.',
      'Ada juga panel Prose Insights ringkas di sisi kanan editor untuk menyorot masalah gaya bab yang sedang dikerjakan.',
    ],
  },
  {
    id: 'heatmap', group: 'analysis', Icon: Flame, color: 'orange', view: 'heatmap',
    title: 'Heatmap Tensi/Pacing',
    where: 'Menu: Heatmap Tensi',
    what: 'Kurva naik-turun tensi seluruh manuskrip (nol token) untuk evaluasi makro pacing — deteksi bagian yang tegang terus (pembaca jenuh) atau melandai.',
    steps: [
      'Buka panel untuk melihat kurva tensi per bab; tinggi & warna bar = tingkat tensi (biru tenang → merah tegang).',
      'Setiap bab awalnya bertensi "Otomatis" (bar bergaris) yang disarankan dari sinyal prosa. Timpa manual lewat kontrol Auto/1–5 di daftar bawah.',
      'Perhatikan kartu "Pola makro": Plateau tegang (≥3 bab tegang beruntun) dan Lembah datar (≥3 bab tenang beruntun).',
    ],
    detail: [
      'Saran otomatis diturunkan dari panjang kalimat, rasio dialog, dan densitas tanda seru/tanya/jeda — heuristik, bukan aturan mutlak.',
      'Tensi manual (Chapter.tension) hanya metadata alur kerja: tidak masuk ke KB AI maupun ekspor naskah.',
    ],
    tip: 'Sepenuhnya lokal & gratis token. Sinergis dengan Wawasan Prosa (rasio dialog) untuk menakar ritme.',
  },
  {
    id: 'promises', group: 'analysis', Icon: Crosshair, color: 'rose', view: 'promises',
    title: 'Janji Plot (Chekhov’s Gun)',
    where: 'Menu: Janji Plot',
    what: 'Ledger elemen yang HARUS terbayar (senjata, ramalan, misteri). Anda catat, aplikasi melacak — nol token.',
    steps: [
      'Catat sebuah janji: dari editor (blok teks → "Catat Janji" di menu melayang), dari detail Codex (ikon crosshair), atau langsung di panel.',
      'Aplikasi melacak kemunculannya per bab (via nama/alias Codex atau kata kunci) dan menandai bila "Tertidur" terlalu lama.',
      'Payoff/Reveal (opsional): kaitkan janji ke rahasia/reveal yang DIBAYARNYA (field "Membayar/mengungkap", idealnya sebuah "rahasia penulis"). Seksi "Pembayaran" lalu memetakan kait per rahasia.',
      'Tandai "Terbayar" saat janji ditepati, atau "Ditinggalkan" bila sengaja dibuang.',
    ],
    detail: [
      'Akurat karena tidak menebak: yang dilacak hanya hal yang Anda deklarasikan. Status "Tertidur N bab" adalah pengingat, bukan kesalahan.',
      'Janji dalam prosa (bukan entitas) dilacak lewat kata kunci; janji yang berupa entitas dilacak dengan menautkannya ke entri Codex.',
      'Di seksi "Pembayaran", rahasia dengan kait yang "Belum ditanam" (tak muncul di prosa) atau "Tanam tipis" ditandai — sinyal foreshadowing kurang sebelum reveal.',
    ],
    tip: 'Sepenuhnya lokal & gratis token. Pakai filter "Perlu perhatian" untuk fokus ke janji tertidur/tak ditemukan.',
  },

  // ── AI & ASISTEN ───────────────────────────────────────────────────────────
  {
    id: 'studio', group: 'ai', Icon: MessagesSquare, color: 'purple', view: 'brainstorm',
    title: 'Studio Asisten',
    where: 'Menu: Studio Asisten',
    what: 'Ruang percakapan penuh untuk brainstorming, menyusun plot, atau kritik prosa — dengan riwayat sesi.',
    steps: [
      'Mulai cepat: pilih salah satu kartu topik awal (Kembangkan Karakter, Eksplorasi Lore, Tarik Ulur Plot, Review Gaya Bahasa) atau ketik pertanyaan/ide Anda sendiri.',
      'Lampirkan (+): impor entri Codex/Bible/bab tertentu (via @codex:, @rule:, cuplikan/ringkasan bab) agar diskusi terfokus.',
      'Aktifkan "Smart Auto" di header untuk menyelipkan otomatis konteks scene relevan dari bab aktif ke tiap jawaban.',
      'Anda bisa Stop di tengah jawaban, atau Regenerasi untuk variasi.',
    ],
    detail: [
      'Setiap sesi tersimpan dan bisa dilanjutkan dari daftar riwayat.',
      'Riwayat Studio otomatis menyembunyikan sesi Scribble & Lokakarya agar tidak tercampur.',
    ],
  },
  {
    id: 'scribble', group: 'ai', Icon: Wand2, color: 'fuchsia', view: 'write',
    title: 'Scribble (Asisten Ringkas)',
    where: 'Panel samping Editor / Codex',
    what: 'Asisten obrolan kecil yang menempel di samping editor/codex untuk pertanyaan cepat tanpa pindah ke Studio.',
    steps: [
      'Buka panel Scribble dari sisi editor atau codex untuk tanya jawab singkat (mis. "beri 3 alternatif nama kota").',
      'Untuk diskusi yang makin panjang, pindah ke Studio Asisten.',
    ],
    detail: [
      'Scribble berbagi mesin sesi dengan Studio, tapi riwayatnya terpisah agar tidak mencemari daftar Studio.',
      'Ditujukan untuk dorongan kecil di tengah menulis, bukan sesi panjang.',
    ],
  },
  {
    id: 'snippets', group: 'ai', Icon: Sparkles, color: 'yellow', view: 'actions',
    title: 'Snippet AI (Aksi Kustom)',
    where: 'Menu: Snippet AI',
    what: 'Simpan prompt yang sering dipakai sebagai tombol pintas — seperti "macro" untuk AI.',
    steps: [
      'Buat snippet baru (mis. "ubah ke gaya bahasa formal") di menu Snippet AI, lengkap dengan label & ikon.',
      'Panggil lewat menu "Tanya AI" (bagian "Kustom (Personal)") saat menyorot teks di editor.',
    ],
    detail: [
      'Sangat menghemat waktu untuk revisi berulang yang sama di banyak bab.',
      'Snippet hanya prompt tersimpan — ia memakai teks yang sedang Anda sorot sebagai targetnya.',
    ],
  },
  {
    id: 'ai-settings', group: 'ai', Icon: Key, color: 'slate', view: 'settings',
    title: 'Penyedia AI, Kunci (BYOK) & Kedalaman Konteks',
    where: 'Pengaturan → tab AI',
    what: 'Pilih penyedia & model AI, masukkan kunci API sendiri, uji koneksi, dan atur seberapa banyak konteks dunia dikirim ke AI.',
    steps: [
      '"Penyedia AI Default": pilih yang aktif — Google AI Studio (Gemini), Groq Cloud, OpenRouter, Anthropic (Claude), Hugging Face, atau Ollama (lokal).',
      'Kredensial API: tempel kunci tiap penyedia (mis. Google "AIzaSy…", Claude "sk-ant-…", Groq "gsk_…", OpenRouter "sk-or-…", HF "hf_…"), pilih modelnya, lalu klik "Simpan Kredensial".',
      'Klik tombol uji koneksi di samping kunci untuk memastikan kunci & model benar-benar bekerja sebelum menulis.',
      'Kedalaman Konteks: Minimal (Eco — hemat, hanya patuhi Bible & abaikan dunia), Seimbang (Optimal — otomatis pilih lore relevan, direkomendasikan), atau Mendalam (Power — detail maksimum, token besar).',
    ],
    detail: [
      'BYOK: kunci disimpan lokal di browser (base64 di localStorage/sessionStorage), tidak pernah dikirim ke server aplikasi — hanya diteruskan ke penyedia yang Anda pilih.',
      'Ollama (Penyedia AI Lokal): centang "Ollama Aktif", isi Base URL (default http://localhost:11434), pilih model. 100% offline tanpa API key — tapi butuh aplikasi Ollama berjalan dengan CORS dikonfigurasi.',
      'Ketahanan: bila penyedia aktif gagal (koneksi/rate-limit), sistem otomatis mencoba penyedia cadangan; kunci salah / kuota habis TIDAK di-retry (percuma).',
      'Model tiap penyedia diingat terpisah, jadi Anda bisa berganti penyedia tanpa mengetik ulang model.',
    ],
  },
  {
    id: 'ai-optimization', group: 'ai', Icon: Coins, color: 'amber', view: 'settings',
    title: 'Optimasi AI Lanjutan (token & biaya)',
    where: 'Pengaturan → tab AI → "Optimasi AI Lanjutan"',
    what: 'Lima penyetel lanjutan untuk menekan token/biaya. Default sudah aman — ubah hanya bila ingin menyetel manual.',
    steps: [
      'Maks. Lore di Cache: batas karakter Codex pada prompt statis — 25.000 (~6k token, paling hemat), 50.000 (default), 75.000, atau 100.000 (lore terkaya). Makin kecil = cache lebih murah ditulis ulang bila sering edit lore di tengah sesi.',
      'Model Tugas Ringan untuk rangkuman dan ekstraksi entitas. Pilih dari daftar penyedia terpilih atau gunakan Default AetherScribe, lalu klik Simpan Kredensial. Ollama memakai model utama.',
      'Masa Hidup Cache (Claude): 1 jam (default — jaga cache hangat untuk sesi menulis panjang) atau 5 menit (untuk pemakaian jarang / burst pendek). Hanya Claude langsung; OpenRouter & Google tak terpengaruh.',
      'Kreativitas Tulis Ulang: geser 0–1 khusus aksi "Tanya AI" di editor. Rendah = presisi & taat instruksi; tinggi = variatif/kreatif tapi rawan menyimpang. Tugas analitis (cek konsistensi, ekstraksi) tak terpengaruh.',
      'Cek Konsistensi Otomatis (boros token): toggle mode idle-check yang menggarisbawahi paragraf (ungu) saat Anda berhenti mengetik. Default MATI.',
    ],
    detail: [
      'Penyetel di sini tersimpan seketika saat diubah (kecuali kredensial yang butuh tombol "Simpan"). Pantau efeknya lewat cache hit rate di Dashboard dan pil Context Meter.',
      'Bagian "Cache Semantik & Vektor" menyediakan "Bersihkan Cache Penyematan" untuk reset indeks vektor (Cari Adegan, Global Search, auto-summarizer) bila state semantik rusak.',
    ],
    tip: 'Untuk biaya minimum: Kedalaman Konteks "Seimbang", Maks. Lore 25k, Cek Konsistensi Otomatis mati, dan model tugas-ringan diisi.',
  },

  // ── PROGRES, DATA & EKSPOR ─────────────────────────────────────────────────
  {
    id: 'projects', group: 'output', Icon: Library, color: 'indigo', actionKey: 'project', openLabel: 'Buka Manajer Naskah',
    title: 'Manajer Naskah (Multi-Proyek)',
    where: 'Header: klik nama proyek (ikon ⚡)',
    what: 'Aplikasi bisa menampung banyak novel sekaligus. Buat, beralih, dan hapus naskah dari satu tempat.',
    steps: [
      'Klik nama proyek di kiri atas header untuk membuka "Naskah Anda".',
      'Klik "Ganti" pada sebuah naskah untuk berpindah ke sana; naskah aktif ditandai lencana "Aktif".',
      'Gunakan "Buat Naskah Baru" (isi judul) untuk memulai proyek baru — masing-masing punya bab, Codex, Bible, dll. yang terpisah.',
    ],
    detail: [
      'Daftar diurutkan berdasarkan "terakhir dibuka", jadi naskah yang sedang digarap selalu di atas.',
      'Menghapus naskah minta konfirmasi ("Hapus?" → "Konfirmasi") dan tidak bisa dilakukan bila hanya tersisa satu naskah.',
      'Nama proyek juga bisa diganti langsung (inline) lewat kotak judul di bagian atas sidebar.',
      'Penghapusan bersifat permanen & lokal — pastikan sudah ada cadangan sebelum menghapus.',
    ],
  },
  {
    id: 'context-meter', group: 'output', Icon: Cpu, color: 'emerald',
    title: 'Context Meter (anggaran token)',
    where: 'Header: pil ikon Cpu dengan %',
    what: 'Memantau seberapa penuh "jendela konteks" model AI oleh bab + lore, agar Anda tahu kapan konteks mulai sesak.',
    steps: [
      'Lihat pil Cpu di header saat sedang di Editor; angkanya = persentase pemakaian konteks model aktif.',
      'Klik untuk membuka rincian: total token vs limit model, plus pecahan Teks Bab / Lore-Codex / Story Bible.',
      'Warna berubah sesuai beban: hijau (aman), amber (>60%), merah (>85% — konteks mulai sesak).',
    ],
    detail: [
      'Ini BERBEDA dari pil target menulis (persentase kata). Context Meter soal token AI; pil target soal progres naskah.',
      'Limit menyesuaikan model/penyedia aktif (mis. Claude ~200k, Gemini 1M+, Groq 8k). Ganti model di Pengaturan mengubah acuan ini.',
      'Hanya muncul saat ada bab aktif (mode Editor).',
    ],
    tip: 'Bila meter memerah, konteks yang dikirim ke AI membengkak (lore + bab panjang). Turunkan "Kedalaman Konteks" atau pangkas cap lore cache di Pengaturan.',
  },
  {
    id: 'planning', group: 'output', Icon: LayoutList, color: 'fuchsia', view: 'outline',
    title: 'Papan Rencana & Manajemen Bab',
    where: 'Menu: Papan Rencana',
    what: 'Papan gaya Kanban untuk memantau status bab (Outline → Draft → Selesai) dan menyusun urutannya.',
    steps: [
      'Drag & drop kartu antar kolom status saat tahap pengerjaan berubah.',
      'Urutkan ulang bab dengan menarik ikon "grip" di daftar bab.',
      'Tulis Ringkasan bab agar AI tahu garis besar isinya walau belum selesai ditulis.',
    ],
    detail: [
      'Ringkasan bab juga bisa diisi otomatis oleh auto-summarizer (lihat Fitur Kecil).',
      'Ringkasan membantu AI memahami bab yang belum ditulis penuh — berguna untuk menjaga alur saat brainstorming.',
    ],
  },
  {
    id: 'stats', group: 'output', Icon: Target, color: 'cyan', view: 'write',
    title: 'Target Menulis, Statistik & Streak',
    where: 'Header: pil target % (bukan pil Cpu) + panel kanan Editor',
    what: 'Lacak jumlah kata, target naskah, target harian, dan rentetan hari produktif (streak).',
    steps: [
      'Klik pil target "%" di header → setel Target Naskah & Target Harian, pantau progress bar & streak 🔥.',
      '"Kata hari ini" dihitung dari pertambahan kata Anda; capai target beberapa hari berturut-turut untuk menambah streak.',
    ],
    detail: [
      'Jangan tertukar dengan pil Cpu (Context Meter) di sebelahnya — yang ini soal progres kata, bukan token AI.',
      'Footer editor menampilkan hitungan kata/karakter & perkiraan waktu baca bab yang sedang dibuka secara live.',
    ],
  },
  {
    id: 'dashboard', group: 'output', Icon: Gauge, color: 'indigo', view: 'dashboard',
    title: 'Dashboard Penggunaan AI',
    where: 'Menu: Dashboard',
    what: 'Pantau pemakaian token, perkiraan biaya, tingkat cache-hit, dan model yang paling sering dipakai.',
    steps: [
      'Lihat kartu "Token dari Cache" & cache hit rate untuk memastikan caching bekerja (menekan biaya).',
      'Bandingkan dengan setelan di Pengaturan → Optimasi AI Lanjutan untuk menyetel berdasarkan data nyata, bukan tebakan.',
    ],
    detail: [
      'Setiap panggilan AI dicatat lokal; dashboard hanya merangkumnya — tidak ada data yang dikirim keluar.',
      'Cache hit tinggi = biaya rendah. Bila rendah, cek apakah Anda sering mengedit lore di tengah sesi menulis (itu membatalkan cache).',
    ],
  },
  {
    id: 'export', group: 'output', Icon: FileDown, color: 'orange', actionKey: 'export', openLabel: 'Buka Ekspor',
    title: 'Ekspor Multi-Format (MD / PDF / DOCX / EPUB)',
    where: 'Ikon unduh di Header',
    what: 'Rajut bab-bab menjadi satu berkas siap kirim, dengan pilihan bab yang disertakan.',
    steps: [
      'Klik ikon unduh di header → pilih format (Markdown, PDF, Word, atau EPUB).',
      'Centang bab yang ingin disertakan (atau "Pilih Semua"); ringkasan menampilkan jumlah kata yang akan diekspor.',
    ],
    detail: [
      'PDF/DOCX/EPUB mempertahankan format tebal & miring; EPUB menghasilkan e-book standar siap dibaca di aplikasi e-reader.',
      'Karena default-nya semua bab, pakai centang untuk mengekspor sebagian (mis. hanya sampel 3 bab pertama).',
    ],
  },
  {
    id: 'backup', group: 'output', Icon: Cloud, color: 'blue', view: 'settings',
    title: 'Backup, Restore & Sinkronisasi (3 lapisan)',
    where: 'Pengaturan → tab Backup',
    what: 'Lindungi karya berlapis: cadangan otomatis di browser, ke folder perangkat, ke Google Drive, plus ekspor/impor manual.',
    steps: [
      'Operasi Manual → "Ekspor Semua Cadangan": unduh satu berkas JSON berisi seluruh ruang kerja (proyek, bab, Codex, Bible, relasi, timeline, sesi chat).',
      '"Kembalikan dari JSON": impor berkas cadangan (.json atau .json.gz). Menimpa SEMUA data setelah konfirmasi, lalu memuat ulang halaman.',
      'Mesin Pencadangan Otomatis berjalan berkala sesuai Interval (15 / 30 / 60 menit) dalam 3 lapisan (lihat detail).',
    ],
    detail: [
      'Lapisan 1 — IndexedDB: cadangan bergulir hening di browser, menyimpan hingga 5 versi. Daftar "Titik Pulih" (timestamp + ukuran) punya tombol Pulihkan, plus "Picu Pencadangan Lokal" manual.',
      'Lapisan 2 — Folder Lokal: menulis berkas .json terus-menerus ke folder pilihan di perangkat (butuh Chrome/Edge; File System Access API). Klik "Pilih Folder Cadangan".',
      'Lapisan 3 — Google Drive (BYOK): tempel Google Client ID Anda, "Login Google", lalu "Kirim Cadangan" untuk salinan luar perangkat.',
      'PENTING: semua data hanya ada lokal di browser (IndexedDB). Hapus cache / ganti perangkat = hilang bila tak ada cadangan.',
      'Restore mendeteksi gzip lewat magic bytes (bukan ekstensi), jadi berkas cadangan lama yang salah nama tetap terbaca.',
    ],
  },
];

// Fitur mikro / tersembunyi — hal kecil yang mudah lupa, dijelaskan ringkas tapi jelas.
export const SMALL_FEATURES: SmallFeature[] = [
  { title: 'Tema Gelap / Terang', where: 'Header (ikon bulan/matahari)', desc: 'Beralih antara mode terang dan gelap sesuai kenyamanan mata. Pilihan tersimpan antar sesi.' },
  { title: 'Toggle Sidebar', where: 'Header (ikon chevron kiri atas)', desc: 'Sembunyikan/tampilkan panel navigasi kiri untuk melebarkan area kerja. Di layar kecil, sidebar menutup sendiri setelah memilih menu.' },
  { title: 'Ganti nama proyek inline', where: 'Kotak judul di atas sidebar', desc: 'Klik langsung nama proyek di sidebar untuk menyuntingnya; perubahan tersimpan seketika ke database.' },
  { title: 'Bersihkan Cache Penyematan', where: 'Pengaturan → Cache Semantik & Vektor', desc: 'Reset indeks vektor (Cari Adegan, Global Search, auto-summarizer) bila ada state semantik yang rusak; worker membangunnya ulang di latar.' },
  { title: 'Log Error', where: 'Sidebar → Log Error', desc: 'Catatan galat aplikasi yang terekam otomatis. Berguna untuk menelusuri masalah bila ada fitur yang berperilaku aneh.' },
  { title: 'Mode Fokus', where: 'Editor → menu "Tampilan", atau Ctrl+Alt+F', desc: 'Sembunyikan seluruh antarmuka & panel (termasuk header) untuk menulis tenang tanpa distraksi. Tekan lagi untuk keluar.' },
  { title: 'Mode Mesin Tik (Typewriter)', where: 'Editor → menu "Tampilan"', desc: 'Baris yang sedang aktif selalu dijaga di tengah layar saat mengetik, seperti mesin tik klasik.' },
  { title: 'Ukuran Teks (Zoom)', where: 'Editor → menu "Tampilan"', desc: 'Perbesar/perkecil teks editor dari 50% sampai 250% tanpa mengubah data — hanya tampilan.' },
  { title: 'Dock menu seleksi', where: 'Menu mengambang (ikon pin)', desc: 'Sematkan menu "Tanya AI" di bawah layar agar tidak menutupi teks yang sedang Anda baca. Posisi diingat.' },
  { title: 'Pemilih provider per-aksi', where: 'Menu "Tanya AI"', desc: 'Bila >1 kunci provider aktif, kirim satu aksi ke provider tertentu (huruf awalnya) tanpa mengubah setelan global.' },
  { title: 'Bandingkan snapshot (diff)', where: 'Panel Riwayat Versi', desc: 'Lihat perbedaan baris-per-baris antara sebuah snapshot dan naskah sekarang sebelum memutuskan memulihkan.' },
  { title: 'Snapshot otomatis pengaman', where: 'Otomatis sebelum pemulihan', desc: 'Sistem mengabadikan naskah sekarang (label "Otomatis") tepat sebelum aksi destruktif, jadi selalu bisa dikembalikan.' },
  { title: 'POV per-bab', where: 'Properti bab', desc: 'Tandai sudut pandang tiap bab; dipakai Lensa Karakter untuk menghitung bab ber-POV dengan akurat.' },
  { title: 'Auto-summarizer', where: 'Berjalan di latar', desc: 'Meringkas bab dengan AI secara otomatis; ringkasan membantu AI memahami isi bab walau belum selesai ditulis.' },
  { title: 'Kategori Codex kustom', where: 'Kamus Data → pengelola kategori', desc: 'Buat kategori sendiri (label, ikon, warna) di luar 6 kategori bawaan. Menghapusnya mengalihkan entri ke "other".' },
  { title: 'Alias Codex', where: 'Form entri Codex', desc: 'Daftarkan variasi nama (julukan, gelar) agar semua bentuk terdeteksi di naskah & terbaca AI.' },
  { title: 'Topik Awal Chat', where: 'Studio Asisten (layar kosong)', desc: 'Kartu pemantik (Kembangkan Karakter, Eksplorasi Lore, Tarik Ulur Plot, Review Gaya Bahasa) mengisi prompt siap-kirim agar tak mulai dari nol.' },
  { title: 'Periksa Ejaan Nama (Buku Gaya)', where: 'Editor → menu "Tampilan"', desc: 'Garis bawah merah putus-putus pada kata yang mirip tapi tak persis nama/alias Codex (kandidat salah-eja) dengan saran perbaikan. Deterministik, nol token, default menyala.' },
  { title: 'Smart Auto-Context', where: 'Header Studio Asisten', desc: 'Selipkan otomatis teks bab yang sedang dikerjakan ke tiap jawaban AI. Cocok saat buntu ide (writer\'s block).' },
  { title: 'Stop & Regenerasi', where: 'Jawaban AI di Studio', desc: 'Hentikan jawaban di tengah bila sudah tak relevan, atau minta variasi baru dari prompt yang sama.' },
  { title: 'Kedalaman Konteks', where: 'Pengaturan → AI', desc: 'Seimbangkan kualitas vs hemat token. Mode "minimal" memakai RAG dinamis; selain itu memakai prompt caching penuh.' },
  { title: 'TTL & cap cache, suhu rewrite', where: 'Pengaturan → Optimasi AI Lanjutan', desc: 'Setel masa hidup cache Claude (5 mnt/1 jam), batas lore yang di-cache, model tugas-ringan, & kreativitas rewrite.' },
  { title: 'Cek koneksi provider', where: 'Pengaturan → kredensial AI', desc: 'Uji apakah kunci & model sebuah penyedia benar-benar bekerja sebelum Anda mulai menulis.' },
  { title: 'Pencarian Global', where: 'Ctrl+K (atau Ctrl+F)', desc: 'Lompat cepat ke bab atau entri Codex mana pun dari mana saja di aplikasi.' },
  { title: 'Sinkronisasi Google Drive', where: 'Pengaturan → Backup', desc: 'Cadangan otomatis ke Drive (BYOK) untuk salinan luar perangkat, di atas backup lokal internal.' },
  { title: 'Peta Bertingkat (Sub-Maps)', where: 'Atlas Dunia → Form Penanda / Kanvas', desc: 'Tautkan wilayah/pin ke peta lokal (kota, dungeon, denah gedung). Menghadirkan portal klik ganda dan pil navigasi mengambang untuk kembali ke peta induk.' },
  { title: 'Pohon Hierarki Peta', where: 'Atlas Dunia → Toolbar (ikon Pohon)', desc: 'Dialog direktori visual yang menampilkan silsilah bersarang seluruh peta proyek (Dunia → Benua → Kota → Denah) dengan pencarian dan lompat langsung.' },
  { title: 'Kalibrasi Skala & Waktu Tempuh', where: 'Atlas Dunia → Toolbar (ikon Skala)', desc: 'Tentukan rasio piksel ke kilometer/mil untuk menghitung jarak rute dan estimasi durasi perjalanan karakter (jalan kaki, kuda, kapal) otomatis tanpa AI.' },
  { title: 'Sorot Wilayah Yatim', where: 'Atlas Dunia → Toolbar (ikon Yatim)', desc: 'Mendeteksi dan menyorot penanda peta yang belum memiliki entri Codex, meredupkan penanda lain agar Anda fokus melengkapi kontinuitas lore.' },
  { title: 'Linimasa Bab Peta', where: 'Atlas Dunia → Toolbar (ikon Linimasa)', desc: 'Slider kronologis bab untuk melihat wilayah mana saja yang sudah dijelajahi atau aktif hingga bab tertentu dalam cerita novel.' },
  { title: 'Lompat ke Peta dari Codex', where: 'Kamus Data → Header detail entri (ikon MapPin)', desc: 'Satu klik pada ikon pin di entri Codex lokasi untuk membuka modul Atlas dan langsung menyorot kamera ke penanda wilayahnya.' },
  { title: 'Katalog Wilayah Terpadu', where: 'Atlas Dunia → Sidebar kanan / Toolbar "Wilayah"', desc: 'Daftar seluruh wilayah di peta aktif maupun seluruh peta novel dengan pencarian cepat, filter jenis, deteksi yatim, dan teleportasi 1-klik ke lokasi.' },
  { title: 'Kalkulator Perjalanan In-World', where: 'Kalender Dunia → Toolbar "Kalkulator" / Detail Tanggal', desc: 'Hitung selisih hari in-world, estimasi waktu tempuh 6 moda transportasi fantasi, dan proyeksikan tanggal tiba otomatis tanpa AI.' },
  { title: 'Hari Libur & Festival Tahunan', where: 'Kalender Dunia → Editor Kalender', desc: 'Rancang festival berulang tahunan dengan lencana berkilau Sparkles di grid bulanan/heatmap dan spanduk perayaan tematik emas.' },
  { title: 'Pelacak Usia Karakter Dinamis', where: 'Kamus Data → Form Karakter (Tanggal Lahir)', desc: 'Tautkan tanggal lahir karakter di Codex; usia in-world dihitung otomatis di setiap peristiwa kalender, lengkap dengan tanda ulang tahun & belum lahir.' },
  { title: 'Audit Kronologi Mundur (Nol Token)', where: 'Kalender Dunia → Toolbar "Audit" / Peta Kontinuitas', desc: 'Deteksi otomatis tanggal bab yang mundur atau rentang terbalik dengan toleransi kilas balik cerdas, 100% deterministik tanpa kuota AI.' },
  { title: 'Tampilan Heatmap Tahunan', where: 'Kalender Dunia → Pengalih tampilan', desc: 'Pantau ritme dan kepadatan peristiwa setahun penuh dalam bird\'s-eye view dengan indikator festival dan zoom 1-klik ke bulan terpilih.' },
  { title: 'Mode Zen Kalender (Full-Width)', where: 'Kalender Dunia → Toolbar header kanan', desc: 'Tutup panel samping inspector untuk memperluas grid kalender hingga 100% lebar layar, dan klik tanggal kapan saja untuk membukanya kembali.' },
];

export const TIPS = [
  { Icon: Cpu,    color: 'text-sky-500',     title: 'Blok Seperlunya Saja', desc: 'Magic Edit hanya mengolah area yang disorot. Sorot paragraf yang butuh diperbaiki saja untuk menghemat token.' },
  { Icon: Coins,  color: 'text-amber-500',   title: 'Batasi Ukuran Output', desc: 'Beri instruksi eksplisit ("maksimal 3 poin", "dalam 50 kata") agar AI tidak menjawab terlalu panjang.' },
  { Icon: Layers, color: 'text-emerald-500', title: 'Kelompokkan Edit Lore', desc: 'Mengedit Codex/Bible membatalkan cache. Selesaikan editing lore dulu, baru menulis, agar cache tetap "hangat" dan murah.' },
  { Icon: Zap,    color: 'text-violet-500',  title: 'Manfaatkan @Mention',   desc: 'AI membaca profil Codex secara mendalam saat dipanggil dengan @ — cara terfokus menjaga konteks tanpa membebani memori.' },
  { Icon: Radar,  color: 'text-indigo-500',  title: 'Pakai Alat Nol-Token',  desc: 'Peta Kontinuitas, Lensa Karakter, Wawasan Prosa, dan Cari Adegan berjalan lokal — gunakan sepuasnya sebelum memanggil AI.' },
];

export const SHORTCUTS = [
  { key: '@',           action: 'Panggil Menu Mention (di editor)' },
  { key: 'Ctrl + K',    action: 'Pencarian Global (lompat bab/codex)' },
  { key: 'Ctrl + F',    action: 'Pencarian Global (alternatif)' },
  { key: 'Ctrl + H',    action: 'Cari & Ganti dalam Bab (footer editor)' },
  { key: 'Ctrl+Alt+F',  action: 'Mode Fokus (sembunyikan antarmuka)' },
  { key: 'Ctrl+Enter',  action: 'Simpan catatan revisi (saat mengetik catatan)' },
  { key: 'Esc',         action: 'Tutup bilah Cari & Ganti / dialog' },
  { key: 'Enter / Dobel-klik', action: 'Selesaikan poligon area atau rute di Atlas' },
  { key: 'Dobel-klik Penanda', action: 'Buka sub-peta (pada penanda bertaut di Atlas)' },
];

// Kategori navigasi (pil).
export type CatId = 'all' | GroupId | 'small' | 'tips' | 'shortcut';
export const CATS: { id: CatId; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'write', label: 'Editor' },
  { id: 'world', label: 'Dunia & Codex' },
  { id: 'analysis', label: 'Analisis' },
  { id: 'ai', label: 'AI' },
  { id: 'output', label: 'Progres' },
  { id: 'small', label: 'Fitur Kecil' },
  { id: 'tips', label: 'Tips' },
  { id: 'shortcut', label: 'Shortcut' },
];

const norm = (s: string) => s.toLowerCase();
export function featureMatches(f: Feature, q: string): boolean {
  const hay = norm([f.title, f.where, f.what, f.tip ?? '', ...f.steps, ...(f.detail ?? [])].join(' '));
  return hay.includes(q);
}
export function smallMatches(s: SmallFeature, q: string): boolean {
  return norm([s.title, s.where, s.desc].join(' ')).includes(q);
}
