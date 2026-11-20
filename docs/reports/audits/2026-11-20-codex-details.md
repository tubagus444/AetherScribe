# Verifikasi detail tambahan Codex — 20 November 2026

- Uji Chromium membuat detail tunggal dan detail dengan riwayat, mencatat
  bab di luar urutan input, membuka riwayat, lalu mengedit nilai terbaru.
- Uji konteks AI mencakup mode caching dan pencarian relevansi, izin AI,
  hasil pencarian yang menyimpan versi izin lama, perpindahan urutan bab,
  serta riwayat untuk audit. Respons penyedia eksternal tidak diperlukan.
- Uji cadangan memastikan remap riwayat ke bab salinan, penolakan tautan
  lintas proyek, dan pemeliharaan catatan saat bab sumber dihapus.

| Pemeriksaan lokal | Hasil |
| --- | --- |
| `npm run test:run` | 831 lulus dalam 94 berkas |
| `npm run test:e2e -- e2e/dataUi.spec.ts -g Codex` | 6 lulus |
| `npm run lint`, `npm run lint:strict`, `npm run lint:maintenance` | Lulus |
| `npm run build` | Lulus |
