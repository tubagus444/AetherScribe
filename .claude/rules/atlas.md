---
paths:
  - "src/features/atlas/**"
  - "src/lib/mapGeometry.ts"
  - "src/lib/atlasColors.ts"
  - "src/lib/blobCodec.ts"
---

# Atlas Dunia (peta interaktif, `viewMode 'atlas'`)

Panel peta interaktif: penulis meng-upload gambar peta sendiri, menandai **pin/area/rute** yang bisa diklik, menautkannya ke Codex, lalu memfilter per jenis/kategori/faksi. Local-first, nol jaringan, analitik nol-token. Panel di-`React.lazy` (`AtlasPanel`), `MapCanvas`/`MarkerSidebar` di-lazy lagi di dalamnya. Spesifikasi & katalog fitur di `docs/features.md` (arsip: `docs/archive/RENCANA-ATLAS-DUNIA.md`).

## Render = Leaflet MURNI (bukan `react-leaflet`)
`MapCanvas.tsx` pakai **Leaflet langsung + `useEffect`/ref** (bukan wrapper `react-leaflet`) — sengaja, untuk hindari risiko kompat wrapper di React 19 & kontrol penuh gambar imperatif. Mode **`CRS.Simple`**, peta = satu `L.imageOverlay` dari Blob (bounds `[[0,0],[height,width]]`). **Callback/data terbaru dilewatkan lewat `propsRef`** agar handler Leaflet imperatif tak jadi basi tanpa memasang-ulang listener. Tiga layer group: `markerLayer` (penanda tersimpan), `draftLayer` (menggambar baru), `editLayer` (handle edit).

> **BEDA dari LoreGraphPanel:** di sini API hit-test/pan/zoom **bawaan Leaflet JUSTRU dipakai** (matang & tepat guna untuk image-as-map) — bukan hit-test manual seperti force-graph. Jangan "menyeragamkan" keduanya.

## Geometri = koordinat RELATIF 0–1, jembatan murni di `mapGeometry.ts`
Penanda disimpan sebagai `{x,y}` (pin) / `[{x,y}…]` (area/route) dalam **0–1**, BUKAN piksel → tahan ganti resolusi/render engine. `src/lib/mapGeometry.ts` (+16 tes) adalah **satu-satunya** jembatan ke koordinat Leaflet — SENGAJA tak mengimpor Leaflet (`LatLngTuple = [number,number]`). Sumbu lat Leaflet naik ke ATAS, y gambar turun → `relToLatLng` membalik: `[h*(1-y), w*x]`. Tambah util geometri baru di sini + tes, jangan hitung koordinat ad-hoc di komponen.

## Model data: dua tabel BARU (v32) → wajib sinkron 3 tempat
`maps { id, projectId, name, imageBlob:Blob, width, height, createdAt }` & `mapMarkers { id, projectId, mapId, kind:'pin'|'area'|'route', geometry, codexId?, title?, note?, color?, createdAt }`. Ini tabel **project-scoped baru** (bukan field inert menumpang) → **WAJIB sinkron:** `importRemap.ts` (remap `mapMarkers.mapId`→`mapIdMap` [buang penanda yatim], `codexId`→`codexIdMap`; `maps` di-insert lebih dulu di service utk bangun `mapIdMap`), `ProjectContext.deleteProject` (hapus keduanya), `backupService` (collect/restore/project). Lupa satu = impor salah-tunjuk / hapus proyek meninggalkan yatim.

## Faksi & warna = TURUNAN dari `codexId` (tanpa FK faksi)
Faksi bukan tabel/id di app ini — faksi = entri Codex ber-`factionTag` (lihat CLAUDE.md #15). Area yang `codexId`-nya menunjuk entri ber-`factionTag` **otomatis** "wilayah faksi itu". Warna penanda **diturunkan** (`src/lib/atlasColors.ts`, murni): `marker.color` eksplisit → hue faksi (hash `factionTag`) → warna kategori Codex → default per-jenis. Peta hex kategori = **salinan lokal** (sama seperti LoreGraphPanel, karena `codexCategories.ts` hanya simpan kelas Tailwind). Filter (jenis/kategori/faksi) = **murni state komponen**, data tetap penuh (pola LoreGraph).

## Kehadiran bab = reuse `buildPresenceIndex` (jangan scan ganda)
`MarkerSidebar` menampilkan "muncul di bab: …" dari `PresenceIndex` (`src/lib/continuity.ts`) atas entri Codex tertaut — indeks dibangun **di worker** via hook `usePresenceIndex(chapters, codex)` di `AtlasPanel` (bukan lagi scan sinkron di main thread). Klik penanda → `openCodexEntry(codexId)` (deep-link ke `CodexDetailModal`, primitif yang sama dipakai panel lain). `title`/`note` hanya fallback bila tak tertaut.

## Gambar upload & backup (opsi "ikut ekspor, bukan auto-backup")
`useMapImageUpload.ts`: terima PNG/JPG/WEBP/GIF (**tolak SVG**), batas 5MB, **auto-resize ~4000px** sisi terpanjang via `<canvas>`, baca dimensi asli. Blob dikodekan base64 saat backup. **Kebijakan v8 (F03/F04):** file/Drive/ekspor novel dan snapshot pre-restore menyertakan gambar lengkap. Hanya rolling auto internal yang membuang base64, menyimpan `imageAssetId` SHA-256 dan penanda `imageMode:'references'`. Restore mencocokkan Blob live dan mempertahankannya; jika referensi tidak tersedia, batalkan sebelum clear, jangan diam-diam mengganti gambar dengan undefined. Legacy tanpa hash memakai identitas/dimensi peta yang sama dengan keterbatasan historis eksplisit (`docs/backup-format.md`). Peta yang sudah kehilangan gambar ketika dicadangkan diberi `imageMissing:true`. Dekode raster memakai allowlist dan batas ukuran, tanpa fetch, di luar transaksi Dexie.

## ⚠️ JEBAKAN (sudah diperbaiki) — query penanda dikunci ke `selectedMapId`, sinkronkan!
`useAtlas(selectedMapId)` meng-query `mapMarkers` per `selectedMapId`, sedangkan peta yang tampil pakai fallback `activeMap = maps.find(...) ?? maps[0]`. Bila `selectedMapId` `undefined` (mis. setelah refresh/pindah panel) sementara peta pertama tetap tampil lewat fallback → query penanda mengembalikan `[]` → **pin/area/rute tersimpan tapi tak tampil, & penanda baru seolah gagal disimpan**. **Solusi:** efek di `AtlasPanel` mengunci `selectedMapId` ke `maps[0].id` begitu daftar termuat. Jaga `selectedMapId` selalu = id peta yang benar-benar dirender.

## Edit penanda (v1.1) — buatan sendiri di atas Leaflet
Mode edit per-penanda terpilih (toggle di `MarkerSidebar`, eksklusif dgn mode gambar, mati saat pilihan berganti). `editLayer` di `MapCanvas`: pin = satu handle draggable; area/route = handle vertex (seret), handle titik-tengah (klik = sisip), klik-kanan vertex = hapus (min area 3 / route 2). **Persist saat `dragend`/ubah struktur** (bukan tiap piksel); saat drag hanya `shape.setLatLngs` live. Penanda yang sedang diedit **di-skip** dari `markerLayer` (digambar di `editLayer`) agar tak dobel. Nol dependensi (belum pakai `leaflet-editable`).

**Saat menambah analitik/tampilan (wilayah yatim, overlay timeline, heatmap): turunkan dari `PresenceIndex`/`mapGeometry.ts` di `src/lib/atlasAnalytics.ts` + tes, tambah SATU layer — jangan tambah tabel/FK.**
