import { DEFAULT_RETENTION } from './backupRetention';

export const AUTO_SNAPSHOT_LIMIT = 12;
export const AI_USAGE_RETENTION_DAYS = 30;

interface TablePolicy {
  kind: 'primary' | 'asset' | 'cache' | 'backup' | 'log';
  scope: 'project-root' | 'project' | 'chapter' | 'workspace';
  relations: readonly string[];
  retention: string;
  backup: 'records' | 'map-assets' | 'cover-assets' | 'exclude';
  projectImport: 'remap' | 'regenerate' | 'skip';
  restore: 'replace' | 'clear' | 'preserve';
  projectDeletion: 'delete' | 'preserve';
}

const projectData = {
  kind: 'primary',
  scope: 'project',
  retention: 'Sampai dihapus atau diganti saat pemulihan.',
  backup: 'records',
  projectImport: 'remap',
  restore: 'replace',
  projectDeletion: 'delete',
} as const;

const derivedCache = {
  ...projectData,
  kind: 'cache',
  backup: 'exclude',
  projectImport: 'regenerate',
  restore: 'clear',
} as const;

const workspaceLocal = {
  scope: 'workspace',
  relations: [],
  backup: 'exclude',
  projectImport: 'skip',
  restore: 'preserve',
  projectDeletion: 'preserve',
} as const;

/** Nama tabel baru ditambahkan setelah tabel ekspor lama untuk menjaga urutan serialisasi. */
export const TABLE_CATALOG = {
  projects: { ...projectData, scope: 'project-root', relations: [] },
  chapters: { ...projectData, relations: ['projectId → projects'] },
  codex: { ...projectData, relations: ['projectId → projects', 'category → slug kategori dalam proyek atau kategori bawaan', 'details[].revisions[].chapterId → chapters'] },
  bible: { ...projectData, relations: ['projectId → projects', 'key unik dalam proyek'] },
  aiActions: { ...projectData, relations: ['projectId → projects'] },
  snapshots: {
    ...projectData,
    relations: ['chapterId → chapters, atau ID historis bila orphaned'],
    retention: `${AUTO_SNAPSHOT_LIMIT} snapshot otomatis per bab. Snapshot manual bertahan sampai dihapus, bab pemilik dihapus, atau workspace dipulihkan. Snapshot tanpa bab induk dipertahankan dalam cadangan penuh.`,
    scope: 'chapter',
  },
  timeline: { ...projectData, relations: ['projectId → projects', 'chapterId → chapters', 'characterIds[] → codex'] },
  relationships: { ...projectData, relations: ['projectId → projects', 'sourceId dan targetId → codex'] },
  chatSessions: {
    ...projectData,
    relations: ['projectId → projects', 'chapterId dan activeChapterId → chapters', 'workshopKey entry:<id> → codex'],
    retention: 'Sampai dihapus atau dipulihkan. Sesi lokakarya dihapus setelah entri disimpan.',
  },
  codexCategories: { ...projectData, relations: ['projectId → projects', 'slug unik dalam proyek'] },
  plotPromises: { ...projectData, relations: ['projectId → projects', 'plantedChapterId → chapters', 'codexId dan payoffCodexId → codex'] },
  glossary: { ...projectData, relations: ['projectId → projects'] },
  maps: { ...projectData, kind: 'asset', backup: 'map-assets', relations: ['projectId → projects', 'imageBlob tersimpan bersama record peta'] },
  mapMarkers: {
    ...projectData,
    relations: [
      'projectId → projects', 'mapId dan linkedMapId → maps', 'codexId dan geometry[].codexId → codex',
      'geometry[].pinId serta meta.importantLocations[].pinId → mapMarkers (pin pada peta yang sama)',
    ],
  },
  continuityTriage: {
    ...projectData,
    relations: ['projectId → projects', 'findingId memuat identitas codex, relationships, atau timeline'],
    retention: 'Sampai status dilepas, data diganti, atau penghapusan bab/Codex membatalkan triase proyek.',
  },
  codexCovers: { ...projectData, kind: 'asset', backup: 'cover-assets', relations: ['projectId → projects', 'codexId → codex', '[codexId+kind] unik'] },
  embeddings: {
    ...derivedCache,
    relations: ['projectId → projects', 'codexId → codex'],
    retention: 'Dapat dibersihkan dan dibangun ulang dari Codex. Dihapus bersama entri pemilik.',
  },
  sceneEmbeddings: {
    ...derivedCache,
    relations: ['projectId → projects', 'chapterId → chapters'],
    retention: 'Chunk basi dipangkas ketika indeks adegan dibangun ulang. Dihapus bersama bab pemilik.',
  },
  backups: {
    ...workspaceLocal,
    kind: 'backup',
    retention: `Otomatis memakai rotasi ${DEFAULT_RETENTION.recent} terbaru, ${DEFAULT_RETENTION.daily} harian, dan ${DEFAULT_RETENTION.weekly} mingguan. Titik pra-pemulihan dikecualikan dari rotasi dan eviksi kuota.`,
  },
  errors: { ...workspaceLocal, kind: 'log', retention: 'Dibersihkan manual melalui panel log.' },
  aiUsageLogs: { ...workspaceLocal, kind: 'log', retention: `Entri lebih lama dari ${AI_USAGE_RETENTION_DAYS} hari dibersihkan saat aplikasi dibuka.` },
} as const satisfies Record<string, TablePolicy>;

export type CatalogTableName = keyof typeof TABLE_CATALOG;
export type BackupTableName = {
  [Name in CatalogTableName]: typeof TABLE_CATALOG[Name]['backup'] extends 'exclude' ? never : Name;
}[CatalogTableName];

const names = Object.keys(TABLE_CATALOG) as CatalogTableName[];

export const BACKUP_TABLES = names.filter((name): name is BackupTableName => TABLE_CATALOG[name].backup !== 'exclude');
export const PROJECT_IMPORT_TABLES = names.filter(name => TABLE_CATALOG[name].projectImport === 'remap');
export const PROJECT_DELETE_TABLES = names.filter(name => TABLE_CATALOG[name].projectDeletion !== 'preserve');
export const RESTORE_TABLES = names.filter(name => TABLE_CATALOG[name].restore !== 'preserve');
export const RESTORE_RECORD_TABLES = BACKUP_TABLES.filter(name => TABLE_CATALOG[name].restore === 'replace');
