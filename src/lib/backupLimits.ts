/** Batas diterapkan juga pada service, bukan hanya pemilih file UI. */
export const BACKUP_LIMITS = {
  fileBytes: 64 * 1024 * 1024,
  jsonBytes: 128 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
  stringBytes: 16 * 1024 * 1024,
  recordsPerTable: 100_000,
  recordsTotal: 200_000,
  depth: 32,
} as const;
