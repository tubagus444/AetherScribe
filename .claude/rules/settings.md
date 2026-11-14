---
paths:
  - "src/components/panels/settings/**"
  - "src/components/panels/SettingsPanel.tsx"
---

# Panel Pengaturan (UI1)

**`SettingsPanel` sengaja dipecah tipis.** `src/components/panels/SettingsPanel.tsx` hanya shell tab. Isinya di `src/components/panels/settings/`: tab `AISettingsTab`/`BackupTab` (container tipis) + `sections/` (`AIPreferences`, `AdvancedAIOptimization`, `ApiCredentials`, `OllamaConfig`, `SemanticCacheSection`, `ManualBackupSection`, `AutoBackupSection`).

**Semua baca/tulis localStorage pengaturan AI lewat hook `useAISettings.ts` (sumber tunggal load+save), tes koneksi lewat `useConnectionTest.ts`.** Saat menambah tunable AI baru: tambahkan state+persist di `useAISettings`, render di section yang relevan — **jangan tulis `localStorage` langsung di komponen** (mencegah panel membengkak jadi god-component lagi). Tombol/kotak error "Cek koneksi" pakai `ConnectionTestButton`/`ConnectionTestError` (jangan duplikasi).

F27: useAISettings mendelegasikan key ke credentialStore bersama facade. Perubahan mode hanya berlaku pada Save; jangan menghapus key legacy saat mount. Clear membersihkan dua storage dan isian tab ini. Jelaskan batas sesi, Base64 bukan enkripsi, tab lain/env server dan request/retry berjalan. Error storage harus tampil tanpa status sukses.
