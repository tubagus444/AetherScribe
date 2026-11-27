import React, { useState, useRef } from 'react';
import { Upload, Download, Database, FileArchive, FolderInput } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { backupService } from '@/src/services/backupService';
import type { BackupScope } from '@/src/lib/backupFormat';
import type { BackupRecord } from '@/src/types';
import { summarizeProjectBackup, importedProjectName, type ProjectBackupCounts } from '@/src/lib/importRemap';
import { invalidateContextCache } from '@/src/services/contextEngine';
import { useProject } from '@/src/contexts/ProjectContext';
import { useToast } from '@/src/hooks/useToast';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { readBackupFile } from '@/src/lib/backupIO';
import { useAutoBackup } from '@/src/hooks/useAutoBackup';
import { BackupStatus } from './AutoBackupSection';

const backupDateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

function formatBackupDate(timestamp: number) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? backupDateFormat.format(date) : 'Tanggal tidak tersedia';
}

export function ManualBackupSection({ internalBackups }: { internalBackups: BackupRecord[] | undefined }) {
  const { toast } = useToast();
  const { layerStatus, recordBackupResult } = useAutoBackup();
  const { projectId: activeProjectId, switchProject } = useProject();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExportingProject, setIsExportingProject] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // null = ikut proyek aktif; angka = pilihan eksplisit dari dropdown.
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  // Cadangan yang sudah di-parse & tervalidasi, menunggu konfirmasi pengguna.
  const [pendingRestore, setPendingRestore] = useState<{ input: unknown; fileName: string; timestamp: number; projectCount: number } | null>(null);
  // File impor per-novel tervalidasi + ringkasan jumlah, menunggu konfirmasi.
  const [pendingImport, setPendingImport] = useState<{ input: unknown; projectName?: string; counts: ProjectBackupCounts } | null>(null);
  const [readingScope, setReadingScope] = useState<BackupScope | null>(null);
  const readingFile = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const projects = useLiveQuery(() => db.projects.orderBy('lastOpened').reverse().toArray(), []);
  const effectiveProjectId = selectedProjectId ?? activeProjectId ?? projects?.[0]?.id ?? null;
  const latestLocalBackup = internalBackups?.[0];
  const fileActionBusy = readingScope !== null || pendingRestore !== null || pendingImport !== null || isRestoring || isImporting;

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      // Satu sumber kebenaran: termasuk chatSessions & versi terbaru.
      const backup = await backupService.collectAllData();

      const { blob, compressed } = await backupService.prepareBackupDownload(backup);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aetherscribe-backup-${new Date().toISOString().split('T')[0]}.json${compressed ? '.gz' : ''}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      recordBackupResult('file', 'ok');
      toast.success('Unduhan cadangan dimulai. Periksa hasilnya di daftar unduhan peramban.');
    } catch (error) {
      console.error('Failed to create backup:', error);
      recordBackupResult('file', 'error');
      toast.error(error instanceof Error ? error.message : 'Gagal membuat cadangan.');
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
      const { blob, compressed } = await backupService.prepareBackupDownload(backup);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aetherscribe-${safeName}-${new Date().toISOString().split('T')[0]}.json${compressed ? '.gz' : ''}`;
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

  const inspectFile = async (event: React.ChangeEvent<HTMLInputElement>, scope: BackupScope) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || readingFile.current || fileActionBusy) return;

    readingFile.current = true;
    setReadingScope(scope);
    try {
      const input = await readBackupFile(file);
      const verified = await backupService.validateInput(input, scope);
      // Keep the original archive for the service's checksum check on confirmation.
      if (scope === 'all') {
        setPendingRestore({ input, fileName: file.name, timestamp: verified.timestamp, projectCount: verified.data.projects.length });
      } else {
        setPendingImport({ input, projectName: verified.projectName, counts: summarizeProjectBackup(verified.data) });
      }
    } catch (error) {
      toast.error(error instanceof SyntaxError ? 'Isi file cadangan harus berupa JSON yang valid.'
        : error instanceof Error ? error.message : 'Gagal membaca file cadangan.');
    } finally {
      readingFile.current = false;
      setReadingScope(null);
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      // Non-destruktif: menambah proyek BARU (remap id di service), tak menyentuh yang ada.
      const { projectId: newId } = await backupService.importProjectData(pendingImport.input);
      await invalidateContextCache(true); // konteks/embedding di-regenerasi utk proyek baru
      await switchProject(newId);         // pindah ke proyek yang baru diimpor (tanpa reload)
      const name = importedProjectName(pendingImport.projectName);
      setPendingImport(null);
      setIsImporting(false);
      toast.success(`Novel “${name}” berhasil diimpor sebagai proyek baru.`);
    } catch (error) {
      console.error('Failed to import project:', error);
      const msg = error instanceof Error
        ? error.message
        : 'Gagal mengimpor novel. Pastikan ini file ekspor per-novel yang valid.';
      toast.error(msg);
      setIsImporting(false);
      setPendingImport(null);
    }
  };

  const cancelImport = () => {
    setPendingImport(null);
  };

  // Nama hasil impor (ber-suffix) + apakah sudah ada novel bernama serupa. Peringatan
  // saja — impor tetap dibuat sebagai salinan terpisah bila pengguna melanjutkan.
  const importBaseName = pendingImport?.projectName ?? '';
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
      await backupService.restoreData(pendingRestore.input);
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
    }
  };

  const cancelRestore = () => {
    setPendingRestore(null);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Database size={18} className="text-indigo-500" />
        <h3 className="text-md font-semibold text-slate-900 dark:text-slate-100">Cadangan ruang kerja</h3>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1 text-sm">
            <p className="font-medium">Titik pulih terakhir di peramban</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {latestLocalBackup ? formatBackupDate(latestLocalBackup.timestamp)
                : internalBackups ? 'Belum ada titik pulih lokal.' : 'Memuat titik pulih…'}
            </p>
          </div>
          <a href="#titik-pulih-lokal" className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
            Lihat titik pulih lokal
          </a>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Titik pulih tersimpan di peramban ini. Unduh cadangan mandiri berisi seluruh ruang kerja dan aset gambar untuk disimpan di luar peramban.
        </p>
        {layerStatus.file && <BackupStatus result={layerStatus.file} successLabel="Unduhan terakhir dimulai" okLabel="Unduhan dimulai" />}

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            type="button"
            onClick={handleBackup}
            disabled={isBackingUp}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download size={18} className="shrink-0" aria-hidden="true" />
            {isBackingUp ? 'Menyiapkan unduhan…' : 'Unduh cadangan ruang kerja'}
          </button>

          <input
            type="file"
            accept=".json,.gz"
            ref={fileInputRef}
            onChange={event => void inspectFile(event, 'all')}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => { if (!fileActionBusy) fileInputRef.current?.click(); }}
            aria-disabled={fileActionBusy}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-sm transition-colors shadow-sm aria-disabled:opacity-50"
          >
            <Upload size={18} className="text-slate-500 dark:text-slate-400" />
            {readingScope === 'all' ? 'Memeriksa file…' : isRestoring ? 'Memulihkan…' : 'Pulihkan seluruh ruang kerja'}
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
            onChange={event => void inspectFile(event, 'project')}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => { if (!fileActionBusy) importInputRef.current?.click(); }}
          aria-disabled={fileActionBusy}
          className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-sm transition-colors shadow-sm aria-disabled:opacity-50"
        >
          <FolderInput size={18} className="text-slate-500 dark:text-slate-400" />
          {readingScope === 'project' ? 'Memeriksa file…' : isImporting ? 'Mengimpor…' : 'Impor satu novel sebagai proyek baru'}
        </button>
      </div>
      <p className="sr-only" role="status">{readingScope ? 'Memeriksa file cadangan…' : ''}</p>

      <ConfirmDialog
        open={pendingRestore !== null}
        tone="danger"
        title="Timpa semua data?"
        confirmLabel="Ya, pulihkan"
        busy={isRestoring}
        onConfirm={confirmRestore}
        onCancel={cancelRestore}
        message={
          pendingRestore && (
            <div className="space-y-3">
              <dl className="space-y-1">
                <div><dt className="inline font-semibold">File </dt><dd className="inline break-all">{pendingRestore.fileName}</dd></div>
                <div><dt className="inline font-semibold">Tanggal cadangan </dt><dd className="inline">{formatBackupDate(pendingRestore.timestamp)}</dd></div>
                <div><dt className="inline font-semibold">Jumlah novel </dt><dd className="inline">{pendingRestore.projectCount}</dd></div>
              </dl>
              <p>Pemulihan akan <strong>mengganti seluruh ruang kerja ini</strong>. AetherScribe akan membuat titik <strong>Sebelum pemulihan</strong> sebelum mengubah data.</p>
            </div>
          )
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
