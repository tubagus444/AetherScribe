# [ARSIP] Rencana & Arsitektur Atlas Dunia — AetherScribe

> **Arsip memori-proyek.** Spesifikasi awal dan rekam jejak implementasi fitur Atlas Dunia (Peta Interaktif).
> **Status: 100% SELESAI (v1.0 s/d v2.1 telah dikirim).**
> Untuk aturan operasional saat ini, buka [kontrak Atlas](../features.md#kontrak-atlas).

---

## 1. Konsep & Filosofi
- **Panel Peta Interaktif** (`viewMode 'atlas'`): Penulis mengunggah gambar peta dunia sendiri, menandai pin/wilayah/rute, menautkannya ke Codex/Faksi, serta memvisualisasikan kehadiran latar cerita.
- **Local-first & Nol-Token:** Sepenuhnya offline di atas Leaflet `CRS.Simple`, analitik deterministik berbasis `PresenceIndex`.

## 2. Arsitektur Teknis
- **Mesin Render:** Leaflet murni + `useEffect`/ref (tanpa wrapper React 19). Peta berupa `L.imageOverlay` dari Blob di IndexedDB.
- **Koordinat Relatif 0–1:** Penanda disimpan dalam rasio `0–1` (bukan piksel) via `src/lib/mapGeometry.ts` (+tes) sehingga tahan ganti resolusi gambar.
- **Model Data (Dexie v32):** Tabel `maps` dan `mapMarkers`. Sinkron 3-tempat: `importRemap.ts`, `ProjectContext.deleteProject`, dan `backupService.ts`.
- **Faksi & Pewarnaan:** Turunan dari `codexId` (berdasarkan entri ber-`factionTag`), tanpa tabel faksi terpisah.

---

## 3. Rekam Jejak Fitur Terkirim (v1.0 – v2.1)

| Versi | Fitur Utama | Catatan Implementasi |
|---|---|---|
| **v1.0** | Peta Interaktif Dasar | Upload gambar, pin, area (poligon), rute (polyline), tautan Codex, filter layer, sidebar kehadiran bab. |
| **v1.1** | Edit Penanda In-Canvas | Seret pin, geser vertex poligon/rute, sisip titik-tengah, klik-kanan hapus vertex via `editLayer`. |
| **v1.2** | Skala & Jarak Tempuh | Kalibrasi skala (`ScaleCalibrationModal`), profil kecepatan (`TravelSpeedSettingsModal`), kalkulasi jarak & waktu tempuh di `mapGeometry.ts`. |
| **v2.0** | Integrasi Dalam & Analitik | "Lihat di peta" dari Codex (deep-link dua-arah), deteksi wilayah yatim (`findOrphanMarkers`), overlay linimasa bab, kabut rahasia (`hidden` disensor), heatmap aktivitas adegan. |
| **v2.1** | Peta Bertingkat (Sub-Maps) | Relasi peta induk/anak via `linkedMapId`, mesin hierarki `atlasHierarchy.ts`, kartu pratinjau thumbnail, navigasi remah roti spasial, dan `MapHierarchyModal`. |
