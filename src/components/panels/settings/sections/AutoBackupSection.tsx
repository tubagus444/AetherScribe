import React, { useState } from 'react';
import { RefreshCcw, Loader2, FolderOpen, History, Database, Cloud, Upload, Check, X, MinusCircle } from 'lucide-react';
import { backupService } from '@/src/services/backupService';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { useAutoBackup, LayerResult } from '@/src/hooks/useAutoBackup';
import { useDriveSync } from '@/src/hooks/useDriveSync';
import { useToast } from '@/src/hooks/useToast';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';

// Restore yang menunggu konfirmasi — bisa dari cadangan internal atau file Drive.
type PendingRestore =
  | { source: 'internal'; id: number; label: string }
  | { source: 'drive'; fileId: string; label: string };

// Badge status hasil backup terakhir per-lapisan (agar kegagalan senyap kelihatan).
function LayerBadge({ result }: { result: LayerResult }) {
  if (!result) return null;
  const map = {
    ok: { cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400', icon: <Check size={11} />, label: 'OK' },
    error: { cls: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400', icon: <X size={11} />, label: 'Gagal' },
    skipped: { cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400', icon: <MinusCircle size={11} />, label: 'Dilewati' },
  }[result.status];
  return (
    <span
      title={`${map.label} • ${format(result.time, 'PPP p')}`}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${map.cls}`}
    >
      {map.icon}{map.label}
    </span>
  );
}

export function AutoBackupSection() {
  const { toast } = useToast();
  const {
    lastBackupTime,
    isBackingUp: isAutoBackingUp,
    selectFolder,
    triggerManualBackup,
    folderName,
    isFileSystemSupported,
    layerStatus
  } = useAutoBackup();

  const driveSync = useDriveSync();

  const [backupInterval, setBackupInterval] = useState(() =>
    localStorage.getItem('backup_interval') || '30'
  );

  const internalBackups = useLiveQuery(() =>
    backupService.getBackupList(),
    []
  );

  const handleIntervalChange = (val: string) => {
    setBackupInterval(val);
    localStorage.setItem('backup_interval', val);
    // Storage event will trigger in App context if multi-tab,
    // or the Provider effect will pick it up if in same tab context
  };

  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const [isRestoringInternal, setIsRestoringInternal] = useState(false);

  const confirmPendingRestore = async () => {
    if (!pendingRestore) return;

    // Drive: delegasikan ke hook (menangani toast + reload + sesi berakhir).
    if (pendingRestore.source === 'drive') {
      const { fileId } = pendingRestore;
      setPendingRestore(null);
      await driveSync.restoreDriveBackup(fileId);
      return;
    }

    // Internal DB.
    setIsRestoringInternal(true);
    try {
      await backupService.restoreFromBackup(pendingRestore.id);
      setPendingRestore(null);
      toast.success('Pemulihan berhasil! Memuat ulang…');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error('Internal restore failed:', err);
      const msg = err instanceof Error
        ? err.message
        : 'Gagal memulihkan dari cadangan internal.';
      toast.error(msg);
      setIsRestoringInternal(false);
      setPendingRestore(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCcw size={18} className="text-indigo-500" />
          <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">Mesin Pencadangan Otomatis</h3>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-indigo-100 dark:border-indigo-800/50">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Aktif
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Database size={16} className="text-indigo-500" />
                Lapisan 1: IndexedDB
              </div>
              <div className="flex items-center gap-1.5">
                <LayerBadge result={layerStatus.internal} />
                {lastBackupTime && (
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    Terakhir: {format(lastBackupTime, 'HH:mm')}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Penyimpanan bergulir yang hening di dalam penyimpanan peramban Anda. Menyimpan riwayat berjenjang (terbaru, harian, mingguan) secara otomatis.
              {' '}Pemulihan gambar peta membutuhkan gambar yang masih tersedia di perangkat ini. Gunakan file atau Drive untuk cadangan gambar lengkap.
            </p>
          </div>
          <button
            onClick={triggerManualBackup}
            disabled={isAutoBackingUp}
            className="w-full h-10 flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-900/10 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm font-medium transition-colors border border-indigo-100 dark:border-indigo-800/30 disabled:opacity-50"
          >
            {isAutoBackingUp ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            Picu Pencadangan Lokal
          </button>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <FolderOpen size={16} className="text-indigo-500" />
                Lapisan 2: Folder Lokal
              </div>
              <LayerBadge result={layerStatus.folder} />
            </div>
            {!isFileSystemSupported ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 rounded-lg text-xs border border-amber-200 dark:border-amber-900/50 my-2">
                API Sistem File tidak didukung di peramban ini. Harap gunakan Chrome/Edge untuk sinkronisasi folder luring.
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Menulis file cadangan `.json` secara terus menerus ke dalam folder di dalam perangkat Anda.
              </p>
            )}
          </div>

          {isFileSystemSupported && (
            folderName ? (
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 truncate pr-2">
                  <FolderOpen size={16} className="text-slate-400" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{folderName}</span>
                </div>
                <button onClick={selectFolder} className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 font-medium px-2">Ubah</button>
              </div>
            ) : (
              <button
                onClick={selectFolder}
                className="w-full h-10 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                <FolderOpen size={16} />
                Pilih Folder Cadangan
              </button>
            )
          )}
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Cloud size={16} className="text-indigo-500" />
                Lapisan 3: Google Drive
              </div>
              <LayerBadge result={layerStatus.drive} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Sinkronkan cadangan utama ke akun Google Drive Anda.
            </p>
          </div>

          {driveSync.needsAuth ? (
            <div className="flex flex-col gap-3 mt-auto">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">
                  Google Client ID (BYOK)
                </label>
                <input
                  type="text"
                  placeholder="xxxxxxxxxx-xxxxxxxxxxxxx.apps.googleusercontent.com"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  defaultValue={localStorage.getItem('google_client_id') || ''}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (val) localStorage.setItem('google_client_id', val);
                    else localStorage.removeItem('google_client_id');
                  }}
                />
              </div>
              <button
                onClick={driveSync.handleLogin}
                disabled={driveSync.isLoggingIn}
                className="w-full h-10 flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {driveSync.isLoggingIn ? <Loader2 size={16} className="animate-spin text-slate-400" /> : <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>}
                Login Google
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
               <span className="text-[10px] text-slate-500 font-medium truncate">
                 {driveSync.user?.email}
               </span>
               <button
                 onClick={driveSync.triggerDriveSync}
                 disabled={driveSync.isSyncing}
                 className="w-full h-10 flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-900/10 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm font-medium transition-colors border border-indigo-100 dark:border-indigo-800/30 disabled:opacity-50"
               >
                 {driveSync.isSyncing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                 Kirim Cadangan
               </button>
               <button onClick={driveSync.handleLogout} className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline mt-1">Keluar</button>
            </div>
          )}
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm md:col-span-3 flex flex-col md:flex-row gap-6">
          {/* Interval */}
          <div className="w-full md:w-1/3 space-y-2">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Interval
            </label>
            <select
              value={backupInterval}
              onChange={(e) => handleIntervalChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
            >
              <option value="15">Setiap 15 Menit</option>
              <option value="30">Setiap 30 Menit</option>
              <option value="60">Setiap 1 Jam</option>
            </select>
          </div>

          {/* Internal History */}
          <div className="w-full md:w-2/3 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-6 flex flex-col">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
              <History size={14} />
              Titik Pulih Lokal
            </div>
            <div className="flex-1 space-y-2 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
              {internalBackups && internalBackups.length > 0 ? (
                internalBackups.map((backup) => (
                  <div key={backup.id} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700/50 transition-colors group">
                    <div className="flex flex-col">
                      <span className="text-slate-900 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5">
                        {format(backup.timestamp, 'MMM d, yyyy • HH:mm:ss')}
                        {backup.kind === 'pre-restore' && (
                          <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[9px] font-bold uppercase tracking-wide">
                            Sebelum pemulihan
                          </span>
                        )}
                      </span>
                      <span className="text-slate-500 dark:text-slate-500 text-[10px]">
                        Ukuran: {(backup.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      onClick={() => setPendingRestore({ source: 'internal', id: backup.id!, label: format(backup.timestamp, 'PPP p') })}
                      className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 rounded-md text-[11px] font-medium transition-all shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      Pulihkan
                    </button>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic py-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg">
                  Belum ada titik pemulihan tersedia.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Titik Pulih Google Drive: tampil saat sesi Drive aktif. Menutup loop
            pemulihan — unduh & pulihkan langsung dari Drive tanpa unduh manual. */}
        {!driveSync.needsAuth && (
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm md:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                <Cloud size={14} />
                Titik Pulih Google Drive
              </div>
              <button
                onClick={driveSync.loadDriveBackups}
                disabled={driveSync.isLoadingDriveBackups}
                className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
              >
                {driveSync.isLoadingDriveBackups ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
                Segarkan
              </button>
            </div>
            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
              {driveSync.isLoadingDriveBackups && !driveSync.driveBackups ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic py-6">
                  Memuat cadangan Drive…
                </div>
              ) : driveSync.driveBackups && driveSync.driveBackups.length > 0 ? (
                driveSync.driveBackups.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700/50 transition-colors group">
                    <div className="flex flex-col">
                      <span className="text-slate-900 dark:text-slate-200 text-xs font-semibold">
                        {format(new Date(file.createdTime), 'MMM d, yyyy • HH:mm:ss')}
                      </span>
                      <span className="text-slate-500 dark:text-slate-500 text-[10px]">
                        {file.size ? `Ukuran: ${(parseInt(file.size) / 1024).toFixed(1)} KB` : file.name}
                      </span>
                    </div>
                    <button
                      onClick={() => setPendingRestore({ source: 'drive', fileId: file.id, label: format(new Date(file.createdTime), 'PPP p') })}
                      disabled={driveSync.isRestoringDrive}
                      className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 rounded-md text-[11px] font-medium transition-all shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                    >
                      {driveSync.isRestoringDrive ? 'Memulihkan…' : 'Pulihkan'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic py-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg">
                  Belum ada cadangan di Google Drive.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        tone="danger"
        title="Timpa semua data?"
        confirmLabel="Ya, pulihkan"
        busy={isRestoringInternal}
        onConfirm={confirmPendingRestore}
        onCancel={() => setPendingRestore(null)}
        message={
          <>
            Memulihkan cadangan{pendingRestore ? ` dari ${pendingRestore.label}` : ''} akan
            {' '}<strong>menimpa SEMUA data</strong> Anda saat ini. Sebuah titik{' '}
            <strong>“Sebelum pemulihan”</strong> otomatis dibuat agar Anda bisa membatalkannya.
          </>
        }
      />
    </section>
  );
}
