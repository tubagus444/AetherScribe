import { useState, useEffect, useCallback } from 'react';
import { initAuth, googleSignIn, logout, getAccessToken, GoogleUser } from '../services/googleAuth';
import { syncProjectToDrive, listDriveBackups, restoreFromDrive, DriveBackupFile } from '../services/driveBackupService';
import { useToast } from './useToast';

export function useDriveSync() {
  const { toast } = useToast();
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[] | null>(null);
  const [isLoadingDriveBackups, setIsLoadingDriveBackups] = useState(false);
  const [isRestoringDrive, setIsRestoringDrive] = useState(false);

  useEffect(() => {
    initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
  }, []);

  const handleLogin = async () => {
    const clientId = localStorage.getItem('google_client_id');
    if (!clientId) {
       toast.warning('Silakan masukkan Google Client ID terlebih dahulu.');
       return;
    }
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn(clientId);
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
      toast.error('Login Google gagal. Periksa Client ID lalu coba lagi.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setDriveBackups(null);
  };

  const handleExpiredSession = () => {
    setNeedsAuth(true);
    setUser(null);
    setDriveBackups(null);
  };

  // Muat daftar cadangan Drive. Dipanggil otomatis saat terautentikasi (efek di
  // bawah) dan lewat tombol "Segarkan".
  const loadDriveBackups = useCallback(async () => {
    setIsLoadingDriveBackups(true);
    try {
      const files = await listDriveBackups();
      setDriveBackups(files);
    } catch (err) {
      console.error('Failed to load drive backups', err);
      if (err instanceof Error && err.message === 'TOKEN_EXPIRED') {
        handleExpiredSession();
        toast.error('Sesi Google Anda telah berakhir. Harap login ulang untuk melihat cadangan Drive.');
      } else {
        toast.error('Gagal memuat daftar cadangan dari Google Drive.');
      }
    } finally {
      setIsLoadingDriveBackups(false);
    }
  }, [toast]);

  // Auto-muat daftar begitu sesi aktif agar Titik Pulih Drive langsung tampil.
  useEffect(() => {
    if (!needsAuth) loadDriveBackups();
  }, [needsAuth, loadDriveBackups]);

  // Melakukan pemulihan sebenarnya. Konfirmasi (destruktif) ditangani komponen lewat
  // ConfirmDialog — hook ini hanya mengeksekusi + memberi umpan balik & reload.
  const restoreDriveBackup = async (fileId: string) => {
    setIsRestoringDrive(true);
    try {
      await restoreFromDrive(fileId);
      toast.success('Pemulihan dari Google Drive berhasil! Memuat ulang…');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error('Drive restore failed', err);
      if (err instanceof Error && err.message === 'TOKEN_EXPIRED') {
        handleExpiredSession();
        toast.error('Sesi Google Anda telah berakhir. Harap login ulang untuk memulihkan.');
      } else if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Gagal memulihkan dari Google Drive. Pastikan file cadangan valid.');
      }
      setIsRestoringDrive(false);
    }
  };

  const triggerDriveSync = async () => {
    setIsSyncing(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }

      // Use trigger a full DB backup
      const driveSuccess = await syncProjectToDrive();
      if (!driveSuccess) {
         throw new Error("DRIVE_SYNC_FAILED");
      }
      toast.success('Berhasil disinkronisasi ke Google Drive!');
      loadDriveBackups();
    } catch (err) {
      console.error('Drive sync failed', err);
      if (err instanceof Error && err.message === 'CONFLICT_DETECTED') {
         const force = window.confirm("Konflik: Ditemukan cadangan yang lebih baru di Google Drive (mungkin diedit di perangkat lain). Menimpa sekarang dapat menghilangkan data yang ada di Drive.\n\nApakah Anda ingin MENIMPA cadangan di Google Drive dengan versi lokal ini?");
         if (force) {
            try {
               const forceSuccess = await syncProjectToDrive(true);
               if (!forceSuccess) throw new Error("DRIVE_SYNC_FAILED");
               toast.success('Berhasil menimpa cadangan di Google Drive!');
               loadDriveBackups();
            } catch (forceErr) {
               console.error('Forced drive sync failed', forceErr);
               toast.error('Gagal menyinkronkan (timpa) ke Google Drive.');
            }
         } else {
            toast.info('Sinkronisasi dibatalkan. Untuk menarik versi Drive, gunakan "Titik Pulih Google Drive" di bawah.');
         }
      } else if (err instanceof Error && err.message === 'TOKEN_EXPIRED') {
         toast.error('Sesi Google Anda telah berakhir. Harap login ulang untuk melanjutkan sinkronisasi.');
         setNeedsAuth(true);
         setUser(null);
      } else {
         toast.error('Gagal menyinkronkan ke Google Drive.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    needsAuth,
    user,
    isLoggingIn,
    isSyncing,
    handleLogin,
    handleLogout,
    triggerDriveSync,
    driveBackups,
    isLoadingDriveBackups,
    isRestoringDrive,
    loadDriveBackups,
    restoreDriveBackup
  };
}
