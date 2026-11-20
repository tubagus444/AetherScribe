import { readBackupSnapshot } from './backupSnapshot';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '@/src/db';
import { PROJECT_IMPORT_TABLES, RESTORE_RECORD_TABLES, RESTORE_TABLES } from '@/src/lib/tableCatalog';
import type { BackupRecord } from '@/src/types';
import { BACKUP_FORMAT_VERSION, type BackupData, type BackupMapRecord, type BackupScope } from '@/src/lib/backupFormat';
import { backupChecksum } from '@/src/lib/backupEnvelope';
import { BACKUP_LIMITS } from '@/src/lib/backupLimits';
import {
  normalizeBackupData, preserveOrphanedSnapshots, serializePortableBackup, verifyBackup, verifyEmbeddedImage,
} from '@/src/lib/portableBackup';
import { selectBackupsToDelete, selectBackupToEvict } from '@/src/lib/backupRetention';
import { compressBackup, prepareInternalBackup } from '@/src/lib/internalBackupPreparation';
import { prepareAutoBackup, serializeInternalBackup } from './internalBackupWorker';
import { blobToDataUrl, dataUrlToBlob } from '@/src/lib/blobCodec';
import { validateBackup } from '@/src/lib/backupValidation';
import { decodeBackupText } from '@/src/lib/backupIO';
import {
  remapProjectDependents,
  remapTriage,
  summarizeProjectBackup,
  importedProjectName,
  type ProjectBackupData,
  type ProjectBackupCounts,
} from '@/src/lib/importRemap';

export type { BackupData } from '@/src/lib/backupFormat';

/**
 * Deteksi kegagalan kuota penyimpanan (IndexedDB penuh). Nama/kode berbeda antar
 * browser (Chrome: `QuotaExceededError`/code 22; Firefox: `NS_ERROR_DOM_QUOTA_REACHED`/
 * code 1014) → cek beberapa varian + pesan.
 */
function isQuotaError(err: any): boolean {
  if (!err) return false;
  const name = err.name || err.inner?.name; // Dexie membungkus DOMException di `inner`
  const code = err.code ?? err.inner?.code;
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014 ||
    /quota/i.test(String(err?.message || ''))
  );
}

export const backupService = {
  /** Ganti `imageBlob` (Blob) → `imageDataUrl` (base64) agar aman di JSON. */
  async serializeMaps(maps: any[]): Promise<BackupMapRecord[]> {
    return Promise.all(maps.map(async (m) => {
      const { imageBlob, imageDataUrl: _url, imageAssetId: _id, imageMissing: _missing, ...rest } = m;
      if (!(imageBlob instanceof Blob)) return { ...rest, imageMissing: true };
      const imageDataUrl = await blobToDataUrl(imageBlob);
      const imageAssetId = await this.computeChecksum(imageDataUrl);
      if (!imageAssetId) throw new Error('Tidak dapat menghitung identitas gambar cadangan. Gunakan browser dengan Web Crypto.');
      return { ...rest, imageDataUrl, imageAssetId };
    }));
  },

  /** Kebalikan `serializeMaps`: `imageDataUrl` → `imageBlob` (Blob). Async → panggil
   *  di LUAR transaksi Dexie; Blob/aset disiapkan sebelum clear. */
  async deserializeMaps(maps: BackupMapRecord[] = [], allowReferences = false) {
    const needsLive = allowReferences && maps.some(m => !m.imageDataUrl && !m.imageMissing);
    const liveMaps = needsLive ? await db.maps.toArray() : [];
    const assets = new Map<string, Blob>();
    const needed = new Set(maps.flatMap(m => m.imageAssetId && !m.imageDataUrl && !m.imageMissing ? [m.imageAssetId] : []));
    // Jangan menahan salinan base64 seluruh gambar live sekaligus hanya untuk
    // resolusi referensi. Hash satu per satu, berhenti setelah semua aset ditemukan.
    for (const live of liveMaps) {
      if (!needed.size) break;
      if (!(live.imageBlob instanceof Blob)) continue;
      const hash = await this.computeChecksum(await blobToDataUrl(live.imageBlob));
      if (hash && needed.has(hash)) { assets.set(hash, live.imageBlob); needed.delete(hash); }
    }
    return Promise.all(maps.map(async (m) => {
      const { imageDataUrl, imageAssetId, imageMissing, ...rest } = m;
      let imageBlob: Blob | undefined;
      if (imageDataUrl) {
        imageBlob = await dataUrlToBlob(imageDataUrl);
        await verifyEmbeddedImage(imageDataUrl, imageAssetId);
      } else if (!imageMissing) {
        if (allowReferences && imageAssetId) imageBlob = assets.get(imageAssetId);
        // Legacy v7 internal tidak menyimpan hash. Pertahankan hanya peta dengan
        // identitas & dimensi yang sama; versi gambar historis tidak dapat dibuktikan.
        if (allowReferences && !imageAssetId) {
          imageBlob = liveMaps.find(live => live.id === m.id && live.projectId === m.projectId &&
            live.createdAt === m.createdAt && live.width === m.width && live.height === m.height)?.imageBlob;
        }
        if (!(imageBlob instanceof Blob)) throw new Error(`Gambar peta “${m.name}” tidak tersedia. Gunakan cadangan lengkap dari file/Drive.`);
      }
      return { ...rest, imageBlob };
    }));
  },
  /**
   * Collects all data from the database.
   * Note: projectId is optional; if provided, technically we could filter,
   * but manual backup collects everything to ensure full redundancy.
   */
  async collectAllData(): Promise<BackupData> {
    const data = await readBackupSnapshot() as BackupData['data'];
    preserveOrphanedSnapshots(data);
    data.maps = await this.serializeMaps(data.maps ?? []);
    return {
      version: BACKUP_FORMAT_VERSION,
      timestamp: Date.now(),
      scope: 'all',
      imageMode: 'full',
      checksum: await this.computeChecksum(JSON.stringify(data)),
      data
    };
  },

  /**
   * Ekspor SATU proyek sebagai cadangan mandiri (#4). Menyaring tiap tabel ke proyek
   * `projectId`. `snapshots` dikunci per `chapterId` (bukan `projectId`) → dikumpulkan
   * lewat daftar id bab proyek ini. `embeddings`/`sceneEmbeddings` sengaja TIDAK ikut:
   * di-regenerasi dari codex/naskah setelah impor (hindari embedding basi + hemat ukuran).
   * Bentuk envelope identik dgn `collectAllData` (checksum sama) plus `scope:'project'`
   * agar jalur restore-penuh bisa menolaknya (lihat catatan di BackupData.scope).
   */
  async collectProjectData(projectId: number): Promise<BackupData> {
    const data = await readBackupSnapshot(projectId) as BackupData['data'];
    const project = data.projects[0];
    data.maps = await this.serializeMaps(data.maps ?? []);
    return {
      version: BACKUP_FORMAT_VERSION,
      timestamp: Date.now(),
      scope: 'project',
      imageMode: 'full',
      projectName: project.name,
      checksum: await this.computeChecksum(JSON.stringify(data)),
      data
    };
  },

  /**
   * SHA-256 hex dari string (dipakai untuk checksum integritas cadangan, #5).
   * Best-effort: bila `crypto.subtle` tak tersedia (konteks tak-aman/browser lawas),
   * kembalikan undefined → cadangan dibuat tanpa checksum, restore melewati verifikasi.
   */
  async computeChecksum(dataString: string): Promise<string | undefined> {
    return backupChecksum(dataString);
  },

  /**
   * Saves backup data to the internal IndexedDB 'backups' table.
   * Retensi berjenjang berlaku untuk cadangan otomatis. Gunakan gzip bila
   * tersedia, dengan JSON mentah sebagai fallback.
   */
  async saveToInternalDB(data: BackupData, kind: 'auto' | 'pre-restore' = 'auto'): Promise<void> {
    return serializeInternalBackup(async () => {
      const prepared = kind === 'auto' ? await prepareAutoBackup(data) : await prepareInternalBackup(data, kind);
      await this.addBackupResilient({
        timestamp: data.timestamp,
        ...prepared,
        kind
      });

      // Safety snapshots remain available independently of auto retention.
      const allBackups = await db.backups.orderBy('timestamp').toArray();
      const toDelete = selectBackupsToDelete(allBackups.filter(b => b.kind !== 'pre-restore'), b => b.timestamp);
      if (toDelete.length) {
        await db.backups.bulkDelete(toDelete.map(b => b.id!));
      }
    });
  },

  /**
   * Tambah satu cadangan dengan DEGRADASI saat kuota penuh. Dulu `db.backups.add`
   * dipanggil SEBELUM rotasi → `add` gagal justru saat penyimpanan hampir penuh (tak
   * ada ruang dibebaskan lebih dulu) & tanpa pemulihan. Kini: bila `add` melempar error
   * kuota, buang cadangan 'auto' TERTUA (JANGAN sentuh 'pre-restore' = jaring undo) lalu
   * coba lagi, berulang sampai berhasil atau tak ada lagi yang bisa dibuang.
   */
  async addBackupResilient(record: Omit<BackupRecord, 'id'>): Promise<void> {
    try {
      await db.backups.add(record as BackupRecord);
      return;
    } catch (err) {
      if (!isQuotaError(err)) throw err;
      console.warn('[Backup] Penyimpanan penuh saat menyimpan cadangan; membuang cadangan lama lalu mencoba lagi…');
    }

    // Evakuasi bertahap + retry.
    for (;;) {
      const evicted = await this.evictOldestAutoBackup();
      if (!evicted) {
        // Hanya tersisa 'pre-restore' (tak boleh dibuang) → menyerah dengan aman.
        throw new Error(
          'Penyimpanan penuh: cadangan otomatis tak dapat disimpan. Hapus data lama atau ekspor manuskrip ke file.'
        );
      }
      try {
        await db.backups.add(record as BackupRecord);
        return;
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        // Masih penuh → lanjut membuang cadangan berikutnya.
      }
    }
  },

  /**
   * Hapus cadangan 'auto' TERTUA untuk membebaskan ruang. Mengembalikan `false` bila
   * tak ada lagi yang aman dibuang. Dipertahankan: SEMUA 'pre-restore' (jaring undo) &
   * SATU cadangan 'auto' terbaru — agar lonjakan kuota tak menghapus seluruh riwayat
   * hanya demi memuat satu cadangan baru (yang bahkan mungkin tetap tak muat).
   */
  async evictOldestAutoBackup(): Promise<boolean> {
    const all = await db.backups.orderBy('timestamp').toArray();
    const victim = selectBackupToEvict(all, b => b.timestamp, b => b.kind === 'pre-restore');
    if (!victim?.id) return false;
    await db.backups.delete(victim.id);
    return true;
  },

  /**
   * Mengubah `BackupRecord.data` (string JSON lama, gzip bytes, atau bytes mentah
   * bila kompresi sempat gagal) kembali menjadi string JSON. Deteksi gzip via magic
   * bytes (0x1f 0x8b) agar robust tanpa bergantung penuh pada flag `compressed`.
   */
  async decodeInternalBackup(backup: BackupRecord): Promise<string> {
    const d = backup.data;
    return decodeBackupText(typeof d === 'string' ? d : d instanceof Uint8Array ? d : new Uint8Array(d as ArrayBuffer));
  },

  /**
   * Helper internal & sumber tunggal kompresi (dipakai juga driveBackupService).
   * Mengembalikan `{ blob, compressed }` agar pemanggil bisa menamai file dengan
   * benar: bila kompresi gagal/tak didukung, `compressed:false` → file JANGAN
   * diberi ekstensi `.gz` (lihat BK4) supaya restore tak salah memanggil
   * DecompressionStream pada data mentah.
   */
  async compressData(dataString: string): Promise<{ blob: Blob; compressed: boolean }> {
    return compressBackup(dataString);
  },

  serializeExternalBackup(data: BackupData, space?: number): string {
    return serializePortableBackup(data, space);
  },

  async prepareExternalBackup(data: BackupData) {
    const json = serializePortableBackup(data, undefined, BACKUP_LIMITS.jsonBytes);
    const encoded = await this.compressData(json);
    if (encoded.blob.size > BACKUP_LIMITS.fileBytes) {
      throw new Error('Ukuran file cadangan melewati batas yang diizinkan.');
    }
    return encoded;
  },

  /**
   * Writes the backup JSON to a file via File System Access API.
   */
  async saveToFile(data: BackupData, fileHandle: FileSystemFileHandle): Promise<void> {
    const json = this.serializeExternalBackup(data, 2);
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  },

  /**
   * Creates a new backup file in the specified directory with compression and versioning.
   */
  async saveToDirectory(data: BackupData, dirHandle: FileSystemDirectoryHandle): Promise<void> {
    // Write compressed data (ekstensi mengikuti hasil kompresi: .json.gz hanya bila
    // benar-benar ter-gzip; bila tidak → .json mentah agar bisa dipulihkan — BK4)
    const { blob, compressed } = await this.prepareExternalBackup(data);

    const ext = compressed ? '.json.gz' : '.json';
    const filename = `aetherscribe-autobackup-${new Date().toISOString().replace(/[:.]/g, '-')}${ext}`;
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // Rotasi berjenjang (#3): kumpulkan file cadangan + timestamp aktual (lastModified,
    // lebih andal daripada parsing ISO di nama file) lalu terapkan kebijakan retensi.
    const externalBackups: { name: string; timestamp: number }[] = [];
    // @ts-ignore - File System Access API Async Iterable
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.startsWith('aetherscribe-autobackup-')) {
            let ts = 0; // fallback: dianggap tertua → boleh dihapus lebih dulu
            try {
                const f = await (entry as FileSystemFileHandle).getFile();
                ts = f.lastModified;
            } catch { /* abaikan; pakai fallback 0 */ }
            externalBackups.push({ name: entry.name, timestamp: ts });
        }
    }

    const toDelete = selectBackupsToDelete(externalBackups, b => b.timestamp);
    for (const file of toDelete) {
        await dirHandle.removeEntry(file.name);
    }
  },

  /**
   * Schema dan checksum berlaku di boundary semua jalur restore/impor.
   * Salinan input tetap membawa data/checksum asli; normalisasi legacy dilakukan
   * setelah verifikasi, hanya pada data yang akan ditulis.
   */
  validateInput(input: unknown, scope: BackupScope) {
    return verifyBackup(input, scope);
  },

  /** Restore-penuh: validasi → resolusi gambar → snapshot pengaman lengkap →
   * clear/refill atomik. Cache embedding dibuang untuk regenerasi. */
  async restoreData(input: unknown): Promise<void> {
    const parsedData = await this.validateInput(input, 'all');
    const data = normalizeBackupData(parsedData);
    // Dekode/resolusi aset sebelum snapshot atau mutasi database.
    const mapRows = await this.deserializeMaps(data.maps, true);

    // Jaring undo (#2): potret state saat ini ke tabel `backups` (tak ikut di-clear
    // oleh transaksi restore) SEBELUM menimpa. Melindungi SEMUA jalur restore
    // (internal / file JSON / Drive) dari cadangan yang valid-sintaks tapi lossy.
    // Fail-closed: jangan mengganti workspace tanpa snapshot lengkap.
    try {
      const current = await this.collectAllData();
      validateBackup(current, 'all');
      await this.saveToInternalDB(current, 'pre-restore');
    } catch (err) {
      throw new Error('Pemulihan dibatalkan: gagal membuat cadangan pengaman pra-pemulihan. Data workspace belum diganti.', { cause: err });
    }

    await db.transaction('rw', RESTORE_TABLES.map(name => db[name]), async () => {
      // Cache turunan ikut dibersihkan untuk regenerasi.
      for (const name of RESTORE_TABLES) await db[name].clear();

      for (const name of RESTORE_RECORD_TABLES) {
        const rows = name === 'maps' ? mapRows : data[name];
        if (!rows?.length) continue;
        if (name === 'bible') {
          // Jaga indeks unik [projectId+key] pada jalur pemulihan.
          const seen = new Set<string>();
          const uniqueBible = rows.filter(entry => {
            const key = `${entry.projectId}|${entry.key}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          await db.bible.bulkAdd(uniqueBible);
        } else {
          const table: ReturnType<typeof db.table> = db[name];
          await table.bulkAdd(rows);
        }
      }
    });
  },

  /**
   * Restores data from an internal backup record.
   */
  async restoreFromBackup(backupId: number): Promise<void> {
    const backup = await db.backups.get(backupId);
    if (!backup) throw new Error('Backup not found');

    const json = await this.decodeInternalBackup(backup);
    const parsedData: unknown = JSON.parse(json);
    await this.restoreData(parsedData);
  },

  /**
   * Impor SATU novel dari file ekspor per-proyek (#4B) sebagai proyek BARU —
   * NON-DESTRUKTIF: hanya menambah baris, tak pernah clear/update/delete, sehingga
   * proyek lain tak tersentuh (undo = hapus proyek lewat ProjectContext.deleteProject).
   *
   * Karena PK numerik auto-increment tak unik lintas-ekspor, tiap baris di-insert TANPA
   * id lama (Dexie menetapkan id baru); proyek→bab→codex di-insert lebih dulu untuk
   * membangun peta id, lalu FK tabel dependen ditulis ulang oleh remapProjectDependents
   * (murni, teruji). Seluruhnya dalam satu transaksi (gagal → rollback).
   *
   * Pemanggil bertanggung jawab menyegarkan konteks (invalidateContextCache) & berpindah
   * ke proyek baru — service ini sengaja bebas dependensi pada worker/konteks.
   */
  async importProjectData(input: unknown): Promise<{ projectId: number; counts: ProjectBackupCounts }> {
    const backup = await this.validateInput(input, 'project');

    const data = normalizeBackupData(backup) as ProjectBackupData;
    const counts = summarizeProjectBackup(data);

    // Dekode gambar peta di LUAR transaksi; id lama dipertahankan untuk
    // membangun mapIdMap saat insert.
    const decodedMaps = await this.deserializeMaps(data.maps);

    // Salin baris tanpa id, set projectId. (id dilepas → Dexie menetapkan id baru.)
    const prep = (row: any, projectId: number) => {
      const copy = { ...row };
      delete copy.id;
      copy.projectId = projectId;
      return copy;
    };

    let newProjectId = 0;
    await db.transaction('rw', PROJECT_IMPORT_TABLES.map(name => db[name]), async () => {
      // 1) Proyek baru (lepas id; lastOpened=now agar langsung teratas; nama diberi
      //    suffix "(impor)" agar terbedakan dari aslinya bila keduanya berdampingan).
      const projectRow = { ...data.projects[0] } as any;
      delete projectRow.id;
      projectRow.name = importedProjectName(projectRow.name);
      projectRow.lastOpened = Date.now();
      newProjectId = await db.projects.add(projectRow) as number;

      // 2) Bab & codex di-insert dulu untuk MEMBANGUN peta id lama→baru.
      const chapterIdMap = new Map<number, number>();
      if (data.chapters?.length) {
        const rows = data.chapters.map((c) => prep(c, newProjectId));
        const keys = await db.chapters.bulkAdd(rows, { allKeys: true });
        data.chapters.forEach((c, i) => { if (c.id != null) chapterIdMap.set(c.id, keys[i] as number); });
      }

      const codexIdMap = new Map<number, number>();
      if (data.codex?.length) {
        const rows = data.codex.map(c => {
          const row = prep(c, newProjectId);
          if (c.details) row.details = c.details.map(detail => ({
            ...detail,
            revisions: detail.revisions?.map(revision => {
              if (revision.chapterId === undefined) return revision;
              const chapterId = chapterIdMap.get(revision.chapterId);
              if (chapterId === undefined) throw new Error('Bab pada riwayat detail Codex tidak ditemukan saat impor.');
              return { ...revision, chapterId };
            }),
          }));
          return row;
        });
        const keys = await db.codex.bulkAdd(rows, { allKeys: true });
        data.codex.forEach((c, i) => { if (c.id != null) codexIdMap.set(c.id, keys[i] as number); });
      }

      // 2b) Peta Atlas di-insert dulu (seperti bab/codex) untuk membangun mapIdMap
      //     yang dipakai remap mapMarkers. Gambar sudah didekode jadi Blob.
      const mapIdMap = new Map<number, number>();
      if (decodedMaps.length) {
        const rows = decodedMaps.map((m) => prep(m, newProjectId));
        const keys = await db.maps.bulkAdd(rows, { allKeys: true });
        decodedMaps.forEach((m, i) => { if (m.id != null) mapIdMap.set(m.id, keys[i] as number); });
      }

      // 3) Remap FK tabel dependen (murni) lalu insert.
      const dep = remapProjectDependents(data, { projectId: newProjectId, chapterIdMap, codexIdMap, mapIdMap });
      if (dep.bible.length) await db.bible.bulkAdd(dep.bible);
      if (dep.aiActions.length) await db.aiActions.bulkAdd(dep.aiActions);
      if (dep.codexCategories.length) await db.codexCategories.bulkAdd(dep.codexCategories);
      if (dep.snapshots.length) await db.snapshots.bulkAdd(dep.snapshots);
      const timelineKeys = dep.timeline.length ? await db.timeline.bulkAdd(dep.timeline, { allKeys: true }) : [];
      const relationshipKeys = dep.relationships.length ? await db.relationships.bulkAdd(dep.relationships, { allKeys: true }) : [];
      const timelineIdMap = new Map<number, number>();
      const relationshipIdMap = new Map<number, number>();
      data.timeline.forEach((row, i) => timelineIdMap.set(row.id!, timelineKeys[i] as number));
      data.relationships.forEach((row, i) => relationshipIdMap.set(row.id!, relationshipKeys[i] as number));
      const triage = remapTriage(data, { projectId: newProjectId, chapterIdMap, codexIdMap, mapIdMap, timelineIdMap, relationshipIdMap });
      if (triage.length) await db.continuityTriage.bulkAdd(triage);
      if (dep.chatSessions.length) await db.chatSessions.bulkAdd(dep.chatSessions);
      if (dep.plotPromises.length) await db.plotPromises.bulkAdd(dep.plotPromises);
      if (dep.glossary.length) await db.glossary.bulkAdd(dep.glossary);
      if (dep.mapMarkers.length) await db.mapMarkers.bulkAdd(dep.mapMarkers);
    });

    return { projectId: newProjectId, counts };
  },

  /**
   * Returns list of internal backups, sorted by newest.
   */
  async getBackupList(): Promise<BackupRecord[]> {
    return db.backups.orderBy('timestamp').reverse().toArray();
  }
};
