/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { backupService } from '@/src/services/backupService';
import { syncProjectToDrive } from '@/src/services/driveBackupService';
import { clearGoogleSession, getAccessToken } from '@/src/services/googleAuth';
import { useToast } from '@/src/hooks/useToast';
import { saveFolderHandle, loadFolderHandle, ensureDirPermission } from '@/src/lib/folderHandleStore';

// Shim for requestIdleCallback
const idleCallback = (cb: IdleRequestCallback) => {
  if ('requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(cb);
  }
  return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1);
};

const cancelIdle = (id: number) => {
  if ('cancelIdleCallback' in window) {
    return (window as any).cancelIdleCallback(id);
  }
  clearTimeout(id);
};

// Hasil terakhir per-lapisan backup. `null` = lapisan tak dikonfigurasi/tak berlaku.
// 'skipped' = terkonfigurasi tapi dilewati siklus ini (mis. izin folder belum diberi).
type BackupOutcome = 'ok' | 'error' | 'skipped' | 'reauth';
export type LayerResult = { status: BackupOutcome; time: number; lastSuccess?: number } | null;
export interface LayerStatuses {
  internal: LayerResult;
  folder: LayerResult;
  drive: LayerResult;
  file: LayerResult;
}

const EMPTY_LAYER_STATUS: LayerStatuses = { internal: null, folder: null, drive: null, file: null };

interface BackupContextType {
  recordBackupResult: (layer: keyof LayerStatuses, status: BackupOutcome) => void;
  isBackingUp: boolean;
  selectFolder: () => Promise<void>;
  triggerManualBackup: () => Promise<void>;
  folderName: string | null;
  isFileSystemSupported: boolean;
  layerStatus: LayerStatuses;
}

const BackupContext = createContext<BackupContextType | undefined>(undefined);

export function BackupProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [layerStatus, setLayerStatus] = useState<LayerStatuses>(() => {
    try {
      const raw = localStorage.getItem('backup_layer_status');
      const stored: LayerStatuses = { ...EMPTY_LAYER_STATUS, ...JSON.parse(raw ?? '{}') };
      const driveSuccess = Date.parse(localStorage.getItem('last_drive_sync_time') ?? '');
      if (Number.isFinite(driveSuccess)) {
        const drive = stored.drive;
        if (!drive || driveSuccess > drive.time) {
          stored.drive = { status: 'ok', time: driveSuccess, lastSuccess: driveSuccess };
        } else if (!drive.lastSuccess) {
          stored.drive = { ...drive, lastSuccess: drive.status === 'ok' ? drive.time : driveSuccess };
        }
      }
      return stored;
    } catch {
      return EMPTY_LAYER_STATUS;
    }
  });
  const layerStatusRef = useRef(layerStatus);
  const recordBackupResult = useCallback((layer: keyof LayerStatuses, status: BackupOutcome) => {
    const previous = layerStatusRef.current[layer];
    const time = Date.now();
    const lastSuccess = status === 'ok' ? time : previous?.lastSuccess ?? (previous?.status === 'ok' ? previous.time : undefined);
    const next = { ...layerStatusRef.current, [layer]: { status, time, lastSuccess } };
    layerStatusRef.current = next;
    setLayerStatus(next);
    try { localStorage.setItem('backup_layer_status', JSON.stringify(next)); } catch { /* kuota */ }
  }, []);
  
  const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const idleRef = useRef<number | null>(null);
  // Guard anti-tumpang-tindih dibaca lewat REF (bukan state) agar selalu nilai terkini
  // & agar `runBackup` tak bergantung pada state `isBackingUp` (dulu memicu efek timer
  // bongkar-pasang `setInterval` tiap siklus + guard baca closure basi).
  const isBackingUpRef = useRef(false);
  // BK10: cegah spam toast konflik/sesi-berakhir tiap siklus auto-backup; cukup
  // beri tahu sekali sampai sync berhasil (atau pengguna bertindak manual).
  const driveNoticeShownRef = useRef(false);

  // Inti backup. `isAuto` membedakan siklus terjadwal (boleh diam saat izin folder
  // belum diberi; notifikasi Drive di-dedup) dari aksi manual (gesture pengguna →
  // boleh prompt izin folder & selalu beri umpan balik).
  const runBackup = useCallback(async (isAuto: boolean) => {
    if (isBackingUpRef.current) return;
    isBackingUpRef.current = true;
    setIsBackingUp(true);
    try {
      const data = await backupService.collectAllData();

      // Layer 1: Internal DB
      try {
        await backupService.saveToInternalDB(data);
        recordBackupResult('internal', 'ok');
      } catch (err) {
        console.error("Internal DB backup failed:", err);
        toast.error("Gagal mencadangkan ke penyimpanan lokal.");
        recordBackupResult('internal', 'error');
      }

      // Layer 2: External Folder (if selected)
      if (directoryHandleRef.current) {
        const handle = directoryHandleRef.current;
        // Izin folder bisa hilang setelah reload (BK6): minta ulang hanya saat aksi
        // manual (gesture); saat auto, lewati diam-diam bila belum diizinkan.
        const allowed = await ensureDirPermission(handle, !isAuto);
        if (allowed) {
          try {
            await backupService.saveToDirectory(data, handle);
            recordBackupResult('folder', 'ok');
          } catch (err) {
            console.error("External backup failed:", err);
            toast.error("Gagal mencadangkan ke folder terpilih. Periksa izin folder.");
            recordBackupResult('folder', 'error');
          }
        } else {
          // Terkonfigurasi tapi izin belum diberi → dilewati (senyap saat auto).
          recordBackupResult('folder', 'skipped');
          if (!isAuto) {
            toast.error("Izin folder cadangan dibutuhkan. Pilih ulang folder untuk mengaktifkan kembali.");
          }
        }
      }

      // Layer 3: Google Drive (if authenticated)
      try {
        const token = await getAccessToken();
        if (token) {
          const driveSuccess = await syncProjectToDrive();
          if (!driveSuccess) {
            throw new Error("DRIVE_SYNC_FAILED");
          }
          driveNoticeShownRef.current = false; // sync sukses → izinkan notifikasi lagi
          recordBackupResult('drive', 'ok');
        }
      } catch (err) {
        console.error("Google Drive sync failed:", err);
        const isConflict = err instanceof Error && err.message === 'CONFLICT_DETECTED';
        const isExpired = err instanceof Error && err.message === 'TOKEN_EXPIRED';
        if (isExpired) clearGoogleSession();
        // Untuk konflik/sesi-berakhir saat auto: tampilkan sekali saja (BK10).
        const suppress = isAuto && (isConflict || isExpired) && driveNoticeShownRef.current;
        if (!suppress) {
          if (isConflict) {
            toast.error("Konflik Google Drive: Versi remote lebih baru! Harap sinkronkan manual.");
          } else if (isExpired) {
            toast.error("Sesi Google Anda telah berakhir. Harap login ulang di Pengaturan untuk melanjutkan pencadangan.");
          } else {
            toast.error("Gagal mencadangkan ke Google Drive.");
          }
          if (isConflict || isExpired) driveNoticeShownRef.current = true;
        }
        recordBackupResult('drive', isExpired ? 'reauth' : 'error');
      }
    } catch (error) {
      console.error("Auto-backup failed:", error);
      recordBackupResult('internal', 'error');
      if (directoryHandleRef.current) recordBackupResult('folder', 'skipped');
      toast.error("Gagal menyiapkan data cadangan. Periksa status simpan naskah lalu coba lagi.");
    } finally {
      isBackingUpRef.current = false;
      setIsBackingUp(false);
    }
  }, [toast, recordBackupResult]);

  // Ref selalu menunjuk `runBackup` terbaru → efek timer bisa berdeps `[]` (interval
  // dibangun SEKALI) tanpa memakai closure basi.
  const runBackupRef = useRef(runBackup);
  runBackupRef.current = runBackup;

  const triggerManualBackup = useCallback(() => runBackup(false), [runBackup]);

  const selectFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      directoryHandleRef.current = handle;
      setFolderName(handle.name);
      await saveFolderHandle(handle); // BK6: bertahan antar reload
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error("Failed to select folder:", err);
      }
    }
  };

  // BK6: pulihkan handle folder yang tersimpan saat mount agar konfigurasi folder
  // tak hilang setelah reload (izinnya diaktifkan ulang saat backup manual berikutnya).
  useEffect(() => {
    let cancelled = false;
    loadFolderHandle().then((handle) => {
      if (!cancelled && handle) {
        directoryHandleRef.current = handle;
        setFolderName(handle.name);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // BK11: setelah reload izin folder hangus jadi 'prompt', sehingga backup auto
  // melewati lapisan 2 diam-diam sampai pengguna picu manual. Browser melarang
  // requestPermission tanpa gesture, jadi kita pasang listener gesture SATU KALI:
  // pada interaksi pertama pengguna (klik/ketik), izin folder diaktifkan ulang
  // otomatis — tak perlu buka Pengaturan & klik "Picu Pencadangan Lokal".
  // Bila izin sudah 'granted' (mis. PWA terinstall dengan izin persisten),
  // listener tak dipasang sama sekali.
  useEffect(() => {
    if (!folderName) return; // tak ada folder terkonfigurasi
    const handle = directoryHandleRef.current;
    if (!handle) return;

    let cancelled = false;
    const events = ['pointerdown', 'keydown'] as const;

    const remove = () => {
      for (const ev of events) window.removeEventListener(ev, onGesture, true);
    };

    const onGesture = async () => {
      remove();
      try {
        await ensureDirPermission(handle, true);
      } catch {
        // Diam: pengguna boleh menolak; siklus auto berikutnya tetap aman dilewati.
      }
    };

    // queryPermission tak butuh gesture; hanya pasang listener bila memang belum diizinkan.
    ensureDirPermission(handle, false).then((granted) => {
      if (cancelled || granted) return;
      for (const ev of events) window.addEventListener(ev, onGesture, true);
    });

    return () => {
      cancelled = true;
      remove();
    };
  }, [folderName]);

  useEffect(() => {
    const runBackupTask = () => {
      idleRef.current = idleCallback(() => {
        runBackupRef.current(true); // baca runBackup terbaru via ref
      });
    };

    const startTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);

      const intervalMinutes = parseInt(localStorage.getItem('backup_interval') || '30');
      const intervalMs = intervalMinutes * 60 * 1000;

      timerRef.current = setInterval(runBackupTask, intervalMs);
    };

    startTimer();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'backup_interval') {
        startTimer();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (idleRef.current) cancelIdle(idleRef.current);
      window.removeEventListener('storage', handleStorage);
    };
    // Dibangun SEKALI: interval tak lagi bongkar-pasang tiap siklus backup. Perubahan
    // interval ditangani listener `storage`; `runBackup` terbaru dibaca via ref.
  }, []);

  return (
    <BackupContext.Provider value={{
      recordBackupResult,
      isBackingUp,
      selectFolder,
      triggerManualBackup,
      get folderName() { return folderName; },
      isFileSystemSupported: 'showDirectoryPicker' in window,
      layerStatus
    }}>
      {children}
    </BackupContext.Provider>
  );
}

export function useAutoBackup() {
  const context = useContext(BackupContext);
  if (context === undefined) {
    throw new Error('useAutoBackup must be used within a BackupProvider');
  }
  return context;
}
