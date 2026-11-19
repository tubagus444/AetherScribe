import { backupChecksum } from './backupEnvelope';
import {
  BACKUP_FORMAT_VERSION, type BackupData, type BackupMapRecord, type BackupScope,
  type PortableBackup, type VerifiedBackup,
} from './backupFormat';
import { readBackupFile } from './backupIO';
import { BACKUP_LIMITS } from './backupLimits';
import { detachMissingWorkshopEntries, normalizeLegacyData, validateBackup } from './backupValidation';
import { chapterFromRecord } from './chapterRecord';

/** Verify the original envelope before applying any legacy normalization. */
export async function verifyBackup(input: unknown, scope?: BackupScope): Promise<VerifiedBackup> {
  validateBackup(input, scope);
  // Snapshot JSON before awaiting crypto so the caller cannot alter verified data.
  const backup = JSON.parse(JSON.stringify(input)) as VerifiedBackup;
  if (backup.checksum && await backupChecksum(JSON.stringify(backup.data)) !== backup.checksum) {
    throw new Error('Verifikasi integritas gagal: cadangan rusak atau checksum tidak dapat diverifikasi.');
  }
  return backup;
}

export async function verifyEmbeddedImage(imageDataUrl: string, imageAssetId?: string): Promise<void> {
  if (imageAssetId && await backupChecksum(imageDataUrl) !== imageAssetId) {
    throw new Error('Identitas gambar cadangan tidak cocok atau tidak dapat diverifikasi.');
  }
}

function requireEmbeddedImages(maps: BackupMapRecord[] = []) {
  for (const map of maps) {
    if (!map.imageMissing && !map.imageDataUrl) {
      throw new Error(`Gambar peta “${map.name}” tidak disertakan. Gunakan cadangan lengkap dari file/Drive.`);
    }
  }
}

function requireFullBackup(backup: VerifiedBackup) {
  if (backup.imageMode === 'references') throw new Error('Ekspor portabel membutuhkan cadangan dengan gambar lengkap.');
  requireEmbeddedImages(backup.data.maps);
}

/** Validate a standalone v3–v8 file, including any embedded asset hashes. */
export async function validatePortableBackup(input: unknown, scope?: BackupScope): Promise<VerifiedBackup> {
  const backup = await verifyBackup(input, scope);
  requireFullBackup(backup);
  for (const map of backup.data.maps ?? []) {
    if (map.imageDataUrl) await verifyEmbeddedImage(map.imageDataUrl, map.imageAssetId);
  }
  return backup;
}

export async function readPortableBackup(file: Blob, scope?: BackupScope): Promise<VerifiedBackup> {
  return validatePortableBackup(await readBackupFile(file), scope);
}

export function preserveOrphanedSnapshots(data: Pick<BackupData['data'], 'chapters' | 'snapshots'>) {
  const chapterIds = new Set(data.chapters.map(chapter => chapter.id));
  data.snapshots = data.snapshots.map(snapshot =>
    snapshot.orphaned || chapterIds.has(snapshot.chapterId) ? snapshot : { ...snapshot, orphaned: true });
}

export function normalizeBackupData(backup: VerifiedBackup): BackupData['data'] {
  const data = {
    ...normalizeLegacyData(backup.data),
    chapters: backup.data.chapters.map(chapterFromRecord),
  } as BackupData['data'];
  if (backup.scope !== 'project') {
    detachMissingWorkshopEntries(data);
    preserveOrphanedSnapshots(data);
  }
  return data;
}

/** Convert a self-contained legacy export to standard v8 without opening a database. */
export async function convertPortableBackup(input: unknown): Promise<PortableBackup> {
  const backup = await verifyBackup(input);
  requireEmbeddedImages(backup.data.maps);
  const data = normalizeBackupData(backup);
  for (const map of data.maps ?? []) {
    if (!map.imageDataUrl) continue;
    if (map.imageAssetId) {
      await verifyEmbeddedImage(map.imageDataUrl, map.imageAssetId);
    } else {
      map.imageAssetId = await backupChecksum(map.imageDataUrl);
      if (!map.imageAssetId) throw new Error('Tidak dapat menghitung identitas gambar cadangan. Gunakan lingkungan dengan Web Crypto.');
    }
  }
  const result: PortableBackup = {
    ...backup,
    version: BACKUP_FORMAT_VERSION,
    scope: backup.scope ?? 'all',
    imageMode: 'full',
    data,
    checksum: await backupChecksum(JSON.stringify(data)),
  };
  validateBackup(result);
  return result;
}

/** Synchronous guard for output already collected and checksummed by the app. */
export function serializePortableBackup(backup: BackupData, space?: number, maxBytes = BACKUP_LIMITS.fileBytes): string {
  validateBackup(backup);
  requireFullBackup(backup);
  const text = JSON.stringify(backup, null, space);
  // A UTF-8 byte count is only needed when the upper bound crosses the limit.
  if (text.length * 3 > maxBytes && new Blob([text]).size > maxBytes) {
    throw new Error('Ukuran file cadangan melewati batas yang diizinkan.');
  }
  return text;
}
