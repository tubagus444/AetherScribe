import React, { useState, useRef } from 'react';
import { Upload, Download, Database, FileArchive, FolderInput } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { backupService, BackupData } from '@/src/services/backupService';
import { summarizeProjectBackup, importedProjectName, type ProjectBackupCounts } from '@/src/lib/importRemap';
import { invalidateContextCache } from '@/src/services/contextEngine';
import { useProject } from '@/src/contexts/ProjectContext';
import { useToast } from '@/src/hooks/useToast';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { readBackupFile } from '@/src/lib/backupIO';

export function ManualBackupSection() {
  const { toast } = useToast();
  const { projectId: activeProjectId, switchProject } = useProject();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExportingProject, setIsExportingProject] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // null = ikut proyek aktif; angka = pilihan eksplisit dari dropdown.
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  // Cadangan yang sudah di-parse & tervalidasi, menunggu konfirmasi pengguna.
  const [pendingRestore, setPendingRestore] = useState<BackupData | null>(null);
  // File impor per-novel tervalidasi + ringkasan jumlah, menunggu konfirmasi.
  const [pendingImport, setPendingImport] = useState<{ backup: BackupData; counts: ProjectBackupCounts } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const projects = useLiveQuery(() => db.projects.orderBy('lastOpened').reverse().toArray(), []);
  const effectiveProjectId = selectedProjectId ?? activeProjectId ?? projects?.[0]?.id ?? null;

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const resetImportInput = () => {
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      // Satu sumber kebenaran: termasuk chatSessions & versi terbaru.
      const backup = await backupService.collectAllData();

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aetherscribe-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Cadangan berhasil diekspor.');
    } catch (error) {
      console.error('Failed to create backup:', error);
      toast.error('Gagal membuat cadangan. Lihat konsol untuk detailnya.');
    } finally {
      setIsBackingUp(false);
    }
  };

  // Ekspor satu novel sebagai file mandiri (#4). Berbeda dari "Ekspor Semua": hanya
  // proyek terpilih, cocok untuk arsip / memindahkan satu novel.
  const handleExportProject = async () => {
    if (effectiveProjectId == null) return;
    setIsExportingProject(true);
    try {
      const backup = await backupService.collectProjectData(effectiveProjectId);
      const safeName = (backup.projectName || 'proyek')
        .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proyek';
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aetherscribe-${safeName}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Novel “${backup.projectName}” berhasil diekspor.`);
    } catch (error) {
      console.error('Failed to export project:', error);
      toast.error('Gagal mengekspor novel. Lihat konsol untuk detailnya.');
    } finally {
      setIsExportingProject(false);
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  // Parse & validasi file, lalu buka dialog konfirmasi (tanpa menyentuh DB dulu).
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const backup = await readBackupFile(file) as BackupData;

      if (!backup.data || !backup.data.projects) {
        throw new Error("Format file cadangan tidak valid");
      }

      // Guard (#4): jalur ini adalah restore-PENUH (meng-clear semua tabel). File ekspor
      // satu novel akan menghapus proyek lain bila dipulihkan di sini — arahkan pengguna
      // ke tombol "Impor Novel" (non-destruktif, menambah sebagai proyek baru).
      if (backup.scope === 'project') {
        toast.error(
          `Ini file ekspor satu novel${backup.projectName ? ` (“${backup.projectName}”)` : ''}. ` +
          'Gunakan tombol “Impor Novel” di bawah untuk menambahkannya sebagai proyek baru.'
        );
        resetFileInput();
        return;
      }

      await backupService.validateInput(backup, 'all');
      setPendingRestore(backup);
    } catch (error) {
      console.error('Failed to read backup:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal membaca file cadangan.');
      resetFileInput();
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  // Parse & validasi file ekspor per-novel, lalu buka dialog konfirmasi impor.
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let backup: any;
    try {
      backup = await readBackupFile(file);
    } catch (error) {
      console.error('Failed to read import file:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal membaca file cadangan.');
      resetImportInput();
      return;
    }

    try {
      // Fail-closed: hanya menerima file ekspor SATU novel (scope:'project').
      await backupService.validateInput(backup, 'project');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'File impor tidak valid.');
      resetImportInput();
      return;
    }

    setPendingImport({ backup, counts: summarizeProjectBackup(backup.data) });
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      // Non-destruktif: menambah proyek BARU (remap id di service), tak menyentuh yang ada.
      const { projectId: newId } = await backupService.importProjectData(pendingImport.backup);
      await invalidateContextCache(true); // konteks/embedding di-regenerasi utk proyek baru
      await switchProject(newId);         // pindah ke proyek yang baru diimpor (tanpa reload)
      const name = importedProjectName(pendingImport.backup.projectName);
      setPendingImport(null);
      setIsImporting(false);
      resetImportInput();
      toast.success(`Novel “${name}” berhasil diimpor sebagai proyek baru.`);
    } catch (error) {
      console.error('Failed to import project:', error);
      const msg = error instanceof Error
        ? error.message
        : 'Gagal mengimpor novel. Pastikan ini file ekspor per-novel yang valid.';
      toast.error(msg);
      setIsImporting(false);
      setPendingImport(null);
      resetImportInput();
    }
  };

  const cancelImport = () => {
    setPendingImport(null);
    resetImportInput();
  };

  // Nama hasil impor (ber-suffix) + apakah sudah ada novel bernama serupa. Peringatan
  // saja — impor tetap dibuat sebagai salinan terpisah bila pengguna melanjutkan.
  const importBaseName = pendingImport?.backup.projectName ?? '';
  const importTargetName = pendingImport ? importedProjectName(importBaseName) : '';
  const importNameClash = pendingImport
    ? !!projects?.some((p) => p.name === importBaseName || p.name === importTargetName)
    : false;

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setIsRestoring(true);
    try {
      // Satu sumber kebenaran restore (verifikasi checksum + snapshot pra-pemulihan
      // + clear semua tabel, atomik). Lihat backupService.restoreData.
      await backupService.restoreData(pendingRestore);
      setPendingRestore(null);
      toast.success('Pemulihan berhasil! Memuat ulang…');
      setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      console.error('Failed to restore backup:', error);
      // Tampilkan alasan penolakan schema/aset atau kegagalan snapshot pengaman.
      const msg = error instanceof Error
        ? error.message
        : 'Gagal memulihkan dari file cadangan.';
      toast.error(msg);
      setIsRestoring(false);
      setPendingRestore(null);
      resetFileInput();
    }
  };

  const cancelRestore = () => {
    setPendingRestore(null);
    resetFileInput();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Database size={18} className="text-indigo-500" />
        <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">Operasi Manual</h3>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ekspor seluruh ruang kerja Anda atau pulihkan dari cadangan JSON yang ada. Memulihkan akan menimpa data yang ada.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleBackup}
            disabled={isBackingUp}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            <Download size={18} className="text-slate-500 dark:text-slate-400" />
            {isBackingUp ? 'Mengekspor...' : 'Ekspor Semua Cadangan'}
          </button>

          <input
            type="file"
            accept=".json,.gz"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            onClick={handleRestoreClick}
            disabled={isRestoring}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            <Upload size={18} className="text-slate-500 dark:text-slate-400" />
            {isRestoring ? 'Memulihkan...' : 'Kembalikan dari JSON'}
          </button>
        </div>
      </div>

      {/* Per-novel (#4): arsipkan/pindahkan satu novel; impor kembali sbg proyek baru. */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <FileArchive size={16} className="text-indigo-500" />
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ekspor &amp; Impor Per-Novel</h4>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ekspor <strong>satu novel</strong> sebagai file mandiri (untuk arsip/pindah), atau impor file seperti itu
          sebagai <strong>proyek baru</strong>. Impor bersifat menambah — proyek Anda yang lain tidak tersentuh.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <select
            value={effectiveProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
            disabled={isExportingProject || !projects?.length}
            className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm transition-colors disabled:opacity-50"
          >
            {projects?.length
              ? projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))
              : <option value="">Tidak ada proyek</option>}
          </select>

          <button
            onClick={handleExportProject}
            disabled={isExportingProject || effectiveProjectId == null}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            <Download size={18} className="text-slate-500 dark:text-slate-400" />
            {isExportingProject ? 'Mengekspor...' : 'Ekspor Novel Ini'}
          </button>
        </div>

        <input
          type="file"
          accept=".json,.gz"
          ref={importInputRef}
          onChange={handleImportFileChange}
          className="hidden"
        />
        <button
          onClick={handleImportClick}
          disabled={isImporting}
          className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
        >
          <FolderInput size={18} className="text-slate-500 dark:text-slate-400" />
          {isImporting ? 'Mengimpor...' : 'Impor Novel (sebagai proyek baru)'}
        </button>
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        tone="danger"
        title="Timpa semua data?"
        confirmLabel="Ya, pulihkan"
        busy={isRestoring}
        onConfirm={confirmRestore}
        onCancel={cancelRestore}
        message={
          <>
            Ini akan <strong>menimpa SEMUA proyek, bab, dan entri</strong> Anda saat ini dengan data dari file cadangan.
            Sebuah titik <strong>“Sebelum pemulihan”</strong> otomatis dibuat agar Anda bisa membatalkannya.
          </>
        }
      />

      <ConfirmDialog
        open={pendingImport !== null}
        tone="default"
        title="Impor sebagai proyek baru?"
        confirmLabel="Ya, impor"
        busy={isImporting}
        onConfirm={confirmImport}
        onCancel={cancelImport}
        message={
          pendingImport ? (
            <>
              Akan ditambahkan sebagai <strong>proyek baru</strong> bernama <strong>“{importTargetName}”</strong>
              {' '}({pendingImport.counts.chapters} bab, {pendingImport.counts.codex} codex, {pendingImport.counts.timeline} timeline,
              {' '}{pendingImport.counts.relationships} relasi
              {pendingImport.counts.plotPromises > 0 && <>, {pendingImport.counts.plotPromises} janji plot</>}). Proyek Anda yang lain <strong>tidak tersentuh</strong>.
              {importNameClash && (
                <span className="mt-3 block text-amber-600 dark:text-amber-400">
                  ⚠ Sudah ada novel dengan nama serupa. Impor tetap dibuat sebagai salinan terpisah.
                </span>
              )}
            </>
          ) : null
        }
      />
    </section>
  );
}
