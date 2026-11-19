import { assembleBackupJson, backupChecksum } from './backupEnvelope';
import { BACKUP_FORMAT_VERSION } from './backupFormat';
import { validateBackup } from './backupValidation';

export interface PreparedInternalBackup {
  data: string | Uint8Array;
  size: number;
  compressed: boolean;
}

export async function compressBackup(text: string): Promise<{ blob: Blob; compressed: boolean }> {
  const blob = new Blob([new TextEncoder().encode(text)]);
  try {
    if (typeof CompressionStream !== 'undefined') {
      return { blob: await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(), compressed: true };
    }
  } catch { /* Plain JSON remains a valid backup on browsers without working gzip. */ }
  return { blob, compressed: false };
}

// Shared by the native worker and fallback. No editor or database dependencies.
export async function prepareInternalBackup(input: unknown, kind: 'auto' | 'pre-restore'): Promise<PreparedInternalBackup> {
  const scope = typeof input === 'object' && input !== null && 'scope' in input && input.scope === 'project' ? 'project' : 'all';
  validateBackup(input, scope);
  if (kind === 'pre-restore' && input.imageMode === 'references') throw new Error('Cadangan pengaman harus menyertakan gambar lengkap.');
  let data = input.data;
  if (kind === 'auto' && data.maps?.length) {
    const maps = await Promise.all(data.maps.map(async map => {
      const { imageDataUrl, ...rest } = map;
      if (imageDataUrl && !rest.imageAssetId) {
        rest.imageAssetId = await backupChecksum(imageDataUrl);
        if (!rest.imageAssetId) throw new Error('Gagal menghitung identitas gambar cadangan.');
      }
      return rest;
    }));
    data = { ...data, maps };
  }
  const text = JSON.stringify(data);
  const checksum = await backupChecksum(text);
  const meta: Record<string, unknown> = { version: input.version, timestamp: input.timestamp };
  if (input.scope) meta.scope = input.scope;
  if (input.projectName) meta.projectName = input.projectName;
  if (input.version === BACKUP_FORMAT_VERSION) meta.imageMode = kind === 'auto' ? 'references' : 'full';
  if (checksum) meta.checksum = checksum;
  const json = assembleBackupJson(meta, text);
  const { blob, compressed } = await compressBackup(json);
  const stored = compressed ? new Uint8Array(await blob.arrayBuffer()) : json;
  return { data: stored, size: blob.size, compressed };
}
