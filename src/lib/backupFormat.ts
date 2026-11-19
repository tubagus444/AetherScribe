import type { AtlasMap, Snapshot } from '@/src/types';
import type { ChapterExportRecord, PersistedChapter } from './chapterContracts';

export const MIN_BACKUP_VERSION = 3;
export const BACKUP_FORMAT_VERSION = 8;
export type BackupScope = 'all' | 'project';

export interface BackupMapRecord extends Omit<AtlasMap, 'id' | 'imageBlob'> {
  id: number;
  imageDataUrl?: string;
  imageAssetId?: string;
  imageMissing?: boolean;
}

export interface BackupData<ChapterRow extends PersistedChapter = ChapterExportRecord> {
  version: number;
  timestamp: number;
  // SHA-256 hex dari JSON `data` (#5). Ada sejak v4; cadangan lama tanpa field ini
  // dilewati verifikasinya (backward-compatible). Menangkap file terpotong/rusak
  // SEBELUM ditimpakan ke DB.
  checksum?: string;
  // Lingkup ekspor (#4). 'project' = ekspor SATU novel yang mandiri (untuk arsip /
  // memindahkan). Tak ada / 'all' = cadangan penuh semua proyek (perilaku lama,
  // backward-compatible). PENTING: file 'project' TIDAK boleh dipulihkan lewat jalur
  // restore-penuh (yang meng-clear semua tabel) — itu akan menghapus proyek lain;
  // impor per-proyek (remap id) adalah jalur terpisah yang menyusul.
  scope?: BackupScope;
  // Nama proyek sumber saat scope='project' (untuk nama file & label impor nanti).
  projectName?: string;
  /** v8: auto internal berisi referensi hash; file/Drive/pre-restore lengkap. */
  imageMode?: 'full' | 'references';
  data: {
    projects: any[];
    chapters: ChapterRow[];
    codex: any[];
    bible: any[];
    aiActions: any[];
    snapshots: Snapshot[];
    timeline: any[];
    relationships: any[];
    chatSessions: any[];
    codexCategories?: any[];
    plotPromises?: any[];
    glossary?: any[];
    // Atlas Dunia (v7). `maps[].imageBlob` diganti `imageDataUrl` (base64) karena Blob
    // tak selamat lewat JSON. v8 internal auto memakai imageAssetId (SHA-256).
    // Snapshot pre-restore selalu menyertakan gambar lengkap.
    maps?: BackupMapRecord[];
    mapMarkers?: any[];
    continuityTriage?: any[];
  };
}

export type VerifiedBackup = BackupData<PersistedChapter & { listMetadata?: unknown }>;

export interface PortableBackup extends BackupData {
  version: typeof BACKUP_FORMAT_VERSION;
  scope: BackupScope;
  imageMode: 'full';
}
